import * as core from "@actions/core";
import * as githubAppToken from "@suzuki-shunsuke/github-app-token";
import * as github from "@actions/github";
import * as client from "./client";
import * as prepare from "./prepare";
import * as notify from "./notify";
import * as commit from "./commit";
import * as server from "./server";
import * as config from "./config";

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
  const serverRepository = core.getInput("server_repository");
  const action = serverRepository
    ? core.getInput("action") || "client"
    : core.getInput("action", { required: true });
  if (core.getState("post")) {
    if (action !== "prepare" && action !== "server") {
      return;
    }
    const promises = [
      revoke(core.getState("token"), core.getState("expires_at")),
      revoke(core.getState("dest_token"), core.getState("dest_expires_at")),
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
        core.error(result.reason);
      }
    });
    return;
  }
  core.saveState("post", "true");

  switch (action) {
    case "client":
      await client.action();
      return;
    case "validate-config":
      config.readConfig();
      return;
    case "prepare":
      await prepare.action();
      return;
    case "notify":
      await notify.action();
      return;
    case "commit":
      await commit.action();
      return;
    case "server":
      await server.action();
      return;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
};
