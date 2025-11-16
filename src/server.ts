import { prepare, readInputs as readPrepareInputs } from "./prepare";
import * as commit from "./commit";
import * as notify from "./notify";

export const server = async () => {
  const prepareInputs = readPrepareInputs();
  const outputs = await prepare(prepareInputs);
  try {
    await commit.create({
      outputs,
      defaultCommitMessage: commit.readDefaultCommitMessage(),
    });
  } catch (e) {
    await notify.notify({
      outputs,
      comment: notify.readComment(),
    });
    throw e;
  }
};
