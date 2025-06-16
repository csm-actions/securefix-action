import * as core from "@actions/core";
import { main } from "./run";

try {
  main({
    config: core.getInput("config", { required: false }),
    metadataFile: core.getInput("metadata", { required: true }),
    repository: core.getInput("repository", { required: true }),
    branch: core.getInput("branch", { required: true }),
  });
} catch (error) {
  core.setFailed(
    error instanceof Error ? error.message : JSON.stringify(error),
  );
}
