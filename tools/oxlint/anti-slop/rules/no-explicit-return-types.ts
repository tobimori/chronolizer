import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

type FunctionImplementation =
  | ESTree.ArrowFunctionExpression
  | ESTree.FunctionDeclaration
  | ESTree.FunctionExpression;

function hasRequiredReturnTypeComment(
  sourceCode: SourceCode,
  node: FunctionImplementation,
): boolean {
  let current: ESTree.Node = node;
  while (true) {
    if (
      sourceCode
        .getCommentsBefore(current)
        .some(
          (comment) =>
            comment.end <= node.start && /\bRETURN TYPE\s*:/u.test(comment.value),
        )
    ) {
      return true;
    }
    if (current.parent.type === "Program") return false;
    current = current.parent;
  }
}

/** Prefer inferred return types on implementations unless TypeScript needs an annotation. */
export const noExplicitReturnTypesRule = defineRule({
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow explicit return types on function implementations unless a RETURN TYPE comment explains why TypeScript needs one.",
    },
    messages: {
      explicitReturnType:
        "Remove this explicit return type and use inference. If TypeScript needs it, add a `RETURN TYPE:` comment that explains the reason.",
    },
  },
  createOnce(context) {
    const checkFunction = (node: FunctionImplementation) => {
      if (
        node.returnType === null ||
        node.returnType === undefined ||
        hasRequiredReturnTypeComment(context.sourceCode, node)
      ) {
        return;
      }
      context.report({
        node: node.returnType,
        messageId: "explicitReturnType",
      });
    };

    return {
      ArrowFunctionExpression: checkFunction,
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
    };
  },
});
