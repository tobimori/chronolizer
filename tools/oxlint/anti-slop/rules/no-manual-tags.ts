import { defineRule } from "@oxlint/plugins";

import type { ESTree } from "@oxlint/plugins";

function propertyName(property: ESTree.Property): string | undefined {
  if (property.computed) return undefined;
  if (property.key.type === "Identifier") return property.key.name;
  if (property.key.type === "Literal" && typeof property.key.value === "string") {
    return property.key.value;
  }
  return undefined;
}

/** Require tagged values to come from their Effect-owned constructor. */
export const noManualTagsRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow manual _tag properties in object literals; use an Effect Schema or Effect data constructor.",
    },
    messages: {
      manualTag:
        "Do not set `_tag` manually. Use the owning Effect Schema `.make` constructor or an Effect-native tagged constructor.",
    },
  },
  createOnce(context) {
    return {
      Property(node) {
        if (node.parent.type !== "ObjectExpression" || propertyName(node) !== "_tag") {
          return;
        }
        context.report({ node, messageId: "manualTag" });
      },
    };
  },
});
