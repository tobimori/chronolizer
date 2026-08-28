import { Schema } from "effect";

export const DateExpressionString = Schema.String.check(Schema.isMinLength(1)).annotate({
  identifier: "DateExpressionString",
});
export type DateExpressionString = typeof DateExpressionString.Type;

const DateFilterStruct = Schema.Struct({
  gt: Schema.optionalKey(DateExpressionString),
  gte: Schema.optionalKey(DateExpressionString),
  lt: Schema.optionalKey(DateExpressionString),
  lte: Schema.optionalKey(DateExpressionString),
});

export const DateFilter = DateFilterStruct.check(
  Schema.makeFilter((filter) => !(filter.gt !== undefined && filter.gte !== undefined), {
    expected: "at most one lower date bound",
  }),
  Schema.makeFilter((filter) => !(filter.lt !== undefined && filter.lte !== undefined), {
    expected: "at most one upper date bound",
  }),
  Schema.makeFilter(
    (filter) =>
      filter.gt !== undefined ||
      filter.gte !== undefined ||
      filter.lt !== undefined ||
      filter.lte !== undefined,
    { expected: "at least one date bound" },
  ),
).annotate({ identifier: "DateFilter" });
export type DateFilter = typeof DateFilter.Type;
