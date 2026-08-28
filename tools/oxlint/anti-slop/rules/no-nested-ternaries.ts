import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

function unwrapParentheses(node: ESTree.Expression) {
  let current = node;
  while (current.type === "ParenthesizedExpression") {
    current = current.expression;
  }
  return current;
}

/** Ban conditional expressions inside the branches of another conditional expression. */
export const noNestedTernariesRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow nested conditional expressions.",
    },
    messages: {
      avoid:
        "A nested ternary is difficult to scan. Use a named value, Match, or clear conditional statements.",
    },
  },
  createOnce(context) {
    return {
      ConditionalExpression(node) {
        if (
          unwrapParentheses(node.consequent).type === "ConditionalExpression" ||
          unwrapParentheses(node.alternate).type === "ConditionalExpression"
        ) {
          context.report({ node, messageId: "avoid" });
        }
      },
    };
  },
});
