import { Effect, Schema, SchemaIssue, SchemaTransformation } from "effect";

import { DateRangeExpr, InstantExpr } from "../ast/schemas.ts";
import { formatFilter, parseFilter } from "./codec.ts";
import { formatInstantExpression, parseInstantExpression } from "./expression.ts";
import { DateFilter } from "./schema.ts";

const expressionIssue = (input: string, offset: number, expected: string) =>
  new SchemaIssue.Forbidden({
    message: `Invalid date expression at offset ${offset}: expected ${expected}; input: ${input}`,
  });

export const InstantExpressionFromString = Schema.String.pipe(
  Schema.decodeTo(
    InstantExpr,
    SchemaTransformation.transformOrFail({
      decode: (input) =>
        Effect.mapError(parseInstantExpression(input), (error) =>
          expressionIssue(error.input, error.offset, error.expected),
        ),
      encode: (expression) => Effect.succeed(formatInstantExpression(expression)),
    }),
  ),
);

export const DateRangeFromFilter = DateFilter.pipe(
  Schema.decodeTo(
    DateRangeExpr,
    SchemaTransformation.transformOrFail({
      decode: (filter) =>
        Effect.mapError(
          parseFilter(filter),
          (error) =>
            new SchemaIssue.Forbidden({
              message:
                error._tag === "FilterExpressionParseError"
                  ? `Invalid filter expression at offset ${error.offset}: expected ${error.expected}`
                  : error.message,
            }),
        ),
      encode: (range) => Effect.succeed(formatFilter(range)),
    }),
  ),
);
