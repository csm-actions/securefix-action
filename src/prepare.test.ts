import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type * as github from "@actions/github";
import type { Entry } from "./config";
import {
  matchClientBranches,
  matchClientRepositories,
  matchPushBranches,
  matchPushRepositories,
  parseLabelDescription,
  readRequest,
  splitFiles,
  validateFileTypes,
  validateHeadSHA,
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
  const label = {
    labelName: "securefix-abc",
    labelDescription: "example/client/123",
  };
  const dispatchInputs = {
    artifact_name: "securefix-xyz",
    client_repository_owner: "example",
    client_repository_name: "client",
    client_workflow_run_id: "456",
  };

  it("reads a label", () => {
    expect(readRequest("label", label, undefined)).toEqual({
      artifactName: "securefix-abc",
      workflowRun: { owner: "example", repo: "client", runId: 123 },
    });
  });

  it("fails if the label is missing", () => {
    expect(() =>
      readRequest("label", { labelName: "", labelDescription: "" }, undefined),
    ).toThrowError("label_name is required");
    expect(() =>
      readRequest(
        "label",
        { labelName: "securefix-abc", labelDescription: "" },
        undefined,
      ),
    ).toThrowError("label_description is required");
  });

  it("reads the inputs of a workflow_dispatch event", () => {
    expect(readRequest("workflow_dispatch", label, dispatchInputs)).toEqual({
      artifactName: "securefix-xyz",
      workflowRun: { owner: "example", repo: "client", runId: 456 },
    });
  });

  it("fails if the inputs of a workflow_dispatch event are missing", () => {
    expect(() =>
      readRequest("workflow_dispatch", label, {
        artifact_name: "securefix-xyz",
        client_repository_owner: "example",
        client_repository_name: "",
      }),
    ).toThrowError("Missing: client_repository_name, client_workflow_run_id");
    expect(() =>
      readRequest("workflow_dispatch", label, undefined),
    ).toThrowError(
      "Missing: artifact_name, client_repository_owner, client_repository_name, client_workflow_run_id",
    );
  });

  it("fails if the workflow run ID isn't a positive integer", () => {
    for (const id of [
      "abc",
      "1.5",
      "-1",
      "0",
      "12abc",
      "0x1A",
      "1e3",
      " 42 ",
      "01",
    ]) {
      expect(() =>
        readRequest("workflow_dispatch", label, {
          ...dispatchInputs,
          client_workflow_run_id: id,
        }),
      ).toThrowError("client_workflow_run_id must be a positive integer");
    }
  });
});

describe("readRequest validates names", () => {
  it("rejects invalid owner and repository names", () => {
    const base = {
      artifact_name: "securefix-xyz",
      client_repository_owner: "example",
      client_repository_name: "client",
      client_workflow_run_id: "456",
    };
    for (const [key, value] of [
      ["client_repository_owner", "exa mple"],
      ["client_repository_name", "client/other"],
    ]) {
      expect(() =>
        readRequest(
          "workflow_dispatch",
          { labelName: "", labelDescription: "" },
          { ...base, [key]: value },
        ),
      ).toThrowError(`${key} is invalid`);
    }
  });
});

describe("parseLabelDescription validates the run ID", () => {
  it("rejects a run ID which isn't a positive integer", () => {
    for (const d of [
      "example/client/123abc",
      "example/client/abc",
      "example/client/0x1A",
    ]) {
      expect(() => parseLabelDescription(d)).toThrowError(
        "the workflow run ID of the label description must be a positive integer",
      );
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

describe("validateHeadSHA", () => {
  it("accepts the latest commit of the branch", () => {
    expect(() => validateHeadSHA("main", "abc", "abc")).not.toThrow();
  });

  it("rejects an old commit", () => {
    expect(() => validateHeadSHA("main", "abc", "def")).toThrowError(
      "The client workflow run must be for the latest commit abc of the branch main, but got def",
    );
  });

  it("rejects an empty commit", () => {
    expect(() => validateHeadSHA("main", "abc", "")).toThrowError(
      "but got (empty)",
    );
  });
});

describe("splitFiles", () => {
  it("ignores empty and duplicated lines", () => {
    expect(splitFiles("a.txt\n\nb.txt\na.txt\n")).toEqual(["a.txt", "b.txt"]);
  });
  it("doesn't remove spaces or carriage returns", () => {
    expect(splitFiles(" a.txt\nconfig.yaml \nb.txt\r\n")).toEqual([
      " a.txt",
      "config.yaml ",
      "b.txt\r",
    ]);
  });
});

describe("validateFileTypes", () => {
  let dir = "";
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "securefix-filetypes-test-"));
    fs.writeFileSync(path.join(dir, "file.txt"), "");
    fs.mkdirSync(path.join(dir, "dir"));
    fs.writeFileSync(path.join(dir, "dir", ".git"), "gitdir: ./g\n");
    fs.writeFileSync(path.join(dir, "dir", "a.txt"), "");
    fs.symlinkSync("file.txt", path.join(dir, "link"));
    fs.symlinkSync("dir", path.join(dir, "linkdir"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it("allows regular files and deleted files in the directory", () => {
    expect(() =>
      validateFileTypes(
        ["file.txt", "deleted.txt", "file.txt/x", "dir/a.txt"],
        dir,
      ),
    ).not.toThrow();
  });
  it("reads files relative to the directory, not the current directory", () => {
    // package.json exists in the current directory, but not in dir
    expect(() => validateFileTypes(["package.json"], dir)).not.toThrow();
    expect(() => validateFileTypes(["src"], dir)).not.toThrow();
  });
  it.each(["dir", "link"])("rejects %s, which isn't a regular file", (p) => {
    expect(() => validateFileTypes([p], dir)).toThrow("must be a regular file");
  });
  it.each([
    "/etc/passwd",
    "../x",
    "a/../../x",
    "./file.txt",
    "a//b",
    "..",
    "dir/",
  ])("rejects a path outside the directory or not normalized: %o", (p) => {
    expect(() => validateFileTypes([p], dir)).toThrow(
      "must be a normalized relative path",
    );
  });
  it("rejects an empty artifact directory", () => {
    expect(() => validateFileTypes(["file.txt"], "")).toThrow(
      "the artifact directory is empty",
    );
  });
  it("rejects a file under a symlinked directory", () => {
    expect(() => validateFileTypes(["linkdir/x"], dir)).toThrow(
      "parent directory of a fixed file must not be a symlink",
    );
  });
});
