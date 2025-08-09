import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { load } from "js-yaml";
import { minimatch } from 'minimatch';
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { zodToJsonSchema } from "zod-to-json-schema";
import * as github from "@actions/github";

type Input = {
  config: string;
  configFile: string;
  metadataFile: string;
};

type Permissions = {
  contents?: "read" | "write" | "none";
  actions?: "read" | "write" | "none";
  pull_requests?: "read" | "write" | "none";
  issues?: "read" | "write" | "none";
  members?: "read" | "write" | "none";
  workflows?: "read" | "write" | "none";
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

const Config = z.object({
  entries: z.array(Entry),
});
export type Config = z.infer<typeof Config>;

const PullRequest = z.object({
  title: z.string(),
  body: z.string(),
  base: z.string(),
  labels: z.array(z.string()),
  assignees: z.array(z.string()),
  reviewers: z.array(z.string()),
  team_reviewers: z.array(z.string()),
  draft: z.boolean(),
  comment: z.string(),
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

export const readConfig = (config: string, configFile: string): Config => {
  if (!config && !configFile) {
    throw new Error("Either config or config_file input is required");
  }
  return Config.parse(load(config ? config : fs.readFileSync(configFile, "utf8")));
};

const nowS = (): string => {
  const date = new Date();
  const pad = (n: number): string => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${mm}${dd}${hh}${min}${ss}`;
};

export const main = async () => {
  const action = core.getInput("action", { required: true });
  if (action === "client1") {
    // Generate artifact name
    const n = nowS();
    const prefix = `securefix-${n}-`;
    const artifactName = `${prefix}${Array.from({ length: 50 - prefix.length }, () => Math.floor(Math.random() * 36).toString(36)).join("")}`;
    core.setOutput("artifact_name", artifactName);
    // List fixed files
    const rootDir = core.getInput("root_dir", { required: false }) || "";
    const result = await exec.getExecOutput("git", ["ls-files", "--modified", "--others", "--exclude-standard"], {
      cwd: rootDir || undefined,
    });
    const fixedFiles = new Set(result.stdout.trim().split("\n").filter(file => file.length > 0));
    if (fixedFiles.size === 0) {
      core.notice("No changes");
      return;
    }
    const files = new Set(core.getInput("files", { required: false }).trim().split("\n").map(file => file.trim()).filter(file => file.length > 0));
    if (files.size === 0) {
      core.setOutput("changed_files_from_root_dir", [...fixedFiles].join("\n"));
      core.setOutput("changed_files", [...fixedFiles].map(file => path.join(rootDir, file)).join("\n"));
      return;
    }
    const filteredFiles = [...files].filter(file => fixedFiles.has(file));
    if (filteredFiles.length === 0) {
      core.notice("No changes");
      return;
    }
    core.setOutput("changed_files_from_root_dir", filteredFiles.join("\n"));
    core.setOutput("changed_files", filteredFiles.map(file => path.join(rootDir, file)).join("\n"));
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
  if (metadata.inputs.pull_request?.title && fixedFiles) {
    core.setOutput("create_pull_request", metadata.inputs.pull_request);
  }
  core.setOutput("root_dir", metadata.inputs.root_dir || "");

  const octokit = github.getOctokit(core.getInput("github_token", { required: true }));
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
  // Read YAML config to push other repositories and branches
  const config = readConfig(configS, configFile);
  const destRepo = metadata.inputs.repository || metadata.context.payload.repository.full_name;
  const destBranch = metadata.inputs.branch || workflowRun.head_branch;
  (() => {
    for (const entry of config.entries) {
      if (entry.client.repositories.includes(metadata.context.payload.repository.full_name) &&
        // source branches are glob patterns
        // Check if the input branch matches any of the source branches
        entry.client.branches.some(branch => minimatch(workflowRun.head_branch || "", branch)) &&
        // destination repositories are glob patterns
        entry.push.repositories.includes(destRepo) &&
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
};

export const generateJSONSchema = (dir: string) => {
  const configJSONSchema = zodToJsonSchema(Config, "config");
  fs.writeFileSync(
    path.join(dir, "config.json"),
    JSON.stringify(configJSONSchema, null, 2) + "\n",
  );
};
