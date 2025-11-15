import * as core from "@actions/core";
import * as githubAppToken from "@suzuki-shunsuke/github-app-token";
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

export const main = async () => {
  if (core.getState("post")) {
    if (core.getInput("action", { required: true }) !== "prepare") {
      return;
    }
    return Promise.allSettled([
      revoke(core.getState("token"), core.getState("expires_at")),
      revoke(core.getState("token_for_push"), core.getState("expires_at_for_push")),
    ]);
  }
  core.saveState("post", "true");

  const action = core.getInput("action", { required: true });
  if (action === "client") {
    await client();
    return;
  }
  const configS = core.getInput("config", { required: false });
  const configFile = core.getInput("config_file", { required: false });
  switch (action) {
  case "validate-config":
    readConfig(configS, configFile);
    return;
  case "prepare":
    await prepare(configS, configFile);
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
