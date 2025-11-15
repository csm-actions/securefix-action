import * as core from "@actions/core";
import * as github from "@actions/github";
import { z } from "zod";
import * as commit from "@suzuki-shunsuke/commit-ts";
import { PullRequest } from "./client";

const Outputs = z.object({
    metadata: z.string(),
    github_token_for_push: z.string(),
    push_repository: z.string(),
    branch: z.string(),
    fixed_files: z.string(),
    root_dir: z.string(),
    create_pull_request: z.optional(z.string()),
});
type Outputs = z.infer<typeof Outputs>;

const Metadata = z.object({
    inputs: z.object({
        commit_message: z.optional(z.string()),
    }),
});
type Metadata = z.infer<typeof Metadata>;

export const commitAction = async () => {
    const outputs = Outputs.parse(JSON.parse(core.getInput("outputs")));

    const fixedFiles = outputs.fixed_files.split('\n').map(file => file.trim()).filter(file => file.length > 0);
    if (fixedFiles.length === 0) {
        core.info("No files to commit");
        return;
    }

    const defaultCommitMessage = core.getInput("commit_message") || "Securefix";
    const metadata = Metadata.parse(JSON.parse(outputs.metadata));
    const commitMessage = metadata.inputs.commit_message || defaultCommitMessage;
    const elems = outputs.push_repository.split('/');
    if (elems.length !== 2) {
        throw new Error(`Invalid push_repository: ${outputs.push_repository}`);
    }
    const [owner, repo] = elems;

    const octokit = github.getOctokit(outputs.github_token_for_push);
    const result = await commit.createCommit(octokit, {
        owner: owner,
        repo: repo,
        branch: outputs.branch,
        message: `${commitMessage}
${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId}`,
        files: fixedFiles,
        rootDir: outputs.root_dir,
        deleteIfNotExist: true,
        logger: {
        info: core.info,
        },
    });
    if (!outputs.create_pull_request) {
        return;
    }

    const prParam = PullRequest.parse(JSON.parse(outputs.create_pull_request));
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
        promises.push(async () => {
            await octokit.rest.issues.createComment({
                owner: owner,
                repo: repo,
                issue_number: pr.data.number,
                body: prParam.comment,
            });
        });
    }
    if (prParam.labels.length > 0) {
        promises.push(async () => {
            await octokit.rest.issues.addLabels({
                owner: owner,
                repo: repo,
                issue_number: pr.data.number,
                labels: prParam.labels,
            });
        });
    }
    if (prParam.assignees.length > 0) {
        promises.push(async () => {
            await octokit.rest.issues.addAssignees({
                owner: owner,
                repo: repo,
                issue_number: pr.data.number,
                assignees: prParam.assignees,
            });
        });
    }
    if (prParam.reviewers.length > 0 || prParam.team_reviewers.length > 0) {
        promises.push(async () => {
            await octokit.rest.pulls.requestReviewers({
                owner: owner,
                repo: repo,
                pull_number: pr.data.number,
                reviewers: prParam.reviewers,
                team_reviewers: prParam.team_reviewers,
            });
        });
    }
    if (prParam.milestone_number) {
        promises.push(async () => {
            await octokit.rest.issues.update({
                owner: owner,
                repo: repo,
                issue_number: pr.data.number,
                milestone: prParam.milestone_number,
            });
        });
    }
    if (prParam.automerge_method) {
        promises.push(async () => {
            await enableAutoMerge(octokit, pr.data.node_id, prParam.automerge_method);
        });
    }
    if (prParam.project?.number) {
        promises.push(async () => {
            if (!prParam.project?.number) {
                return;
            }
            const projectId = await getProjectId(octokit, prParam.project.owner, prParam.project.number);
            await addItemToProject(octokit, projectId, pr.data.node_id);
        });
    }
    await Promise.allSettled(promises);
};

const enableAutoMerge = async (octokit: commit.GitHub, prId: string, method: string) => {
        await octokit.graphql(`
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
            });
};

const getProjectId = async (octokit: commit.GitHub, owner: string, projectNumber: number): Promise<string> => {
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

const addItemToProject = async (octokit: commit.GitHub, projectId: string, contentId: string) => {
    await octokit.graphql(`
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
            projectId: projectId,
            contentId: contentId,
        },
    );
};
