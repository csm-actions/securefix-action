import * as core from "@actions/core";
import * as github from "@actions/github";
import { z } from "zod";
import * as commit from "@suzuki-shunsuke/commit-ts";
import { Outputs, PullRequest } from "./prepare";

const Metadata = z.object({
  inputs: z.object({
    commit_message: z.string().optional(),
  }),
});
type Metadata = z.infer<typeof Metadata>;

type Inputs = {
  outputs: Outputs;
  defaultCommitMessage?: string;
};

export const readDefaultCommitMessage = (): string => {
  return core.getInput("commit_message") || "Securefix";
};

export const action = async () => {
  await create({
    outputs: Outputs.parse(JSON.parse(core.getInput("outputs"))),
    defaultCommitMessage: readDefaultCommitMessage(),
  });
};

export const create = async (inputs: Inputs) => {
  const outputs = inputs.outputs;

  const fixedFiles = outputs.fixed_files
    .split("\n")
    .map((file) => file.trim())
    .filter((file) => file.length > 0);
  if (fixedFiles.length === 0) {
    core.info("No files to commit");
    return;
  }

  const defaultCommitMessage = inputs.defaultCommitMessage || "Securefix";
  const metadata = Metadata.parse(JSON.parse(outputs.metadata));
  const commitMessage = metadata.inputs.commit_message || defaultCommitMessage;
  const elems = outputs.push_repository.split("/");
  if (elems.length !== 2) {
    throw new Error(`Invalid push_repository: ${outputs.push_repository}`);
  }
  const [owner, repo] = elems;

  const octokit = github.getOctokit(outputs.github_token);
  core.info(`Creating a commit on ${owner}/${repo} ${outputs.branch}`);
  const createdCommit = await commit.createCommit(octokit, {
    owner: owner,
    repo: repo,
    branch: outputs.branch,
    message: `${commitMessage}
${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}`,
    files: fixedFiles,
    deleteIfNotExist: true,
    logger: {
      info: core.info,
    },
  });
  if (createdCommit?.commit?.sha) {
    core.notice(
      `Created a commit branch=${outputs.branch} ${github.context.serverUrl}/${owner}/${repo}/commit/${createdCommit.commit.sha}`,
    );
  }
  if (!outputs.create_pull_request) {
    return;
  }

  const prParam = PullRequest.parse(JSON.parse(outputs.create_pull_request));
  core.info(`Creating a pull request on ${owner}/${repo} ${outputs.branch}`);
  const pr = await octokit.rest.pulls.create({
    owner: owner,
    repo: repo,
    head: outputs.branch,
    title: prParam.title,
    body: prParam.body,
    base: prParam.base,
    draft: prParam.draft,
  });
  core.notice(`Created a pull request: ${pr.data.html_url}`);

  const promises = [];

  if (prParam.comment) {
    core.info(`Posting a pull request comment`);
    promises.push(
      octokit.rest.issues.createComment({
        owner: owner,
        repo: repo,
        issue_number: pr.data.number,
        body: prParam.comment,
      }),
    );
  }
  if (prParam.labels.length > 0) {
    core.info(`Adding labels: ${prParam.labels.join(", ")}`);
    promises.push(
      octokit.rest.issues.addLabels({
        owner: owner,
        repo: repo,
        issue_number: pr.data.number,
        labels: prParam.labels,
      }),
    );
  }
  if (prParam.assignees.length > 0) {
    core.info(`Adding assignees: ${prParam.assignees.join(", ")}`);
    promises.push(
      octokit.rest.issues.addAssignees({
        owner: owner,
        repo: repo,
        issue_number: pr.data.number,
        assignees: prParam.assignees,
      }),
    );
  }
  if (prParam.reviewers.length > 0 || prParam.team_reviewers.length > 0) {
    core.info(
      `Requesting reviewers: ${prParam.reviewers.join(", ")} team_reviewers: ${prParam.team_reviewers.join(", ")}`,
    );
    promises.push(
      octokit.rest.pulls.requestReviewers({
        owner: owner,
        repo: repo,
        pull_number: pr.data.number,
        reviewers: prParam.reviewers,
        team_reviewers: prParam.team_reviewers,
      }),
    );
  }
  if (prParam.milestone_number) {
    core.info(`Updating the milestone: ${prParam.milestone_number}`);
    promises.push(
      octokit.rest.issues.update({
        owner: owner,
        repo: repo,
        issue_number: pr.data.number,
        milestone: prParam.milestone_number,
      }),
    );
  }
  if (prParam.automerge_method) {
    promises.push(
      enableAutoMerge(octokit, pr.data.node_id, prParam.automerge_method),
    );
  }
  const project = prParam.project;
  if (project?.number || project?.id) {
    promises.push(addItemToProject(octokit, pr.data.node_id, project));
  }
  if (promises.length === 0) {
    return;
  }
  core.info(`Updating the pull request`);
  await Promise.allSettled(promises).then((results) => {
    for (const result of results) {
      if (result.status === "fulfilled") {
        continue;
      }
      core.error(result.reason);
    }
  });
};

const enableAutoMerge = async (
  octokit: commit.GitHub,
  prId: string,
  method: string,
) => {
  core.info(`Enabling auto merge with method: ${method}`);
  await octokit.graphql(
    `
        mutation ($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
            enablePullRequestAutoMerge(
            input: {
                pullRequestId: $pullRequestId
                mergeMethod: $mergeMethod
            }
            ) {
            pullRequest {
                number
            }
            }
        }`,
    {
      pullRequestId: prId,
      mergeMethod: method.toUpperCase(),
    },
  );
};

const getProjectId = async (
  octokit: commit.GitHub,
  owner: string,
  projectNumber: number,
): Promise<string> => {
  core.info(
    `Getting project ID for project number: owner:${owner} project_number:${projectNumber}`,
  );
  const data = await octokit.graphql<any>(
    `query ($owner: String!, $number: Int!) {
            organization(login: $owner) {
                projectV2(number: $number) {
                    id
                }
            }
        }`,
    {
      owner: owner,
      number: projectNumber,
    },
  );
  return data.organization.projectV2.id;
};

type Project = {
  owner: string;
  number: number;
  id?: string;
};

const addItemToProject = async (
  octokit: commit.GitHub,
  contentId: string,
  project: Project,
) => {
  if (!project.id) {
    project.id = await getProjectId(octokit, project.owner, project.number);
  }

  core.info(
    `Adding item to project: projectId:${project.id} contentId:${contentId}`,
  );
  await octokit.graphql(
    `
        mutation ($projectId: ID!, $contentId: ID!) {
            addProjectV2ItemById(
                input: {
                    projectId: $projectId
                    contentId: $contentId
                }
            ) {
                item {
                    id
                }
            }
        }
        `,
    {
      projectId: project.id,
      contentId: contentId,
    },
  );
};
