import { describe, it, expect, vi } from "vitest";
import type * as github from "@actions/github";
import type { Entry } from "./config";
import {
  isNormalizedPath,
  listFixedFiles,
  isGitDir,
  isGitSpecialFile,
  splitFiles,
  validateChanges,
  validateSymlinkTarget,
  matchClientBranches,
  matchClientRepositories,
  matchPushBranches,
  matchPushRepositories,
  parseLabelDescription,
  readRequest,
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

describe("isNormalizedPath", () => {
  it.each([
    "a",
    "a/b",
    "a.txt",
    ".github/workflows/ci.yaml",
    "a..b",
    "a\tb.txt",
  ])("%s is normalized", (p) => {
    expect(isNormalizedPath(p)).toBe(true);
  });
  it.each([
    "",
    ".",
    "..",
    "./a",
    "a/",
    "/a",
    "a//b",
    "a/./b",
    "a/../b",
    "../a",
    " README.md",
    "a.txt ",
    "a\nb",
    "a\u0000b",
  ])("%s isn't normalized", (p) => {
    expect(isNormalizedPath(p)).toBe(false);
  });
});

describe("isGitDir", () => {
  it.each([
    ".git",
    ".GIT",
    ".git.",
    ".git ",
    ".git. .",
    "GIT~1",
    "git~12",
    ".g\u200cit",
    "\ufeff.git",
    ".git::$INDEX_ALLOCATION",
    ".GIT:stream",
  ])("%s is .git", (c) => {
    expect(isGitDir(c)).toBe(true);
  });
  it.each([".github", "git", ".gitignore", "a.git", "git~", ".git2"])(
    "%s isn't .git",
    (c) => {
      expect(isGitDir(c)).toBe(false);
    },
  );
});

describe("validateSymlinkTarget", () => {
  it.each([
    { path: "a", target: "b" },
    { path: "dir/link", target: "../shared.txt" },
    { path: "a/b/link", target: "../../c/d" },
    { path: "dir/link", target: "not-found" },
    { path: "a", target: ".github/x" },
    { path: "a", target: ".config" },
    { path: "a", target: "A_b-c.d1" },
  ])("allows $path -> $target", (symlink) => {
    expect(() => validateSymlinkTarget(symlink)).not.toThrow();
  });
  it.each([
    // Not allowed characters or forms
    "",
    ".",
    "./b",
    "b/",
    "a//b",
    "/etc/passwd",
    "C:/Users/x",
    "c:",
    "C:foo",
    "a:b",
    "..\\..\\x",
    "b\nc",
    "a b",
    "日本語",
    "x.",
    "...",
    ".. /.. /etc",
    "GIT~1/config",
    ".g\u200cit/config",
    "CON",
    "x/nul.txt",
    "LPT1",
  ])("rejects a target with characters or forms not allowed: %o", (target) => {
    expect(() => validateSymlinkTarget({ path: "a/b/link", target })).toThrow(
      "the target of a symlink",
    );
  });
  it.each([
    [{ path: "a", target: "../x" }, "outside"],
    [{ path: "a", target: ".." }, 'only ".."'],
    [{ path: "dir/link", target: "../../x" }, "outside"],
    // ".." after d is resolved from d's target if d is a symlink
    [{ path: "x", target: "a/b/d/../secret.txt" }, '".." after'],
    [{ path: "a/b/link", target: "../c/../../../x" }, '".." after'],
    [{ path: "docs/config", target: "../.git/config" }, ".git"],
    [{ path: "a", target: "sub/.GIT/config" }, ".git"],
    [{ path: "a", target: ".git" }, ".git"],
  ])("rejects %o (%s)", (symlink, reason) => {
    expect(() => validateSymlinkTarget(symlink)).toThrow(reason);
  });
});

describe("validateChanges", () => {
  const sha = "1111111111111111111111111111111111111111";
  it("allows separate paths", () => {
    expect(() =>
      validateChanges(
        ["a.txt"],
        [{ path: "sub", sha }],
        [{ path: "link", target: "a.txt" }],
        false,
      ),
    ).not.toThrow();
  });
  it.each([
    [["link"], [], [{ path: "link", target: "a" }]],
    [[], [{ path: "x", sha }], [{ path: "x", target: "a" }]],
    [
      [],
      [],
      [
        { path: "x", target: "a" },
        { path: "x", target: "b" },
      ],
    ],
  ])("rejects a path passed twice: %o %o %o", (files, submodules, symlinks) => {
    expect(() => validateChanges(files, submodules, symlinks, true)).toThrow(
      "must not be passed with another",
    );
  });
  it.each(["./a", "a/", " a", "a\nb", "../a"])(
    "rejects a non-normalized path: %o",
    (p) => {
      expect(() =>
        validateChanges([], [], [{ path: p, target: "x" }], true),
      ).toThrow("normalized relative path");
      expect(() => validateChanges([], [{ path: p, sha }], [], true)).toThrow(
        "normalized relative path",
      );
    },
  );
  it.each(["./a.txt", ".github/workflows/../workflows/x.yml", " a.txt"])(
    "rejects a non-normalized file path: %o",
    (p) => {
      expect(() => validateChanges([p], [], [], true)).toThrow(
        "normalized relative path",
      );
    },
  );
  it("allows an uppercase submodule SHA", () => {
    expect(() =>
      validateChanges(
        [],
        [{ path: "sub", sha: sha.toUpperCase().replace(/1/g, "A") }],
        [],
        true,
      ),
    ).not.toThrow();
  });
  it.each([
    [
      { path: "x", target: "sub/up/secret" },
      "point to or go through a submodule",
    ],
    [{ path: "x", target: "link/secret" }, "go through a symlink"],
  ])("rejects a target going through %o", (symlink, message) => {
    expect(() =>
      validateChanges(
        [],
        [{ path: "sub", sha }],
        [symlink, { path: "link", target: "dir" }],
        true,
      ),
    ).toThrow(message);
  });
  it.each([
    [{ path: "x", target: "sub" }, "point to or go through a submodule"],
    [{ path: "x", target: "SUB/evil" }, "point to or go through a submodule"],
    [{ path: "x", target: "sub./evil" }, "the target of a symlink"],
    [{ path: "x", target: "LINK/secret" }, "go through a symlink"],
  ])("rejects %o case-insensitively", (symlink, message) => {
    expect(() =>
      validateChanges(
        [],
        [{ path: "sub", sha }],
        [symlink, { path: "link", target: "dir" }],
        true,
      ),
    ).toThrow(message);
  });
  it("allows a target pointing to a symlink itself", () => {
    expect(() =>
      validateChanges(
        [],
        [],
        [
          { path: "x", target: "link" },
          { path: "link", target: "dir" },
        ],
        true,
      ),
    ).not.toThrow();
  });
  it.each([".GIT/config", "git~1/hooks/post-checkout", ".git\u200c/config"])(
    "rejects a file path containing .git: %o",
    (p) => {
      expect(() => validateChanges([p], [], [], true)).toThrow(
        "must not contain .git",
      );
    },
  );
  it.each(["a\\.git\\x", "a\\GIT~1"])(
    "rejects a symlink path containing .git with backslashes: %o",
    (p) => {
      expect(() =>
        validateChanges([], [], [{ path: p, target: "x" }], true),
      ).toThrow("must not contain .git");
    },
  );
  it("quotes values from the client in errors", () => {
    const sha = "\n```\n# injected\n```";
    expect(() => validateChanges([], [{ path: "x", sha }], [], true)).toThrow(
      JSON.stringify(sha),
    );
  });
  it.each([
    [["A.txt"], [], [{ path: "a.txt", target: "x" }]],
    [
      [],
      [],
      [
        { path: "Docs", target: "x" },
        { path: "docs", target: "y" },
      ],
    ],
  ])(
    "rejects paths differing only in case: %o %o %o",
    (files, submodules, symlinks) => {
      expect(() => validateChanges(files, submodules, symlinks, true)).toThrow(
        "must not be passed with another",
      );
    },
  );
  it.each([
    [
      [],
      [
        { path: "Docs", target: "x/y" },
        { path: "docs/l", target: "../z" },
      ],
    ],
    [[{ path: "sub", sha }], [{ path: "sub/l", target: "x" }]],
  ])(
    "rejects a symlink under another symlink or a submodule: %o %o",
    (submodules, symlinks) => {
      expect(() => validateChanges([], submodules, symlinks, true)).toThrow(
        "must not be under another symlink or a submodule",
      );
    },
  );
  it.each([".gitmodules", "a/.gitattributes", ".GITIGNORE", "GITMOD~1"])(
    "rejects a symlink at %s",
    (p) => {
      expect(() =>
        validateChanges([], [], [{ path: p, target: "x" }], true),
      ).toThrow("must not be .gitmodules");
    },
  );
  it("rejects an invalid submodule SHA", () => {
    expect(() =>
      validateChanges([], [{ path: "sub", sha: "main" }], [], true),
    ).toThrow("commit SHA");
  });
  it.each([".git/hooks/x", "sub/.Git/config", "GIT~1/config"])(
    "rejects a symlink path containing .git: %s",
    (p) => {
      expect(() =>
        validateChanges([], [], [{ path: p, target: "a" }], true),
      ).toThrow("must not contain .git");
    },
  );
  it.each([".github", ".github/workflows", ".github/workflows/ci.yaml"])(
    "rejects a symlink and a submodule at %s unless allowWorkflowFix",
    (p) => {
      const symlinks = [{ path: p, target: p === ".github" ? "x" : "a" }];
      expect(() => validateChanges([], [], symlinks, false)).toThrow(
        /allow_workflow_fix/,
      );
      expect(() => validateChanges([], [], symlinks, true)).not.toThrow();
      const submodules = [{ path: p, sha }];
      expect(() => validateChanges([], submodules, [], false)).toThrow(
        /allow_workflow_fix/,
      );
    },
  );
  it.each([".github/workflows/ci.yaml", ".github/workflows", ".github"])(
    "rejects a file at %s unless allowWorkflowFix",
    (p) => {
      expect(() => validateChanges([p], [], [], false)).toThrow(
        /allow_workflow_fix/,
      );
      expect(() => validateChanges([p], [], [], true)).not.toThrow();
    },
  );
  it("allows other files in .github", () => {
    expect(() =>
      validateChanges(
        [],
        [],
        [{ path: ".github/CODEOWNERS", target: "x" }],
        false,
      ),
    ).not.toThrow();
  });
});

describe("isGitSpecialFile", () => {
  it.each([
    ".gitmodules",
    ".GitAttributes",
    ".gitignore.",
    ".mailmap",
    "GITMOD~1",
    "gitign~2",
  ])("%s is a special file", (c) => {
    expect(isGitSpecialFile(c)).toBe(true);
  });
  it.each(["gitmodules", ".gitmodules.bak", "a.gitignore"])(
    "%s isn't a special file",
    (c) => {
      expect(isGitSpecialFile(c)).toBe(false);
    },
  );
});

describe("splitFiles", () => {
  it("trims lines and ignores empty and duplicated lines", () => {
    expect(splitFiles(" a.txt\n\nb.txt\na.txt\n")).toEqual(["a.txt", "b.txt"]);
  });
});

describe("listFixedFiles", () => {
  it("includes files, submodules, and symlinks", () => {
    expect(
      listFixedFiles(
        ["a.txt", "b.txt"],
        [{ path: "sub", sha: "1111111111111111111111111111111111111111" }],
        [{ path: "link", target: "a.txt" }],
      ),
    ).toBe("a.txt\nb.txt\nsub\nlink");
  });
  it("works with only symlinks", () => {
    expect(listFixedFiles([], [], [{ path: "link", target: "a" }])).toBe(
      "link",
    );
  });
});
