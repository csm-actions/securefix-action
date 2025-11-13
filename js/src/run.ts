import * as core from "@actions/core";
import { client } from "./client";
import { prepare } from "./prepare";
import { readConfig } from "./config";

export const main = async () => {
  const action = core.getInput("action", { required: true });
  if (action === "client") {
    await client();
    return;
  }
  const configS = core.getInput("config", { required: false });
  const configFile = core.getInput("config_file", { required: false });
  if (action === "validate-config") {
    readConfig(configS, configFile);
    return;
  }
  if (action === "prepare") {
    await prepare(configS, configFile);
    return;
  }
  if (action !== "validate-repository") {
    throw new Error(`Unknown action (${action}). action must be either validate-config or validate-repository`);
  }
};
