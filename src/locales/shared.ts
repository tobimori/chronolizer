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
import { daysInMonth, InstantExpr, isIsoDate, Unit } from "../ast/schemas.ts";
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

export const fromNowRange = () => lowerOpenRange(greaterThanOrEqual(now()));

export const untilNowRange = () => upperOpenRange(lessThanOrEqual(now()));

export const remainingPeriodRange = (unit: Unit) => {
  const start = startOf(now(), unit);
  return boundedRange(greaterThanOrEqual(now()), lessThan(shift(start, 1, unit)));
};

export const periodStartDay = (period: Period, canonical: string) =>
  Period.make({ start: period.start, end: shift(period.start, 1, "day"), canonical });

export const periodEndDay = (period: Period, canonical: string) =>
  Period.make({ start: shift(period.end, -1, "day"), end: period.end, canonical });

export const relativeWeekend = (direction: number, canonical: string) => {
  const weekBase = direction === 0 ? now() : shift(now(), direction, "week");
  const weekStart = startOf(weekBase, "week");
  const start = shift(weekStart, 5, "day");
  return Period.make({ start, end: shift(start, 2, "day"), canonical });
};

const TrailingCount = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
);

const TrailingPeriod = Schema.Struct({
  amount: TrailingCount,
  unit: Unit,
});

const FuturePeriod = Schema.Struct({
  amount: TrailingCount,
  unit: Unit,
});

const CalendarPeriodOffset = Schema.Struct({
  amount: Schema.Int,
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

export const futureRange = (amount: number, unit: Unit) =>
  boundedRange(greaterThanOrEqual(now()), lessThanOrEqual(shift(now(), amount, unit)));

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

export const futurePeriod = (range: DateRangeExpr) => {
  if (
    range.lower?._tag !== "GreaterThanOrEqual" ||
    range.upper?._tag !== "LessThanOrEqual" ||
    range.lower.value._tag !== "Now" ||
    range.upper.value._tag !== "Shift" ||
    range.upper.value.amount <= 0 ||
    range.upper.value.base._tag !== "Now"
  ) {
    return Option.none<typeof FuturePeriod.Type>();
  }
  return Option.some(
    FuturePeriod.make({
      amount: range.upper.value.amount,
      unit: range.upper.value.unit,
    }),
  );
};

export const relativePeriod = (unit: Unit, direction: number, canonical: string) => {
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

export const namedDatePeriod = (
  yearText: string,
  monthText: string,
  dayText: string,
  monthNumber: (value: string) => number | undefined,
  canonical: (day: number, month: number, year: number) => string,
) => {
  const year = validYear(yearText);
  const month = monthNumber(monthText);
  const day = Number(dayText);
  if (year === undefined || month === undefined) return Option.none<Period>();
  const value = isoDate(year, month, day);
  if (!isIsoDate(value) || value === "9999-12-31") return Option.none<Period>();
  return Option.some(fixedDatePeriod(value, canonical(day, month, year)));
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

export const fixedQuarterPeriod = (year: number, quarter: number, canonical: string) => {
  const month = (quarter - 1) * 3 + 1;
  const nextYear = quarter === 4 ? year + 1 : year;
  const nextMonth = quarter === 4 ? 1 : month + 3;
  return Period.make({
    start: dateLiteral(isoDate(year, month, 1)),
    end: dateLiteral(isoDate(nextYear, nextMonth, 1)),
    canonical,
  });
};

export const quarterOfRelativeYear = (quarter: number, direction: number, canonical: string) => {
  const yearBase = direction === 0 ? now() : shift(now(), direction, "year");
  const yearStart = startOf(yearBase, "year");
  const start = quarter === 1 ? yearStart : shift(yearStart, (quarter - 1) * 3, "month");
  return Period.make({
    start,
    end: shift(start, 1, "quarter"),
    canonical,
  });
};

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

export const calendarPeriodOffset = (range: DateRangeExpr) => {
  if (
    range.lower?._tag !== "GreaterThanOrEqual" ||
    range.upper?._tag !== "LessThan" ||
    range.lower.value._tag !== "StartOf" ||
    range.lower.value.base._tag !== "Shift" ||
    range.lower.value.base.amount === 0 ||
    range.lower.value.base.base._tag !== "Now" ||
    range.lower.value.unit !== range.lower.value.base.unit ||
    range.upper.value._tag !== "Shift" ||
    range.upper.value.amount !== 1 ||
    range.upper.value.unit !== range.lower.value.unit ||
    formatInstantExpression(range.upper.value.base) !== formatInstantExpression(range.lower.value)
  ) {
    return Option.none<typeof CalendarPeriodOffset.Type>();
  }
  return Option.some(
    CalendarPeriodOffset.make({
      amount: range.lower.value.base.amount,
      unit: range.lower.value.unit,
    }),
  );
};

export const candidate = (range: DateRangeExpr, canonical: string) =>
  NaturalCandidate.make({ range, canonical });

export const joinedNowCandidate = (
  input: string,
  periodToNow: ReadonlyArray<readonly [prefix: string, suffix: string]>,
  nowToPeriod: ReadonlyArray<string>,
  parsePeriod: (input: string) => Option.Option<Period>,
  canonicalToNow: (period: string) => string,
  canonicalFromNow: (period: string) => string,
) => {
  for (const [prefix, suffix] of periodToNow) {
    if (!input.startsWith(prefix) || !input.endsWith(suffix)) continue;
    const period = parsePeriod(input.slice(prefix.length, -suffix.length));
    if (Option.isNone(period)) continue;
    return Option.some(
      candidate(
        boundedRange(greaterThanOrEqual(period.value.start), lessThanOrEqual(now())),
        canonicalToNow(period.value.canonical),
      ),
    );
  }
  for (const prefix of nowToPeriod) {
    if (!input.startsWith(prefix)) continue;
    const period = parsePeriod(input.slice(prefix.length));
    if (Option.isNone(period)) continue;
    return Option.some(
      candidate(
        boundedRange(greaterThanOrEqual(now()), lessThan(period.value.end)),
        canonicalFromNow(period.value.canonical),
      ),
    );
  }
  return Option.none<NaturalCandidate>();
};

export const joinedPeriodCandidate = (
  input: string,
  joins: ReadonlyArray<readonly [prefix: string, separator: string]>,
  parsePeriod: (input: string) => Option.Option<Period>,
  canonical: (lower: string, upper: string) => string,
) => {
  for (const [prefix, separator] of joins) {
    if (!input.startsWith(prefix)) continue;
    const separatorIndex = input.indexOf(separator, prefix.length);
    if (separatorIndex === -1) continue;
    const lower = parsePeriod(input.slice(prefix.length, separatorIndex));
    const upper = parsePeriod(input.slice(separatorIndex + separator.length));
    if (Option.isNone(lower) || Option.isNone(upper)) continue;
    return Option.some(
      candidate(
        boundedRange(greaterThanOrEqual(lower.value.start), lessThan(upper.value.end)),
        canonical(lower.value.canonical, upper.value.canonical),
      ),
    );
  }
  return Option.none<NaturalCandidate>();
};

export const periodBoundaryCandidate = (
  period: Period,
  boundary: "since" | "before" | "through" | "after",
  canonical: string,
) => {
  switch (boundary) {
    case "since":
      return candidate(lowerOpenRange(greaterThanOrEqual(period.start)), canonical);
    case "before":
      return candidate(upperOpenRange(lessThan(period.start)), canonical);
    case "through":
      return candidate(upperOpenRange(lessThan(period.end)), canonical);
    case "after":
      return candidate(lowerOpenRange(greaterThanOrEqual(period.end)), canonical);
  }
};

export const openBoundaryCandidate = (
  input: string,
  boundaries: ReadonlyArray<readonly [string, "since" | "before" | "through" | "after"]>,
  parsePeriod: (input: string) => Option.Option<Period>,
) => {
  for (const boundary of boundaries) {
    if (!input.startsWith(boundary[0])) continue;
    const period = parsePeriod(input.slice(boundary[0].length));
    if (Option.isNone(period)) continue;
    const canonical = `${boundary[0]}${period.value.canonical}`;
    return Option.some(periodBoundaryCandidate(period.value, boundary[1], canonical));
  }
  return Option.none<NaturalCandidate>();
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

export const datedQuarterPeriods = (range: DateRangeExpr) => {
  const years = [...new Set(expressionDates(range).map((date) => date.slice(0, 4)))];
  return years.flatMap((year) => [1, 2, 3, 4].map((quarter) => `q${quarter} ${year}`));
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

export const periodsFromPhrases = (
  phrases: ReadonlyArray<string>,
  parsePeriod: (input: string) => Option.Option<Period>,
) =>
  phrases.flatMap((phrase) =>
    Option.match(parsePeriod(phrase), { onNone: () => [], onSome: (period) => [period] }),
  );

export const renderPeriodRange = (
  range: DateRangeExpr,
  toDate: ReadonlyArray<NaturalCandidate>,
  periods: ReadonlyArray<Period>,
  since: (period: string) => string,
  before: (period: string) => string,
  through: (period: string) => string,
  after: (period: string) => string,
  between: (lower: string, upper: string) => string,
  toNow: (period: string) => string,
  fromNow: (period: string) => string,
  untilNow: () => string,
  afterNow: () => string,
) => {
  const expected = rangeKey(range);
  for (const entry of toDate) {
    if (rangeKey(entry.range) === expected) return Option.some(entry.canonical);
  }

  const filter = formatFilter(range);
  if (filter.lte === "now" && filter.gt === undefined && filter.gte === undefined) {
    return Option.some(untilNow());
  }
  if (filter.gte === "now" && filter.lt === undefined && filter.lte === undefined) {
    return Option.some(afterNow());
  }
  if (filter.gte !== undefined && filter.lte === "now") {
    const period = periods.find(
      (candidate) => formatInstantExpression(candidate.start) === filter.gte,
    );
    if (period !== undefined) return Option.some(toNow(period.canonical));
  }
  if (filter.gte === "now" && filter.lt !== undefined) {
    const period = periods.find(
      (candidate) => formatInstantExpression(candidate.end) === filter.lt,
    );
    if (period !== undefined) return Option.some(fromNow(period.canonical));
  }
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
