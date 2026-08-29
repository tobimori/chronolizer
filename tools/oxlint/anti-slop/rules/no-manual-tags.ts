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

const memberName = (member: ESTree.MemberExpression) => {
  if (!member.computed && member.property.type === "Identifier") return member.property.name;
  if (member.computed && member.property.type === "Literal") return member.property.value;
  return undefined;
};

/** Require tagged values and checks to use their Effect-owned APIs. */
export const noManualTagsRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow manual _tag construction and access; use Effect Schema, Match, or tagged constructors.",
    },
    messages: {
      manualTag:
        "Do not set `_tag` manually. Use the owning Effect Schema `.make` constructor or an Effect-native tagged constructor.",
      tagAccess:
        "Do not access `_tag` directly. Use Effect Schema predicates, Match, or a tagged API predicate.",
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
      MemberExpression(node) {
        if (memberName(node) === "_tag") {
          context.report({ node, messageId: "tagAccess" });
        }
      },
    };
  },
});
