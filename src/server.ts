import * as core from "@actions/core";
import * as prepare from "./prepare";
import * as commit from "./commit";
import * as notify from "./notify";

const isObject = (value: unknown): value is object => {
  return typeof value === "object" && value !== null;
};

const getErrorMessage = (error: unknown): string => {
  if (
    isObject(error) &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return JSON.stringify(error);
};

export const action = async () => {
  core.startGroup("prepare");
  const prepareInputs = prepare.readInputs();
  const data = await prepare.prepare(prepareInputs);
  try {
    const outputs = await prepare.validateRepository(data);
    core.endGroup();
    core.startGroup("commit");
    await commit.create({
      outputs,
      defaultCommitMessage: commit.readDefaultCommitMessage(),
    });
    core.endGroup();
  } catch (e) {
    const err = isObject(e);
    core.startGroup("notify");
    await notify.notify({
      owner: data.workflowRun.owner,
      repo: data.workflowRun.repo,
      pr_number: data.metadata.context.payload.pull_request?.number ?? 0,
      githubToken: data.token,
      comment: [
        notify.readComment(),
        "\n## Error",
        "\n```",
        getErrorMessage(e),
        "```\n",
      ].join("\n"),
    });
    core.endGroup();
    throw e;
  }
};
