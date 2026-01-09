import { Config } from "./config";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

const configJSONSchema = z.toJSONSchema(Config);
fs.writeFileSync(
  path.join("json-schema", "config.json"),
  JSON.stringify(configJSONSchema, null, 2) + "\n",
);
