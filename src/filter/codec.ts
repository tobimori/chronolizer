import { Effect } from "effect";

import {
  boundedRange,
  greaterThan,
  greaterThanOrEqual,
  lessThan,
  lessThanOrEqual,
  lowerOpenRange,
  upperOpenRange,
} from "../ast/constructors.ts";
import { normalizeRange } from "../ast/normalize.ts";
import type { DateRangeExpr, InstantExpr, LowerBound, UpperBound } from "../ast/schemas.ts";
import { InvalidDateFilterError } from "./errors.ts";
import { formatInstantExpression, parseInstantExpression } from "./expression.ts";
import { DateFilter } from "./schema.ts";

const parseLower = (filter: DateFilter) => {
  if (filter.gt !== undefined) {
    return Effect.map(parseInstantExpression(filter.gt), greaterThan);
  }
  if (filter.gte !== undefined) {
    return Effect.map(parseInstantExpression(filter.gte), greaterThanOrEqual);
  }
  return Effect.void;
};

const parseUpper = (filter: DateFilter) => {
  if (filter.lt !== undefined) {
    return Effect.map(parseInstantExpression(filter.lt), lessThan);
  }
  if (filter.lte !== undefined) {
    return Effect.map(parseInstantExpression(filter.lte), lessThanOrEqual);
  }
  return Effect.void;
};

export const parseFilter = (filter: DateFilter) =>
  Effect.gen(function* () {
    const lower = yield* parseLower(filter);
    const upper = yield* parseUpper(filter);
    if (lower !== undefined && upper !== undefined) {
      return normalizeRange(boundedRange(lower, upper));
    }
    if (lower !== undefined) {
      return normalizeRange(lowerOpenRange(lower));
    }
    if (upper !== undefined) {
      return normalizeRange(upperOpenRange(upper));
    }
    return yield* new InvalidDateFilterError({
      message: "A date filter must contain at least one bound",
    });
  });

const formatLower = (bound: LowerBound) => {
  const value = formatInstantExpression(bound.value);
  return bound._tag === "GreaterThan"
    ? DateFilter.make({ gt: value })
    : DateFilter.make({ gte: value });
};

const formatUpper = (bound: UpperBound) => {
  const value = formatInstantExpression(bound.value);
  return bound._tag === "LessThan"
    ? DateFilter.make({ lt: value })
    : DateFilter.make({ lte: value });
};

export const formatFilter = (range: DateRangeExpr) => {
  const normalized = normalizeRange(range);
  if (normalized.lower !== undefined && normalized.upper !== undefined) {
    const lower = formatLower(normalized.lower);
    const upper = formatUpper(normalized.upper);
    if ("gt" in lower) {
      return "lt" in upper
        ? DateFilter.make({ gt: lower.gt, lt: upper.lt })
        : DateFilter.make({ gt: lower.gt, lte: upper.lte });
    }
    return "lt" in upper
      ? DateFilter.make({ gte: lower.gte, lt: upper.lt })
      : DateFilter.make({ gte: lower.gte, lte: upper.lte });
  }
  if (normalized.lower !== undefined) return formatLower(normalized.lower);
  return formatUpper(normalized.upper);
};

export const completePeriod = (start: InstantExpr, end: InstantExpr) =>
  boundedRange(greaterThanOrEqual(start), lessThan(end));
