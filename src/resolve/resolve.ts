import { DateTime, Effect, Option } from "effect";

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

const shiftDateTime = (value: DateTime.Zoned, amount: number, unit: Unit) => {
  switch (unit) {
    case "day":
      return DateTime.add(value, { days: amount });
    case "week":
      return DateTime.add(value, { weeks: amount });
    case "month":
      return DateTime.add(value, { months: amount });
    case "quarter":
      return DateTime.add(value, { months: amount * 3 });
    case "year":
      return DateTime.add(value, { years: amount });
  }
};

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
  Effect.map(evaluateInstant(bound.value, reference, zone), (value) =>
    bound._tag === "GreaterThan"
      ? ResolvedGreaterThan.make({ value })
      : ResolvedGreaterThanOrEqual.make({ value }),
  );

const resolveUpper = (bound: UpperBound, reference: DateTime.Zoned, zone: DateTime.TimeZone) =>
  Effect.map(evaluateInstant(bound.value, reference, zone), (value) =>
    bound._tag === "LessThan"
      ? ResolvedLessThan.make({ value })
      : ResolvedLessThanOrEqual.make({ value }),
  );

export const resolve = (range: DateRangeExpr) =>
  Effect.gen(function* () {
    const zone = yield* DateTime.CurrentTimeZone;
    const reference = yield* DateTime.nowInCurrentZone;
    const lower =
      range.lower === undefined ? undefined : yield* resolveLower(range.lower, reference, zone);
    const upper =
      range.upper === undefined ? undefined : yield* resolveUpper(range.upper, reference, zone);

    if (
      lower !== undefined &&
      upper !== undefined &&
      DateTime.toEpochMillis(lower.value) >= DateTime.toEpochMillis(upper.value)
    ) {
      return yield* new ResolutionError({
        message: "The lower range endpoint must be before the upper endpoint",
      });
    }
    if (lower !== undefined && upper !== undefined) {
      return ResolvedDateRange.make({ lower, upper });
    }
    if (lower !== undefined) return ResolvedDateRange.make({ lower });
    if (upper !== undefined) return ResolvedDateRange.make({ upper });
    return yield* new ResolutionError({
      message: "A date range must contain at least one bound",
    });
  });
