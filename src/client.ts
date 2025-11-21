import * as core from "@actions/core";
import { z } from "zod";
import * as securefix from "@csm-actions/securefix-action";

export const PullRequest = z.object({
  title: z.string(),
  body: z.string(),
  base: z.string(),
  labels: z.array(z.string()),
  assignees: z.array(z.string()),
  reviewers: z.array(z.string()),
  team_reviewers: z.array(z.string()),
  draft: z.boolean(),
  comment: z.string(),
  automerge_method: z.optional(z.enum(["merge", "squash", "rebase"])),
  project: z.nullable(
    z.object({
      number: z.number(),
      owner: z.string(),
      id: z.optional(z.string()),
    }),
  ),
  milestone_number: z.optional(z.number()),
});
export type PullRequest = z.infer<typeof PullRequest>;

type Inputs = {
  appId: string;
  privateKey: string;
  rootDir: string;
  serverRepository: string;
  repo: string;
  branch: string;
  failIfChanges: boolean;
  files: Set<string>;
  pr: PullRequest;
  commitMessage: string;
  workspace: string;
};

type automergeMethod = undefined | "merge" | "squash" | "rebase";

const validateAutomergeMethod = (method: string): automergeMethod => {
  if (!["", "merge", "squash", "rebase"].includes(method)) {
    throw new Error(
      'automerge_method must be one of "", "merge", "squash", or "rebase"',
    );
  }
  return method as automergeMethod;
};

export const action = async () => {
  const inputs: Inputs = {
    appId: core.getInput("app_id", { required: true }),
    privateKey: core.getInput("app_private_key", { required: true }),
    serverRepository: core.getInput("server_repository", { required: true }),
    rootDir: core.getInput("root_dir"),
    commitMessage: core.getInput("commit_message"),
    repo: core.getInput("repository"),
    branch: core.getInput("branch"),
    failIfChanges: core.getBooleanInput("fail_if_changes"),
    files: new Set(
      core
        .getInput("files")
        .trim()
        .split("\n")
        .map((file) => file.trim())
        .filter((file) => file.length > 0),
    ),
    pr: {
      title: core.getInput("pull_request_title"),
      body: core.getInput("pull_request_body"),
      base: core.getInput("pull_request_base_branch"),
      labels: core
        .getInput("pull_request_labels")
        .trim()
        .split("\n")
        .filter((label) => label),
      assignees: core
        .getInput("pull_request_assignees")
        .trim()
        .split("\n")
        .filter((assignee) => assignee),
      reviewers: core
        .getInput("pull_request_reviewers")
        .trim()
        .split("\n")
        .filter((reviewer) => reviewer),
      team_reviewers: core
        .getInput("pull_request_team_reviewers")
        .trim()
        .split("\n")
        .filter((team_reviewer) => team_reviewer),
      draft: core.getBooleanInput("pull_request_draft"),
      comment: core.getInput("pull_request_comment"),
      automerge_method: validateAutomergeMethod(
        core.getInput("automerge_method"),
      ),
      project:
        core.getInput("project_number") || core.getInput("project_id")
          ? {
              number: core.getInput("project_number")
                ? parseInt(core.getInput("project_number"), 10)
                : 0,
              owner: core.getInput("project_owner"),
              id: core.getInput("project_id"),
            }
          : null,
      milestone_number: core.getInput("milestone_number")
        ? parseInt(core.getInput("milestone_number"), 10)
        : 0,
    },
    workspace: process.env.GITHUB_WORKSPACE || "",
  };
  const result = await securefix.request(inputs);
  core.setOutput("artifact_name", result.artifactName);
  if (result.changedFilesFromRootDir) {
    core.setOutput(
      "changed_files_from_root_dir",
      result.changedFilesFromRootDir.join("\n"),
    );
  }
  if (result.changedFiles.length > 0) {
    core.setOutput("changed_files", result.changedFiles.join("\n"));
  }
  return;
};
