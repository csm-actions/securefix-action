import * as fs from "fs";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { DefaultArtifactClient } from "@actions/artifact";
import { z } from "zod";
import { minimatch } from "minimatch";
import * as githubAppToken from "@suzuki-shunsuke/github-app-token";
import { readConfig, type Entry } from "./config";

type Inputs = {
  appId: string;
  appPrivateKey: string;
  workflowName: string;
  labelName: string;
  labelDescription: string;
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

const PullRequest = z.object({
  title: z.string(),
  body: z.string(),
  base: z.string(),
  labels: z.string().array(),
  assignees: z.string().array(),
  reviewers: z.string().array(),
  team_reviewers: z.string().array(),
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

const Inputs = z.object({
  repository: z.string().optional(),
  branch: z.string().optional(),
  pull_request: PullRequest.optional(),
});

const Payload = z.object({
  pull_request: PayloadPullRequest.optional(),
  repository: Repository,
});

const Context = z.object({
  payload: Payload,
});

const Metadata = z.object({
  inputs: Inputs,
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
  push_repository: z.string(),
  pull_request: z.string().optional(),
  workflow_run: z.string(),
  error: z.string().optional(),
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
  setPushRepository(pushRepository: string) {
    core.debug(`output push_repository=${pushRepository}`);
    if (this.isOutput) {
      core.setOutput("push_repository", pushRepository);
    }
    this.outputs.push_repository = pushRepository;
  }
  setWorkflowRun(workflowRun: string) {
    core.debug(`output workflow_run=${workflowRun}`);
    if (this.isOutput) {
      core.setOutput("workflow_run", workflowRun);
    }
    this.outputs.workflow_run = workflowRun;
  }
}

export const validateRepository = async (data: Data): Promise<Output> => {
  const inputs = data.inputs;
  const outputs = data.outputs;
  const metadata = data.metadata;
  // Read metadata
  const fixedFiles = fs
    .readFileSync(`${inputs.labelName}_files.txt`, "utf8")
    .trim();
  outputs.setFixedFiles(fixedFiles);
  const octokit = github.getOctokit(data.token);

  if (
    metadata.inputs.pull_request?.title &&
    !metadata.inputs.pull_request?.base
  ) {
    // Get the default branch
    const { data: repository } = await octokit.rest.repos.get({
      owner: metadata.context.payload.repository.owner.login,
      repo: metadata.context.payload.repository.name,
    });
    metadata.inputs.pull_request.base = repository.default_branch;
  }

  if (metadata.inputs.pull_request?.title && fixedFiles) {
    outputs.setCreatePullRequest(JSON.stringify(metadata.inputs.pull_request));
  }

  // Get a pull request
  if (metadata.context.payload.pull_request) {
    const { data: pullRequest } = await octokit.rest.pulls.get({
      owner: metadata.context.payload.repository.owner.login,
      repo: metadata.context.payload.repository.name,
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
    outputs.setPushRepository(metadata.context.payload.repository.full_name);
    outputs.setBranch(data.branch);
    return outputs;
  }

  // If pushed repository and branch are specified, the workflow run branch must be protected.
  const { data: branch } = await octokit.rest.repos.getBranch({
    owner: metadata.context.payload.repository.owner.login,
    repo: metadata.context.payload.repository.name,
    branch: data.branch,
  });
  if (!branch.protected) {
    throw new Error("the workflow run head branch must be protected");
  }

  // Read YAML config to push a commit to other repositories and branches
  const config = readConfig();
  const destRepo =
    metadata.inputs.repository || metadata.context.payload.repository.full_name;
  const destBranch = metadata.inputs.branch || data.branch;

  const clientRepo = metadata.context.payload.repository.full_name;
  const clientOwner = metadata.context.payload.repository.owner.login;
  const clientRepoName = metadata.context.payload.repository.name;

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

    // All conditions matched
    outputs.setPushRepository(destRepo);
    outputs.setBranch(destBranch);

    if (metadata.inputs.pull_request?.title) {
      if (!metadata.inputs.pull_request.base) {
        throw new Error(
          "pull_request base branch is required to create a pull request",
        );
      }
      if (!entry.pull_request) {
        throw new Error("Creating a pull request isn't allowed for this entry");
      }
      if (
        !(await validatePullRequestBaseBranch(
          octokit,
          entry,
          destRepo,
          metadata.inputs.pull_request.base,
        ))
      ) {
        throw new Error(
          "The given pull request branch isn't allowed for this entry",
        );
      }
      outputs.setPullRequest(JSON.stringify(metadata.inputs.pull_request));
    }
    return outputs;
  }

  throw new Error(
    "No matching entry found in the config for the given repository and branch.",
  );
};

export const readInputs = (): Inputs => {
  return {
    appId: core.getInput("app_id", { required: true }),
    appPrivateKey: core.getInput("app_private_key", { required: true }),
    labelName: core.getInput("label_name", { required: true }),
    labelDescription: core.getInput("label_description", { required: true }),
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

const matchClientRepositories = (entry: Entry, clientRepo: string): boolean => {
  return entry.client.repositories.some((repo) => minimatch(clientRepo, repo));
};

const matchClientBranches = async (
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

const matchPushRepositories = (
  entry: Entry,
  destRepo: string,
  clientRepo: string,
): boolean => {
  if (entry.push.repositories) {
    return entry.push.repositories.some((repo) => minimatch(destRepo, repo));
  }
  return destRepo === clientRepo;
};

const matchPushBranches = (entry: Entry, destBranch: string): boolean => {
  return entry.push.branches.some((branch) => minimatch(destBranch, branch));
};

const validatePullRequestBaseBranch = async (
  octokit: ReturnType<typeof github.getOctokit>,
  entry: Entry,
  destRepo: string,
  baseBranch: string,
): Promise<boolean> => {
  if (!entry.pull_request) {
    return false;
  }
  if (entry.pull_request.base_branches) {
    return entry.pull_request.base_branches.includes(baseBranch);
  }
  const [destOwner, destRepoName] = destRepo.split("/");
  const defaultBranch = await getDefaultBranch(
    octokit,
    destOwner,
    destRepoName,
  );
  return baseBranch === defaultBranch;
};

const parseLabelDescription = (labelDescription: string): WorkflowRun => {
  const elems = labelDescription.split("/");
  if (elems.length !== 3) {
    throw new Error(
      "Label description must be in the format <repository owner>/<repository name>/<workflow run ID>",
    );
  }
  return {
    owner: elems[0],
    repo: elems[1],
    runId: parseInt(elems[2], 10),
  };
};

type Repository = {
  owner: string;
  repo: string;
};

const createToken = async (
  inputs: Inputs,
  repo: Repository,
): Promise<githubAppToken.Token> => {
  const permissions: githubAppToken.Permissions = {
    actions: "read",
    contents: "write",
    pull_requests: "write",
  };
  if (inputs.allowWorkflowFix) {
    permissions.workflows = "write";
  }
  if (inputs.allowMembersRead) {
    permissions.members = "read";
  }
  if (inputs.allowOrganizationProjectsWrite) {
    permissions.organization_projects = "write";
  }
  core.info(`Creating a github token`);
  const token = await githubAppToken.create({
    appId: inputs.appId,
    privateKey: inputs.appPrivateKey,
    owner: repo.owner,
    repositories: [repo.repo],
    permissions: permissions,
  });
  core.setSecret(token.token);
  return token;
};

const downloadArtifact = async (
  token: string,
  workflowRun: WorkflowRun,
  labelName: string,
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
    labelName,
    artifactOpts,
  );
  if (!targetArtifact) {
    core.setFailed(`Artifact '${labelName}' not found`);
    return;
  }
  core.info(`Downloading an artifact`);
  await artifact.downloadArtifact(targetArtifact.id, artifactOpts);
};

type Data = {
  inputs: Inputs;
  workflowRun: WorkflowRun;
  token: string;
  sha: string;
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
  const workflowRun = parseLabelDescription(inputs.labelDescription);
  core.notice(
    `client workflow run: ${github.context.serverUrl}/${workflowRun.owner}/${workflowRun.repo}/actions/runs/${workflowRun.runId}`,
  );
  outputs.setClientRepository(`${workflowRun.owner}/${workflowRun.repo}`);

  // create github app token
  const token = await createToken(inputs, {
    owner: workflowRun.owner,
    repo: workflowRun.repo,
  });
  core.saveState("token", token.token);
  core.saveState("expires_at", token.expiresAt);
  outputs.setGitHubToken(token.token);
  await downloadArtifact(token.token, workflowRun, inputs.labelName);

  const metadataS = fs.readFileSync(`${inputs.labelName}.json`, "utf8");
  const metadata = Metadata.parse(JSON.parse(metadataS));
  outputs.setMetadata(metadataS);

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
