import * as fs from "fs";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { DefaultArtifactClient } from "@actions/artifact";
import { z } from "zod";
import { minimatch } from "minimatch";
import * as githubAppToken from "@suzuki-shunsuke/github-app-token";
import { readConfig } from "./config";

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

const PullRequest = z.object({
  title: z.string(),
  body: z.string(),
  base: z.string(),
  labels: z.array(z.string()),
  assignees: z.array(z.string()),
  reviewers: z.array(z.string()),
  team_reviewers: z.array(z.string()),
  draft: z.boolean(),
  automerge_method: z.optional(z.enum(["", "merge", "squash", "rebase"])),
  comment: z.string(),
  project: z.optional(
    z.nullable(
      z.object({
        number: z.number(),
        owner: z.string(),
        id: z.optional(z.string()),
      }),
    ),
  ),
  milestone_number: z.optional(z.number()),
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
  repository: z.optional(z.string()),
  branch: z.optional(z.string()),
  pull_request: z.optional(PullRequest),
});

const Payload = z.object({
  pull_request: z.optional(PayloadPullRequest),
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
  create_pull_request: z.optional(z.string()),
  fixed_files: z.string(),
  github_token: z.string(),
  metadata: z.string(),
  push_repository: z.string(),
  pull_request: z.optional(z.string()),
  workflow_run: z.string(),
  error: z.optional(z.string()),
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
  const token = data.token;
  const runId = data.runId;
  const outputs = data.outputs;
  const metadata = data.metadata;
  // Read metadata
  const fixedFiles = fs
    .readFileSync(`${inputs.labelName}_files.txt`, "utf8")
    .trim();
  outputs.setFixedFiles(fixedFiles);
  const octokit = github.getOctokit(token);

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
  // Get GitHub Actions Workflow Run
  const workflowName = inputs.workflowName;
  const { data: workflowRun } = await octokit.rest.actions.getWorkflowRun({
    owner: metadata.context.payload.repository.owner.login,
    repo: metadata.context.payload.repository.name,
    run_id: runId,
  });

  if (!workflowRun.head_branch) {
    throw new Error("workflowRun.head_branch is not set");
  }
  const headBranch = workflowRun.head_branch;

  outputs.setWorkflowRun(JSON.stringify(workflowRun));
  // Validate workflow name
  if (workflowName && workflowRun.name !== workflowName) {
    throw new Error(
      `The client workflow name must be ${workflowName}, but got ${workflowRun.name}`,
    );
  }

  // Validate repository and branch
  if (!metadata.inputs.branch && !metadata.inputs.repository) {
    outputs.setPushRepository(metadata.context.payload.repository.full_name);
    outputs.setBranch(workflowRun.head_branch);
    return outputs;
  }

  // check if head branch is protected
  const { data: branch } = await octokit.rest.repos.getBranch({
    owner: metadata.context.payload.repository.owner.login,
    repo: metadata.context.payload.repository.name,
    branch: headBranch,
  });
  if (!branch.protected) {
    throw new Error("the workflow run head branch must be protected");
  }

  // Read YAML config to push other repositories and branches
  const config = readConfig();
  const destRepo =
    metadata.inputs.repository || metadata.context.payload.repository.full_name;
  const destBranch = metadata.inputs.branch || workflowRun.head_branch;
  (() => {
    for (const entry of config.entries) {
      if (
        entry.client.repositories.some((repo) =>
          minimatch(metadata.context.payload.repository.full_name, repo),
        ) &&
        entry.client.branches.some((branch) => minimatch(headBranch, branch)) &&
        entry.push.repositories.some((repo) => minimatch(destRepo, repo)) &&
        entry.push.branches.some((branch) => minimatch(destBranch, branch))
      ) {
        outputs.setPushRepository(destRepo);
        outputs.setBranch(destBranch);
        if (metadata.inputs.pull_request?.title) {
          if (!metadata.inputs.pull_request.base) {
            throw new Error(
              "pull_request base branch is required to create a pull request",
            );
          }
          if (!entry.pull_request) {
            throw new Error(
              "Creating a pull request isn't allowed for this entry",
            );
          }
          if (
            !entry.pull_request.base_branches.includes(
              metadata.inputs.pull_request.base,
            )
          ) {
            throw new Error(
              "The given pull request branch isn't allowed for this entry",
            );
          }
          outputs.setPullRequest(JSON.stringify(metadata.inputs.pull_request));
        }
        return;
      }
    }
    throw new Error(
      "No matching entry found in the config for the given repository and branch.",
    );
  })();
  return outputs;
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
  return await githubAppToken.create({
    appId: inputs.appId,
    privateKey: inputs.appPrivateKey,
    owner: repo.owner,
    repositories: [repo.repo],
    permissions: permissions,
  });
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

  return {
    inputs,
    workflowRun,
    token: token.token,
    runId: workflowRun.runId,
    outputs,
    metadata,
  };
};

export const main = async (
  inputs: Inputs,
  isOutput: boolean,
): Promise<Output> => {
  const data = await prepare(inputs, isOutput);
  return await validateRepository(data);
};
