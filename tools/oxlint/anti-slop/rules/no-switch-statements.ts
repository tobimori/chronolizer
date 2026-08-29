import { defineRule } from "@oxlint/plugins";

/** Require Effect Match for explicit value branching. */
export const noSwitchStatementsRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow switch statements in favor of Effect Match.",
    },
    messages: {
      preferMatch: "Use Effect Match instead of a switch statement.",
    },
  },
  createOnce(context) {
    return {
      SwitchStatement(node) {
        context.report({ node, messageId: "preferMatch" });
      },
    };
  },
});
