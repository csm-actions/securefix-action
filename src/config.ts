import * as fs from "fs";
import { z } from "zod";
import { load } from "js-yaml";
import * as core from "@actions/core";

const Client = z.object({
  repositories: z.array(z.string()),
  branches: z.array(z.string()),
});

const Push = z.object({
  repositories: z.array(z.string()),
  branches: z.array(z.string()),
});

const PullRequestEntry = z.object({
  base_branches: z.array(z.string()),
});

const Entry = z.object({
  client: Client,
  push: Push,
  pull_request: z.optional(PullRequestEntry),
});

export const Config = z.object({
  entries: z.array(Entry),
});
export type Config = z.infer<typeof Config>;

export const readConfig = (): Config => {
  const config = core.getInput("config", { required: false });
  const configFile = core.getInput("config_file", { required: false });
  if (!config && !configFile) {
    throw new Error("Either config or config_file input is required");
  }
  return Config.parse(load(config ? config : fs.readFileSync(configFile, "utf8")));
};
