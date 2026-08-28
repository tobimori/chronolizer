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
  "januar",
  "februar",
  "märz",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "dezember",
] as const;

interface UnitPhrases {
  readonly unit: Unit;
  readonly noun: string;
  readonly plural: string;
  readonly current: string;
  readonly previous: string;
  readonly next: string;
  readonly toDate: string;
}

const unitPhrases: ReadonlyArray<UnitPhrases> = [
  {
    unit: "day",
    noun: "tag",
    plural: "tage",
    current: "heute",
    previous: "gestern",
    next: "morgen",
    toDate: "tag bis heute",
  },
  {
    unit: "week",
    noun: "woche",
    plural: "wochen",
    current: "diese woche",
    previous: "letzte woche",
    next: "nächste woche",
    toDate: "woche bis heute",
  },
  {
    unit: "month",
    noun: "monat",
    plural: "monate",
    current: "dieser monat",
    previous: "letzter monat",
    next: "nächster monat",
    toDate: "monat bis heute",
  },
  {
    unit: "quarter",
    noun: "quartal",
    plural: "quartale",
    current: "dieses quartal",
    previous: "letztes quartal",
    next: "nächstes quartal",
    toDate: "quartal bis heute",
  },
  {
    unit: "year",
    noun: "jahr",
    plural: "jahre",
    current: "dieses jahr",
    previous: "letztes jahr",
    next: "nächstes jahr",
    toDate: "jahr bis heute",
  },
];

const title = (value: string) => `${value.slice(0, 1).toLocaleUpperCase("de")}${value.slice(1)}`;

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

  const monthYear = EffectString.match(/^([a-zäöüß]+) (\d{4})$/u)(input);
  if (Option.isSome(monthYear)) {
    const month = monthNumber(monthYear.value[1]);
    const year = validYear(monthYear.value[2]);
    if (month !== undefined && year !== undefined) {
      return Option.some(fixedMonthPeriod(year, month, `${title(months[month - 1])} ${year}`));
    }
  }

  const relativeMonth = EffectString.match(/^([a-zäöüß]+) (letzten|dieses|nächsten) jahres$/u)(
    input,
  );
  if (Option.isSome(relativeMonth)) {
    const month = monthNumber(relativeMonth.value[1]);
    const direction =
      relativeMonth.value[2] === "letzten" ? -1 : relativeMonth.value[2] === "nächsten" ? 1 : 0;
    if (month !== undefined) {
      return Option.some(
        monthOfRelativeYear(
          month,
          direction,
          `${title(months[month - 1])} ${relativeMonth.value[2]} Jahres`,
        ),
      );
    }
  }

  const standaloneMonth = monthNumber(input);
  if (standaloneMonth !== undefined) {
    return Option.some(monthOfRelativeYear(standaloneMonth, 0, title(months[standaloneMonth - 1])));
  }

  const relative = unitPhrases.find(
    (entry) => entry.current === input || entry.previous === input || entry.next === input,
  );
  if (relative !== undefined) {
    const direction = input === relative.previous ? -1 : input === relative.next ? 1 : 0;
    return Option.some(relativePeriod(relative.unit, direction, input));
  }

  return Option.none<Period>();
};

const boundaryCandidate = (input: string) => {
  const boundaries = [
    ["seit ", "since"],
    ["vor ", "before"],
    ["bis einschließlich ", "through"],
    ["nach ", "after"],
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
          `seit ${period.value.canonical}`,
        ),
      );
    case "before":
      return Option.some(
        candidate(upperOpenRange(lessThan(period.value.start)), `vor ${period.value.canonical}`),
      );
    case "through":
      return Option.some(
        candidate(
          upperOpenRange(lessThan(period.value.end)),
          `bis einschließlich ${period.value.canonical}`,
        ),
      );
    case "after":
      return Option.some(
        candidate(
          lowerOpenRange(greaterThanOrEqual(period.value.end)),
          `nach ${period.value.canonical}`,
        ),
      );
  }
};

const parseTrailingPeriod = (input: string) => {
  const match = EffectString.match(
    /^(?:(?:die letzten|letzten|letzte) )?([1-9]\d*) (tag|tage|woche|wochen|monat|monate|quartal|quartale|jahr|jahre)$/u,
  )(input);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const amount = parseTrailingCount(match.value[1]);
  const entry = unitPhrases.find(
    (unit) => unit.noun === match.value[2] || unit.plural === match.value[2],
  );
  if (
    Option.isNone(amount) ||
    entry === undefined ||
    (amount.value === 1 ? match.value[2] !== entry.noun : match.value[2] !== entry.plural)
  ) {
    return Option.none<ReturnType<typeof candidate>>();
  }
  return Option.some(
    candidate(
      trailingRange(amount.value, entry.unit),
      amount.value === 1
        ? `1 ${title(entry.noun)}`
        : `letzte ${amount.value} ${title(entry.plural)}`,
    ),
  );
};

const parseGerman = (input: string) => {
  const trailing = parseTrailingPeriod(input);
  if (Option.isSome(trailing)) return trailing;

  const toDate = unitPhrases.find((entry) => entry.toDate === input);
  if (toDate !== undefined) {
    return Option.some(candidate(periodToDateRange(toDate.unit), input));
  }

  const boundary = boundaryCandidate(input);
  if (Option.isSome(boundary)) return boundary;

  if (input.startsWith("von ")) {
    const separator = input.indexOf(" bis ", 4);
    if (separator !== -1) {
      const lower = parsePeriod(input.slice(4, separator));
      const upper = parsePeriod(input.slice(separator + 5));
      if (Option.isSome(lower) && Option.isSome(upper)) {
        return Option.some(
          candidate(
            boundedRange(greaterThanOrEqual(lower.value.start), lessThan(upper.value.end)),
            `von ${lower.value.canonical} bis ${upper.value.canonical}`,
          ),
        );
      }
    }
  }

  return Option.map(parsePeriod(input), (period) =>
    candidate(periodRange(period), period.canonical),
  );
};

const renderGerman = (range: DateRangeExpr) => {
  const trailing = trailingPeriod(range);
  if (Option.isSome(trailing)) {
    const entry = unitPhrases.find((unit) => unit.unit === trailing.value.unit);
    if (entry !== undefined) {
      return Option.some(
        trailing.value.amount === 1
          ? `1 ${title(entry.noun)}`
          : `letzte ${trailing.value.amount} ${title(entry.plural)}`,
      );
    }
  }

  const periods = [
    ...unitPhrases.flatMap((entry) => [entry.current, entry.previous, entry.next]),
    ...months.flatMap((month) => [month, `${month} letzten jahres`, `${month} nächsten jahres`]),
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
    ...unitPhrases.map((entry) => entry.toDate),
    ...periods,
    ...periods.flatMap((period) => [
      `seit ${period}`,
      `vor ${period}`,
      `bis einschließlich ${period}`,
      `nach ${period}`,
    ]),
    ...periods.flatMap((lower) => periods.map((upper) => `von ${lower} bis ${upper}`)),
  ];
  return renderFromPhrases(range, phrases, parseGerman);
};

export const GermanContribution = new BaseLanguageContribution({
  locale: "de",
  vocabulary: [
    ...months,
    ...unitPhrases.flatMap((entry) => [
      entry.noun,
      entry.plural,
      ...entry.current.split(" "),
      ...entry.previous.split(" "),
      ...entry.next.split(" "),
    ]),
    "bis",
    "die",
    "dieses",
    "einschließlich",
    "jahres",
    "letzte",
    "letzten",
    "nach",
    "nächsten",
    "seit",
    "vor",
    "von",
  ],
  normalize: normalizeNaturalText,
  correct: correctWhitespaceSeparatedText,
  parseExact: parseGerman,
  render: renderGerman,
});

export const GermanLanguage = defineLanguagePlugin({
  id: "chronolizer/language-de",
  effect: (context) =>
    Effect.asVoid(context.register("chronolizer/language-de", GermanContribution)),
});

export const GermanLanguageLayer = languagePluginsLayer([GermanLanguage]);
