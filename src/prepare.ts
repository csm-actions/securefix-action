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
  root_dir: z.optional(z.string()),
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

const validateRepository = async (
  inputs: Inputs,
  token: string,
  runId: string,
): Promise<githubAppToken.Permissions> => {
  // Read metadata
  const metadataS = fs.readFileSync(`${inputs.labelName}.json`, "utf8");
  const metadata = Metadata.parse(JSON.parse(metadataS));
  core.setOutput("metadata", metadataS);
  const fixedFiles = fs
    .readFileSync(`${inputs.labelName}_files.txt`, "utf8")
    .trim();
  core.setOutput("fixed_files", fixedFiles);
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
    core.setOutput("create_pull_request", metadata.inputs.pull_request);
    core.setOutput(
      "automerge_method",
      metadata.inputs.pull_request.automerge_method || "",
    );
    core.setOutput(
      "project_owner",
      metadata.inputs.pull_request.project?.owner || "",
    );
    core.setOutput(
      "project_number",
      metadata.inputs.pull_request.project?.number || 0,
    );
  }
  core.setOutput("root_dir", metadata.inputs.root_dir || "");

  // Get a pull request
  if (metadata.context.payload.pull_request) {
    core.setOutput(
      "pull_request_number",
      metadata.context.payload.pull_request.number,
    );
    const { data: pullRequest } = await octokit.rest.pulls.get({
      owner: metadata.context.payload.repository.owner.login,
      repo: metadata.context.payload.repository.name,
      pull_number: metadata.context.payload.pull_request.number,
    });
    core.setOutput("pull_request", pullRequest);
  }
  // Get GitHub Actions Workflow Run
  const workflowName = inputs.workflowName;
  const { data: workflowRun } = await octokit.rest.actions.getWorkflowRun({
    owner: metadata.context.payload.repository.owner.login,
    repo: metadata.context.payload.repository.name,
    run_id: parseInt(runId, 10),
  });

  if (!workflowRun.head_branch) {
    throw new Error("workflowRun.head_branch is not set");
  }
  const headBranch = workflowRun.head_branch;

  core.setOutput("workflow_run", workflowRun);
  // Validate workflow name
  if (workflowName && workflowRun.name !== workflowName) {
    throw new Error(
      `The client workflow name must be ${workflowName}, but got ${workflowRun.name}`,
    );
  }

  // Validate repository and branch
  if (!metadata.inputs.branch && !metadata.inputs.repository) {
    core.setOutput("repository", metadata.context.payload.repository.full_name);
    core.setOutput(
      "repository_owner",
      metadata.context.payload.repository.owner.login,
    );
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
        core.setOutput("push_repository", destRepo);
        core.setOutput("repository_owner", destRepo.split("/")[0]);
        core.setOutput("repository_name", destRepo.split("/")[1]);
        core.setOutput("branch", destBranch);
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
          core.setOutput("pull_request", metadata.inputs.pull_request);
        }
        return;
      }
    }
    throw new Error(
      "No matching entry found in the config for the given repository and branch.",
    );
  })();

  const permissions: githubAppToken.Permissions = {
    contents: "write",
  };

  if (inputs.allowWorkflowFix) {
    permissions.workflows = "write";
  }
  if (metadata.inputs.pull_request?.title) {
    permissions.pull_requests = "write";
  }
  if ((metadata.inputs.pull_request?.labels || []).length > 0) {
    permissions.issues = "write";
  }
  if ((metadata.inputs.pull_request?.team_reviewers || []).length > 0) {
    permissions.members = "read";
  }
  if (metadata.inputs.pull_request?.project?.number) {
    permissions.organization_projects = "write";
  }
  return permissions;
};

export const prepare = async () => {
  const inputs: Inputs = {
    appId: core.getInput("app_id", { required: true }),
    appPrivateKey: core.getInput("app_private_key", { required: true }),
    labelName: core.getInput("label_name", { required: true }),
    labelDescription: core.getInput("label_description", { required: true }),
    allowWorkflowFix: core.getBooleanInput("allow_workflow_fix"),
    config: core.getInput("config"),
    configFile: core.getInput("config_file"),
    workflowName: core.getInput("workflow_name"),
  };
  const elems = inputs.labelDescription.split("/");
  if (elems.length !== 3) {
    core.setFailed(
      "Label description must be in the format <repository owner>/<repository name>/<workflow run ID>",
    );
    return;
  }
  const owner = elems[0];
  const repo = elems[1];
  const runId = elems[2];
  core.setOutput("client_repository", `${owner}/${repo}`);

  // create github app token
  const permissions: githubAppToken.Permissions = {
    actions: "read",
    contents: "write",
    pull_requests: "write",
  };
  if (core.getBooleanInput("allow_workflow_fix", { required: true })) {
    permissions.workflows = "write";
  }
  core.info(`Creating a github token: ${owner}/${repo}`);
  const token = await githubAppToken.create({
    appId: inputs.appId,
    privateKey: inputs.appPrivateKey,
    owner: owner,
    repositories: [repo],
    permissions: permissions,
  });
  core.saveState("token", token.token);
  core.saveState("expires_at", token.expiresAt);
  core.setOutput("github_token", token.token);
  // Download a GitHub Actions Artifact
  const artifact = new DefaultArtifactClient();
  core.info(`Getting an artifact: ${owner}/${repo} ${runId}`);
  const artifactOpts = {
    findBy: {
      token: token.token,
      repositoryOwner: owner,
      repositoryName: repo,
      workflowRunId: parseInt(runId, 10),
    },
  };
  const { artifact: targetArtifact } = await artifact.getArtifact(
    inputs.labelName,
    artifactOpts,
  );
  if (!targetArtifact) {
    core.setFailed(`Artifact '${inputs.labelName}' not found`);
    return;
  }
  core.info(`Downloading an artifact: ${owner}/${repo} ${runId}`);
  await artifact.downloadArtifact(targetArtifact.id, artifactOpts);
  const pushPermissions = await validateRepository(inputs, token.token, runId);
  if (
    pushPermissions &&
    (pushPermissions.issues ||
      pushPermissions.members ||
      pushPermissions.organization_projects ||
      repo !== github.context.repo.repo)
  ) {
    core.info(`Creating a push token: ${owner}/${repo}`);
    const pushToken = await githubAppToken.create({
      appId: inputs.appId,
      privateKey: inputs.appPrivateKey,
      owner: owner,
      repositories: [repo],
      permissions: pushPermissions,
    });
    core.saveState("token_for_push", token.token);
    core.saveState("expires_at_for_push", token.expiresAt);
    core.setOutput("github_token_for_push", pushToken.token);
  } else {
    core.setOutput("github_token_for_push", token.token);
  }
};
