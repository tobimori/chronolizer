import { Option, Schema, String as EffectString } from "effect";

import {
  boundedRange,
  dateLiteral,
  greaterThanOrEqual,
  lessThan,
  lessThanOrEqual,
  now,
  shift,
  startOf,
} from "../ast/constructors.ts";
import { InstantExpr, Unit } from "../ast/schemas.ts";
import type { DateRangeExpr } from "../ast/schemas.ts";
import { formatFilter, rangeKey } from "../filter/codec.ts";
import { NaturalCandidate } from "../language/model.ts";

export const Period = Schema.Struct({
  start: InstantExpr,
  end: InstantExpr,
  canonical: Schema.String,
});
export type Period = typeof Period.Type;

export const periodRange = (period: Period) =>
  boundedRange(greaterThanOrEqual(period.start), lessThan(period.end));

export const periodToDateRange = (unit: Unit) =>
  boundedRange(greaterThanOrEqual(startOf(now(), unit)), lessThanOrEqual(now()));

const TrailingCount = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
);

const TrailingPeriod = Schema.Struct({
  amount: TrailingCount,
  unit: Unit,
});

export const parseTrailingCount = (value: string) => {
  const amount = Number(value);
  return Schema.is(TrailingCount)(amount) ? Option.some(amount) : Option.none<number>();
};

export const trailingRange = (amount: number, unit: Unit) =>
  boundedRange(greaterThanOrEqual(shift(now(), -amount, unit)), lessThanOrEqual(now()));

export const trailingPeriod = (range: DateRangeExpr) => {
  if (
    range.lower?._tag !== "GreaterThanOrEqual" ||
    range.upper?._tag !== "LessThanOrEqual" ||
    range.lower.value._tag !== "Shift" ||
    range.lower.value.amount >= 0 ||
    range.lower.value.base._tag !== "Now" ||
    range.upper.value._tag !== "Now"
  ) {
    return Option.none<typeof TrailingPeriod.Type>();
  }
  return Option.some(
    TrailingPeriod.make({
      amount: -range.lower.value.amount,
      unit: range.lower.value.unit,
    }),
  );
};

export const relativePeriod = (unit: Unit, direction: -1 | 0 | 1, canonical: string) => {
  const base = direction === 0 ? now() : shift(now(), direction, unit);
  const start = startOf(base, unit);
  return Period.make({
    start,
    end: shift(start, 1, unit),
    canonical,
  });
};

const pad = (value: number) => String(value).padStart(2, "0");

export const isoDate = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;

const leapYear = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

const monthLength = (year: number, month: number) => {
  if (month === 2) return leapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

export const nextDay = (year: number, month: number, day: number) => {
  if (day < monthLength(year, month)) return isoDate(year, month, day + 1);
  if (month < 12) return isoDate(year, month + 1, 1);
  return isoDate(year + 1, 1, 1);
};

export const previousDay = (year: number, month: number, day: number) => {
  if (day > 1) return isoDate(year, month, day - 1);
  if (month > 1) return isoDate(year, month - 1, monthLength(year, month - 1));
  return isoDate(year - 1, 12, 31);
};

export const fixedDatePeriod = (value: string, canonical: string) => {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return Period.make({
    start: dateLiteral(value),
    end: dateLiteral(nextDay(year, month, day)),
    canonical,
  });
};

export const fixedMonthPeriod = (year: number, month: number, canonical: string) => {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return Period.make({
    start: dateLiteral(isoDate(year, month, 1)),
    end: dateLiteral(isoDate(nextYear, nextMonth, 1)),
    canonical,
  });
};

export const fixedYearPeriod = (year: number, canonical: string) =>
  Period.make({
    start: dateLiteral(isoDate(year, 1, 1)),
    end: dateLiteral(isoDate(year + 1, 1, 1)),
    canonical,
  });

export const monthOfRelativeYear = (month: number, direction: -1 | 0 | 1, canonical: string) => {
  const yearBase = direction === 0 ? now() : shift(now(), direction, "year");
  const yearStart = startOf(yearBase, "year");
  const start = month === 1 ? yearStart : shift(yearStart, month - 1, "month");
  return Period.make({
    start,
    end: shift(start, 1, "month"),
    canonical,
  });
};

export const candidate = (range: DateRangeExpr, canonical: string) =>
  NaturalCandidate.make({ range, canonical });

export const expressionDates = (range: DateRangeExpr) => {
  const filter = formatFilter(range);
  const expressions = [filter.gt, filter.gte, filter.lt, filter.lte];
  const dates = new Set<string>();
  for (const expression of expressions) {
    if (expression === undefined) continue;
    const match = EffectString.match(/^(\d{4})-(\d{2})-(\d{2})/u)(expression);
    if (Option.isSome(match)) dates.add(match.value[0]);
  }
  return [...dates];
};

export const renderFromPhrases = (
  range: DateRangeExpr,
  phrases: ReadonlyArray<string>,
  parse: (input: string) => Option.Option<NaturalCandidate>,
) => {
  const expected = rangeKey(range);
  for (const phrase of phrases) {
    const parsed = parse(phrase);
    if (Option.isSome(parsed) && rangeKey(parsed.value.range) === expected) {
      return Option.some(parsed.value.canonical);
    }
  }
  return Option.none<string>();
};
