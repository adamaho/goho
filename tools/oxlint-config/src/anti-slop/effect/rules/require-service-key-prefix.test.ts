import { RuleTester } from "oxlint/plugins-dev";

import { requireServiceKeyPrefixRule } from "./require-service-key-prefix.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const options = [{ prefix: "@app/" }];

tester.run("anti-slop-effect/require-service-key-prefix", requireServiceKeyPrefixRule, {
  valid: [
    {
      code: 'import { Context } from "effect"; class Service extends Context.Service<Service, {}>()("@app/Service") {}',
      options,
    },
    {
      code: 'import { Context as Ctx } from "effect"; class Service extends Ctx.Service<Service, {}>()("@app/Service") {}',
      options,
    },
    'const Context = { Service: () => () => class {} }; class Service extends Context.Service()("other") {}',
  ],
  invalid: [
    {
      code: 'import { Context } from "effect"; class Service extends Context.Service<Service, {}>()("@other/Service") {}',
      options,
      errors: [{ messageId: "wrongPrefix" }],
    },
    {
      code: 'import { Context } from "effect"; const key = "@app/Service"; class Service extends Context.Service<Service, {}>()(key) {}',
      options,
      errors: [{ messageId: "staticKey" }],
    },
  ],
});
