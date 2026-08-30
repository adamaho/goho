import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

function importedName(specifier: ESTree.ImportSpecifier): string {
  return specifier.imported.type === "Identifier"
    ? specifier.imported.name
    : specifier.imported.value;
}

function isStaticName(argument: ESTree.CallExpression["arguments"][number] | undefined): boolean {
  if (argument === undefined || argument.type === "SpreadElement") return false;
  if (argument.type === "Literal") return typeof argument.value === "string";
  return argument.type === "TemplateLiteral" && argument.expressions.length === 0;
}

/** Require Effect.fn declarations to carry a stable trace name. */
export const requireEffectFnNameRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Require every Effect.fn call to provide a static operation name.",
    },
    messages: {
      missingName:
        "Give this Effect.fn a static operation name so traces and diagnostics identify the workflow.",
    },
  },
  createOnce(context) {
    const effectBindings = new Set<string>();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== "effect") return;

        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportSpecifier" && importedName(specifier) === "Effect") {
            effectBindings.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== "MemberExpression" ||
          callee.computed ||
          callee.object.type !== "Identifier" ||
          !effectBindings.has(callee.object.name) ||
          callee.property.type !== "Identifier" ||
          callee.property.name !== "fn"
        ) {
          return;
        }

        if (isStaticName(node.arguments[0])) return;
        context.report({ node: callee, messageId: "missingName" });
      },
    };
  },
});
