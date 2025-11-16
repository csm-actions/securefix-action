import * as core from "@actions/core";
import { main } from "./run";

try {
  await main();
} catch (error) {
  const msg = error instanceof Error ? error.message : JSON.stringify(error);
  core.debug(`output error=${msg}`);
  core.setOutput("error", msg);
  core.setFailed(msg);
}
