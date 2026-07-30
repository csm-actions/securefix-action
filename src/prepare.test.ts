import { describe, it, expect, vi } from "vitest";
import type * as github from "@actions/github";
import type { Entry } from "./config";
import {
  matchClientBranches,
  matchClientRepositories,
  matchPushBranches,
  matchPushRepositories,
  parseLabelDescription,
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
