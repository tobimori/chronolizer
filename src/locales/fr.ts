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
  absoluteDatePeriod,
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
  isoDate,
  joinedNowCandidate,
  joinedPeriodCandidate,
  monthOfRelativeYear,
  namedCurrentYearDatePeriod,
  namedDatePeriod,
  openBoundaryCandidate,
  parseTrailingCount,
  periodBoundaryCandidate,
  periodEndDay,
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
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

const monthAbbreviations = [
  ["jan", "janv"],
  ["fév", "févr", "fev", "fevr", "fevrier"],
  ["mar"],
  ["avr"],
  [],
  ["jun"],
  ["juil", "jul"],
  ["aout"],
  ["sep", "sept"],
  ["oct"],
  ["nov"],
  ["déc", "dec", "decembre"],
] as const;

interface UnitForms {
  readonly unit: Unit;
  readonly singular: string;
  readonly plural: string;
  readonly current: string;
  readonly previous: string;
  readonly next: string;
  readonly toDate: string;
  readonly remaining: string;
}

const units: ReadonlyArray<UnitForms> = [
  {
    unit: "day",
    singular: "jour",
    plural: "jours",
    current: "aujourd'hui",
    previous: "hier",
    next: "demain",
    toDate: "aujourd'hui jusqu'à maintenant",
    remaining: "reste de la journée",
  },
  {
    unit: "week",
    singular: "semaine",
    plural: "semaines",
    current: "cette semaine",
    previous: "la semaine dernière",
    next: "la semaine prochaine",
    toDate: "semaine à ce jour",
    remaining: "reste de la semaine",
  },
  {
    unit: "month",
    singular: "mois",
    plural: "mois",
    current: "ce mois-ci",
    previous: "le mois dernier",
    next: "le mois prochain",
    toDate: "mois à ce jour",
    remaining: "reste du mois",
  },
  {
    unit: "quarter",
    singular: "trimestre",
    plural: "trimestres",
    current: "ce trimestre",
    previous: "le trimestre dernier",
    next: "le trimestre prochain",
    toDate: "trimestre à ce jour",
    remaining: "reste du trimestre",
  },
  {
    unit: "year",
    singular: "an",
    plural: "ans",
    current: "cette année",
    previous: "l'année dernière",
    next: "l'année prochaine",
    toDate: "année à ce jour",
    remaining: "reste de l'année",
  },
];

const title = (value: string) => `${value.slice(0, 1).toLocaleUpperCase("fr")}${value.slice(1)}`;

const unitAliases = [
  ["jour", "day"],
  ["jours", "day"],
  ["semaine", "week"],
  ["semaines", "week"],
  ["mois", "month"],
  ["trimestre", "quarter"],
  ["trimestres", "quarter"],
  ["an", "year"],
  ["ans", "year"],
  ["année", "year"],
  ["annee", "year"],
  ["années", "year"],
  ["annees", "year"],
] as const satisfies ReadonlyArray<readonly [string, Unit]>;

const periodAliases = [
  ...units.flatMap((entry) => [
    [entry.current, entry.unit, 0, entry.current] as const,
    [entry.previous, entry.unit, -1, entry.previous] as const,
    [entry.next, entry.unit, 1, entry.next] as const,
  ]),
  ["semaine en cours", "week", 0, "cette semaine"],
  ["semaine dernière", "week", -1, "la semaine dernière"],
  ["semaine derniere", "week", -1, "la semaine dernière"],
  ["semaine suivante", "week", 1, "la semaine prochaine"],
  ["le mois en cours", "month", 0, "ce mois-ci"],
  ["ce mois", "month", 0, "ce mois-ci"],
  ["mois dernier", "month", -1, "le mois dernier"],
  ["mois prochain", "month", 1, "le mois prochain"],
  ["mois à venir", "month", 1, "le mois prochain"],
  ["l'année en cours", "year", 0, "cette année"],
  ["cette annee", "year", 0, "cette année"],
  ["année dernière", "year", -1, "l'année dernière"],
  ["annee derniere", "year", -1, "l'année dernière"],
  ["année passée", "year", -1, "l'année dernière"],
  ["année prochaine", "year", 1, "l'année prochaine"],
  ["annee prochaine", "year", 1, "l'année prochaine"],
  ["trimestre dernier", "quarter", -1, "le trimestre dernier"],
  ["trimestre prochain", "quarter", 1, "le trimestre prochain"],
  ["avant-hier", "day", -2, "avant-hier"],
  ["après-demain", "day", 2, "après-demain"],
  ["apres-demain", "day", 2, "après-demain"],
  ["l'avant-dernière semaine", "week", -2, "l'avant-dernière semaine"],
  ["la semaine après la prochaine", "week", 2, "la semaine après la prochaine"],
  ["le mois avant le dernier", "month", -2, "le mois avant le dernier"],
  ["le mois après le prochain", "month", 2, "le mois après le prochain"],
  ["le trimestre avant le dernier", "quarter", -2, "le trimestre avant le dernier"],
  ["le trimestre après le prochain", "quarter", 2, "le trimestre après le prochain"],
  ["l'année avant la dernière", "year", -2, "l'année avant la dernière"],
  ["l'année après la prochaine", "year", 2, "l'année après la prochaine"],
] as const satisfies ReadonlyArray<readonly [string, Unit, number, string]>;

const periodArticle = {
  day: "de la journée",
  week: "de la semaine",
  month: "du mois",
  quarter: "du trimestre",
  year: "de l'année",
} as const satisfies Record<Unit, string>;

const toDatePhrases = units.flatMap((entry) => {
  const yearAliases =
    entry.unit === "year" ? ["depuis le début d'année", "depuis le début de l'année en cours"] : [];
  return [
    entry.toDate,
    `depuis le début ${periodArticle[entry.unit]}`,
    `depuis le commencement ${periodArticle[entry.unit]}`,
    `${entry.current} jusqu'à maintenant`,
    ...yearAliases,
  ].map((phrase) => ({ entry, phrase }));
});

const remainingAliases = {
  day: ["reste d'aujourd'hui"],
  week: ["reste de cette semaine", "reste de la semaine en cours"],
  month: ["reste de ce mois", "reste de ce mois-ci"],
  quarter: ["reste de ce trimestre"],
  year: ["reste de cette année", "reste de l'année en cours"],
} as const satisfies Record<Unit, ReadonlyArray<string>>;

const remainingPhrases = units.flatMap((entry) =>
  [
    entry.remaining,
    `ce qui reste ${periodArticle[entry.unit]}`,
    ...remainingAliases[entry.unit],
  ].map((phrase) => ({ entry, phrase })),
);

const relativeYearDirection = (value: string) => {
  if (value.includes("derni") || value.includes("pass")) return -1;
  if (value.includes("prochain")) return 1;
  return 0;
};

const relativeYearName = (direction: number) => {
  if (direction < 0) return "l'année dernière";
  if (direction > 0) return "l'année prochaine";
  return "cette année";
};

const monthNumber = (value: string) => {
  const normalized = value.endsWith(".") ? value.slice(0, -1) : value;
  const full = months.findIndex((month) => month === normalized);
  if (full !== -1) return full + 1;
  const short = monthAbbreviations.findIndex((aliases) =>
    aliases.some((alias) => alias === normalized),
  );
  return short === -1 ? undefined : short + 1;
};

const dateLabel = (day: number, month: number, year: number) =>
  `${day === 1 ? "1er" : day} ${textAt(months, month - 1)} ${year}`;

const currentDateLabel = (day: number, month: number) =>
  `${day === 1 ? "1er" : day} ${textAt(months, month - 1)}`;

const parseNamedDate = (input: string) => {
  const named = EffectString.match(
    /^(?:le )?(1er|[0-3]?\d)(?: de)? ([a-zàâçéèêëîïôûùüÿœ]+\.?)(?: de)? (\d{4})$/u,
  )(input);
  if (Option.isSome(named)) {
    return namedDatePeriod(
      textAt(named.value, 3),
      textAt(named.value, 2),
      textAt(named.value, 1).replace(/er$/u, ""),
      monthNumber,
      dateLabel,
    );
  }
  const numeric = EffectString.match(/^([0-3]?\d)[./-]([01]?\d)[./-](\d{4})$/u)(input);
  if (Option.isSome(numeric)) {
    const year = validYear(textAt(numeric.value, 3));
    const month = Number(textAt(numeric.value, 2));
    const day = Number(textAt(numeric.value, 1));
    if (year !== undefined && month >= 1 && month <= 12) {
      const value = isoDate(year, month, day);
      if (isIsoDate(value) && value !== "9999-12-31") {
        return Option.some(fixedDatePeriod(value, dateLabel(day, month, year)));
      }
    }
  }

  const current = EffectString.match(
    /^(?:le )?(1er|[0-3]?\d)(?: de)? ([a-zàâçéèêëîïôûùüÿœ]+\.?)$/u,
  )(input);
  return Option.isSome(current)
    ? namedCurrentYearDatePeriod(
        textAt(current.value, 2),
        textAt(current.value, 1).replace(/er$/u, ""),
        monthNumber,
        currentDateLabel,
      )
    : Option.none<Period>();
};

const quarterNumber = (value: string) => {
  if ((value.startsWith("q") || value.startsWith("t")) && value.length === 2) {
    return Number(value.slice(1));
  }
  if (value === "1er" || value === "premier") return 1;
  if (value === "2e" || value === "2ème" || value === "deuxième" || value === "deuxieme") return 2;
  if (value === "3e" || value === "3ème" || value === "troisième" || value === "troisieme")
    return 3;
  return value === "4e" || value === "4ème" || value === "quatrième" || value === "quatrieme"
    ? 4
    : undefined;
};

const parseQuarter = (input: string) => {
  const fixed = EffectString.match(
    /^(t[1-4]|q[1-4]|1er|premier|2e|2ème|deuxième|deuxieme|3e|3ème|troisième|troisieme|4e|4ème|quatrième|quatrieme)(?: trimestre)?(?: de)? (\d{4})$/u,
  )(input);
  if (Option.isSome(fixed)) {
    const quarter = quarterNumber(textAt(fixed.value, 1));
    const year = validYear(textAt(fixed.value, 2));
    if (quarter !== undefined && year !== undefined) {
      return Option.some(fixedQuarterPeriod(year, quarter, `T${quarter} ${year}`));
    }
  }
  const relative = EffectString.match(
    /^(t[1-4]|q[1-4]) de (l'année dernière|l'annee derniere|l'année prochaine|l'annee prochaine|cette année|cette annee)$/u,
  )(input);
  if (Option.isSome(relative)) {
    const quarter = quarterNumber(textAt(relative.value, 1));
    const direction = relativeYearDirection(textAt(relative.value, 2));
    if (quarter !== undefined) {
      return Option.some(
        quarterOfRelativeYear(quarter, direction, `T${quarter} de ${relativeYearName(direction)}`),
      );
    }
  }
  const standalone = EffectString.match(/^(?:le )?(t[1-4]|q[1-4])$/u)(input);
  if (Option.isNone(standalone)) return Option.none<Period>();
  const quarter = quarterNumber(textAt(standalone.value, 1));
  return quarter === undefined
    ? Option.none<Period>()
    : Option.some(quarterOfRelativeYear(quarter, 0, `T${quarter}`));
};

const parseBasePeriod = (input: string) => {
  const absoluteDate = absoluteDatePeriod(input, "fr");
  if (Option.isSome(absoluteDate)) return absoluteDate;
  const namedDate = parseNamedDate(input);
  if (Option.isSome(namedDate)) return namedDate;
  const quarter = parseQuarter(input);
  if (Option.isSome(quarter)) return quarter;

  const yearMatch = EffectString.match(/^(?:(?:l')?année |annee )?(\d{4})$/u)(input);
  if (Option.isSome(yearMatch)) {
    const year = validYear(textAt(yearMatch.value, 1));
    if (year !== undefined) return Option.some(fixedYearPeriod(year, String(year)));
  }

  const monthYear = EffectString.match(/^([a-zàâçéèêëîïôûùüÿœ]+\.?)(?: de)? (\d{4})$/u)(input);
  if (Option.isSome(monthYear)) {
    const month = monthNumber(textAt(monthYear.value, 1));
    const year = validYear(textAt(monthYear.value, 2));
    if (month !== undefined && year !== undefined) {
      return Option.some(
        fixedMonthPeriod(year, month, `${title(textAt(months, month - 1))} ${year}`),
      );
    }
  }

  const relativeMonth = EffectString.match(
    /^([a-zàâçéèêëîïôûùüÿœ]+\.?) de (l'année dernière|l'annee derniere|l'année prochaine|l'annee prochaine|cette année|cette annee)$/u,
  )(input);
  if (Option.isSome(relativeMonth)) {
    const month = monthNumber(textAt(relativeMonth.value, 1));
    const yearText = textAt(relativeMonth.value, 2);
    const direction = relativeYearDirection(yearText);
    if (month !== undefined) {
      return Option.some(
        monthOfRelativeYear(
          month,
          direction,
          `${title(textAt(months, month - 1))} de ${relativeYearName(direction)}`,
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

  const alias = periodAliases.find((entry) => entry[0] === input);
  if (alias !== undefined) return Option.some(relativePeriod(alias[1], alias[2], alias[3]));

  if (["week-end", "le week-end", "ce week-end", "weekend", "ce weekend"].includes(input)) {
    return Option.some(relativeWeekend(0, "ce week-end"));
  }
  if (["le week-end dernier", "week-end dernier", "le weekend dernier"].includes(input)) {
    return Option.some(relativeWeekend(-1, "le week-end dernier"));
  }
  if (["le week-end prochain", "week-end prochain", "le weekend prochain"].includes(input)) {
    return Option.some(relativeWeekend(1, "le week-end prochain"));
  }
  if (input === "l'avant-dernier week-end") {
    return Option.some(relativeWeekend(-2, input));
  }
  if (input === "le week-end après le prochain") {
    return Option.some(relativeWeekend(2, input));
  }
  return Option.none<Period>();
};

const parsePeriod = (input: string) => {
  const edge = EffectString.match(
    /^(?:le |la |l')?(début|debut|commencement|fin)(?: du | de la | de l'| de )(.+)$/u,
  )(input);
  if (Option.isSome(edge)) {
    const edgeName = textAt(edge.value, 1);
    const period = parseBasePeriod(textAt(edge.value, 2));
    if (Option.isSome(period)) {
      const isEnd = edgeName === "fin";
      const canonical = `${isEnd ? "fin" : "début"} de ${period.value.canonical}`;
      return Option.some(
        isEnd ? periodEndDay(period.value, canonical) : periodStartDay(period.value, canonical),
      );
    }
  }
  const wrapper = ["pendant ", "en ", "tout ", "tout le ", "toute la "].find((prefix) =>
    input.startsWith(prefix),
  );
  return parseBasePeriod(wrapper === undefined ? input : input.slice(wrapper.length));
};

const countedUnit = (value: string) => unitAliases.find((entry) => entry[0] === value)?.[1];

const countedUnitPattern =
  "jour|jours|semaine|semaines|mois|trimestre|trimestres|an|ans|année|annee|années|annees";

const compileCountedPattern = (source: string) =>
  new RegExp(source.replace("UNIT", countedUnitPattern), "u");

const calendarPastPattern = compileCountedPattern("^il y a ([1-9]\\d*) (UNIT)$");
const calendarFuturePattern = compileCountedPattern("^dans ([1-9]\\d*) (UNIT)$");
const rollingSincePattern = compileCountedPattern("^depuis ([1-9]\\d*) (UNIT)$");
const rollingBarePattern = compileCountedPattern("^([1-9]\\d*) (UNIT)$");
const rollingPastPatterns = [
  compileCountedPattern(
    "^(?:(?:les|la) )?(?:derniers|dernières|dernieres|passés|passées|passes|précédents|précédentes|precedents|precedentes) ([1-9]\\d*) (UNIT)$",
  ),
  compileCountedPattern(
    "^(?:(?:les|la) )?([1-9]\\d*) (?:derniers|dernières|dernieres|passés|passées|passes|précédents|précédentes|precedents|precedentes) (UNIT)$",
  ),
  compileCountedPattern(
    "^([1-9]\\d*) (UNIT) (?:derniers|dernières|dernieres|passés|passées|passes|précédents|précédentes|precedents|precedentes)$",
  ),
];
const rollingFuturePatterns = [
  compileCountedPattern(
    "^(?:(?:les|la) )?(?:prochains|prochaines|suivants|suivantes) ([1-9]\\d*) (UNIT)$",
  ),
  compileCountedPattern(
    "^(?:(?:les|la) )?([1-9]\\d*) (?:prochains|prochaines|suivants|suivantes) (UNIT)$",
  ),
  compileCountedPattern("^([1-9]\\d*) (UNIT) (?:prochains|prochaines|suivants|suivantes|à venir)$"),
];

const firstPatternMatch = (input: string, patterns: ReadonlyArray<RegExp>) =>
  Option.firstSomeOf(patterns.map((pattern) => EffectString.match(pattern)(input)));

const isFeminineUnit = (unit: Unit) => unit === "week";

const relativeCountPhrase = (amount: number, entry: UnitForms, future: boolean) => {
  const noun = amount === 1 ? entry.singular : entry.plural;
  let modifier = future ? "prochains" : "derniers";
  if (isFeminineUnit(entry.unit)) modifier = future ? "prochaines" : "dernières";
  return `les ${amount} ${modifier} ${noun}`;
};

const parseCalendarOffset = (input: string) => {
  const past = EffectString.match(calendarPastPattern)(input);
  const future = EffectString.match(calendarFuturePattern)(input);
  const match = Option.firstSomeOf([past, future]);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const amount = parseTrailingCount(textAt(match.value, 1));
  const unit = countedUnit(textAt(match.value, 2));
  if (Option.isNone(amount) || unit === undefined) {
    return Option.none<ReturnType<typeof candidate>>();
  }
  const entry = units.find((item) => item.unit === unit);
  if (entry === undefined) return Option.none<ReturnType<typeof candidate>>();
  const direction = Option.isSome(past) ? -amount.value : amount.value;
  const noun = amount.value === 1 ? entry.singular : entry.plural;
  const canonical =
    direction < 0 ? `il y a ${amount.value} ${noun}` : `dans ${amount.value} ${noun}`;
  return Option.some(candidate(periodRange(relativePeriod(unit, direction, canonical)), canonical));
};

const parseRollingPeriod = (input: string) => {
  const since = EffectString.match(rollingSincePattern)(input);
  const past = firstPatternMatch(input, rollingPastPatterns);
  const bare = EffectString.match(rollingBarePattern)(input);
  const future = firstPatternMatch(input, rollingFuturePatterns);
  const match = Option.firstSomeOf([since, past, bare, future]);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const amount = parseTrailingCount(textAt(match.value, 1));
  const unit = countedUnit(textAt(match.value, 2));
  if (Option.isNone(amount) || unit === undefined) {
    return Option.none<ReturnType<typeof candidate>>();
  }
  const entry = units.find((item) => item.unit === unit);
  if (entry === undefined) return Option.none<ReturnType<typeof candidate>>();
  const isFuture = Option.isSome(future);
  const range = isFuture ? futureRange(amount.value, unit) : trailingRange(amount.value, unit);
  return Option.some(candidate(range, relativeCountPhrase(amount.value, entry, isFuture)));
};

const boundaryCandidate = (input: string) => {
  const included = EffectString.match(/^jusqu'à (.+) (?:inclus|incluse|inclusivement)$/u)(input);
  if (Option.isSome(included)) {
    const period = parsePeriod(textAt(included.value, 1));
    if (Option.isSome(period)) {
      return Option.some(
        periodBoundaryCandidate(period.value, "through", `jusqu'à ${period.value.canonical}`),
      );
    }
  }
  return openBoundaryCandidate(
    input,
    [
      ["jusqu'avant ", "before"],
      ["jusqu'au début de ", "before"],
      ["jusqu'à et y compris ", "through"],
      ["à partir de ", "since"],
      ["depuis ", "since"],
      ["avant ", "before"],
      ["jusqu'à ", "through"],
      ["jusqu'au ", "through"],
      ["jusqu'en ", "through"],
      ["après ", "after"],
      ["apres ", "after"],
    ],
    parsePeriod,
  );
};

const parseFrench = (input: string) => {
  const remaining = remainingPhrases.find((entry) => entry.phrase === input);
  if (remaining !== undefined) {
    return Option.some(
      candidate(remainingPeriodRange(remaining.entry.unit), remaining.entry.remaining),
    );
  }
  if (["jusqu'à aujourd'hui", "jusqu'à maintenant", "à ce jour"].includes(input)) {
    return Option.some(candidate(untilNowRange(), "jusqu'à maintenant"));
  }
  if (["depuis maintenant", "à partir de maintenant", "désormais"].includes(input)) {
    return Option.some(candidate(fromNowRange(), "depuis maintenant"));
  }
  const offset = parseCalendarOffset(input);
  if (Option.isSome(offset)) return offset;
  const rolling = parseRollingPeriod(input);
  if (Option.isSome(rolling)) return rolling;
  const toDate = toDatePhrases.find((entry) => entry.phrase === input);
  if (toDate !== undefined) {
    return Option.some(candidate(periodToDateRange(toDate.entry.unit), toDate.entry.toDate));
  }

  const nowBounded = joinedNowCandidate(
    input,
    [
      ["depuis ", " jusqu'à maintenant"],
      ["depuis ", " jusqu'à aujourd'hui"],
      ["entre ", " et aujourd'hui"],
    ],
    ["d'aujourd'hui à ", "de maintenant à ", "entre aujourd'hui et "],
    parsePeriod,
    (period) => `depuis ${period} jusqu'à maintenant`,
    (period) => `de maintenant à ${period}`,
  );
  if (Option.isSome(nowBounded)) return nowBounded;

  const bounded = joinedPeriodCandidate(
    input,
    [
      ["depuis ", " jusqu'à "],
      ["du ", " au "],
      ["de ", " à "],
      ["entre ", " et "],
      ["", " - "],
      ["", " – "],
      ["", " — "],
      ["", " jusqu'à "],
      ["", " au "],
    ],
    parsePeriod,
    (lower, upper) => `du ${lower} au ${upper}`,
  );
  if (Option.isSome(bounded)) return bounded;
  const boundary = boundaryCandidate(input);
  if (Option.isSome(boundary)) return boundary;
  return Option.map(parsePeriod(input), (period) =>
    candidate(periodRange(period), period.canonical),
  );
};

const staticPeriodPhrases = [
  ...periodAliases.map((entry) => entry[0]),
  "ce week-end",
  "le week-end dernier",
  "le week-end prochain",
  "l'avant-dernier week-end",
  "le week-end après le prochain",
  ...periodAliases.flatMap((entry) => [`début de ${entry[0]}`, `fin de ${entry[0]}`]),
  ...[1, 2, 3, 4].flatMap((quarter) => [
    `t${quarter}`,
    `t${quarter} de cette année`,
    `t${quarter} de l'année dernière`,
    `t${quarter} de l'année prochaine`,
  ]),
  ...months.flatMap((month) => [
    month,
    `${month} de l'année dernière`,
    `${month} de l'année prochaine`,
  ]),
];

const staticPeriods = periodsFromPhrases(staticPeriodPhrases, parsePeriod);
const boundaryPrefixes = ["depuis ", "avant ", "jusqu'à ", "après "];

const countedSuggestions = (input: string) => {
  const amount = naturalCount(input);
  if (amount === undefined) return [];
  return units.flatMap((entry) => {
    const noun = amount === 1 ? entry.singular : entry.plural;
    const past = isFeminineUnit(entry.unit) ? "dernières" : "derniers";
    const future = isFeminineUnit(entry.unit) ? "prochaines" : "prochains";
    return [
      relativeCountPhrase(amount, entry, false),
      `${amount} ${past} ${noun}`,
      `${amount} ${noun}`,
      relativeCountPhrase(amount, entry, true),
      `${amount} ${future} ${noun}`,
      `${amount} ${noun} à venir`,
      `il y a ${amount} ${noun}`,
      `dans ${amount} ${noun}`,
    ];
  });
};

const frenchSuggestionPhrases = [
  ...units.map((entry) => entry.toDate),
  ...units.map((entry) => entry.remaining),
  ...staticPeriodPhrases,
  ...prefixNaturalPhrases(staticPeriodPhrases, boundaryPrefixes),
  "jusqu'à maintenant",
  "depuis maintenant",
];

const suggestFrench = (input: string, limit: number) => {
  const fixed = fixedCalendarPeriodPhrases(input, months);
  return completeNaturalPhrases(
    input,
    [
      ...frenchSuggestionPhrases,
      ...fixed,
      ...prefixNaturalPhrases(fixed, boundaryPrefixes),
      ...countedSuggestions(input),
    ],
    limit,
  );
};

const renderFrench = (range: DateRangeExpr) => {
  const offset = calendarPeriodOffset(range);
  if (Option.isSome(offset) && Math.abs(offset.value.amount) > 1) {
    const entry = units.find((unit) => unit.unit === offset.value.unit);
    if (entry !== undefined) {
      const amount = Math.abs(offset.value.amount);
      const noun = amount === 1 ? entry.singular : entry.plural;
      return Option.some(
        offset.value.amount < 0 ? `il y a ${amount} ${noun}` : `dans ${amount} ${noun}`,
      );
    }
  }
  const future = futurePeriod(range);
  if (Option.isSome(future)) {
    const entry = units.find((unit) => unit.unit === future.value.unit);
    if (entry !== undefined) {
      const noun = future.value.amount === 1 ? entry.singular : entry.plural;
      return Option.some(`${future.value.amount} ${noun} à venir`);
    }
  }
  const trailing = trailingPeriod(range);
  if (Option.isSome(trailing)) {
    const entry = units.find((unit) => unit.unit === trailing.value.unit);
    if (entry !== undefined) {
      return Option.some(relativeCountPhrase(trailing.value.amount, entry, false));
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
      ...units.map((entry) => candidate(periodToDateRange(entry.unit), entry.toDate)),
      ...units.map((entry) => candidate(remainingPeriodRange(entry.unit), entry.remaining)),
    ],
    periods,
    (period) => `depuis ${period}`,
    (period) => `avant ${period}`,
    (period) => `jusqu'à ${period}`,
    (period) => `après ${period}`,
    (lower, upper) => `du ${lower} au ${upper}`,
    (period) => `depuis ${period} jusqu'à maintenant`,
    (period) => `de maintenant à ${period}`,
    () => "jusqu'à maintenant",
    () => "depuis maintenant",
  );
};

const normalizeFrench = (input: string, locale: string) =>
  normalizeNaturalText(input, locale).replaceAll("’", "'");

export const FrenchContribution = new BaseLanguageContribution({
  locale: "fr",
  vocabulary: [
    ...months,
    ...monthAbbreviations.flatMap((aliases) => aliases),
    ...units.flatMap((entry) => [
      entry.singular,
      entry.plural,
      ...entry.current.split(" "),
      ...entry.previous.split(" "),
      ...entry.next.split(" "),
    ]),
    ...toDatePhrases.flatMap((entry) => entry.phrase.split(" ")),
    ...remainingPhrases.flatMap((entry) => entry.phrase.split(" ")),
    "année",
    "annee",
    "après",
    "avant",
    "commencement",
    "dans",
    "depuis",
    "dernier",
    "début",
    "entre",
    "fin",
    "inclus",
    "maintenant",
    "passé",
    "précédent",
    "prochain",
    "reste",
    "jusqu'à",
  ],
  normalize: normalizeFrench,
  correct: correctWhitespaceSeparatedText,
  parseExact: parseFrench,
  suggest: suggestFrench,
  render: renderFrench,
});

export const FrenchLanguage = defineLanguagePlugin({
  id: "chronolizer/language-fr",
  effect: (context) =>
    Effect.asVoid(context.register("chronolizer/language-fr", FrenchContribution)),
});

export const FrenchLanguageLayer = languagePluginsLayer([FrenchLanguage]);
