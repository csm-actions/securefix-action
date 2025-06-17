import * as fs from "fs";
import { z } from "zod";
import { load } from "js-yaml";
import { minimatch } from 'minimatch';
import * as core from "@actions/core";

type Input = {
  config: string;
  metadataFile: string;
  repository: string;
  branch: string;
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

const PullRequest = z.object({
  title: z.string(),
  body: z.string(),
  base: z.string(),
  labels: z.array(z.string()),
  assignees: z.array(z.string()),
  reviewers: z.array(z.string()),
  draft: z.boolean(),
  comment: z.string(),
});

const Inputs = z.object({
  repository: z.string(),
  branch: z.string(),
  pull_request: z.optional(PullRequest),
});

const Metadata = z.object({
  inputs: Inputs,
});

export const main = (input: Input) => {
  // Read metadata to get repository and branch
  const metadata = Metadata.parse(load(fs.readFileSync(input.metadataFile, "utf8")));
  // Validate repository and branch
  if (!metadata.inputs.branch && !metadata.inputs.repository) {
    core.setOutput("repository", input.repository);
    core.setOutput("branch", input.branch);
    return;
  }
  if (!input.config) {
    throw new Error("the input config is required to push a commit to other repositories and branches");
  }
  // Read YAML config to push other repositories and branches
  const config = Config.parse(load(input.config));
  const destRepo = metadata.inputs.repository || input.repository;
  const destBranch = metadata.inputs.branch || input.branch;
  for (const entry of config.entries) {
    if (entry.client.repositories.includes(input.repository) &&
      // source branches are glob patterns
      // Check if the input branch matches any of the source branches
      entry.client.branches.some(branch => minimatch(input.branch, branch)) &&
      // destination repositories are glob patterns
      entry.push.repositories.includes(destRepo) &&
      entry.push.branches.some(branch => minimatch(destBranch, branch))
    ) {
      core.setOutput("repository", destRepo);
      core.setOutput("branch", destBranch);
      if (metadata.inputs.pull_request) {
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
};
