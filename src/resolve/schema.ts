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

const ResolvedBoundedDateRange = Schema.TaggedStruct("ResolvedDateRange", {
  lower: ResolvedLowerBound,
  upper: ResolvedUpperBound,
});

const ResolvedLowerOpenDateRange = Schema.TaggedStruct("ResolvedDateRange", {
  lower: ResolvedLowerBound,
  upper: Schema.optionalKey(Schema.Never),
});

const ResolvedUpperOpenDateRange = Schema.TaggedStruct("ResolvedDateRange", {
  lower: Schema.optionalKey(Schema.Never),
  upper: ResolvedUpperBound,
});

export const ResolvedDateRange = Schema.Union([
  ResolvedBoundedDateRange,
  ResolvedLowerOpenDateRange,
  ResolvedUpperOpenDateRange,
]).annotate({ identifier: "ResolvedDateRange" });
export type ResolvedDateRange = typeof ResolvedDateRange.Type;

export class ResolutionError extends Schema.TaggedError<ResolutionError>()("ResolutionError", {
  message: Schema.String,
}) {}
