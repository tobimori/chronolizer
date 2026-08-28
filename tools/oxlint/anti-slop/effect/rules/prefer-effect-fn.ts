import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

const isEffectGen = (node: ESTree.CallExpression) => {
  const callee = node.callee;
  return (
    callee.type === "MemberExpression" &&
    callee.computed === false &&
    callee.object.type === "Identifier" &&
    callee.object.name === "Effect" &&
    callee.property.type === "Identifier" &&
    callee.property.name === "gen"
  );
};

/** Keep generator-based Effect functions on the reusable Effect.fn boundary. */
export const preferEffectFnRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer Effect.fn over Effect.gen for generator-based Effect code.",
    },
    messages: {
      preferEffectFn:
        "Use Effect.fn instead of Effect.gen. Name reusable runtime operations when a stable tracing name is useful.",
    },
  },
  createOnce(context) {
    return {
      CallExpression(node) {
        if (!isEffectGen(node)) return;
        context.report({ node: node.callee, messageId: "preferEffectFn" });
      },
    };
  },
});
