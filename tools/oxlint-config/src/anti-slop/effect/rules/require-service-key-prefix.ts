import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

function importedName(specifier: ESTree.ImportSpecifier): string {
  return specifier.imported.type === "Identifier"
    ? specifier.imported.name
    : specifier.imported.value;
}

/** Keep Effect service identifiers inside the repository's owned namespace. */
export const requireServiceKeyPrefixRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require Context.Service keys to use a configured static prefix.",
    },
    schema: [
      {
        type: "object",
        properties: {
          prefix: { type: "string", minLength: 1 },
        },
        required: ["prefix"],
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ prefix: "@" }],
    messages: {
      staticKey: "Give this Context.Service a static string key inside the repository namespace.",
      wrongPrefix: 'Service key "{{key}}" must begin with the owned prefix "{{prefix}}".',
    },
  },
  createOnce(context) {
    const contextBindings = new Set<string>();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== "effect") return;

        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportSpecifier" && importedName(specifier) === "Context") {
            contextBindings.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        if (node.callee.type !== "CallExpression") return;

        const service = node.callee.callee;
        if (
          service.type !== "MemberExpression" ||
          service.computed ||
          service.object.type !== "Identifier" ||
          !contextBindings.has(service.object.name) ||
          service.property.type !== "Identifier" ||
          service.property.name !== "Service"
        ) {
          return;
        }

        const keyArgument = node.arguments[0];
        if (
          keyArgument === undefined ||
          keyArgument.type === "SpreadElement" ||
          keyArgument.type !== "Literal" ||
          typeof keyArgument.value !== "string"
        ) {
          context.report({ node, messageId: "staticKey" });
          return;
        }

        const option = context.options?.[0];
        const prefix =
          typeof option === "object" &&
          option !== null &&
          !Array.isArray(option) &&
          typeof option.prefix === "string"
            ? option.prefix
            : "@";

        if (keyArgument.value.startsWith(prefix)) return;
        context.report({
          node: keyArgument,
          messageId: "wrongPrefix",
          data: { key: keyArgument.value, prefix },
        });
      },
    };
  },
});
