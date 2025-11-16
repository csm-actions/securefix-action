import * as core from "@actions/core";
import * as prepare from "./prepare";
import * as commit from "./commit";
import * as notify from "./notify";

export const server = async () => {
  core.startGroup("prepare");
  const prepareInputs = prepare.readInputs();
  const outputs = await prepare.prepare(prepareInputs);
  core.endGroup();
  try {
    core.startGroup("commit");
    await commit.create({
      outputs,
      defaultCommitMessage: commit.readDefaultCommitMessage(),
    });
    core.endGroup();
  } catch (e) {
    core.startGroup("notify");
    await notify.notify({
      outputs,
      comment: notify.readComment(),
    });
    core.endGroup();
    throw e;
  }
};
