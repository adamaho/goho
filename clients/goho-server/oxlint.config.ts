import base from "@adamaho/nopeus-oxlint-config";
import effect from "@adamaho/nopeus-oxlint-plugin/effect";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [
    base,
    effect({
      packageName: "goho",
    }),
  ],
});
