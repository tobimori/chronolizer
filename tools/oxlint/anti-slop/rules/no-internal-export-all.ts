import { defineRule } from "@oxlint/plugins";

/** Keep wildcard re-exports in the package root instead of internal wrapper modules. */
export const noInternalExportAllRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow wildcard re-exports outside the root source entry.",
    },
    messages: {
      internal:
        "Do not use a wildcard re-export in an internal module. Export the API from the root source entry or use explicit exports.",
    },
  },
  create(context) {
    const filename = context.filename.replaceAll("\\", "/");
    if (filename.endsWith("/src/index.ts") || filename === "src/index.ts") return {};
    return {
      ExportAllDeclaration(node) {
        context.report({ node, messageId: "internal" });
      },
    };
  },
});
