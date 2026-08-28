import { Option, Schema, String as EffectString } from "effect";

import {
  boundedRange,
  dateLiteral,
  greaterThanOrEqual,
  lessThan,
  lessThanOrEqual,
  lowerOpenRange,
  now,
  shift,
  startOf,
  upperOpenRange,
} from "../ast/constructors.ts";
import { daysInMonth, InstantExpr, Unit } from "../ast/schemas.ts";
import type { DateRangeExpr } from "../ast/schemas.ts";
import { formatFilter, rangeKey } from "../filter/codec.ts";
import { formatInstantExpression } from "../filter/expression.ts";
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

export const validYear = (value: string) => {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1 && year <= 9998 ? year : undefined;
};

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

export const nextDay = (year: number, month: number, day: number) => {
  if (day < daysInMonth(year, month)) return isoDate(year, month, day + 1);
  if (month < 12) return isoDate(year, month + 1, 1);
  return isoDate(year + 1, 1, 1);
};

export const previousDay = (year: number, month: number, day: number) => {
  if (day > 1) return isoDate(year, month, day - 1);
  if (month > 1) return isoDate(year, month - 1, daysInMonth(year, month - 1));
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

export const openBoundaryCandidate = (
  input: string,
  boundaries: ReadonlyArray<readonly [string, "since" | "before" | "through" | "after"]>,
  parsePeriod: (input: string) => Option.Option<Period>,
) => {
  const boundary = boundaries.find((entry) => input.startsWith(entry[0]));
  if (boundary === undefined) return Option.none<NaturalCandidate>();
  const period = parsePeriod(input.slice(boundary[0].length));
  if (Option.isNone(period)) return Option.none<NaturalCandidate>();
  const canonical = `${boundary[0]}${period.value.canonical}`;
  switch (boundary[1]) {
    case "since":
      return Option.some(
        candidate(lowerOpenRange(greaterThanOrEqual(period.value.start)), canonical),
      );
    case "before":
      return Option.some(candidate(upperOpenRange(lessThan(period.value.start)), canonical));
    case "through":
      return Option.some(candidate(upperOpenRange(lessThan(period.value.end)), canonical));
    case "after":
      return Option.some(
        candidate(lowerOpenRange(greaterThanOrEqual(period.value.end)), canonical),
      );
  }
};

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

export const datedPeriods = (range: DateRangeExpr, months: ReadonlyArray<string>) => {
  const dates = expressionDates(range);
  const years = [...new Set(dates.map((date) => date.slice(0, 4)))];
  return [
    ...years.flatMap((year) => [...months.map((month) => `${month} ${year}`), year]),
    ...dates.flatMap((date) =>
      date === "0000-01-01"
        ? [date]
        : [
            date,
            previousDay(
              Number(date.slice(0, 4)),
              Number(date.slice(5, 7)),
              Number(date.slice(8, 10)),
            ),
          ],
    ),
  ];
};

export const renderPeriodRange = (
  range: DateRangeExpr,
  toDate: ReadonlyArray<NaturalCandidate>,
  phrases: ReadonlyArray<string>,
  parsePeriod: (input: string) => Option.Option<Period>,
  since: (period: string) => string,
  before: (period: string) => string,
  through: (period: string) => string,
  after: (period: string) => string,
  between: (lower: string, upper: string) => string,
) => {
  const expected = rangeKey(range);
  for (const entry of toDate) {
    if (rangeKey(entry.range) === expected) return Option.some(entry.canonical);
  }

  const periods = phrases.flatMap((phrase) =>
    Option.match(parsePeriod(phrase), { onNone: () => [], onSome: (period) => [period] }),
  );
  const filter = formatFilter(range);
  if (filter.gte !== undefined && filter.lt !== undefined) {
    const exact = periods.find(
      (period) =>
        formatInstantExpression(period.start) === filter.gte &&
        formatInstantExpression(period.end) === filter.lt,
    );
    if (exact !== undefined) return Option.some(exact.canonical);
    const lower = periods.find(
      (period) => formatInstantExpression(period.start) === filter.gte,
    )?.canonical;
    const upper = periods.find(
      (period) => formatInstantExpression(period.end) === filter.lt,
    )?.canonical;
    return lower === undefined || upper === undefined
      ? Option.none<string>()
      : Option.some(between(lower, upper));
  }
  if (filter.gte !== undefined && filter.lt === undefined && filter.lte === undefined) {
    for (const period of periods) {
      if (formatInstantExpression(period.start) === filter.gte) {
        return Option.some(since(period.canonical));
      }
      if (formatInstantExpression(period.end) === filter.gte) {
        return Option.some(after(period.canonical));
      }
    }
  }
  if (filter.lt !== undefined && filter.gt === undefined && filter.gte === undefined) {
    for (const period of periods) {
      if (formatInstantExpression(period.start) === filter.lt) {
        return Option.some(before(period.canonical));
      }
      if (formatInstantExpression(period.end) === filter.lt) {
        return Option.some(through(period.canonical));
      }
    }
  }
  return Option.none<string>();
};
