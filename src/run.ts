import * as core from "@actions/core";
import * as githubAppToken from "@suzuki-shunsuke/github-app-token";
import * as github from "@actions/github";
import { client } from "./client";
import { prepare } from "./prepare";
import { notify } from "./notify";
import { commitAction } from "./commit";
import { readConfig } from "./config";

const revoke = async (token: string, expiresAt: string) => {
  if (!token) {
    return;
  }
  if (expiresAt && githubAppToken.hasExpired(expiresAt)) {
    core.info("GitHub App token has already expired");
    return;
  }
  core.info("Revoking GitHub App token");
  return githubAppToken.revoke(token);
};

const deleteLabel = async (token: string, labelName: string) => {
  const octokit = github.getOctokit(token);
  const param = {
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    name: labelName,
  };
  core.info(`Deleting a label ${labelName} of ${param.owner}/${param.repo}`);
  await octokit.rest.issues.deleteLabel(param);
};

export const main = async () => {
  if (core.getState("post")) {
    if (core.getInput("action", { required: true }) !== "prepare") {
      return;
    }
    const promises = [
      revoke(core.getState("token"), core.getState("expires_at")),
    ];
    if (core.getBooleanInput("delete_label")) {
      promises.push(
        deleteLabel(
          core.getInput("github_token_to_delete_label", { required: true }),
          core.getInput("label_name", { required: true }),
        ),
      );
    }
    await Promise.allSettled(promises).then((results) => {
      for (const result of results) {
        if (result.status === "fulfilled") {
          continue;
        }
        console.error(result.reason);
      }
    });
  }
  core.saveState("post", "true");

  const action = core.getInput("action", { required: true });
  switch (action) {
    case "client":
      await client();
      return;
    case "validate-config":
      readConfig();
      return;
    case "prepare":
      await prepare();
      return;
    case "notify":
      await notify();
      return;
    case "commit":
      await commitAction();
      return;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
};
