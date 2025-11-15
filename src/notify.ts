import client from "@actions/artifact";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { z } from "zod";

const Outputs = z.object({
    pull_request_number: z.optional(z.string()),
    github_token: z.string(),
    client_repository: z.string(),
});
type Outputs = z.infer<typeof Outputs>;

const defaultComment = `## :x: Securefix Action failed.`;

export const notify = async () => {
    const outputs = Outputs.parse(JSON.parse(core.getInput("outputs")));
    if (!outputs.pull_request_number) {
        return;
    }
    const elems = outputs.client_repository.split('/');
    if (elems.length !== 2) {
        throw new Error(`Invalid client_repository: ${outputs.client_repository}`);
    }
    const [owner, repo] = elems;
    const octokit = github.getOctokit(outputs.github_token);
    octokit.rest.issues.createComment({
        owner: owner,
        repo: repo,
        issue_number: parseInt(outputs.pull_request_number, 10),
        body: `${core.getInput("pull_request_comment") || defaultComment}
[Workflow](${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId})
The comment was created by [Securefix Action](https://github.com/csm-actions/securefix-action).`,
    });
};
