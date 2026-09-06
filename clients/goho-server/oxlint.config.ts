import base from "@adamaho/nopeus-oxlint-config";
import effect from "@adamaho/nopeus-oxlint-plugin/effect";
import { defineConfig } from "oxlint";

import packageJson from "../../package.json" with { type: "json" };

export default defineConfig({
  extends: [
    base,
    effect({
      packageName: packageJson.name,
    }),
  ],
});
