import { Effect, Option, String as EffectString } from "effect";

import {
  boundedRange,
  greaterThanOrEqual,
  lessThan,
  lowerOpenRange,
  upperOpenRange,
} from "../ast/constructors.ts";
import { isIsoDate } from "../ast/schemas.ts";
import type { DateRangeExpr, Unit } from "../ast/schemas.ts";
import { BaseLanguageContribution } from "../language/model.ts";
import { defineLanguagePlugin, languagePluginsLayer } from "../language/registry.ts";
import { correctWhitespaceSeparatedText } from "../natural/correction.ts";
import { normalizeNaturalText } from "../natural/text.ts";
import {
  candidate,
  expressionDates,
  fixedDatePeriod,
  fixedMonthPeriod,
  fixedYearPeriod,
  monthOfRelativeYear,
  parseTrailingCount,
  periodRange,
  periodToDateRange,
  previousDay,
  relativePeriod,
  renderFromPhrases,
  trailingPeriod,
  trailingRange,
} from "./shared.ts";
import type { Period } from "./shared.ts";

const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

const units = [
  ["day", "day", "days"],
  ["week", "week", "weeks"],
  ["month", "month", "months"],
  ["quarter", "quarter", "quarters"],
  ["year", "year", "years"],
] as const satisfies ReadonlyArray<readonly [string, Unit, string]>;

const title = (value: string) => `${value.slice(0, 1).toLocaleUpperCase("en")}${value.slice(1)}`;

const monthNumber = (value: string) => {
  const index = months.findIndex((month) => month === value);
  return index === -1 ? undefined : index + 1;
};

const validYear = (value: string) => {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1 && year <= 9998 ? year : undefined;
};

const parsePeriod = (input: string) => {
  if (isIsoDate(input) && input !== "9999-12-31") {
    return Option.some(fixedDatePeriod(input, input));
  }

  const yearMatch = EffectString.match(/^\d{4}$/u)(input);
  if (Option.isSome(yearMatch)) {
    const year = validYear(yearMatch.value[0]);
    if (year !== undefined) return Option.some(fixedYearPeriod(year, String(year)));
  }

  const monthYear = EffectString.match(/^([a-z]+) (\d{4})$/u)(input);
  if (Option.isSome(monthYear)) {
    const month = monthNumber(monthYear.value[1]);
    const year = validYear(monthYear.value[2]);
    if (month !== undefined && year !== undefined) {
      return Option.some(fixedMonthPeriod(year, month, `${title(months[month - 1])} ${year}`));
    }
  }

  const relativeMonth = EffectString.match(/^([a-z]+) of (last|this|next) year$/u)(input);
  if (Option.isSome(relativeMonth)) {
    const month = monthNumber(relativeMonth.value[1]);
    const direction =
      relativeMonth.value[2] === "last" ? -1 : relativeMonth.value[2] === "next" ? 1 : 0;
    if (month !== undefined) {
      return Option.some(
        monthOfRelativeYear(
          month,
          direction,
          `${title(months[month - 1])} of ${relativeMonth.value[2]} year`,
        ),
      );
    }
  }

  const standaloneMonth = monthNumber(input);
  if (standaloneMonth !== undefined) {
    return Option.some(monthOfRelativeYear(standaloneMonth, 0, title(months[standaloneMonth - 1])));
  }

  if (input === "today") return Option.some(relativePeriod("day", 0, "today"));
  if (input === "yesterday") {
    return Option.some(relativePeriod("day", -1, "yesterday"));
  }
  if (input === "tomorrow") {
    return Option.some(relativePeriod("day", 1, "tomorrow"));
  }

  const relative = EffectString.match(/^(last|this|next) ([a-z]+)$/u)(input);
  if (Option.isSome(relative)) {
    const unit = units.find((entry) => entry[0] === relative.value[2])?.[1];
    if (unit !== undefined) {
      const direction = relative.value[1] === "last" ? -1 : relative.value[1] === "next" ? 1 : 0;
      return Option.some(
        relativePeriod(unit, direction, `${relative.value[1]} ${relative.value[2]}`),
      );
    }
  }

  return Option.none<Period>();
};

const boundaryCandidate = (input: string) => {
  const boundaries = [
    ["since ", "since"],
    ["before ", "before"],
    ["through ", "through"],
    ["after ", "after"],
  ] as const;
  const boundary = boundaries.find((entry) => input.startsWith(entry[0]));
  if (boundary === undefined) return Option.none<ReturnType<typeof candidate>>();
  const period = parsePeriod(input.slice(boundary[0].length));
  if (Option.isNone(period)) return Option.none<ReturnType<typeof candidate>>();
  switch (boundary[1]) {
    case "since":
      return Option.some(
        candidate(
          lowerOpenRange(greaterThanOrEqual(period.value.start)),
          `since ${period.value.canonical}`,
        ),
      );
    case "before":
      return Option.some(
        candidate(upperOpenRange(lessThan(period.value.start)), `before ${period.value.canonical}`),
      );
    case "through":
      return Option.some(
        candidate(upperOpenRange(lessThan(period.value.end)), `through ${period.value.canonical}`),
      );
    case "after":
      return Option.some(
        candidate(
          lowerOpenRange(greaterThanOrEqual(period.value.end)),
          `after ${period.value.canonical}`,
        ),
      );
  }
};

const parseTrailingPeriod = (input: string) => {
  const match = EffectString.match(
    /^(?:(?:last|previous) )?([1-9]\d*) (day|days|week|weeks|month|months|quarter|quarters|year|years)$/u,
  )(input);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const amount = parseTrailingCount(match.value[1]);
  const entry = units.find((unit) => unit[0] === match.value[2] || unit[2] === match.value[2]);
  if (
    Option.isNone(amount) ||
    entry === undefined ||
    (amount.value === 1 ? match.value[2] !== entry[0] : match.value[2] !== entry[2])
  ) {
    return Option.none<ReturnType<typeof candidate>>();
  }
  return Option.some(
    candidate(
      trailingRange(amount.value, entry[1]),
      amount.value === 1 ? `1 ${entry[0]}` : `last ${amount.value} ${entry[2]}`,
    ),
  );
};

const parseEnglish = (input: string) => {
  const trailing = parseTrailingPeriod(input);
  if (Option.isSome(trailing)) return trailing;

  const toDate = units.find((entry) => `${entry[0]} to date` === input);
  if (toDate !== undefined) {
    return Option.some(candidate(periodToDateRange(toDate[1]), input));
  }

  const boundary = boundaryCandidate(input);
  if (Option.isSome(boundary)) return boundary;

  if (input.startsWith("from ")) {
    const separator = input.indexOf(" to ", 5);
    if (separator !== -1) {
      const lower = parsePeriod(input.slice(5, separator));
      const upper = parsePeriod(input.slice(separator + 4));
      if (Option.isSome(lower) && Option.isSome(upper)) {
        return Option.some(
          candidate(
            boundedRange(greaterThanOrEqual(lower.value.start), lessThan(upper.value.end)),
            `from ${lower.value.canonical} to ${upper.value.canonical}`,
          ),
        );
      }
    }
  }

  return Option.map(parsePeriod(input), (period) =>
    candidate(periodRange(period), period.canonical),
  );
};

const renderEnglish = (range: DateRangeExpr) => {
  const trailing = trailingPeriod(range);
  if (Option.isSome(trailing)) {
    const entry = units.find((unit) => unit[1] === trailing.value.unit);
    if (entry !== undefined) {
      return Option.some(
        trailing.value.amount === 1 ? `1 ${entry[0]}` : `last ${trailing.value.amount} ${entry[2]}`,
      );
    }
  }

  const periods = [
    "today",
    "yesterday",
    "tomorrow",
    ...units.flatMap((entry) => [`this ${entry[0]}`, `last ${entry[0]}`, `next ${entry[0]}`]),
    ...months.flatMap((month) => [month, `${month} of last year`, `${month} of next year`]),
  ];
  const dates = expressionDates(range);
  const years = new Set(dates.map((date) => date.slice(0, 4)));
  for (const year of years) {
    periods.push(...months.map((month) => `${month} ${year}`), year);
  }
  for (const date of dates) {
    periods.push(date);
    if (date !== "0000-01-01") {
      periods.push(
        previousDay(Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))),
      );
    }
  }
  const phrases = [
    ...units.map((entry) => `${entry[0]} to date`),
    ...periods,
    ...periods.flatMap((period) => [
      `since ${period}`,
      `before ${period}`,
      `through ${period}`,
      `after ${period}`,
    ]),
    ...periods.flatMap((lower) => periods.map((upper) => `from ${lower} to ${upper}`)),
  ];
  return renderFromPhrases(range, phrases, parseEnglish);
};

export const EnglishContribution = new BaseLanguageContribution({
  locale: "en",
  vocabulary: [
    ...months,
    ...units.flatMap((entry) => [entry[0], entry[2]]),
    "after",
    "before",
    "date",
    "from",
    "last",
    "next",
    "of",
    "previous",
    "since",
    "this",
    "through",
    "to",
    "today",
    "tomorrow",
    "yesterday",
  ],
  normalize: normalizeNaturalText,
  correct: correctWhitespaceSeparatedText,
  parseExact: parseEnglish,
  render: renderEnglish,
});

export const EnglishLanguage = defineLanguagePlugin({
  id: "chronolizer/language-en",
  effect: (context) =>
    Effect.asVoid(context.register("chronolizer/language-en", EnglishContribution)),
});

export const EnglishLanguageLayer = languagePluginsLayer([EnglishLanguage]);
