import { Option } from "effect";

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
import type { DateRangeExpr, InstantExpr, Unit } from "../ast/schemas.ts";
import { formatFilter } from "../filter/codec.ts";
import type { NaturalCandidate } from "../language/model.ts";

export interface Period {
  readonly start: InstantExpr;
  readonly end: InstantExpr;
  readonly canonical: string;
}

export const periodRange = (period: Period) =>
  boundedRange(greaterThanOrEqual(period.start), lessThan(period.end));

export const periodToDateRange = (unit: Unit) =>
  boundedRange(greaterThanOrEqual(startOf(now(), unit)), lessThanOrEqual(now()));

export const relativePeriod = (unit: Unit, direction: -1 | 0 | 1, canonical: string) => {
  const base = direction === 0 ? now() : shift(now(), direction, unit);
  const start = startOf(base, unit);
  return {
    start,
    end: shift(start, 1, unit),
    canonical,
  } satisfies Period;
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

export const fixedDatePeriod = (value: string, canonical: string) => {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return {
    start: dateLiteral(value),
    end: dateLiteral(nextDay(year, month, day)),
    canonical,
  } satisfies Period;
};

export const fixedMonthPeriod = (year: number, month: number, canonical: string) => {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: dateLiteral(isoDate(year, month, 1)),
    end: dateLiteral(isoDate(nextYear, nextMonth, 1)),
    canonical,
  } satisfies Period;
};

export const fixedYearPeriod = (year: number, canonical: string) =>
  ({
    start: dateLiteral(isoDate(year, 1, 1)),
    end: dateLiteral(isoDate(year + 1, 1, 1)),
    canonical,
  }) satisfies Period;

export const monthOfRelativeYear = (month: number, direction: -1 | 0 | 1, canonical: string) => {
  const yearBase = direction === 0 ? now() : shift(now(), direction, "year");
  const yearStart = startOf(yearBase, "year");
  const start = month === 1 ? yearStart : shift(yearStart, month - 1, "month");
  return {
    start,
    end: shift(start, 1, "month"),
    canonical,
  } satisfies Period;
};

export const candidate = (range: DateRangeExpr, canonical: string) =>
  ({ range, canonical }) satisfies NaturalCandidate;

export const rangeKey = (range: DateRangeExpr) => {
  const filter = formatFilter(range);
  return `${filter.gt ?? ""}|${filter.gte ?? ""}|${filter.lt ?? ""}|${filter.lte ?? ""}`;
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
