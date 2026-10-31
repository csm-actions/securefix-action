import { describe, it, expect, vi } from "vitest";
import type * as github from "@actions/github";
import type { Entry } from "./config";
import {
  matchClientBranches,
  matchClientRepositories,
  matchPushBranches,
  matchPushRepositories,
  parseLabelDescription,
  readRequest,
  validateRef,
} from "./prepare";

type Octokit = ReturnType<typeof github.getOctokit>;

// newOctokit returns a stub which only supports `octokit.rest.repos.get`.
const newOctokit = (defaultBranch: string) => {
  const get = vi
    .fn()
    .mockResolvedValue({ data: { default_branch: defaultBranch } });
  return {
    octokit: { rest: { repos: { get: get } } } as unknown as Octokit,
    get: get,
  };
};

const newEntry = (entry: Partial<Entry>): Entry => ({
  client: { repositories: ["example/client"] },
  push: { branches: ["main"] },
  ...entry,
});

describe("parseLabelDescription", () => {
  it("parses a label description", () => {
    expect(parseLabelDescription("example/client/123")).toEqual({
      owner: "example",
      repo: "client",
      runId: 123,
    });
  });

  it("fails if the number of elements isn't three", () => {
    for (const labelDescription of ["example/client", "example/client/123/4"]) {
      expect(() => parseLabelDescription(labelDescription)).toThrowError(
        "Label description must be in the format <repository owner>/<repository name>/<workflow run ID>",
      );
    }
  });
});

describe("matchClientRepositories", () => {
  it("matches a repository by an exact name", () => {
    const entry = newEntry({ client: { repositories: ["example/client"] } });
    expect(matchClientRepositories(entry, "example/client")).toBe(true);
    expect(matchClientRepositories(entry, "example/other")).toBe(false);
  });

  it("matches a repository by a glob pattern", () => {
    const entry = newEntry({ client: { repositories: ["example/*"] } });
    expect(matchClientRepositories(entry, "example/client")).toBe(true);
    expect(matchClientRepositories(entry, "other/client")).toBe(false);
  });

  it("matches a repository by one of the patterns", () => {
    const entry = newEntry({
      client: { repositories: ["example/client", "other/*"] },
    });
    expect(matchClientRepositories(entry, "other/client")).toBe(true);
  });

  it("doesn't match anything if no repository is configured", () => {
    const entry = newEntry({ client: { repositories: [] } });
    expect(matchClientRepositories(entry, "example/client")).toBe(false);
  });
});

describe("matchClientBranches", () => {
  it("matches a branch by the configured patterns", async () => {
    const entry = newEntry({
      client: {
        repositories: ["example/client"],
        branches: ["main", "feat/*"],
      },
    });
    const { octokit, get } = newOctokit("main");
    expect(
      await matchClientBranches(
        octokit,
        entry,
        "example",
        "client-1",
        "feat/a",
      ),
    ).toBe(true);
    expect(
      await matchClientBranches(octokit, entry, "example", "client-1", "fix/a"),
    ).toBe(false);
    // The default branch isn't looked up if branches are configured.
    expect(get).not.toHaveBeenCalled();
  });

  it("falls back to the default branch if no branch is configured", async () => {
    const entry = newEntry({ client: { repositories: ["example/client"] } });
    const { octokit, get } = newOctokit("main");
    expect(
      await matchClientBranches(octokit, entry, "example", "client-2", "main"),
    ).toBe(true);
    expect(
      await matchClientBranches(
        octokit,
        entry,
        "example",
        "client-2",
        "feat/a",
      ),
    ).toBe(false);
    // The default branch is cached, so it's looked up only once.
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("matchPushRepositories", () => {
  it("matches a repository by the configured patterns", () => {
    const entry = newEntry({
      push: { repositories: ["example/server-*"], branches: ["main"] },
    });
    expect(
      matchPushRepositories(entry, "example/server-1", "example/client"),
    ).toBe(true);
    expect(
      matchPushRepositories(entry, "example/other", "example/client"),
    ).toBe(false);
  });

  it("allows only the client repository if no repository is configured", () => {
    const entry = newEntry({ push: { branches: ["main"] } });
    expect(
      matchPushRepositories(entry, "example/client", "example/client"),
    ).toBe(true);
    expect(
      matchPushRepositories(entry, "example/server", "example/client"),
    ).toBe(false);
  });
});

describe("matchPushBranches", () => {
  it("matches a branch by the configured patterns", () => {
    const entry = newEntry({ push: { branches: ["main", "feat/*"] } });
    expect(matchPushBranches(entry, "main")).toBe(true);
    expect(matchPushBranches(entry, "feat/a")).toBe(true);
    expect(matchPushBranches(entry, "fix/a")).toBe(false);
  });

  it("doesn't match anything if no branch is configured", () => {
    const entry = newEntry({ push: { branches: [] } });
    expect(matchPushBranches(entry, "main")).toBe(false);
  });
});

describe("readRequest", () => {
  const empty = {
    labelName: "",
    labelDescription: "",
    artifactName: "",
    clientRepositoryOwner: "",
    clientRepositoryName: "",
    clientWorkflowRunId: "",
  };

  it("reads a label", () => {
    expect(
      readRequest({
        ...empty,
        labelName: "securefix-abc",
        labelDescription: "example/client/123",
      }),
    ).toEqual({
      artifactName: "securefix-abc",
      workflowRun: { owner: "example", repo: "client", runId: 123 },
    });
  });

  it("prefers a label to workflow_dispatch inputs", () => {
    expect(
      readRequest({
        labelName: "securefix-abc",
        labelDescription: "example/client/123",
        artifactName: "securefix-xyz",
        clientRepositoryOwner: "other",
        clientRepositoryName: "other",
        clientWorkflowRunId: "456",
      }).artifactName,
    ).toBe("securefix-abc");
  });

  it("fails if a label has no description", () => {
    expect(() =>
      readRequest({ ...empty, labelName: "securefix-abc" }),
    ).toThrowError("label_description is required");
  });

  it("reads workflow_dispatch inputs", () => {
    expect(
      readRequest({
        ...empty,
        artifactName: "securefix-abc",
        clientRepositoryOwner: "example",
        clientRepositoryName: "client",
        clientWorkflowRunId: "123",
      }),
    ).toEqual({
      artifactName: "securefix-abc",
      workflowRun: { owner: "example", repo: "client", runId: 123 },
    });
  });

  it("fails if workflow_dispatch inputs are missing", () => {
    expect(() =>
      readRequest({
        ...empty,
        artifactName: "securefix-abc",
        clientRepositoryOwner: "example",
      }),
    ).toThrowError("Missing: client_repository_name, client_workflow_run_id");
  });

  it("fails if the workflow run ID isn't a positive integer", () => {
    for (const id of ["abc", "1.5", "-1", "0", "12abc"]) {
      expect(() =>
        readRequest({
          ...empty,
          artifactName: "securefix-abc",
          clientRepositoryOwner: "example",
          clientRepositoryName: "client",
          clientWorkflowRunId: id,
        }),
      ).toThrowError("client_workflow_run_id must be a positive integer");
    }
  });
});

describe("validateRef", () => {
  it("ignores events other than workflow_dispatch", () => {
    expect(() =>
      validateRef("label", "refs/heads/feature", "main"),
    ).not.toThrow();
  });

  it("accepts the default branch", () => {
    expect(() =>
      validateRef("workflow_dispatch", "refs/heads/main", "main"),
    ).not.toThrow();
  });

  it("rejects other branches and tags", () => {
    for (const ref of ["refs/heads/feature", "refs/tags/v1.0.0", "main"]) {
      expect(() => validateRef("workflow_dispatch", ref, "main")).toThrowError(
        "The server workflow must run on the default branch main",
      );
    }
  });

  it("fails if the default branch is unknown", () => {
    expect(() =>
      validateRef("workflow_dispatch", "refs/heads/main", undefined),
    ).toThrowError("The default branch of the server repository isn't found");
  });
});
