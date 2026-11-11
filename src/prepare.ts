import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { DefaultArtifactClient } from "@actions/artifact";
import { z } from "zod";
import { minimatch } from "minimatch";
import * as githubAppToken from "@suzuki-shunsuke/github-app-token";
import { newAppOctokit } from "./app_octokit";
import { readConfig, type Entry } from "./config";
import * as unzip from "./unzip";

type Inputs = {
  appOctokit: githubAppToken.Client;
  workflowName: string;
  /** The name of the artifact uploaded by the client workflow run */
  artifactName: string;
  /** The client workflow run */
  workflowRun: WorkflowRun;
  allowWorkflowFix: boolean;
  config: string;
  configFile: string;
  allowMembersRead: boolean;
  allowOrganizationProjectsWrite: boolean;
};

const User = z.object({
  login: z.string(),
});

export const AutomergeMethod = z.enum(["", "merge", "squash", "rebase"]);
export type AutomergeMethod = z.infer<typeof AutomergeMethod>;

export const PullRequest = z.object({
  title: z.string(),
  body: z.string().default(""),
  base: z.string(),
  labels: z.string().array().default([]),
  assignees: z.string().array().default([]),
  reviewers: z.string().array().default([]),
  team_reviewers: z.string().array().default([]),
  draft: z.boolean(),
  automerge_method: AutomergeMethod.optional(),
  comment: z.string(),
  project: z
    .object({
      number: z.number(),
      owner: z.string(),
      id: z.string().optional(),
    })
    .nullish(),
  milestone_number: z.number().optional(),
});

const Repository = z.object({
  name: z.string(),
  full_name: z.string(),
  owner: User,
});

const PayloadPullRequest = z.object({
  number: z.number(),
});

/**
 * Returns true if p is a normalized relative path in the repository, which
 * the Create a tree API accepts: e.g. "a/b", but not "", ".", "./a", "a/",
 * "/a", "a//b", or "../a".
 */
export const isNormalizedPath = (p: string): boolean =>
  p !== "" &&
  p !== "." &&
  p !== ".." &&
  !p.startsWith("/") &&
  !p.endsWith("/") &&
  !p.startsWith("../") &&
  path.posix.normalize(p) === p &&
  // A newline breaks newline-separated lists like fixed_files. Other
  // characters such as spaces, tabs, and carriage returns are allowed,
  // because Git and the Create a tree API allow them, and paths aren't
  // trimmed.
  !/[\n\u0000]/.test(p);

// The validation of paths assumes that the repository is
// checked out on Linux, whose file systems are case-sensitive and don't
// interpret names specially, unlike Windows (NTFS) and macOS (HFS+, APFS).

export const isGitDir = (component: string): boolean => component === ".git";

// Git's fsck rejects these files as submodules (e.g. gitmodulesBlob)
const gitSpecialFiles = new Set([
  ".gitmodules",
  ".gitattributes",
  ".gitignore",
  ".mailmap",
]);

// Paths and SHAs are validated by validateChanges, not by the schemas, so
// that an invalid request is reported to the client as a comment.
export const Submodule = z.object({
  path: z.string(),
  sha: z.string(),
});

// SHA-1. GitHub doesn't support SHA-256 repositories.
const shaPattern = /^[0-9a-f]{40}$/i;

export type Submodule = z.infer<typeof Submodule>;

const hasGitDir = (p: string): boolean => p.split("/").some(isGitDir);

/**
 * Validates the changed paths sent by the client, which isn't trusted.
 *
 * - A path must be a normalized relative path (isNormalizedPath) without
 *   .git, and a submodule SHA must be a commit SHA.
 * - A path of a file or a submodule must not be passed twice.
 *   fixed_files includes both, and the commit action excludes the paths of
 *   submodules from it, which must be exact.
 * - Unless workflow files can be fixed, no path can be at .github,
 *   .github/workflows, or under .github/workflows, in addition to the
 *   permission of the GitHub App installation access token.
 */
export const validateChanges = (
  files: string[],
  submodules: Submodule[],
  allowWorkflowFix: boolean,
  // Returns true if a file is deleted, i.e. it isn't in the artifact
  isFileDeleted: (file: string) => boolean = () => false,
): void => {
  // Values from the client are quoted with JSON.stringify in errors, which
  // are posted to the client's pull request.
  const q = JSON.stringify;
  for (const submodule of submodules) {
    if (!shaPattern.test(submodule.sha)) {
      throw new Error(
        `the SHA of a submodule must be a commit SHA: ${q(submodule.path)} ${q(submodule.sha)}`,
      );
    }
  }
  for (const file of files) {
    if (!isNormalizedPath(file)) {
      throw new Error(
        `a path of a file must be a normalized relative path in the repository: ${q(file)}`,
      );
    }
    if (hasGitDir(file)) {
      throw new Error(`a path of a file must not contain .git: ${q(file)}`);
    }
  }
  const seen = new Set(files);
  for (const { path: p, kind } of submodules.map((s) => ({
    path: s.path,
    kind: "submodule",
  }))) {
    if (!isNormalizedPath(p)) {
      throw new Error(
        `a path of a ${kind} must be a normalized relative path in the repository: ${q(p)}`,
      );
    }
    if (seen.has(p)) {
      throw new Error(
        `a path of a ${kind} must not be passed with another file or submodule: ${q(p)}`,
      );
    }
    seen.add(p);
    if (hasGitDir(p)) {
      throw new Error(`a path of a ${kind} must not contain .git: ${q(p)}`);
    }
    if (gitSpecialFiles.has(p.split("/").at(-1) ?? "")) {
      throw new Error(
        `a ${kind} must not be .gitmodules, .gitattributes, .gitignore, or .mailmap: ${q(p)}`,
      );
    }
  }
  if (!allowWorkflowFix) {
    for (const p of listChangedPaths(files, submodules)) {
      if (
        p === ".github" ||
        p === ".github/workflows" ||
        p.startsWith(".github/workflows/")
      ) {
        throw new Error(
          `a path can't be changed in .github/workflows unless allow_workflow_fix is true: ${q(p)}`,
        );
      }
    }
  }
  const submodulePaths = new Set(submodules.map((s) => s.path));
  // A path under a submodule in the request isn't allowed, because the
  // submodule entry replaces the directory. A deleted file under it is
  // allowed, because files in a directory are deleted when the directory is
  // replaced with a submodule.
  for (const { path: p, kind } of [
    ...files.map((f) => ({ path: f, kind: "file" })),
    ...submodules.map((s) => ({ path: s.path, kind: "submodule" })),
  ]) {
    const dirs = p.split("/").slice(0, -1);
    for (let i = 1; i <= dirs.length; i++) {
      const dir = dirs.slice(0, i).join("/");
      // Whether a file is deleted is checked only here, after its path is
      // validated, to avoid accessing the file system for other files
      if (submodulePaths.has(dir) && !(kind === "file" && isFileDeleted(p))) {
        throw new Error(`a ${kind} must not be under a submodule: ${q(p)}`);
      }
    }
  }
};

const MetadataInputs = z.object({
  repository: z.string().optional(),
  branch: z.string().optional(),
  pull_request: PullRequest.optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
  // They are parsed by readChanges, so that an invalid value is reported to
  // the client's pull request
  submodules: z.unknown().optional(),
});

const Payload = z.object({
  pull_request: PayloadPullRequest.optional(),
  repository: Repository,
});

const Context = z.object({
  payload: Payload,
});

const Metadata = z.object({
  inputs: MetadataInputs,
  context: Context,
});
type Metadata = z.infer<typeof Metadata>;

export const Outputs = z.object({
  branch: z.string(),
  client_repository: z.string(),
  create_pull_request: z.string().optional(),
  fixed_files: z.string(),
  github_token: z.string(),
  metadata: z.string(),
  custom: z.string(),
  push_repository: z.string(),
  pull_request: z.string().optional(),
  workflow_run: z.string(),
  error: z.string().optional(),
  submodules: z.string().optional(),
  base_sha: z.string().optional(),
});
export type Outputs = z.infer<typeof Outputs>;

class Output {
  isOutput: boolean;
  outputs: Outputs;
  constructor(isOutput: boolean) {
    this.isOutput = isOutput;
    this.outputs = {
      branch: "",
      client_repository: "",
      create_pull_request: undefined,
      fixed_files: "",
      github_token: "",
      metadata: "",
      custom: "",
      push_repository: "",
      workflow_run: "",
    };
  }
  setBranch(branch: string) {
    core.debug(`output branch=${branch}`);
    if (this.isOutput) {
      core.setOutput("branch", branch);
    }
    this.outputs.branch = branch;
  }
  setClientRepository(clientRepository: string) {
    core.debug(`output client_repository=${clientRepository}`);
    if (this.isOutput) {
      core.setOutput("client_repository", clientRepository);
    }
    this.outputs.client_repository = clientRepository;
  }
  setCreatePullRequest(createPullRequest: string) {
    core.debug(`output create_pull_request=${createPullRequest}`);
    if (this.isOutput) {
      core.setOutput("create_pull_request", createPullRequest);
    }
    this.outputs.create_pull_request = createPullRequest;
  }
  setPullRequest(pr: string) {
    core.debug(`output pull_request=${pr}`);
    if (this.isOutput) {
      core.setOutput("pull_request", pr);
    }
    this.outputs.pull_request = pr;
  }
  setFixedFiles(fixedFiles: string) {
    core.debug(`output fixed_files=${fixedFiles}`);
    if (this.isOutput) {
      core.setOutput("fixed_files", fixedFiles);
    }
    this.outputs.fixed_files = fixedFiles;
  }
  setGitHubToken(githubToken: string) {
    if (this.isOutput) {
      core.setOutput("github_token", githubToken);
    }
    this.outputs.github_token = githubToken;
  }
  setMetadata(metadata: string) {
    core.debug(`output metadata=${metadata}`);
    if (this.isOutput) {
      core.setOutput("metadata", metadata);
    }
    this.outputs.metadata = metadata;
  }
  setCustom(custom: unknown) {
    const s = JSON.stringify(custom);
    core.debug(`output custom=${s}`);
    core.setOutput("custom", s); // custom is outputted regardless of `isOutput`
    this.outputs.custom = s;
  }
  setPushRepository(pushRepository: string) {
    core.debug(`output push_repository=${pushRepository}`);
    if (this.isOutput) {
      core.setOutput("push_repository", pushRepository);
    }
    this.outputs.push_repository = pushRepository;
  }
  /**
   * The head commit of the client workflow run (head_sha).
   * It's set only when the commit is pushed to the same repository and branch
   * as the client workflow run, so the commit is created on top of it and the
   * push fails if the branch has been updated since then.
   */
  setBaseSHA(baseSHA: string) {
    if (this.isOutput) {
      core.setOutput("base_sha", baseSHA);
    }
    this.outputs.base_sha = baseSHA;
  }
  setSubmodules(submodules: string) {
    core.debug(`output submodules=${submodules}`);
    if (this.isOutput) {
      core.setOutput("submodules", submodules);
    }
    this.outputs.submodules = submodules;
  }
  setWorkflowRun(workflowRun: string) {
    core.debug(`output workflow_run=${workflowRun}`);
    if (this.isOutput) {
      core.setOutput("workflow_run", workflowRun);
    }
    this.outputs.workflow_run = workflowRun;
  }
}

const getTokenForDest = async (data: Data): Promise<string> => {
  if (
    !data.metadata.inputs.repository ||
    data.metadata.context.payload.repository.full_name ===
      data.metadata.inputs.repository
  ) {
    return data.token;
  }
  const token = await createToken(
    data.inputs,
    data.metadata.context.payload.repository.owner.login,
    [
      data.metadata.inputs.repository?.split("/")[1],
      data.metadata.context.payload.repository.name,
    ],
  );
  core.saveState("dest_token", token.token);
  core.saveState("dest_expires_at", token.expiresAt);
  return token.token;
};

/**
 * Returns the paths of files in _files.txt and submodules, i.e. all changed
 * paths. They are output as fixed_files.
 */
export const listChangedPaths = (
  files: string[],
  submodules: Submodule[],
): string[] => [...files, ...submodules.map((submodule) => submodule.path)];

/**
 * Splits newline-separated files such as _files.txt and fixed_files.
 * Empty and duplicated lines are ignored.
 *
 * Lines are split only with "\n", and they aren't trimmed: a file name can
 * have leading or trailing spaces or a carriage return, and removing them
 * would make another file deleted, e.g. "config.yaml " would be committed as
 * the deletion of "config.yaml", which isn't in the artifact. The client
 * writes _files.txt with "\n".
 */
export const splitFiles = (files: string): string[] => [
  ...new Set(files.split("\n").filter((file) => file.length > 0)),
];

type Changes = {
  files: string[];
  submodules: Submodule[];
  // An error parsing submodules, which is thrown after the request is
  // authorized
  error?: Error;
};

/**
 * Reads the changes in the request: files in _files.txt, and submodules in
 * the metadata file. They aren't validated yet.
 */
const readChanges = (data: Data): Changes => {
  const { inputs, metadata } = data;
  const files = splitFiles(
    fs.readFileSync(`${inputs.artifactName}_files.txt`, "utf8"),
  );
  const submodules = z
    .array(Submodule)
    .optional()
    .safeParse(metadata.inputs.submodules);
  if (!submodules.success) {
    return {
      files,
      submodules: [],
      error: new Error(
        `submodules in the metadata file are invalid: ${submodules.error.message}`,
      ),
    };
  }
  return {
    files,
    // A SHA is lowercased, which the Create a tree API expects
    submodules: (submodules.data ?? []).map((submodule) => ({
      ...submodule,
      sha: submodule.sha.toLowerCase(),
    })),
  };
};

/**
 * Outputs the changes. fixed_files includes the paths of submodules too, so
 * that custom validation of fixed_files checks every changed path. The commit
 * action excludes them from the files to commit.
 *
 * They are output before they are validated, as before, so that steps run
 * on failure can read them. The commit action doesn't run if prepare fails.
 */
const setChanges = (outputs: Output, changes: Changes): void => {
  const { files, submodules } = changes;
  outputs.setFixedFiles(listChangedPaths(files, submodules).join("\n"));
  if (submodules.length > 0) {
    outputs.setSubmodules(JSON.stringify(submodules));
  }
};

/**
 * Validates the changes in the request.
 *
 * It's called after the request is authorized (e.g. the workflow name, the
 * protected branch, and the config), so that an unauthorized request is
 * reported as such, and after the pull_request output is set, so that the
 * notify action can post the error to the client's pull request.
 */
const validateRequestChanges = (data: Data, changes: Changes): void => {
  if (changes.error) {
    throw changes.error;
  }
  // The commit action reads files relative to the current directory, where
  // the artifact is extracted (GITHUB_WORKSPACE), and deletes a file which
  // doesn't exist (deleteIfNotExist)
  validateChanges(
    changes.files,
    changes.submodules,
    data.inputs.allowWorkflowFix,
    (file) => !fs.existsSync(file),
  );
};

export const validateRepository = async (data: Data): Promise<Output> => {
  const inputs = data.inputs;
  const outputs = data.outputs;
  const metadata = data.metadata;
  const changes = readChanges(data);
  setChanges(outputs, changes);
  const token = await getTokenForDest(data);
  outputs.setGitHubToken(token);
  const octokit = github.getOctokit(token);

  const clientRepo = metadata.context.payload.repository.full_name;
  const clientOwner = metadata.context.payload.repository.owner.login;
  const clientRepoName = metadata.context.payload.repository.name;

  const destRepo = metadata.inputs.repository || clientRepo;
  outputs.setPushRepository(destRepo);
  const destBranch = metadata.inputs.branch || data.branch;
  outputs.setBranch(destBranch);
  const destOwner = clientOwner;
  const destRepoName = destRepo.split("/")[1];

  let prBaseBranch = "";
  if (metadata.inputs.pull_request?.title) {
    if (metadata.inputs.pull_request?.base) {
      prBaseBranch = metadata.inputs.pull_request.base;
    } else {
      // Get the default branch
      prBaseBranch = await getDefaultBranch(octokit, destOwner, destRepoName);
      metadata.inputs.pull_request.base = prBaseBranch;
    }
    outputs.setCreatePullRequest(JSON.stringify(metadata.inputs.pull_request));
  }

  // Get a pull request
  if (metadata.context.payload.pull_request) {
    const { data: pullRequest } = await octokit.rest.pulls.get({
      owner: clientOwner,
      repo: clientRepoName,
      pull_number: metadata.context.payload.pull_request.number,
    });
    outputs.setPullRequest(JSON.stringify(pullRequest));
  }

  if (!data.branch) {
    throw new Error("workflowRun.head_branch is not set");
  }

  // Validate workflow name
  if (inputs.workflowName && data.workflowName !== inputs.workflowName) {
    throw new Error(
      `The client workflow name must be ${inputs.workflowName}, but got ${data.workflowName}`,
    );
  }

  if (!metadata.inputs.branch && !metadata.inputs.repository) {
    // By default, push to the same repository and branch as the workflow run.
    // Create the commit on top of the head commit of the workflow run,
    // so that a request for an old workflow run can't revert changes pushed
    // after it: the ref isn't force-updated, so the push fails unless the
    // branch is still at that commit.
    // data.sha is never empty here, because it's empty only when getting the
    // workflow run failed, in which case data.branch is also empty and the
    // check above fails.
    outputs.setBaseSHA(data.sha);
    validateRequestChanges(data, changes);
    return outputs;
  }

  // If pushed repository and branch are specified, the workflow run branch must be protected.
  const { data: branch } = await octokit.rest.repos.getBranch({
    owner: clientOwner,
    repo: clientRepoName,
    branch: data.branch,
  });
  if (!branch.protected) {
    throw new Error("the workflow run head branch must be protected");
  }
  // Reject a request for an old workflow run, which could revert changes
  // pushed after it. head_sha isn't a commit of the destination, so it can't be
  // used as the parent of the commit as in the default case.
  validateHeadSHA(data.branch, branch.commit.sha, data.sha);

  // Read YAML config to push a commit to other repositories and branches
  const config = readConfig();

  for (const entry of config.entries) {
    if (!matchClientRepositories(entry, clientRepo)) {
      continue;
    }
    if (
      !(await matchClientBranches(
        octokit,
        entry,
        clientOwner,
        clientRepoName,
        data.branch ?? "",
      ))
    ) {
      continue;
    }
    if (!matchPushRepositories(entry, destRepo, clientRepo)) {
      continue;
    }
    if (!matchPushBranches(entry, destBranch)) {
      continue;
    }

    if (!entry.pull_request) {
      throw new Error("Creating a pull request isn't allowed for this entry");
    }
    validateRequestChanges(data, changes);
    return outputs;
  }

  throw new Error(
    "No matching entry found in the config for the given repository and branch.",
  );
};

export type LabelInputs = {
  labelName: string;
  labelDescription: string;
};

const dispatchInputNames = [
  "artifact_name",
  "client_repository_owner",
  "client_repository_name",
  "client_workflow_run_id",
] as const;

/**
 * Works out the artifact and the client workflow run.
 *
 * When the server workflow is run by a workflow_dispatch event, they are read
 * from the inputs of the event, which the client action sets.
 * Otherwise they are read from the label (labels:created event).
 */
export const readRequest = (
  eventName: string,
  label: LabelInputs,
  dispatchInputs: Record<string, unknown> | undefined,
): { artifactName: string; workflowRun: WorkflowRun } => {
  if (eventName !== "workflow_dispatch") {
    if (!label.labelName) {
      throw new Error("label_name is required");
    }
    if (!label.labelDescription) {
      throw new Error("label_description is required");
    }
    return {
      artifactName: label.labelName,
      workflowRun: parseLabelDescription(label.labelDescription),
    };
  }
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of dispatchInputNames) {
    const value = dispatchInputs?.[name];
    if (typeof value !== "string" || !value) {
      missing.push(name);
      continue;
    }
    values[name] = value;
  }
  if (missing.length > 0) {
    throw new Error(
      `The workflow_dispatch event must have the inputs ${dispatchInputNames.join(", ")}. Missing: ${missing.join(", ")}`,
    );
  }
  return {
    artifactName: values.artifact_name,
    workflowRun: {
      owner: validateName(
        "client_repository_owner",
        values.client_repository_owner,
      ),
      repo: validateName(
        "client_repository_name",
        values.client_repository_name,
      ),
      runId: parseRunId(
        "client_workflow_run_id",
        values.client_workflow_run_id,
      ),
    },
  };
};

/**
 * Fails unless a workflow_dispatch event runs on the default branch.
 *
 * Unlike a label event, which always runs the workflow on the default branch,
 * workflow_dispatch lets the client choose any branch or tag of the server
 * repository, where an old and vulnerable server workflow may remain.
 * The default branch is read from the event payload, so no API call is needed.
 */
export const validateRef = (
  eventName: string,
  ref: string,
  defaultBranch: string | undefined,
): void => {
  if (eventName !== "workflow_dispatch") {
    return;
  }
  if (!defaultBranch) {
    throw new Error(
      "The default branch of the server repository isn't found in the event payload",
    );
  }
  if (ref !== `refs/heads/${defaultBranch}`) {
    throw new Error(
      `The server workflow must run on the default branch ${defaultBranch}, but got ${ref}`,
    );
  }
};

/**
 * Fails unless the client workflow run is for the latest commit of its branch.
 */
export const validateHeadSHA = (
  branchName: string,
  branchSHA: string,
  runSHA: string,
): void => {
  if (!runSHA || branchSHA !== runSHA) {
    throw new Error(
      `The client workflow run must be for the latest commit ${branchSHA} of the branch ${branchName}, but got ${runSHA || "(empty)"}`,
    );
  }
};

export const readInputs = (): Inputs => {
  validateRef(
    github.context.eventName,
    github.context.ref,
    github.context.payload.repository?.default_branch,
  );
  const request = readRequest(
    github.context.eventName,
    {
      labelName: core.getInput("label_name"),
      labelDescription: core.getInput("label_description"),
    },
    github.context.payload.inputs,
  );
  return {
    appOctokit: newAppOctokit(),
    artifactName: request.artifactName,
    workflowRun: request.workflowRun,
    allowWorkflowFix: core.getBooleanInput("allow_workflow_fix"),
    config: core.getInput("config"),
    configFile: core.getInput("config_file"),
    workflowName: core.getInput("workflow_name"),
    allowMembersRead: core.getBooleanInput("allow_members_read"),
    allowOrganizationProjectsWrite: core.getBooleanInput(
      "allow_organization_projects_write",
    ),
  };
};

export const action = async () => {
  const inputs = readInputs();
  await main(inputs, true);
};

type WorkflowRun = {
  owner: string;
  repo: string;
  runId: number;
};

// Cache for default branch to avoid redundant API calls
const defaultBranchCache = new Map<string, string>();

const getDefaultBranch = async (
  octokit: ReturnType<typeof github.getOctokit>,
  owner: string,
  repo: string,
): Promise<string> => {
  const key = `${owner}/${repo}`;
  const cached = defaultBranchCache.get(key);
  if (cached) {
    return cached;
  }
  const { data: repository } = await octokit.rest.repos.get({ owner, repo });
  defaultBranchCache.set(key, repository.default_branch);
  return repository.default_branch;
};

// Validation functions for config entry matching

export const matchClientRepositories = (
  entry: Entry,
  clientRepo: string,
): boolean => {
  return entry.client.repositories.some((repo) => minimatch(clientRepo, repo));
};

export const matchClientBranches = async (
  octokit: ReturnType<typeof github.getOctokit>,
  entry: Entry,
  clientOwner: string,
  clientRepoName: string,
  branch: string,
): Promise<boolean> => {
  if (entry.client.branches) {
    return entry.client.branches.some((b) => minimatch(branch, b));
  }
  const defaultBranch = await getDefaultBranch(
    octokit,
    clientOwner,
    clientRepoName,
  );
  return branch === defaultBranch;
};

export const matchPushRepositories = (
  entry: Entry,
  destRepo: string,
  clientRepo: string,
): boolean => {
  if (entry.push.repositories) {
    return entry.push.repositories.some((repo) => minimatch(destRepo, repo));
  }
  return destRepo === clientRepo;
};

export const matchPushBranches = (
  entry: Entry,
  destBranch: string,
): boolean => {
  return entry.push.branches.some((branch) => minimatch(destBranch, branch));
};

// GitHub owner and repository names consist of alphanumerics, "-", "_", and ".".
const namePattern = /^[A-Za-z0-9_.-]+$/;

const validateName = (key: string, value: string): string => {
  if (!namePattern.test(value)) {
    throw new Error(`${key} is invalid: ${value}`);
  }
  return value;
};

/**
 * Parses a workflow run ID strictly.
 * Number() and parseInt() accept values such as "0x1A", "1e3", " 42 ",
 * and "123abc", so the format is checked first.
 */
export const parseRunId = (key: string, value: string): number => {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${key} must be a positive integer, got ${value}`);
  }
  const runId = Number(value);
  if (!Number.isSafeInteger(runId)) {
    throw new Error(`${key} must be a positive integer, got ${value}`);
  }
  return runId;
};

export const parseLabelDescription = (
  labelDescription: string,
): WorkflowRun => {
  const elems = labelDescription.split("/");
  if (elems.length !== 3) {
    throw new Error(
      "Label description must be in the format <repository owner>/<repository name>/<workflow run ID>",
    );
  }
  return {
    owner: validateName(
      "the repository owner of the label description",
      elems[0],
    ),
    repo: validateName(
      "the repository name of the label description",
      elems[1],
    ),
    runId: parseRunId("the workflow run ID of the label description", elems[2]),
  };
};

type Repository = {
  owner: string;
  repo: string;
};

const createToken = async (
  inputs: Inputs,
  owner: string,
  repositories: string[],
): Promise<githubAppToken.Token> => {
  const permissions: githubAppToken.Permissions = {
    actions: "read", // Download Artifacts. Client repositories
    contents: "write", // Create commits. Destination repositories
    pull_requests: "write", // Create and update PRs. Destination repositories
  };
  if (inputs.allowWorkflowFix) {
    permissions.workflows = "write"; // Create and Update workflow files. Destination repositories
  }
  if (inputs.allowMembersRead) {
    permissions.members = "read"; // Request reviews to teams. Destination repositories
  }
  if (inputs.allowOrganizationProjectsWrite) {
    permissions.organization_projects = "write"; // Add PRs to organization projects
  }
  core.info(
    `Creating a github token owner=${owner} repositories=${repositories.join(",")}`,
  );
  const token = await githubAppToken.create({
    octokit: inputs.appOctokit,
    owner: owner,
    repositories: repositories,
    permissions: permissions,
  });
  core.setSecret(token.token);
  return token;
};

export const downloadArtifact = async (
  token: string,
  workflowRun: WorkflowRun,
  artifactName: string,
): Promise<void> => {
  // Download a GitHub Actions Artifact
  const artifact = new DefaultArtifactClient();
  core.info(`Getting an artifact`);
  const artifactOpts = {
    findBy: {
      token: token,
      repositoryOwner: workflowRun.owner,
      repositoryName: workflowRun.repo,
      workflowRunId: workflowRun.runId,
    },
  };
  const { artifact: targetArtifact } = await artifact.getArtifact(
    artifactName,
    artifactOpts,
  );
  if (!targetArtifact) {
    core.setFailed(`Artifact '${artifactName}' not found`);
    return;
  }
  // The artifact is downloaded as a zip file and extracted by unzip.extract()
  // instead of being extracted by `@actions/artifact`, which doesn't restore
  // file modes.
  const workspace = process.env.GITHUB_WORKSPACE;
  if (!workspace) {
    throw new Error("Unable to get the GITHUB_WORKSPACE env variable");
  }
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), "securefix-"));
  try {
    core.info(`Downloading an artifact`);
    await artifact.downloadArtifact(targetArtifact.id, {
      ...artifactOpts,
      path: downloadDir,
      skipDecompress: true,
    });
    // The downloaded file name is derived from the Content-Disposition header of
    // the response, so the file is found by listing the directory.
    const files = fs.readdirSync(downloadDir);
    if (files.length !== 1) {
      throw new Error(
        `One downloaded artifact file is expected, but got ${files.length} files: ${files.join(", ")}`,
      );
    }
    core.info(`Extracting the artifact into ${workspace}`);
    await unzip.extract(path.join(downloadDir, files[0]), workspace);
  } finally {
    fs.rmSync(downloadDir, { recursive: true, force: true });
  }
};

type Data = {
  inputs: Inputs;
  workflowRun: WorkflowRun;
  token: string;
  sha: string;
  /** The branch where the workflow run was triggered */
  branch: string;
  workflowName: string;
  runId: number;
  outputs: Output;
  metadata: Metadata;
};

export const prepare = async (
  inputs: Inputs,
  isOutput: boolean,
): Promise<Data> => {
  const outputs = new Output(isOutput);
  const workflowRun = inputs.workflowRun;
  core.notice(
    `client workflow run: ${github.context.serverUrl}/${workflowRun.owner}/${workflowRun.repo}/actions/runs/${workflowRun.runId}`,
  );
  outputs.setClientRepository(`${workflowRun.owner}/${workflowRun.repo}`);

  // create github app token
  const token = await createToken(inputs, workflowRun.owner, [
    workflowRun.repo,
  ]);
  core.saveState("token", token.token);
  core.saveState("expires_at", token.expiresAt);
  outputs.setGitHubToken(token.token);
  await downloadArtifact(token.token, workflowRun, inputs.artifactName);

  const metadataS = fs.readFileSync(`${inputs.artifactName}.json`, "utf8");
  const metadata = Metadata.parse(JSON.parse(metadataS));
  outputs.setMetadata(metadataS);
  outputs.setCustom(metadata.inputs.custom ?? {});

  if (metadata.context.payload.pull_request?.number) {
    core.notice(
      `client pr: ${github.context.serverUrl}/${metadata.context.payload.repository.owner.login}/${metadata.context.payload.repository.name}/pull/${metadata.context.payload.pull_request.number}`,
    );
  }

  try {
    const octokit = github.getOctokit(token.token);
    const { data: wr } = await octokit.rest.actions.getWorkflowRun({
      owner: metadata.context.payload.repository.owner.login,
      repo: metadata.context.payload.repository.name,
      run_id: workflowRun.runId,
    });
    outputs.setWorkflowRun(JSON.stringify(wr));
    return {
      inputs,
      workflowRun,
      token: token.token,
      runId: workflowRun.runId,
      sha: wr.head_sha,
      branch: wr.head_branch ?? "",
      workflowName: wr.name ?? "",
      outputs,
      metadata,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    core.error(`Failed to get the workflow run: ${msg}`);
    return {
      inputs,
      workflowRun,
      token: token.token,
      runId: workflowRun.runId,
      sha: "",
      branch: "",
      workflowName: "",
      outputs,
      metadata,
    };
  }
};

export const main = async (
  inputs: Inputs,
  isOutput: boolean,
): Promise<Output> => {
  const data = await prepare(inputs, isOutput);
  return await validateRepository(data);
};
