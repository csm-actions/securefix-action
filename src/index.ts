import * as core from "@actions/core";
import { main } from "./run";

try {
  main();
} catch (error) {
  const msg = error instanceof Error ? error.message : JSON.stringify(error);
  core.setOutput("error", msg);
  core.setFailed(msg);
}
