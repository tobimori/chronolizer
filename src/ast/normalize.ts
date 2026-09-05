import { Match } from "effect";

import {
  boundedRange,
  dateLiteral,
  greaterThan,
  greaterThanOrEqual,
  lessThan,
  lessThanOrEqual,
  lowerOpenRange,
  now,
  shift,
  startOf,
  upperOpenRange,
} from "./constructors.ts";
import { foldInstant } from "./fold.ts";
import type { DateRangeExpr, InstantExpr, LowerBound, UpperBound } from "./schemas.ts";

// Calendar shifts cannot be combined: month clamping and time-zone gaps change intermediate dates.
export const normalizeInstant = (expression: InstantExpr) =>
  foldInstant<InstantExpr>(expression, {
    now,
    dateLiteral,
    startOf,
    shift: (base, amount, unit) => (amount === 0 ? base : shift(base, amount, unit)),
  });

const normalizeLower = (bound: LowerBound) =>
  Match.valueTags(bound, {
    GreaterThan: (value) => greaterThan(normalizeInstant(value.value)),
    GreaterThanOrEqual: (value) => greaterThanOrEqual(normalizeInstant(value.value)),
  });

const normalizeUpper = (bound: UpperBound) =>
  Match.valueTags(bound, {
    LessThan: (value) => lessThan(normalizeInstant(value.value)),
    LessThanOrEqual: (value) => lessThanOrEqual(normalizeInstant(value.value)),
  });

export const normalizeRange = (range: DateRangeExpr) => {
  if (range.lower !== undefined && range.upper !== undefined) {
    return boundedRange(normalizeLower(range.lower), normalizeUpper(range.upper));
  }
  if (range.lower !== undefined) {
    return lowerOpenRange(normalizeLower(range.lower));
  }
  return upperOpenRange(normalizeUpper(range.upper));
};
