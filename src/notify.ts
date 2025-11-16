import * as core from "@actions/core";
import * as github from "@actions/github";
import { z } from "zod";

const Outputs = z.object({
  pull_request_number: z.optional(z.string()),
  github_token: z.string(),
  client_repository: z.string(),
  error: z.optional(z.string()),
});
type Outputs = z.infer<typeof Outputs>;

const defaultComment = `## :x: Securefix Action failed.`;

export const readComment = (): string => {
  return core.getInput("pull_request_comment") || defaultComment;
};

export const action = async () => {
  const inputs = {
    outputs: Outputs.parse(JSON.parse(core.getInput("outputs"))),
    comment: readComment(),
    commitError: core.getInput("commit_error"),
  };
  const outputs = inputs.outputs;
  if (!outputs.pull_request_number) {
    return;
  }
  const elems = outputs.client_repository.split("/");
  if (elems.length !== 2) {
    throw new Error(`Invalid client_repository: ${outputs.client_repository}`);
  }
  const [owner, repo] = elems;
  const msgs = [inputs.comment];
  if (inputs.outputs.error) {
    msgs.push(
        "\n## Prepare Error",
        "\n```",
        inputs.outputs.error,
        "```\n",
    );
  }
  if (inputs.commitError) {
    msgs.push(
        "\n## Commit Error",
        "\n```",
        inputs.commitError,
        "```\n",
    );
  }
  await notify({
    owner: owner,
    repo: repo,
    pr_number: parseInt(outputs.pull_request_number, 10),
    comment: msgs.join("\n"),
    githubToken: outputs.github_token,
  });
};

type Inputs = {
  owner: string;
  repo: string;
  pr_number: number;
  comment: string;
  githubToken: string;
};

export const notify = async (inputs: Inputs) => {
  if (!inputs.pr_number) {
    return;
  }
  const octokit = github.getOctokit(inputs.githubToken);
  core.notice(
    `Creating a pull request comment on ${inputs.owner}/${inputs.repo} PR#${inputs.pr_number}`,
  );
  octokit.rest.issues.createComment({
    owner: inputs.owner,
    repo: inputs.repo,
    issue_number: inputs.pr_number,
    body: `${inputs.comment}
[Workflow](${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId})
The comment was created by [Securefix Action](https://github.com/csm-actions/securefix-action).`,
  });
};
