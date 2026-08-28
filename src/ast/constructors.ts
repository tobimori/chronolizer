import {
  DateLiteral,
  DateRangeExpr,
  GreaterThan,
  GreaterThanOrEqual,
  LessThan,
  LessThanOrEqual,
  Now,
  Shift,
  StartOf,
} from "./schemas.ts";
import type { InstantExpr, IsoDate, LowerBound, Unit, UpperBound } from "./schemas.ts";

export const now = () => Now.make({});

export const dateLiteral = (value: IsoDate) => DateLiteral.make({ value });

export const shift = (base: InstantExpr, amount: number, unit: Unit) =>
  Shift.make({ base, amount, unit });

export const startOf = (base: InstantExpr, unit: Unit) => StartOf.make({ base, unit });

export const greaterThan = (value: InstantExpr) => GreaterThan.make({ value });

export const greaterThanOrEqual = (value: InstantExpr) => GreaterThanOrEqual.make({ value });

export const lessThan = (value: InstantExpr) => LessThan.make({ value });

export const lessThanOrEqual = (value: InstantExpr) => LessThanOrEqual.make({ value });

export const boundedRange = (lower: LowerBound, upper: UpperBound) =>
  DateRangeExpr.make({ lower, upper });

export const lowerOpenRange = (lower: LowerBound) => DateRangeExpr.make({ lower });

export const upperOpenRange = (upper: UpperBound) => DateRangeExpr.make({ upper });
