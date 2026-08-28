import { Effect } from "effect";

import { normalizeRange } from "../ast/normalize.ts";
import type { DateRangeExpr, InstantExpr, LowerBound, UpperBound } from "../ast/schemas.ts";
import { InvalidDateFilterError } from "./errors.ts";
import { formatInstantExpression, parseInstantExpression } from "./expression.ts";
import type { DateFilter } from "./schema.ts";

const parseLower = (filter: DateFilter) => {
  if (filter.gt !== undefined) {
    return Effect.map(parseInstantExpression(filter.gt), (value) => ({
      _tag: "GreaterThan" as const,
      value,
    }));
  }
  if (filter.gte !== undefined) {
    return Effect.map(parseInstantExpression(filter.gte), (value) => ({
      _tag: "GreaterThanOrEqual" as const,
      value,
    }));
  }
  return Effect.void;
};

const parseUpper = (filter: DateFilter) => {
  if (filter.lt !== undefined) {
    return Effect.map(parseInstantExpression(filter.lt), (value) => ({
      _tag: "LessThan" as const,
      value,
    }));
  }
  if (filter.lte !== undefined) {
    return Effect.map(parseInstantExpression(filter.lte), (value) => ({
      _tag: "LessThanOrEqual" as const,
      value,
    }));
  }
  return Effect.void;
};

export const parseFilter = (filter: DateFilter) =>
  Effect.gen(function* () {
    const lower = yield* parseLower(filter);
    const upper = yield* parseUpper(filter);
    if (lower !== undefined && upper !== undefined) {
      return normalizeRange({ _tag: "DateRange", lower, upper });
    }
    if (lower !== undefined) {
      return normalizeRange({ _tag: "DateRange", lower });
    }
    if (upper !== undefined) {
      return normalizeRange({ _tag: "DateRange", upper });
    }
    return yield* new InvalidDateFilterError({
      message: "A date filter must contain at least one bound",
    });
  });

const formatLower = (bound: LowerBound) => {
  const value = formatInstantExpression(bound.value);
  return bound._tag === "GreaterThan" ? { gt: value } : { gte: value };
};

const formatUpper = (bound: UpperBound) => {
  const value = formatInstantExpression(bound.value);
  return bound._tag === "LessThan" ? { lt: value } : { lte: value };
};

export const formatFilter = (range: DateRangeExpr) => {
  const normalized = normalizeRange(range);
  if (normalized.lower !== undefined && normalized.upper !== undefined) {
    const lower = formatLower(normalized.lower);
    const upper = formatUpper(normalized.upper);
    if ("gt" in lower) {
      return "lt" in upper ? { gt: lower.gt, lt: upper.lt } : { gt: lower.gt, lte: upper.lte };
    }
    return "lt" in upper ? { gte: lower.gte, lt: upper.lt } : { gte: lower.gte, lte: upper.lte };
  }
  if (normalized.lower !== undefined) return formatLower(normalized.lower);
  if (normalized.upper !== undefined) return formatUpper(normalized.upper);
  throw new InvalidDateFilterError({
    message: "A date range must contain at least one bound",
  });
};

export const completePeriod = (start: InstantExpr, end: InstantExpr) =>
  ({
    _tag: "DateRange",
    lower: { _tag: "GreaterThanOrEqual", value: start },
    upper: { _tag: "LessThan", value: end },
  }) satisfies DateRangeExpr;
