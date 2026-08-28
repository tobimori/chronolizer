import { Schema } from "effect";

export const ResolvedGreaterThan = Schema.TaggedStruct("GreaterThan", {
  value: Schema.DateTimeZoned,
});
export const ResolvedGreaterThanOrEqual = Schema.TaggedStruct("GreaterThanOrEqual", {
  value: Schema.DateTimeZoned,
});
export const ResolvedLessThan = Schema.TaggedStruct("LessThan", {
  value: Schema.DateTimeZoned,
});
export const ResolvedLessThanOrEqual = Schema.TaggedStruct("LessThanOrEqual", {
  value: Schema.DateTimeZoned,
});

export const ResolvedLowerBound = Schema.Union([ResolvedGreaterThan, ResolvedGreaterThanOrEqual]);
export type ResolvedLowerBound = typeof ResolvedLowerBound.Type;

export const ResolvedUpperBound = Schema.Union([ResolvedLessThan, ResolvedLessThanOrEqual]);
export type ResolvedUpperBound = typeof ResolvedUpperBound.Type;

export const ResolvedDateRange = Schema.TaggedStruct("ResolvedDateRange", {
  lower: Schema.optionalKey(ResolvedLowerBound),
  upper: Schema.optionalKey(ResolvedUpperBound),
}).check(
  Schema.makeFilter((range) => range.lower !== undefined || range.upper !== undefined, {
    expected: "a resolved range with at least one bound",
  }),
);
export type ResolvedDateRange = typeof ResolvedDateRange.Type;

export class ResolutionError extends Schema.TaggedError<ResolutionError>()("ResolutionError", {
  message: Schema.String,
}) {}
