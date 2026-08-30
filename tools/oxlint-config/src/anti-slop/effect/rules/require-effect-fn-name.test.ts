import { RuleTester } from "oxlint/plugins-dev";

import { requireEffectFnNameRule } from "./require-effect-fn-name.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const error = { messageId: "missingName" };

tester.run("anti-slop-effect/require-effect-fn-name", requireEffectFnNameRule, {
  valid: [
    'import { Effect } from "effect"; const load = Effect.fn("App.load")(function* () {});',
    'import { Effect as Fx } from "effect"; const load = Fx.fn(`App.load`)(function* () {});',
    "const Effect = { fn() {} }; Effect.fn(function* () {});",
  ],
  invalid: [
    {
      code: 'import { Effect } from "effect"; const load = Effect.fn(function* () {});',
      errors: [error],
    },
    {
      code: 'import { Effect as Fx } from "effect"; const name = "App.load"; Fx.fn(name)(() => 1);',
      errors: [error],
    },
  ],
});
