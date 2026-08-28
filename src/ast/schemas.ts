import { Schema } from "effect";

export const Unit = Schema.Literals(["day", "week", "month", "quarter", "year"]);
export type Unit = typeof Unit.Type;

const isLeapYear = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const daysInMonth = (year: number, month: number) => {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
};

export const isIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
};

export const IsoDate = Schema.String.check(
  Schema.makeFilter(isIsoDate, { expected: "an ISO calendar date (YYYY-MM-DD)" }),
).annotate({ identifier: "IsoDate" });
export type IsoDate = typeof IsoDate.Type;

export interface Now {
  readonly _tag: "Now";
}

export interface DateLiteral {
  readonly _tag: "DateLiteral";
  readonly value: IsoDate;
}

export interface Shift {
  readonly _tag: "Shift";
  readonly base: InstantExpr;
  readonly amount: number;
  readonly unit: Unit;
}

export interface StartOf {
  readonly _tag: "StartOf";
  readonly base: InstantExpr;
  readonly unit: Unit;
}

export type InstantExpr = Now | DateLiteral | Shift | StartOf;

export const Now = Schema.TaggedStruct("Now", {});
export const DateLiteral = Schema.TaggedStruct("DateLiteral", { value: IsoDate });

const ShiftAmount = Schema.Int.check(
  Schema.isBetween({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
);

export const InstantExpr: Schema.Codec<InstantExpr> = Schema.suspend(
  // RETURN TYPE: TypeScript needs the recursive schema contract before initialization.
  (): Schema.Codec<InstantExpr> =>
    Schema.Union([
      Now,
      DateLiteral,
      Schema.TaggedStruct("Shift", {
        base: InstantExpr,
        amount: ShiftAmount,
        unit: Unit,
      }),
      Schema.TaggedStruct("StartOf", {
        base: InstantExpr,
        unit: Unit,
      }),
    ]),
).annotate({ identifier: "InstantExpr" });

export const GreaterThan = Schema.TaggedStruct("GreaterThan", {
  value: InstantExpr,
});
export const GreaterThanOrEqual = Schema.TaggedStruct("GreaterThanOrEqual", {
  value: InstantExpr,
});
export const LessThan = Schema.TaggedStruct("LessThan", { value: InstantExpr });
export const LessThanOrEqual = Schema.TaggedStruct("LessThanOrEqual", {
  value: InstantExpr,
});

export const LowerBound = Schema.Union([GreaterThan, GreaterThanOrEqual]);
export type LowerBound = typeof LowerBound.Type;
export const UpperBound = Schema.Union([LessThan, LessThanOrEqual]);
export type UpperBound = typeof UpperBound.Type;

const DateRangeStruct = Schema.TaggedStruct("DateRange", {
  lower: Schema.optionalKey(LowerBound),
  upper: Schema.optionalKey(UpperBound),
});

export const DateRangeExpr = DateRangeStruct.check(
  Schema.makeFilter((range) => range.lower !== undefined || range.upper !== undefined, {
    expected: "a date range with at least one bound",
  }),
).annotate({ identifier: "DateRangeExpr" });
export type DateRangeExpr = typeof DateRangeExpr.Type;
