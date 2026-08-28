import { Effect, Match } from "effect";

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

export const parseFilter = Effect.fn("chronolizer.parseFilter")(function* (filter: DateFilter) {
  const [lower, upper] = yield* Effect.all([parseLower(filter), parseUpper(filter)]);
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

const formatLower = Match.typeTags<LowerBound>()({
  GreaterThan: (bound) => DateFilter.make({ gt: formatInstantExpression(bound.value) }),
  GreaterThanOrEqual: (bound) =>
    DateFilter.make({
      gte: formatInstantExpression(bound.value),
    }),
});

const formatUpper = Match.typeTags<UpperBound>()({
  LessThan: (bound) => DateFilter.make({ lt: formatInstantExpression(bound.value) }),
  LessThanOrEqual: (bound) =>
    DateFilter.make({
      lte: formatInstantExpression(bound.value),
    }),
});

export const formatFilter = (range: DateRangeExpr) => {
  const normalized = normalizeRange(range);
  if (normalized.lower !== undefined && normalized.upper !== undefined) {
    return DateFilter.make({
      ...formatLower(normalized.lower),
      ...formatUpper(normalized.upper),
    });
  }
  if (normalized.lower !== undefined) return formatLower(normalized.lower);
  return formatUpper(normalized.upper);
};

export const rangeKey = (range: DateRangeExpr) => {
  const filter = formatFilter(range);
  return `${filter.gt ?? ""}|${filter.gte ?? ""}|${filter.lt ?? ""}|${filter.lte ?? ""}`;
};

export const completePeriod = (start: InstantExpr, end: InstantExpr) =>
  boundedRange(greaterThanOrEqual(start), lessThan(end));
