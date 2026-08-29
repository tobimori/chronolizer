import { Match, Option, Schema, String as EffectString } from "effect";

export const Unit = Schema.Literals(["day", "week", "month", "quarter", "year"]);
export type Unit = typeof Unit.Type;

const isLeapYear = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

export const daysInMonth = (year: number, month: number) =>
  Match.value(month).pipe(
    Match.when(2, () => (isLeapYear(year) ? 29 : 28)),
    Match.when(Match.is(4, 6, 9, 11), () => 30),
    Match.orElse(() => 31),
  );

export const isIsoDate = (value: string) => {
  if (Option.isNone(EffectString.match(/^\d{4}-\d{2}-\d{2}$/)(value))) {
    return false;
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
};

export const IsoDate = Schema.String.check(
  Schema.makeFilter(isIsoDate, { expected: "an ISO calendar date (YYYY-MM-DD)" }),
).annotate({ identifier: "IsoDate" });
export type IsoDate = typeof IsoDate.Type;

export class Now extends Schema.TaggedClass<Now>()("Now", {}) {}

export class DateLiteral extends Schema.TaggedClass<DateLiteral>()("DateLiteral", {
  value: IsoDate,
}) {}

const ShiftAmount = Schema.Int.check(
  Schema.isBetween({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
);

export class Shift extends Schema.TaggedClass<Shift>()("Shift", {
  base: Schema.suspend(
    // RETURN TYPE: TypeScript needs the recursive schema contract before initialization.
    (): Schema.Codec<InstantExpr> => InstantExpr,
  ),
  amount: ShiftAmount,
  unit: Unit,
}) {}

export class StartOf extends Schema.TaggedClass<StartOf>()("StartOf", {
  base: Schema.suspend(
    // RETURN TYPE: TypeScript needs the recursive schema contract before initialization.
    (): Schema.Codec<InstantExpr> => InstantExpr,
  ),
  unit: Unit,
}) {}

export type InstantExpr = Now | DateLiteral | Shift | StartOf;

export const InstantExpr: Schema.Codec<InstantExpr> = Schema.suspend(
  // RETURN TYPE: TypeScript needs the recursive schema contract before initialization.
  (): Schema.Codec<InstantExpr> => Schema.Union([Now, DateLiteral, Shift, StartOf]),
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

const BoundedDateRange = Schema.TaggedStruct("DateRange", {
  lower: LowerBound,
  upper: UpperBound,
});

const LowerOpenDateRange = Schema.TaggedStruct("DateRange", {
  lower: LowerBound,
  upper: Schema.optionalKey(Schema.Never),
});

const UpperOpenDateRange = Schema.TaggedStruct("DateRange", {
  lower: Schema.optionalKey(Schema.Never),
  upper: UpperBound,
});

export const DateRangeExpr = Schema.Union([
  BoundedDateRange,
  LowerOpenDateRange,
  UpperOpenDateRange,
]).annotate({ identifier: "DateRangeExpr" });
export type DateRangeExpr = typeof DateRangeExpr.Type;
