import * as fs from "fs";
import { z } from "zod";
import { load } from "js-yaml";
import { minimatch } from 'minimatch';
import * as core from "@actions/core";
import * as github from "@actions/github";
import { client } from "./client";

type Input = {
  config: string;
  configFile: string;
  metadataFile: string;
};

const Client = z.object({
  repositories: z.array(z.string()),
  branches: z.array(z.string()),
});

const Push = z.object({
  repositories: z.array(z.string()),
  branches: z.array(z.string()),
});

const PullRequestEntry = z.object({
  base_branches: z.array(z.string()),
});

const Entry = z.object({
  client: Client,
  push: Push,
  pull_request: z.optional(PullRequestEntry),
});

export const Config = z.object({
  entries: z.array(Entry),
});
type Config = z.infer<typeof Config>;

const PullRequest = z.object({
  title: z.string(),
  body: z.string(),
  base: z.string(),
  labels: z.array(z.string()),
  assignees: z.array(z.string()),
  reviewers: z.array(z.string()),
  team_reviewers: z.array(z.string()),
  draft: z.boolean(),
  automerge_method: z.optional(z.enum(['', 'merge', 'squash', 'rebase'])),
  comment: z.string(),
  project: z.optional(z.nullable(z.object({
    number: z.number(),
    owner: z.string(),
  }))),
  milestone_number: z.optional(z.number()),
});

const Inputs = z.object({
  repository: z.optional(z.string()),
  branch: z.optional(z.string()),
  root_dir: z.optional(z.string()),
  pull_request: z.optional(PullRequest),
});

const User = z.object({
  login: z.string(),
});

const Repository = z.object({
  name: z.string(),
  full_name: z.string(),
  owner: User,
});

const PayloadPullRequest = z.object({
  number: z.number(),
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

const readConfig = (config: string, configFile: string): Config => {
  if (!config && !configFile) {
    throw new Error("Either config or config_file input is required");
  }
  return Config.parse(load(config ? config : fs.readFileSync(configFile, "utf8")));
};

export const main = async () => {
  const action = core.getInput("action", { required: true });
  if (action === "client") {
    await client();
    return;
  }
  const configS = core.getInput("config", { required: false });
  const configFile = core.getInput("config_file", { required: false });
  if (action === "validate-config") {
    readConfig(configS, configFile);
    return;
  }
  if (action !== "validate-repository") {
    throw new Error(`Unknown action (${action}). action must be either validate-config or validate-repository`);
  }
  const input: Input = {
    metadataFile: core.getInput("metadata_file", { required: true }),
    config: configS,
    configFile: configFile,
  };

  // Read metadata 
  const metadataS = fs.readFileSync(input.metadataFile, "utf8");
  const metadata = Metadata.parse(JSON.parse(metadataS));
  core.setOutput("metadata", metadataS);
  const fixedFiles = fs.readFileSync(core.getInput("changed_files", { required: true }), "utf8").trim();
  core.setOutput("fixed_files", fixedFiles);

  const octokit = github.getOctokit(core.getInput("github_token", { required: true }));

  if (metadata.inputs.pull_request?.title && !metadata.inputs.pull_request?.base) {
    // Get the default branch
    const { data: repository } = await octokit.rest.repos.get({
      owner: metadata.context.payload.repository.owner.login,
      repo: metadata.context.payload.repository.name,
    });
    metadata.inputs.pull_request.base = repository.default_branch;
  }

  if (metadata.inputs.pull_request?.title && fixedFiles) {
    core.setOutput("create_pull_request", metadata.inputs.pull_request);
    core.setOutput("automerge_method", metadata.inputs.pull_request.automerge_method || "");
    core.setOutput("project_owner", metadata.inputs.pull_request.project?.owner || "");
    core.setOutput("project_number", metadata.inputs.pull_request.project?.number || 0);
  }
  core.setOutput("root_dir", metadata.inputs.root_dir || "");

  // Get a pull request
  if (metadata.context.payload.pull_request) {
    core.setOutput("pull_request_number", metadata.context.payload.pull_request.number);
    const { data: pullRequest } = await octokit.rest.pulls.get({
      owner: metadata.context.payload.repository.owner.login,
      repo: metadata.context.payload.repository.name,
      pull_number: metadata.context.payload.pull_request.number,
    });
    core.setOutput("pull_request", pullRequest);
  }
  // Get GitHub Actions Workflow Run
  const workflowName = core.getInput("workflow_name", { required: false });
  const { data: workflowRun } = await octokit.rest.actions.getWorkflowRun({
    owner: metadata.context.payload.repository.owner.login,
    repo: metadata.context.payload.repository.name,
    run_id: parseInt(core.getInput("run_id", { required: true }), 10),
  });

  if (!workflowRun.head_branch) {
    throw new Error("workflowRun.head_branch is not set");
  }
  const headBranch = workflowRun.head_branch;

  core.setOutput("workflow_run", workflowRun);
  // Validate workflow name
  if (workflowName && workflowRun.name !== workflowName) {
    throw new Error(`The client workflow name must be ${workflowName}, but got ${workflowRun.name}`);
  }

  // Validate repository and branch
  if (!metadata.inputs.branch && !metadata.inputs.repository) {
    core.setOutput("repository", metadata.context.payload.repository.full_name);
    core.setOutput("repository_owner", metadata.context.payload.repository.owner.login);
    core.setOutput("repository_name", metadata.context.payload.repository.name);
    core.setOutput("branch", workflowRun.head_branch);
    return;
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
  const config = readConfig(configS, configFile);
  const destRepo = metadata.inputs.repository || metadata.context.payload.repository.full_name;
  const destBranch = metadata.inputs.branch || workflowRun.head_branch;
  (() => {
    for (const entry of config.entries) {
      if (entry.client.repositories.some(repo => minimatch(metadata.context.payload.repository.full_name, repo)) &&
        entry.client.branches.some(branch => minimatch(headBranch, branch)) &&
        entry.push.repositories.some(repo => minimatch(destRepo, repo)) &&
        entry.push.branches.some(branch => minimatch(destBranch, branch))
      ) {
        core.setOutput("repository", destRepo);
        core.setOutput("repository_owner", destRepo.split("/")[0]);
        core.setOutput("repository_name", destRepo.split("/")[1]);
        core.setOutput("branch", destBranch);
        if (metadata.inputs.pull_request?.title) {
          if (!metadata.inputs.pull_request.base) {
            throw new Error("pull_request base branch is required to create a pull request");
          }
          if (!entry.pull_request) {
            throw new Error("Creating a pull request isn't allowed for this entry");
          }
          if (!entry.pull_request.base_branches.includes(metadata.inputs.pull_request.base)) {
            throw new Error("The given pull request branch isn't allowed for this entry");
          }
          core.setOutput("pull_request", metadata.inputs.pull_request);
        }
        return;
      }
    }
    throw new Error("No matching entry found in the config for the given repository and branch.");
  })();

  if (core.getBooleanInput("allow_workflow_fix", { required: true })) {
    core.setOutput("permission-workflows", "write");
  }
  if (metadata.inputs.pull_request?.title) {
    core.setOutput("permission-pull-requests", "write");
  }
  if ((metadata.inputs.pull_request?.labels || []).length > 0) {
    core.setOutput("permission-issues", "write");
  }
  if ((metadata.inputs.pull_request?.team_reviewers || []).length > 0) {
    core.setOutput("permission-members", "read");
  }
  if (metadata.inputs.pull_request?.project?.number) {
    core.setOutput("permission-organization-projects", "write");
  }
};
