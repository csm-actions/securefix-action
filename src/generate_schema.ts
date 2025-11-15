import { Config } from "./config";
import { zodToJsonSchema } from "zod-to-json-schema";
import * as fs from "fs";
import * as path from "path";

const configJSONSchema = zodToJsonSchema(Config, "config");
fs.writeFileSync(
  path.join("json-schema", "config.json"),
  JSON.stringify(configJSONSchema, null, 2) + "\n",
);
