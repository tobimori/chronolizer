import { Effect, Option, String as EffectString } from "effect";

import { isIsoDate } from "../ast/schemas.ts";
import type { DateRangeExpr, Unit } from "../ast/schemas.ts";
import { BaseLanguageContribution } from "../language/model.ts";
import { defineLanguagePlugin, languagePluginsLayer } from "../language/registry.ts";
import { correctWhitespaceSeparatedText } from "../natural/correction.ts";
import {
  completeNaturalPhrases,
  fixedCalendarPeriodPhrases,
  naturalCount,
  prefixNaturalPhrases,
} from "../natural/suggestion.ts";
import { normalizeNaturalText } from "../natural/text.ts";
import {
  calendarPeriodOffset,
  candidate,
  currentYearDatePeriods,
  datedPeriods,
  datedQuarterPeriods,
  fixedDatePeriod,
  fixedMonthPeriod,
  fixedQuarterPeriod,
  fixedYearPeriod,
  fromNowRange,
  futurePeriod,
  futureRange,
  joinedNowCandidate,
  joinedPeriodCandidate,
  monthOfRelativeYear,
  namedCurrentYearDatePeriod,
  namedDatePeriod,
  openBoundaryCandidate,
  parseTrailingCount,
  periodEndDay,
  periodPreviousDay,
  periodRange,
  periodsFromPhrases,
  periodStartDay,
  periodToDateRange,
  quarterOfRelativeYear,
  relativePeriod,
  relativeWeekend,
  remainingPeriodRange,
  renderPeriodRange,
  textAt,
  trailingPeriod,
  trailingRange,
  untilNowRange,
  validYear,
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

const monthAbbreviations = [
  ["jan"],
  ["feb"],
  ["mar"],
  ["apr"],
  ["may"],
  ["jun"],
  ["jul"],
  ["aug"],
  ["sep", "sept"],
  ["oct"],
  ["nov"],
  ["dec"],
] as const;

const quarterNames = ["first", "second", "third", "fourth"] as const;

const units = [
  ["day", "day", "days"],
  ["week", "week", "weeks"],
  ["month", "month", "months"],
  ["quarter", "quarter", "quarters"],
  ["year", "year", "years"],
] as const satisfies ReadonlyArray<readonly [string, Unit, string]>;

const title = (value: string) => `${value.slice(0, 1).toLocaleUpperCase("en")}${value.slice(1)}`;

const currentPeriod = (unit: string) => (unit === "day" ? "today" : `this ${unit}`);

const remainingPeriodPhrases = units.flatMap((entry) =>
  [
    `rest of the ${entry[0]}`,
    `rest of ${entry[0]}`,
    `rest of ${currentPeriod(entry[0])}`,
    `remainder of the ${entry[0]}`,
    `remaining ${entry[0]}`,
  ].map((phrase) => ({ entry, phrase })),
);

const toDateAbbreviations = ["dtd", "wtd", "mtd", "qtd", "ytd"] as const;

const toDatePhrases = units.flatMap((entry, index) =>
  [
    `${entry[0]} to date`,
    `${entry[0]}-to-date`,
    toDateAbbreviations[index] ?? "",
    `since the start of the ${entry[0]}`,
    `since the beginning of the ${entry[0]}`,
    `from the start of the ${entry[0]} to now`,
    `from the beginning of the ${entry[0]} to now`,
    `${currentPeriod(entry[0])} so far`,
    `so far ${currentPeriod(entry[0])}`,
    `${currentPeriod(entry[0])} until now`,
    `${currentPeriod(entry[0])} up to now`,
  ].map((phrase) => ({ entry, phrase })),
);

const monthNumber = (value: string) => {
  const normalized = value.endsWith(".") ? value.slice(0, -1) : value;
  const fullIndex = months.findIndex((month) => month === normalized);
  if (fullIndex !== -1) return fullIndex + 1;
  const shortIndex = monthAbbreviations.findIndex((aliases) =>
    aliases.some((alias) => alias === normalized),
  );
  return shortIndex === -1 ? undefined : shortIndex + 1;
};

const relativeDirection = (value: string) => {
  if (value === "last" || value === "previous") return -1;
  if (value === "next" || value === "coming" || value === "upcoming") return 1;
  return 0;
};

const relativeDirectionName = (direction: number) => {
  if (direction < 0) return "last";
  if (direction > 0) return "next";
  return "this";
};

const quarterNumber = (value: string) => {
  if (value.startsWith("q")) return Number(value.slice(1));
  const index = quarterNames.findIndex((name) => name === value);
  return index === -1 ? undefined : index + 1;
};

const parseQuarter = (input: string) => {
  const fixed = EffectString.match(/^(q[1-4])(?: of)? (\d{4})$/u)(input);
  const reversed = EffectString.match(/^(\d{4}) (q[1-4])$/u)(input);
  const namedFixed = EffectString.match(/^(first|second|third|fourth) quarter(?: of)? (\d{4})$/u)(
    input,
  );
  const relative = EffectString.match(/^(q[1-4])(?: of)? (last|this|next) year$/u)(input);
  const namedRelative = EffectString.match(
    /^(first|second|third|fourth) quarter(?: of)? (last|this|next) year$/u,
  )(input);
  const standalone = EffectString.match(/^(q[1-4])$/u)(input);
  const namedStandalone = EffectString.match(/^(first|second|third|fourth) quarter$/u)(input);

  const fixedMatch = Option.firstSomeOf([fixed, reversed, namedFixed]);
  if (Option.isSome(fixedMatch)) {
    const quarterText = textAt(fixedMatch.value, Option.isSome(reversed) ? 2 : 1);
    const yearText = textAt(fixedMatch.value, Option.isSome(reversed) ? 1 : 2);
    const quarter = quarterNumber(quarterText);
    const year = validYear(yearText);
    if (quarter !== undefined && year !== undefined) {
      return Option.some(fixedQuarterPeriod(year, quarter, `Q${quarter} ${year}`));
    }
  }

  const relativeMatch = Option.firstSomeOf([relative, namedRelative]);
  if (Option.isSome(relativeMatch)) {
    const directionText = textAt(relativeMatch.value, 2);
    const quarter = quarterNumber(textAt(relativeMatch.value, 1));
    if (quarter !== undefined) {
      const direction = relativeDirection(directionText);
      return Option.some(
        quarterOfRelativeYear(quarter, direction, `Q${quarter} of ${directionText} year`),
      );
    }
  }

  const standaloneMatch = Option.firstSomeOf([standalone, namedStandalone]);
  if (Option.isNone(standaloneMatch)) return Option.none<Period>();
  const quarter = quarterNumber(textAt(standaloneMatch.value, 1));
  return quarter === undefined
    ? Option.none<Period>()
    : Option.some(quarterOfRelativeYear(quarter, 0, `Q${quarter}`));
};

const currentDateLabel = (day: number, month: number) =>
  `${day} ${title(textAt(months, month - 1))}`;

const parseNamedDate = (input: string) => {
  const dayFirst = EffectString.match(
    /^(?:the )?([0-3]?\d)(?:st|nd|rd|th)?(?: of)? ([a-z]+\.?),? (\d{4})$/u,
  )(input);
  if (Option.isSome(dayFirst)) {
    return namedDatePeriod(
      textAt(dayFirst.value, 3),
      textAt(dayFirst.value, 2),
      textAt(dayFirst.value, 1),
      monthNumber,
      (day, month, year) => `${day} ${title(textAt(months, month - 1))} ${year}`,
    );
  }
  const monthFirst = EffectString.match(
    /^([a-z]+\.?) (?:the )?([0-3]?\d)(?:st|nd|rd|th)?,? (\d{4})$/u,
  )(input);
  if (Option.isSome(monthFirst)) {
    return namedDatePeriod(
      textAt(monthFirst.value, 3),
      textAt(monthFirst.value, 1),
      textAt(monthFirst.value, 2),
      monthNumber,
      (day, month, year) => `${day} ${title(textAt(months, month - 1))} ${year}`,
    );
  }

  const currentDayFirst = EffectString.match(
    /^(?:the )?([0-3]?\d)(?:st|nd|rd|th)?(?: of)? ([a-z]+\.?)$/u,
  )(input);
  const currentMonthFirst = EffectString.match(
    /^([a-z]+\.?) (?:the )?([0-3]?\d)(?:st|nd|rd|th)?$/u,
  )(input);
  const current = Option.firstSomeOf([currentDayFirst, currentMonthFirst]);
  if (Option.isNone(current)) return Option.none<Period>();
  return Option.isSome(currentDayFirst)
    ? namedCurrentYearDatePeriod(
        textAt(current.value, 2),
        textAt(current.value, 1),
        monthNumber,
        currentDateLabel,
      )
    : namedCurrentYearDatePeriod(
        textAt(current.value, 1),
        textAt(current.value, 2),
        monthNumber,
        currentDateLabel,
      );
};

const parseBasePeriod = (input: string) => {
  if (isIsoDate(input) && input !== "9999-12-31") {
    return Option.some(fixedDatePeriod(input, input));
  }

  const namedDate = parseNamedDate(input);
  if (Option.isSome(namedDate)) return namedDate;

  const quarter = parseQuarter(input);
  if (Option.isSome(quarter)) return quarter;

  const yearMatch = EffectString.match(/^(?:(?:the )?(?:calendar )?year )?(\d{4})$/u)(input);
  if (Option.isSome(yearMatch)) {
    const year = validYear(textAt(yearMatch.value, 1));
    if (year !== undefined) return Option.some(fixedYearPeriod(year, String(year)));
  }

  const monthYear = EffectString.match(/^([a-z]+\.?) (\d{4})$/u)(input);
  if (Option.isSome(monthYear)) {
    const month = monthNumber(textAt(monthYear.value, 1));
    const year = validYear(textAt(monthYear.value, 2));
    if (month !== undefined && year !== undefined) {
      return Option.some(
        fixedMonthPeriod(year, month, `${title(textAt(months, month - 1))} ${year}`),
      );
    }
  }

  const relativeMonth = EffectString.match(/^([a-z]+\.?) (?:of )?(last|this|next) year$/u)(input);
  if (Option.isSome(relativeMonth)) {
    const directionText = textAt(relativeMonth.value, 2);
    const month = monthNumber(textAt(relativeMonth.value, 1));
    const direction = relativeDirection(directionText);
    if (month !== undefined) {
      return Option.some(
        monthOfRelativeYear(
          month,
          direction,
          `${title(textAt(months, month - 1))} of ${directionText} year`,
        ),
      );
    }
  }

  const standaloneMonth = monthNumber(input);
  if (standaloneMonth !== undefined) {
    return Option.some(
      monthOfRelativeYear(standaloneMonth, 0, title(textAt(months, standaloneMonth - 1))),
    );
  }

  if (input === "today") return Option.some(relativePeriod("day", 0, "today"));
  if (input === "yesterday") {
    return Option.some(relativePeriod("day", -1, "yesterday"));
  }
  if (input === "tomorrow") {
    return Option.some(relativePeriod("day", 1, "tomorrow"));
  }
  if (input === "weekend" || input === "the weekend" || input === "this weekend") {
    return Option.some(relativeWeekend(0, "this weekend"));
  }
  if (input === "last weekend" || input === "previous weekend") {
    return Option.some(relativeWeekend(-1, "last weekend"));
  }
  if (input === "next weekend" || input === "coming weekend") {
    return Option.some(relativeWeekend(1, "next weekend"));
  }
  if (input === "the weekend before last") {
    return Option.some(relativeWeekend(-2, "the weekend before last"));
  }
  if (input === "the weekend after next") {
    return Option.some(relativeWeekend(2, "the weekend after next"));
  }

  const articlePeriod = EffectString.match(/^the (day|week|month|quarter|year)$/u)(input);
  if (Option.isSome(articlePeriod)) {
    const entry = units.find((unit) => unit[0] === textAt(articlePeriod.value, 1));
    if (entry !== undefined) {
      return Option.some(relativePeriod(entry[1], 0, currentPeriod(entry[0])));
    }
  }

  const outerRelative = EffectString.match(
    /^(?:the )?(day|week|month|quarter|year) (before last|after next)$/u,
  )(input);
  if (Option.isSome(outerRelative)) {
    const entry = units.find((unit) => unit[0] === textAt(outerRelative.value, 1));
    if (entry !== undefined) {
      const direction = textAt(outerRelative.value, 2) === "before last" ? -2 : 2;
      return Option.some(relativePeriod(entry[1], direction, input));
    }
  }

  const relative = EffectString.match(
    /^(?:the )?(last|previous|this|current|next|coming|upcoming) (?:calendar )?([a-z]+)$/u,
  )(input);
  if (Option.isSome(relative)) {
    const unitText = textAt(relative.value, 2);
    const unit = units.find((entry) => entry[0] === unitText)?.[1];
    if (unit !== undefined) {
      const direction = relativeDirection(textAt(relative.value, 1));
      const canonicalDirection = relativeDirectionName(direction);
      return Option.some(relativePeriod(unit, direction, `${canonicalDirection} ${unitText}`));
    }
  }

  return Option.none<Period>();
};

const parsePeriod = (input: string) => {
  const previousDay = EffectString.match(/^(?:the )?day before (.+)$/u)(input);
  if (Option.isSome(previousDay)) {
    const period = parseBasePeriod(textAt(previousDay.value, 1));
    if (Option.isSome(period)) {
      return Option.some(
        periodPreviousDay(period.value, `the day before ${period.value.canonical}`),
      );
    }
  }

  const edge = EffectString.match(/^(?:the )?(start|beginning|end) of (.+)$/u)(input);
  if (Option.isSome(edge)) {
    const period = parseBasePeriod(textAt(edge.value, 2));
    if (Option.isSome(period)) {
      const edgeName = textAt(edge.value, 1);
      const name = edgeName === "beginning" ? "start" : edgeName;
      const canonical = `${name} of ${period.value.canonical}`;
      return Option.some(
        name === "end"
          ? periodEndDay(period.value, canonical)
          : periodStartDay(period.value, canonical),
      );
    }
  }
  const wrapper = ["during ", "in ", "for ", "all of ", "the whole of "].find((prefix) =>
    input.startsWith(prefix),
  );
  return parseBasePeriod(wrapper === undefined ? input : input.slice(wrapper.length));
};

const boundaryCandidate = (input: string) =>
  openBoundaryCandidate(
    input,
    [
      ["up to and including ", "through"],
      ["on or before ", "through"],
      ["on or after ", "since"],
      ["up to including ", "through"],
      ["since the beginning of ", "since"],
      ["since the start of ", "since"],
      ["from the beginning of ", "since"],
      ["from the start of ", "since"],
      ["starting from ", "since"],
      ["through the end of ", "through"],
      ["until the end of ", "through"],
      ["after the end of ", "after"],
      ["until the start of ", "before"],
      ["before the beginning of ", "before"],
      ["before the start of ", "before"],
      ["before beginning of ", "before"],
      ["before start of ", "before"],
      ["starting ", "since"],
      ["through ", "through"],
      ["earlier than ", "before"],
      ["later than ", "after"],
      ["before ", "before"],
      ["since ", "since"],
      ["after ", "after"],
      ["until ", "before"],
      ["till ", "before"],
      ["up to ", "before"],
      ["from ", "since"],
    ],
    parsePeriod,
  );

const countedUnit = (value: string, amount: number) =>
  units.find((entry) => value === (amount === 1 ? entry[0] : entry[2]));

const parseCalendarOffset = (input: string) => {
  const singular = EffectString.match(
    /^(?:(?:a|one) (day|week|month|quarter|year) (ago|prior|from now)|in (?:a|one) (day|week|month|quarter|year))$/u,
  )(input);
  if (Option.isSome(singular)) {
    const unitText = textAt(singular.value, 1) || textAt(singular.value, 3);
    const entry = units.find((unit) => unit[0] === unitText);
    if (entry !== undefined) {
      const directionText = textAt(singular.value, 2);
      const isPast = directionText === "ago" || directionText === "prior";
      const direction = isPast ? -1 : 1;
      const canonical = isPast ? `1 ${entry[0]} ago` : `in 1 ${entry[0]}`;
      return Option.some(
        candidate(periodRange(relativePeriod(entry[1], direction, canonical)), canonical),
      );
    }
  }

  const past = EffectString.match(
    /^([1-9]\d*) (day|days|week|weeks|month|months|quarter|quarters|year|years) (?:ago|prior)$/u,
  )(input);
  const futureIn = EffectString.match(
    /^in ([1-9]\d*) (day|days|week|weeks|month|months|quarter|quarters|year|years)$/u,
  )(input);
  const futureFromNow = EffectString.match(
    /^([1-9]\d*) (day|days|week|weeks|month|months|quarter|quarters|year|years) from now$/u,
  )(input);
  const match = Option.firstSomeOf([past, futureIn, futureFromNow]);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const amount = parseTrailingCount(textAt(match.value, 1));
  if (Option.isNone(amount)) return Option.none<ReturnType<typeof candidate>>();
  const unitText = textAt(match.value, 2);
  const entry = countedUnit(unitText, amount.value);
  if (entry === undefined) return Option.none<ReturnType<typeof candidate>>();
  const direction = Option.isSome(past) ? -amount.value : amount.value;
  const canonical =
    direction < 0 ? `${amount.value} ${unitText} ago` : `in ${amount.value} ${unitText}`;
  return Option.some(
    candidate(periodRange(relativePeriod(entry[1], direction, canonical)), canonical),
  );
};

const parseRollingPeriod = (input: string) => {
  const past = EffectString.match(
    /^(?:(?:last|previous|past) |(?:in|over) the (?:last|previous|past) )?([1-9]\d*) (day|days|week|weeks|month|months|quarter|quarters|year|years)$/u,
  )(input);
  const singularPast = EffectString.match(
    /^(?:past|the past|in the past|over the past|this past) (day|week|month|quarter|year)$/u,
  )(input);
  const future = EffectString.match(
    /^(?:(?:next|coming|within) |(?:in|over|within) the (?:next|coming) )([1-9]\d*) (day|days|week|weeks|month|months|quarter|quarters|year|years)$/u,
  )(input);
  const singularFuture = EffectString.match(
    /^(?:in|over|within) the (?:next|coming) (day|week|month|quarter|year)$/u,
  )(input);
  const match = Option.firstSomeOf([past, singularPast, future, singularFuture]);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const singular = Option.isSome(singularPast) || Option.isSome(singularFuture);
  const amount = parseTrailingCount(singular ? "1" : textAt(match.value, 1));
  if (Option.isNone(amount)) return Option.none<ReturnType<typeof candidate>>();
  const unitText = textAt(match.value, singular ? 1 : 2);
  const entry = countedUnit(unitText, amount.value);
  if (entry === undefined) return Option.none<ReturnType<typeof candidate>>();
  const isFuture = Option.isSome(future) || Option.isSome(singularFuture);
  const range = isFuture
    ? futureRange(amount.value, entry[1])
    : trailingRange(amount.value, entry[1]);
  if (amount.value === 1) {
    const canonical = isFuture ? `within the next ${entry[0]}` : `past ${entry[0]}`;
    return Option.some(candidate(range, canonical));
  }
  const direction = isFuture ? "next" : "last";
  return Option.some(candidate(range, `${direction} ${amount.value} ${entry[2]}`));
};

const parseElidedDateRange = (input: string) => {
  const monthFirst = EffectString.match(
    /^([a-z]+\.?) ([0-3]?\d)(?:st|nd|rd|th)?(?: (?:to|through) |[–—-])([0-3]?\d)(?:st|nd|rd|th)?,?(?: (\d{4}))?$/u,
  )(input);
  const dayFirst = EffectString.match(
    /^([0-3]?\d)(?:st|nd|rd|th)?(?: (?:to|through) |[–—-])([0-3]?\d)(?:st|nd|rd|th)? ([a-z]+\.?)(?: (\d{4}))?$/u,
  )(input);
  const match = Option.firstSomeOf([monthFirst, dayFirst]);
  if (Option.isNone(match)) return Option.none();

  const isMonthFirst = Option.isSome(monthFirst);
  const month = textAt(match.value, isMonthFirst ? 1 : 3);
  const lowerDay = textAt(match.value, isMonthFirst ? 2 : 1);
  const upperDay = textAt(match.value, isMonthFirst ? 3 : 2);
  const year = textAt(match.value, 4);
  const suffix = year.length === 0 ? "" : ` ${year}`;
  return joinedPeriodCandidate(
    `from ${lowerDay} ${month}${suffix} to ${upperDay} ${month}${suffix}`,
    [["from ", " to "]],
    parsePeriod,
    (lower, upper) => `from ${lower} to ${upper}`,
  );
};

const parseEnglish = (input: string) => {
  const remaining = remainingPeriodPhrases.find((entry) => entry.phrase === input);
  if (remaining !== undefined) {
    return Option.some(
      candidate(remainingPeriodRange(remaining.entry[1]), `rest of the ${remaining.entry[0]}`),
    );
  }

  if (["until now", "till now", "up to now", "through now"].includes(input)) {
    return Option.some(candidate(untilNowRange(), "until now"));
  }
  if (["from now", "from now on", "starting now"].includes(input)) {
    return Option.some(candidate(fromNowRange(), "from now"));
  }

  const offset = parseCalendarOffset(input);
  if (Option.isSome(offset)) return offset;

  const rolling = parseRollingPeriod(input);
  if (Option.isSome(rolling)) return rolling;

  const toDate = toDatePhrases.find((entry) => entry.phrase === input);
  if (toDate !== undefined) {
    return Option.some(candidate(periodToDateRange(toDate.entry[1]), `${toDate.entry[0]} to date`));
  }

  const elided = parseElidedDateRange(input);
  if (Option.isSome(elided)) return elided;

  const nowBounded = joinedNowCandidate(
    input,
    [
      ["from ", " to now"],
      ["from ", " until now"],
      ["from ", " through now"],
      ["from ", " to date"],
      ["between ", " and now"],
    ],
    ["from now to ", "from now until ", "from now through ", "between now and "],
    parsePeriod,
    (period) => `from ${period} to now`,
    (period) => `from now to ${period}`,
  );
  if (Option.isSome(nowBounded)) return nowBounded;

  const bounded = joinedPeriodCandidate(
    input,
    [
      ["from ", " to and including "],
      ["from ", " through and including "],
      ["from ", " to "],
      ["from ", " until "],
      ["from ", " through "],
      ["from ", " till "],
      ["between ", " and "],
      ["between ", " through "],
      ["", " to and including "],
      ["", " through and including "],
      ["", " to "],
      ["", " until "],
      ["", " through "],
      ["", " till "],
      ["", " - "],
      ["", " – "],
      ["", " — "],
      ["between ", "-"],
      ["", "-"],
      ["between ", "–"],
      ["", "–"],
      ["between ", "—"],
      ["", "—"],
      ["between ", "~"],
      ["", "~"],
    ],
    parsePeriod,
    (lower, upper) => `from ${lower} to ${upper}`,
  );
  if (Option.isSome(bounded)) return bounded;

  const boundary = boundaryCandidate(input);
  if (Option.isSome(boundary)) return boundary;

  return Option.map(parsePeriod(input), (period) =>
    candidate(periodRange(period), period.canonical),
  );
};

const staticPeriodPhrases = [
  "today",
  "yesterday",
  "the day before yesterday",
  "tomorrow",
  "this weekend",
  "last weekend",
  "next weekend",
  "the weekend before last",
  "the weekend after next",
  ...units
    .filter((entry) => entry[1] !== "day")
    .flatMap((entry) => [
      `this ${entry[0]}`,
      `last ${entry[0]}`,
      `next ${entry[0]}`,
      `start of this ${entry[0]}`,
      `end of this ${entry[0]}`,
      `start of last ${entry[0]}`,
      `end of last ${entry[0]}`,
      `start of next ${entry[0]}`,
      `end of next ${entry[0]}`,
    ]),
  ...[1, 2, 3, 4].flatMap((quarter) => [
    `q${quarter}`,
    `q${quarter} of last year`,
    `q${quarter} of next year`,
  ]),
  ...months.flatMap((month) => [month, `${month} of last year`, `${month} of next year`]),
];

const staticPeriods = periodsFromPhrases(staticPeriodPhrases, parsePeriod);

const boundaryPrefixes = ["since ", "before ", "through ", "after "];

const countedSuggestions = (input: string) => {
  const amount = naturalCount(input);
  if (amount === undefined) return [];
  return units.flatMap((entry) => {
    const noun = amount === 1 ? entry[0] : entry[2];
    return [
      `last ${amount} ${noun}`,
      `${amount} ${noun}`,
      `next ${amount} ${noun}`,
      `${amount} ${noun} ago`,
      `in ${amount} ${noun}`,
    ];
  });
};

const englishSuggestionPhrases = [
  ...units.map((entry) => `${entry[0]} to date`),
  ...remainingPeriodPhrases.map((entry) => entry.phrase),
  ...units.flatMap((entry) => [`past ${entry[0]}`, `within the next ${entry[0]}`]),
  ...staticPeriodPhrases,
  ...prefixNaturalPhrases(staticPeriodPhrases, boundaryPrefixes),
  "until now",
  "from now",
];

const suggestEnglish = (input: string, limit: number) => {
  const fixed = fixedCalendarPeriodPhrases(input, months);
  return completeNaturalPhrases(
    input,
    [
      ...englishSuggestionPhrases,
      ...fixed,
      ...prefixNaturalPhrases(fixed, boundaryPrefixes),
      ...countedSuggestions(input),
    ],
    limit,
  );
};

const renderEnglish = (range: DateRangeExpr) => {
  const offset = calendarPeriodOffset(range);
  if (Option.isSome(offset) && Math.abs(offset.value.amount) > 1) {
    const entry = units.find((unit) => unit[1] === offset.value.unit);
    if (entry !== undefined) {
      const noun = offset.value.amount === -1 || offset.value.amount === 1 ? entry[0] : entry[2];
      return Option.some(
        offset.value.amount < 0
          ? `${-offset.value.amount} ${noun} ago`
          : `in ${offset.value.amount} ${noun}`,
      );
    }
  }

  const future = futurePeriod(range);
  if (Option.isSome(future)) {
    const entry = units.find((unit) => unit[1] === future.value.unit);
    if (entry !== undefined) {
      return Option.some(
        future.value.amount === 1
          ? `within the next ${entry[0]}`
          : `next ${future.value.amount} ${entry[2]}`,
      );
    }
  }

  const trailing = trailingPeriod(range);
  if (Option.isSome(trailing)) {
    const entry = units.find((unit) => unit[1] === trailing.value.unit);
    if (entry !== undefined) {
      return Option.some(
        trailing.value.amount === 1
          ? `past ${entry[0]}`
          : `last ${trailing.value.amount} ${entry[2]}`,
      );
    }
  }

  const periods = [
    ...staticPeriods,
    ...currentYearDatePeriods(range, currentDateLabel),
    ...periodsFromPhrases(
      [...datedPeriods(range, months), ...datedQuarterPeriods(range)],
      parsePeriod,
    ),
  ];
  return renderPeriodRange(
    range,
    [
      ...units.map((entry) => candidate(periodToDateRange(entry[1]), `${entry[0]} to date`)),
      ...units.map((entry) => candidate(remainingPeriodRange(entry[1]), `rest of the ${entry[0]}`)),
    ],
    periods,
    (period) => `since ${period}`,
    (period) => `before ${period}`,
    (period) => `through ${period}`,
    (period) => `after ${period}`,
    (lower, upper) => `from ${lower} to ${upper}`,
    (period) => `from ${period} to now`,
    (period) => `from now to ${period}`,
    () => "until now",
    () => "from now",
  );
};

export const EnglishContribution = new BaseLanguageContribution({
  locale: "en",
  vocabulary: [
    ...months,
    ...quarterNames,
    "q1",
    "q2",
    "q3",
    "q4",
    ...monthAbbreviations.flatMap((aliases) => aliases),
    ...toDatePhrases.flatMap((entry) => entry.phrase.split(" ")),
    ...remainingPeriodPhrases.flatMap((entry) => entry.phrase.split(" ")),
    ...units.flatMap((entry) => [entry[0], entry[2]]),
    "after",
    "ago",
    "all",
    "one",
    "and",
    "beginning",
    "before",
    "calendar",
    "coming",
    "current",
    "date",
    "during",
    "end",
    "far",
    "for",
    "from",
    "in",
    "including",
    "last",
    "next",
    "now",
    "on",
    "over",
    "of",
    "past",
    "previous",
    "prior",
    "since",
    "so",
    "start",
    "starting",
    "this",
    "through",
    "till",
    "whole",
    "to",
    "until",
    "upcoming",
    "within",
    "today",
    "tomorrow",
    "weekend",
    "yesterday",
  ],
  normalize: normalizeNaturalText,
  correct: correctWhitespaceSeparatedText,
  parseExact: parseEnglish,
  suggest: suggestEnglish,
  render: renderEnglish,
});

export const EnglishLanguage = defineLanguagePlugin({
  id: "chronolizer/language-en",
  effect: (context) =>
    Effect.asVoid(context.register("chronolizer/language-en", EnglishContribution)),
});

export const EnglishLanguageLayer = languagePluginsLayer([EnglishLanguage]);
