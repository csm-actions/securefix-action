import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, it, expect, afterEach } from "vitest";
import { readConfig } from "./config";

const config = `entries:
  - client:
      repositories:
        - example/client
      branches:
        - main
    push:
      repositories:
        - example/server
      branches:
        - feat/*
    pull_request: {}
`;

describe("readConfig", () => {
  afterEach(() => {
    delete process.env.INPUT_CONFIG;
    delete process.env.INPUT_CONFIG_FILE;
  });

  it("reads the config input", () => {
    process.env.INPUT_CONFIG = config;
    expect(readConfig()).toEqual({
      entries: [
        {
          client: {
            repositories: ["example/client"],
            branches: ["main"],
          },
          push: {
            repositories: ["example/server"],
            branches: ["feat/*"],
          },
          pull_request: {},
        },
      ],
    });
  });

  it("reads the config_file input", () => {
    const configFile = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "securefix-")),
      "config.yaml",
    );
    fs.writeFileSync(configFile, config);
    process.env.INPUT_CONFIG_FILE = configFile;
    expect(readConfig().entries).toHaveLength(1);
  });

  it("prefers the config input over the config_file input", () => {
    process.env.INPUT_CONFIG = config;
    process.env.INPUT_CONFIG_FILE = "no-such-file.yaml";
    expect(readConfig().entries).toHaveLength(1);
  });

  it("omittable fields are omittable", () => {
    process.env.INPUT_CONFIG = `entries:
  - client:
      repositories:
        - example/client
    push:
      branches:
        - main
`;
    expect(readConfig()).toEqual({
      entries: [
        {
          client: { repositories: ["example/client"] },
          push: { branches: ["main"] },
        },
      ],
    });
  });

  it("fails if neither config nor config_file is set", () => {
    expect(() => readConfig()).toThrowError(
      "Either config or config_file input is required",
    );
  });

  it("fails if a required field is missing", () => {
    process.env.INPUT_CONFIG = `entries:
  - client:
      repositories:
        - example/client
`;
    expect(() => readConfig()).toThrowError();
  });

  it("fails if the config isn't valid YAML", () => {
    process.env.INPUT_CONFIG = "entries: [";
    expect(() => readConfig()).toThrowError();
  });
});
