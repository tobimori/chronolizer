import { Schema } from "effect";

import { GreaterThanOrEqual, LessThan, Now, Shift, StartOf } from "./schemas.ts";
import type { DateRangeExpr, InstantExpr, IsoDate, Unit } from "./schemas.ts";

export interface InstantAlgebra<A> {
  readonly now: () => A;
  readonly dateLiteral: (value: IsoDate) => A;
  readonly shift: (base: A, amount: number, unit: Unit) => A;
  readonly startOf: (base: A, unit: Unit) => A;
}

// RETURN TYPE: TypeScript needs the recursive generic contract before initialization.
export const foldInstant = <A>(expression: InstantExpr, algebra: InstantAlgebra<A>): A => {
  switch (expression._tag) {
    case "Now":
      return algebra.now();
    case "DateLiteral":
      return algebra.dateLiteral(expression.value);
    case "Shift":
      return algebra.shift(
        foldInstant(expression.base, algebra),
        expression.amount,
        expression.unit,
      );
    case "StartOf":
      return algebra.startOf(foldInstant(expression.base, algebra), expression.unit);
  }
};

interface RelativeOffset {
  readonly months: number;
  readonly days: number;
}

const shiftOffset = (base: RelativeOffset, amount: number, unit: Unit) => {
  switch (unit) {
    case "year":
      return { ...base, months: base.months + amount * 12 };
    case "quarter":
      return { ...base, months: base.months + amount * 3 };
    case "month":
      return { ...base, months: base.months + amount };
    case "week":
      return { ...base, days: base.days + amount * 7 };
    case "day":
      return { ...base, days: base.days + amount };
  }
};

const containsPositiveShiftInstant = (expression: InstantExpr) => {
  const offset = foldInstant<RelativeOffset>(expression, {
    now: () => ({ months: 0, days: 0 }),
    dateLiteral: () => ({ months: 0, days: 0 }),
    shift: shiftOffset,
    startOf: (base) => base,
  });
  return offset.months > 0 || offset.days > 0;
};

export const containsPositiveShift = (range: DateRangeExpr) =>
  (range.lower !== undefined && containsPositiveShiftInstant(range.lower.value)) ||
  (range.upper !== undefined && containsPositiveShiftInstant(range.upper.value));

const isGreaterThanOrEqual = Schema.is(GreaterThanOrEqual);
const isLessThan = Schema.is(LessThan);
const isNow = Schema.is(Now);
const isShift = Schema.is(Shift);
const isStartOf = Schema.is(StartOf);

export const isCurrentPeriod = (range: DateRangeExpr) => {
  if (!isGreaterThanOrEqual(range.lower) || !isLessThan(range.upper)) return false;
  const start = range.lower.value;
  const end = range.upper.value;
  if (!isStartOf(start) || !isNow(start.base) || !isShift(end)) return false;
  if (end.amount !== 1 || !isStartOf(end.base) || !isNow(end.base.base)) return false;
  return start.unit === end.unit && start.unit === end.base.unit;
};
