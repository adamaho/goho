import { RuleTester } from "oxlint/plugins-dev";

import { noUnknownParametersRule } from "./no-unknown-parameters.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const error = { messageId: "unknownParameter" };

tester.run("anti-slop/no-unknown-parameters", noUnknownParametersRule, {
  valid: [
    "function handle(input: User) {}",
    "function enrich(cause: unknown) {}",
    "function errorMessage(error: unknown): string { return String(error); }",
    'function isString(value: unknown): value is string { return typeof value === "string"; }',
  ],
  invalid: [
    { code: "function handle(input: unknown) {}", errors: [error] },
    { code: "const parse = (payload: unknown) => payload;", errors: [error] },
    {
      code: "interface Decoder { decode(input: unknown): string }",
      errors: [error],
    },
  ],
});
