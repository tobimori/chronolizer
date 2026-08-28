import type {
  DateRangeExpr,
  InstantExpr,
  IsoDate,
  LowerBound,
  Unit,
  UpperBound,
} from "./schemas.ts";

export const now = () => ({ _tag: "Now" }) satisfies InstantExpr;

export const dateLiteral = (value: IsoDate) =>
  ({
    _tag: "DateLiteral",
    value,
  }) satisfies InstantExpr;

export const shift = (base: InstantExpr, amount: number, unit: Unit) =>
  ({ _tag: "Shift", base, amount, unit }) satisfies InstantExpr;

export const startOf = (base: InstantExpr, unit: Unit) =>
  ({
    _tag: "StartOf",
    base,
    unit,
  }) satisfies InstantExpr;

export const greaterThan = (value: InstantExpr) =>
  ({
    _tag: "GreaterThan",
    value,
  }) satisfies LowerBound;

export const greaterThanOrEqual = (value: InstantExpr) =>
  ({
    _tag: "GreaterThanOrEqual",
    value,
  }) satisfies LowerBound;

export const lessThan = (value: InstantExpr) =>
  ({
    _tag: "LessThan",
    value,
  }) satisfies UpperBound;

export const lessThanOrEqual = (value: InstantExpr) =>
  ({
    _tag: "LessThanOrEqual",
    value,
  }) satisfies UpperBound;

export const boundedRange = (lower: LowerBound, upper: UpperBound) =>
  ({ _tag: "DateRange", lower, upper }) satisfies DateRangeExpr;

export const lowerOpenRange = (lower: LowerBound) =>
  ({
    _tag: "DateRange",
    lower,
  }) satisfies DateRangeExpr;

export const upperOpenRange = (upper: UpperBound) =>
  ({
    _tag: "DateRange",
    upper,
  }) satisfies DateRangeExpr;
