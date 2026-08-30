import { eslintCompatPlugin } from "@oxlint/plugins";

import { noServiceConstructorImportsRule } from "./rules/no-service-constructor-imports.ts";
import { requireEffectFnNameRule } from "./rules/require-effect-fn-name.ts";
import { requireServiceKeyPrefixRule } from "./rules/require-service-key-prefix.ts";

/** Opt-in Oxlint rules for Effect service and Layer architecture. */
const antiSlopEffectPlugin = eslintCompatPlugin({
  meta: { name: "anti-slop-effect" },
  rules: {
    "no-service-constructor-imports": noServiceConstructorImportsRule,
    "require-effect-fn-name": requireEffectFnNameRule,
    "require-service-key-prefix": requireServiceKeyPrefixRule,
  },
});

export default antiSlopEffectPlugin;
