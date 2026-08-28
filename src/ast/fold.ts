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
