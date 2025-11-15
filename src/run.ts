import * as core from "@actions/core";
import { client } from "./client";
import { prepare } from "./prepare";
import { notify } from "./notify";
import { commitAction } from "./commit";
import { readConfig } from "./config";

export const main = async () => {
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
