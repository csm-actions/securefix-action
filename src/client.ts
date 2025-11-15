import * as fs from "fs";
import * as path from "path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as github from "@actions/github";
import { DefaultArtifactClient } from "@actions/artifact";
import { z } from "zod";
import * as githubAppToken from "@suzuki-shunsuke/github-app-token";
import { newName } from "@csm-actions/label";

const nowS = (): string => {
  const date = new Date();
  const pad = (n: number): string => n.toString().padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}${mm}${dd}${hh}${min}${ss}`;
};

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
  automerge_method: z.string(),
  project: z.nullable(
    z.object({
      number: z.number(),
      owner: z.string(),
      id: z.string(),
    }),
  ),
  milestone_number: z.number(),
});
export type PullRequest = z.infer<typeof PullRequest>;

export const client = async () => {
  // Generate artifact name
  const n = nowS();
  const prefix = `securefix-${n}-`;
  const artifactName = newName(prefix);
  core.setOutput("artifact_name", artifactName);
  // List fixed files
  const rootDir = core.getInput("root_dir", { required: false }) || "";
  const result = await exec.getExecOutput(
    "git",
    ["ls-files", "--modified", "--others", "--exclude-standard"],
    {
      cwd: rootDir || undefined,
    },
  );
  const fixedFiles = new Set(
    result.stdout
      .trim()
      .split("\n")
      .filter((file) => file.length > 0),
  );
  if (fixedFiles.size === 0) {
    core.notice("No changes");
    return;
  }

  const files = getFiles(fixedFiles, artifactName, rootDir);

  createMetadataFile(artifactName);
  if (files.changed_files_from_root_dir) {
    core.setOutput(
      "changed_files_from_root_dir",
      files.changed_files_from_root_dir.join("\n"),
    );
  }
  if (files.changed_files) {
    core.setOutput("changed_files", files.changed_files.join("\n"));
    if (files.changed_files_from_root_dir) {
      fs.writeFileSync(
        `${artifactName}_files.txt`,
        files.changed_files_from_root_dir.join("\n") + "\n",
      );
    }
  }

  if (files.changed_files && files.changed_files.length > 0) {
    // upload artifact
    const artifact = new DefaultArtifactClient();
    await artifact.uploadArtifact(
      artifactName,
      (files.changed_files || []).concat(
        `${artifactName}.json`,
        `${artifactName}_files.txt`,
      ),
      process.env.GITHUB_WORKSPACE || "",
    );
    await fs.rmSync(`${artifactName}_files.txt`);
  }
  await fs.rmSync(`${artifactName}.json`);
  await createLabel(
    {
      appId: core.getInput("app_id"),
      privateKey: core.getInput("app_private_key"),
      owner: github.context.repo.owner,
      repositories: [core.getInput("server_repository")],
      permissions: {
        issues: "write",
      },
    },
    artifactName,
    `${github.context.repo.owner}/${github.context.repo.repo}/${github.context.runId}`,
  );
  if (files.changed_files && files.changed_files.length > 0) {
    if (
      core.getBooleanInput("fail_if_changes") ||
      (!core.getInput("repository") && !core.getInput("branch"))
    ) {
      core.setFailed("Changes detected. A commit will be pushed");
      core.info(files.changed_files.join("\n"));
      return;
    }
    core.notice("Changes detected. A commit will be pushed");
    core.info(files.changed_files.join("\n"));
    return;
  }
  return;
};

type Files = {
  changed_files_from_root_dir?: string[];
  changed_files?: string[];
};

const getFiles = (
  fixedFiles: Set<string>,
  artifactName: string,
  rootDir: string,
): Files => {
  if (fixedFiles.size === 0) {
    core.notice("No changes");
    return {};
  }
  createMetadataFile(artifactName);
  const files = new Set(
    core
      .getInput("files", { required: false })
      .trim()
      .split("\n")
      .map((file) => file.trim())
      .filter((file) => file.length > 0),
  );
  if (files.size === 0) {
    return {
      changed_files_from_root_dir: [...fixedFiles],
      changed_files: [...fixedFiles].map((file) => path.join(rootDir, file)),
    };
  }
  const filteredFiles = [...files].filter((file) => fixedFiles.has(file));
  if (filteredFiles.length === 0) {
    core.notice("No changes");
    return {};
  }
  return {
    changed_files_from_root_dir: filteredFiles,
    changed_files: filteredFiles.map((file) => path.join(rootDir, file)),
  };
};

const createLabel = async (
  inputs: githubAppToken.Inputs,
  labelName: string,
  description: string,
) => {
  const token = await githubAppToken.create(inputs);
  try {
    const octokit = github.getOctokit(token.token);
    await octokit.rest.issues.createLabel({
      owner: inputs.owner,
      repo: inputs.repositories ? inputs.repositories[0] : "",
      name: labelName,
      description: description,
    });
  } catch (error: any) {
    if (githubAppToken.hasExpired(token.expiresAt)) {
      core.info("GitHub App token has already expired");
      return;
    }
    core.info("Revoking GitHub App token");
    await githubAppToken.revoke(token.token);
    throw error;
  }
};

const createMetadataFile = (labelName: string) => {
  let automergeMethod = core.getInput("automerge_method");
  if (!["", "merge", "squash", "rebase"].includes(automergeMethod)) {
    throw new Error(
      'automerge_method must be one of "", "merge", "squash", or "rebase"',
    );
  }
  const pr: PullRequest = {
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
    draft: core.getInput("pull_request_draft") === "true",
    comment: core.getInput("pull_request_comment"),
    automerge_method: automergeMethod,
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
  };
  const value = {
    context: github.context,
    inputs: {
      repository: core.getInput("repository"),
      branch: core.getInput("branch"),
      commit_message: core.getInput("commit_message"),
      root_dir: core.getInput("root_dir"),
      pull_request: pr,
    },
  };
  if (
    !pr.title &&
    (pr.base ||
      pr.body ||
      pr.labels.length > 0 ||
      pr.assignees.length > 0 ||
      pr.reviewers.length > 0 ||
      pr.team_reviewers.length > 0 ||
      pr.draft ||
      pr.comment)
  ) {
    throw new Error("pull_request_title is required to create a pull request");
  }
  fs.writeFileSync(`${labelName}.json`, JSON.stringify(value, null, 2) + "\n");
};
