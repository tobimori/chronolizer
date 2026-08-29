import { DateTime, Effect, Match, Option } from "effect";

import { foldInstant } from "../ast/fold.ts";
import type {
  DateRangeExpr,
  InstantExpr,
  IsoDate,
  LowerBound,
  Unit,
  UpperBound,
} from "../ast/schemas.ts";
import {
  ResolvedDateRange,
  ResolvedGreaterThan,
  ResolvedGreaterThanOrEqual,
  ResolvedLessThan,
  ResolvedLessThanOrEqual,
  ResolutionError,
} from "./schema.ts";

const shiftDateTime = (value: DateTime.Zoned, amount: number, unit: Unit) =>
  Match.value(unit).pipe(
    Match.when("day", () => DateTime.add(value, { days: amount })),
    Match.when("week", () => DateTime.add(value, { weeks: amount })),
    Match.when("month", () => DateTime.add(value, { months: amount })),
    Match.when("quarter", () => DateTime.add(value, { months: amount * 3 })),
    Match.when("year", () => DateTime.add(value, { years: amount })),
    Match.exhaustive,
  );

const startOfDateTime = (value: DateTime.Zoned, unit: Unit) => {
  if (unit === "quarter") {
    const month = DateTime.getPart(value, "month");
    const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1;
    return DateTime.startOf(DateTime.setParts(value, { month: quarterMonth }), "month");
  }
  return DateTime.startOf(value, unit, { weekStartsOn: 1 });
};

const literalInZone = (value: IsoDate, zone: DateTime.TimeZone) => {
  const zoned = DateTime.makeZoned(
    {
      year: Number(value.slice(0, 4)),
      month: Number(value.slice(5, 7)),
      day: Number(value.slice(8, 10)),
    },
    { timeZone: zone, adjustForTimeZone: true },
  );
  return Option.match(zoned, {
    onNone: () => Effect.fail(new ResolutionError({ message: `Cannot resolve the date ${value}` })),
    onSome: Effect.succeed,
  });
};

const evaluateInstant = (
  expression: InstantExpr,
  reference: DateTime.Zoned,
  zone: DateTime.TimeZone,
) =>
  foldInstant<Effect.Effect<DateTime.Zoned, ResolutionError>>(expression, {
    now: () => Effect.succeed(reference),
    dateLiteral: (value) => literalInZone(value, zone),
    shift: (base, amount, unit) => Effect.map(base, (value) => shiftDateTime(value, amount, unit)),
    startOf: (base, unit) => Effect.map(base, (value) => startOfDateTime(value, unit)),
  });

const resolveLower = (bound: LowerBound, reference: DateTime.Zoned, zone: DateTime.TimeZone) =>
  Match.valueTags(bound, {
    GreaterThan: (value) =>
      Effect.map(evaluateInstant(value.value, reference, zone), (resolved) =>
        ResolvedGreaterThan.make({ value: resolved }),
      ),
    GreaterThanOrEqual: (value) =>
      Effect.map(evaluateInstant(value.value, reference, zone), (resolved) =>
        ResolvedGreaterThanOrEqual.make({ value: resolved }),
      ),
  });

const resolveUpper = (bound: UpperBound, reference: DateTime.Zoned, zone: DateTime.TimeZone) =>
  Match.valueTags(bound, {
    LessThan: (value) =>
      Effect.map(evaluateInstant(value.value, reference, zone), (resolved) =>
        ResolvedLessThan.make({ value: resolved }),
      ),
    LessThanOrEqual: (value) =>
      Effect.map(evaluateInstant(value.value, reference, zone), (resolved) =>
        ResolvedLessThanOrEqual.make({ value: resolved }),
      ),
  });

export const resolve = Effect.fn("chronolizer.resolve")(function* (range: DateRangeExpr) {
  const zone = yield* DateTime.CurrentTimeZone;
  const reference = yield* DateTime.nowInCurrentZone;
  if (range.lower !== undefined && range.upper !== undefined) {
    const lower = yield* resolveLower(range.lower, reference, zone);
    const upper = yield* resolveUpper(range.upper, reference, zone);
    if (DateTime.toEpochMillis(lower.value) >= DateTime.toEpochMillis(upper.value)) {
      return yield* new ResolutionError({
        message: "The lower range endpoint must be before the upper endpoint",
      });
    }
    return ResolvedDateRange.make({ lower, upper });
  }
  if (range.lower !== undefined) {
    return ResolvedDateRange.make({
      lower: yield* resolveLower(range.lower, reference, zone),
    });
  }
  return ResolvedDateRange.make({
    upper: yield* resolveUpper(range.upper, reference, zone),
  });
});
