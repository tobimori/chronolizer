import { Match, Schema } from "effect";

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
import { Shift } from "./schemas.ts";
import type { DateRangeExpr, InstantExpr, LowerBound, UpperBound } from "./schemas.ts";

const isShift = Schema.is(Shift);

// RETURN TYPE: TypeScript needs the recursive function contract before initialization.
export const normalizeInstant = (expression: InstantExpr): InstantExpr =>
  Match.valueTags(expression, {
    Now: () => now(),
    DateLiteral: (literal) => dateLiteral(literal.value),
    StartOf: (operation) => startOf(normalizeInstant(operation.base), operation.unit),
    Shift: (operation) => {
      const base = normalizeInstant(operation.base);
      if (operation.amount === 0) return base;
      if (isShift(base) && base.unit === operation.unit) {
        const amount = base.amount + operation.amount;
        if (Number.isSafeInteger(amount)) {
          return normalizeInstant(shift(base.base, amount, operation.unit));
        }
      }
      return shift(base, operation.amount, operation.unit);
    },
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
