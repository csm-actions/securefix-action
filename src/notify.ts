import * as core from "@actions/core";
import * as github from "@actions/github";
import { z } from "zod";

const Outputs = z.object({
  pull_request: z.optional(z.string()),
  github_token: z.string(),
  client_repository: z.string(),
  error: z.optional(z.string()),
  workflow_run: z.string(),
});
type Outputs = z.infer<typeof Outputs>;

export const WorkflowRun = z.object({
  head_sha: z.string(),
});
type WorkflowRun = z.infer<typeof WorkflowRun>;

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
  const workflowRun = WorkflowRun.parse(
    JSON.parse(inputs.outputs.workflow_run),
  );
  const pr = inputs.outputs.pull_request
    ? JSON.parse(inputs.outputs.pull_request)
    : undefined;
  const outputs = inputs.outputs;
  if (!pr?.number) {
    core.info("No pull request to comment on");
    return;
  }
  const elems = outputs.client_repository.split("/");
  if (elems.length !== 2) {
    throw new Error(`Invalid client_repository: ${outputs.client_repository}`);
  }
  const [owner, repo] = elems;
  const msgs = [inputs.comment];
  if (outputs.error) {
    msgs.push("\n## Prepare Error", "\n```", outputs.error, "```\n");
  }
  if (inputs.commitError) {
    msgs.push("\n## Commit Error", "\n```", inputs.commitError, "```\n");
  }
  await notify({
    owner: owner,
    repo: repo,
    pr_number: pr.number,
    comment: msgs.join("\n"),
    githubToken: outputs.github_token,
    sha: workflowRun.head_sha,
  });
};

type Inputs = {
  owner: string;
  repo: string;
  pr_number: number;
  comment: string;
  githubToken: string;
  sha: string;
};

export const notify = async (inputs: Inputs) => {
  if (!inputs.pr_number) {
    return;
  }
  const octokit = github.getOctokit(inputs.githubToken);
  core.info(
    `Creating a pull request comment on ${inputs.owner}/${inputs.repo} PR#${inputs.pr_number}`,
  );
  const comment = await octokit.rest.issues.createComment({
    owner: inputs.owner,
    repo: inputs.repo,
    issue_number: inputs.pr_number,
    body: `${inputs.comment}
[Workflow](${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/actions/runs/${github.context.runId})
The comment was created by [Securefix Action](https://github.com/csm-actions/securefix-action).

<!-- github-comment: {"SHA1":"${inputs.sha}","TemplateKey":"securefix-action"} -->`,
  });
  core.notice(`Created a pull request comment: ${comment.data.html_url}`);
};
