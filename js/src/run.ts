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

const Source = z.object({
  repositories: z.array(z.string()),
  branches: z.array(z.string()),
});

const Destination = z.object({
  pull_request: z.optional(z.boolean()),
  repositories: z.array(z.string()),
  branches: z.array(z.string()),
});

const Entry = z.object({
  source: Source,
  destination: Destination,
});

const Config = z.object({
  entries: z.array(Entry),
});

const PullRequest = z.object({
  title: z.string(),
  description: z.string(),
  labels: z.array(z.string()),
  assignees: z.array(z.string()),
  reviewers: z.array(z.string()),
  draft: z.boolean(),
  comment: z.string(),
});

const Inputs = z.object({
  repository: z.string(),
  branch: z.string(),
  pullRequest: z.optional(PullRequest),
});

const Metadata = z.object({
  inputs: Inputs,
});

export const main = (input: Input) => {
  // Read metadata to get repository and branch
  const metadata = Metadata.parse(load(fs.readFileSync(input.metadataFile, "utf8")));
  // Validate repository and branch
  if (!metadata.inputs.branch && !metadata.inputs.repository) {
    return;
  }
  if (!input.config) {
    input.config = '{"entries": []}'; // Default empty config if not provided
  }
  // Read YAML config to push other repositories and branches
  const config = Config.parse(load(input.config));
  const destRepo = metadata.inputs.repository || input.repository;
  const destBranch = metadata.inputs.branch || input.branch;
  for (const entry of config.entries) {
    if (entry.source.repositories.includes(metadata.inputs.repository) &&
      // source branches are glob patterns
      // Check if the input branch matches any of the source branches
      entry.source.branches.some(branch => minimatch(metadata.inputs.branch, branch)) &&
      // destination repositories are glob patterns
      entry.destination.repositories.includes(destRepo) &&
      entry.destination.branches.some(branch => minimatch(destBranch, branch))
    ) {
      core.setOutput("repository", destRepo);
      core.setOutput("branch", destBranch);
      if (metadata.inputs.pullRequest) {
        if (!entry.destination.pull_request) {
          throw new Error("Creating a pull request isn't allowed for this entry.");
        }
        core.setOutput("pull_request", metadata.inputs.pullRequest);
      }
    }
  }
  throw new Error("No matching entry found in the config for the given repository and branch.");
};
