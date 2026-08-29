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

const monthAbbreviations = [
  ["jan"],
  ["feb"],
  ["mär", "mrz"],
  ["apr"],
  ["mai"],
  ["jun"],
  ["jul"],
  ["aug"],
  ["sep", "sept"],
  ["okt"],
  ["nov"],
  ["dez"],
] as const;

interface UnitPhrases {
  readonly unit: Unit;
  readonly noun: string;
  readonly plural: string;
  readonly current: string;
  readonly previous: string;
  readonly next: string;
  readonly compound: string;
  readonly currentGenitive: string;
  readonly previousGenitive: string;
  readonly nextGenitive: string;
  readonly indefiniteDative: string;
  readonly indefiniteGenitive: string;
  readonly dative: string;
  readonly genitive: string;
}

const unitPhrases: ReadonlyArray<UnitPhrases> = [
  {
    unit: "day",
    noun: "tag",
    plural: "tage",
    current: "heute",
    previous: "gestern",
    next: "morgen",
    compound: "tages",
    currentGenitive: "dieses tages",
    previousGenitive: "letzten tages",
    nextGenitive: "nächsten tages",
    indefiniteDative: "einem tag",
    indefiniteGenitive: "eines tages",
    dative: "tagen",
    genitive: "des tages",
  },
  {
    unit: "week",
    noun: "woche",
    plural: "wochen",
    current: "diese woche",
    previous: "letzte woche",
    next: "nächste woche",
    compound: "wochen",
    currentGenitive: "dieser woche",
    previousGenitive: "letzter woche",
    nextGenitive: "nächster woche",
    indefiniteDative: "einer woche",
    indefiniteGenitive: "einer woche",
    dative: "wochen",
    genitive: "der woche",
  },
  {
    unit: "month",
    noun: "monat",
    plural: "monate",
    current: "dieser monat",
    previous: "letzter monat",
    next: "nächster monat",
    compound: "monats",
    currentGenitive: "dieses monats",
    previousGenitive: "letzten monats",
    nextGenitive: "nächsten monats",
    indefiniteDative: "einem monat",
    indefiniteGenitive: "eines monats",
    dative: "monaten",
    genitive: "des monats",
  },
  {
    unit: "quarter",
    noun: "quartal",
    plural: "quartale",
    current: "dieses quartal",
    previous: "letztes quartal",
    next: "nächstes quartal",
    compound: "quartals",
    currentGenitive: "dieses quartals",
    previousGenitive: "letzten quartals",
    nextGenitive: "nächsten quartals",
    indefiniteDative: "einem quartal",
    indefiniteGenitive: "eines quartals",
    dative: "quartalen",
    genitive: "des quartals",
  },
  {
    unit: "year",
    noun: "jahr",
    plural: "jahre",
    current: "dieses jahr",
    previous: "letztes jahr",
    next: "nächstes jahr",
    compound: "jahres",
    currentGenitive: "dieses jahres",
    previousGenitive: "letzten jahres",
    nextGenitive: "nächsten jahres",
    indefiniteDative: "einem jahr",
    indefiniteGenitive: "eines jahres",
    dative: "jahren",
    genitive: "des jahres",
  },
];

const title = (value: string) => `${value.slice(0, 1).toLocaleUpperCase("de")}${value.slice(1)}`;

const canonicalToDate = (entry: UnitPhrases) => `seit ${title(entry.compound)}beginn`;

const canonicalRelative = (value: string) => {
  const separator = value.lastIndexOf(" ");
  if (separator === -1) return value;
  return `${value.slice(0, separator + 1)}${title(value.slice(separator + 1))}`;
};

const remainingPeriodPhrases = unitPhrases.flatMap((entry) =>
  [`rest ${entry.genitive}`, `rest ${entry.currentGenitive}`].map((phrase) => ({ entry, phrase })),
);

const toDatePhrases = unitPhrases.flatMap((entry) =>
  [
    `seit ${entry.compound}beginn`,
    `seit ${entry.compound}anfang`,
    `seit beginn ${entry.genitive}`,
    `seit anfang ${entry.genitive}`,
    `seit beginn ${entry.currentGenitive}`,
    `seit anfang ${entry.currentGenitive}`,
    `vom ${entry.compound}beginn bis heute`,
    `vom ${entry.compound}anfang bis heute`,
    `vom beginn ${entry.genitive} bis heute`,
    `vom anfang ${entry.genitive} bis heute`,
    `vom beginn ${entry.currentGenitive} bis heute`,
    `vom anfang ${entry.currentGenitive} bis heute`,
    `${entry.noun} bis heute`,
    `${entry.current} bisher`,
    `bisher ${entry.current}`,
  ].map((phrase) => ({ entry, phrase })),
);

const currentBoundaryPhrases = unitPhrases.flatMap((entry) =>
  (
    [
      [`vor ${entry.compound}beginn`, "before"],
      [`vor ${entry.compound}anfang`, "before"],
      [`bis ${entry.compound}beginn`, "before"],
      [`bis ${entry.compound}anfang`, "before"],
      [`bis ${entry.compound}ende`, "through"],
      [`nach ${entry.compound}ende`, "after"],
      [`ab ${entry.compound}ende`, "after"],
    ] as const
  ).map(([phrase, boundary]) => ({ boundary, entry, phrase })),
);

const declinedBoundaryPeriods = [
  ["diese woche", "week", 0, "dieser woche", "diese woche"],
  ["letzte woche", "week", -1, "letzter woche", "letzte woche"],
  ["nächste woche", "week", 1, "nächster woche", "nächste woche"],
  ["dieser monat", "month", 0, "diesem monat", "diesen monat"],
  ["letzter monat", "month", -1, "letztem monat", "letzten monat"],
  ["nächster monat", "month", 1, "nächstem monat", "nächsten monat"],
  ["dieses quartal", "quarter", 0, "diesem quartal", "dieses quartal"],
  ["letztes quartal", "quarter", -1, "letztem quartal", "letztes quartal"],
  ["nächstes quartal", "quarter", 1, "nächstem quartal", "nächstes quartal"],
  ["dieses jahr", "year", 0, "diesem jahr", "dieses jahr"],
  ["letztes jahr", "year", -1, "letztem jahr", "letztes jahr"],
  ["nächstes jahr", "year", 1, "nächstem jahr", "nächstes jahr"],
] as const satisfies ReadonlyArray<readonly [string, Unit, number, string, string]>;

const relativeAliases = [
  ...unitPhrases.flatMap((entry) => [
    [entry.currentGenitive, entry.unit, 0, entry.current] as const,
    [entry.previousGenitive, entry.unit, -1, entry.previous] as const,
    [entry.nextGenitive, entry.unit, 1, entry.next] as const,
  ]),
  ...declinedBoundaryPeriods.map(
    ([canonical, unit, direction, dative]) => [dative, unit, direction, canonical] as const,
  ),
  ["vorgestern", "day", -2, "vorgestern"],
  ["vorletzten tag", "day", -2, "vorletzter tag"],
  ["übernächsten tag", "day", 2, "übernächster tag"],
  ["vorletzte woche", "week", -2, "vorletzte woche"],
  ["übernächste woche", "week", 2, "übernächste woche"],
  ["vorletzten monat", "month", -2, "vorletzter monat"],
  ["übernächsten monat", "month", 2, "übernächster monat"],
  ["vorletztes quartal", "quarter", -2, "vorletztes quartal"],
  ["übernächstes quartal", "quarter", 2, "übernächstes quartal"],
  ["vorletztes jahr", "year", -2, "vorletztes jahr"],
  ["übernächstes jahr", "year", 2, "übernächstes jahr"],
  ["letzten tag", "day", -1, "gestern"],
  ["vergangenen tag", "day", -1, "gestern"],
  ["vorherigen tag", "day", -1, "gestern"],
  ["diesen tag", "day", 0, "heute"],
  ["heutigen tag", "day", 0, "heute"],
  ["nächsten tag", "day", 1, "morgen"],
  ["kommenden tag", "day", 1, "morgen"],
  ["vergangene woche", "week", -1, "letzte woche"],
  ["vorherige woche", "week", -1, "letzte woche"],
  ["aktuelle woche", "week", 0, "diese woche"],
  ["laufende woche", "week", 0, "diese woche"],
  ["kommende woche", "week", 1, "nächste woche"],
  ["folgende woche", "week", 1, "nächste woche"],
  ["letzten monat", "month", -1, "letzter monat"],
  ["vergangenen monat", "month", -1, "letzter monat"],
  ["vorherigen monat", "month", -1, "letzter monat"],
  ["diesen monat", "month", 0, "dieser monat"],
  ["aktuellen monat", "month", 0, "dieser monat"],
  ["laufenden monat", "month", 0, "dieser monat"],
  ["nächsten monat", "month", 1, "nächster monat"],
  ["kommenden monat", "month", 1, "nächster monat"],
  ["folgenden monat", "month", 1, "nächster monat"],
  ["vergangenes quartal", "quarter", -1, "letztes quartal"],
  ["vorheriges quartal", "quarter", -1, "letztes quartal"],
  ["aktuelles quartal", "quarter", 0, "dieses quartal"],
  ["laufendes quartal", "quarter", 0, "dieses quartal"],
  ["kommendes quartal", "quarter", 1, "nächstes quartal"],
  ["folgendes quartal", "quarter", 1, "nächstes quartal"],
  ["vergangenes jahr", "year", -1, "letztes jahr"],
  ["vorheriges jahr", "year", -1, "letztes jahr"],
  ["aktuelles jahr", "year", 0, "dieses jahr"],
  ["laufendes jahr", "year", 0, "dieses jahr"],
  ["kommendes jahr", "year", 1, "nächstes jahr"],
  ["folgendes jahr", "year", 1, "nächstes jahr"],
] as const satisfies ReadonlyArray<readonly [string, Unit, number, string]>;

const monthNumber = (value: string) => {
  const normalized = value.endsWith(".") ? value.slice(0, -1) : value;
  const fullIndex = months.findIndex((month) => month === normalized);
  if (fullIndex !== -1) return fullIndex + 1;
  const shortIndex = monthAbbreviations.findIndex((aliases) =>
    aliases.some((alias) => alias === normalized),
  );
  return shortIndex === -1 ? undefined : shortIndex + 1;
};

const currentDateLabel = (day: number, month: number) =>
  `${day}. ${title(textAt(months, month - 1))}`;

const withRelativeCase = (canonical: string, grammaticalCase: "dative" | "accusative") => {
  const period = declinedBoundaryPeriods.find((entry) => canonical === canonicalRelative(entry[0]));
  if (period === undefined) return canonical;
  return canonicalRelative(period[grammaticalCase === "dative" ? 3 : 4]);
};

const withRelativeGenitive = (canonical: string) => {
  for (const entry of unitPhrases) {
    if (canonical === canonicalRelative(entry.current))
      return canonicalRelative(entry.currentGenitive);
    if (canonical === canonicalRelative(entry.previous)) {
      return canonicalRelative(entry.previousGenitive);
    }
    if (canonical === canonicalRelative(entry.next)) return canonicalRelative(entry.nextGenitive);
  }
  return canonical;
};

const parseNamedDate = (input: string) => {
  const named = EffectString.match(/^([0-3]?\d)\.? ([a-zäöüß]+\.?) (\d{4})$/u)(input);
  if (Option.isSome(named)) {
    return namedDatePeriod(
      textAt(named.value, 3),
      textAt(named.value, 2),
      textAt(named.value, 1),
      monthNumber,
      (day, month, year) => `${day}. ${title(textAt(months, month - 1))} ${year}`,
    );
  }
  const numeric = EffectString.match(/^([0-3]?\d)\.([01]?\d)\.(\d{4})$/u)(input);
  if (Option.isSome(numeric)) {
    const year = validYear(textAt(numeric.value, 3));
    const day = Number(textAt(numeric.value, 1));
    const month = Number(textAt(numeric.value, 2));
    if (year !== undefined && month >= 1 && month <= 12) {
      const value = isoDate(year, month, day);
      if (isIsoDate(value) && value !== "9999-12-31") {
        return Option.some(
          fixedDatePeriod(value, `${day}. ${title(textAt(months, month - 1))} ${year}`),
        );
      }
    }
  }

  const current = EffectString.match(/^([0-3]?\d)\.? ([a-zäöüß]+\.?)$/u)(input);
  return Option.isSome(current)
    ? namedCurrentYearDatePeriod(
        textAt(current.value, 2),
        textAt(current.value, 1),
        monthNumber,
        currentDateLabel,
      )
    : Option.none<Period>();
};

const quarterNames = ["erstes", "zweites", "drittes", "viertes"] as const;

const quarterNumber = (value: string) => {
  if (value.startsWith("q")) return Number(value.slice(1));
  if (value.endsWith(".")) return Number(value.slice(0, -1));
  const index = quarterNames.findIndex((name) => name === value);
  return index === -1 ? undefined : index + 1;
};

const relativeDirection = (value: string) => {
  if (value === "letzten") return -1;
  if (value === "nächsten") return 1;
  return 0;
};

const parseQuarter = (input: string) => {
  const fixed = EffectString.match(
    /^(q[1-4]|[1-4]\.|erstes|zweites|drittes|viertes)(?: quartal)? (\d{4})$/u,
  )(input);
  const reversed = EffectString.match(/^(\d{4}) (q[1-4])$/u)(input);
  const relative = EffectString.match(
    /^(q[1-4]|[1-4]\.|erstes|zweites|drittes|viertes)(?: quartal)? (letzten|dieses|nächsten) jahres$/u,
  )(input);
  const standalone = EffectString.match(
    /^(q[1-4]|[1-4]\.|erstes|zweites|drittes|viertes)(?: quartal)?$/u,
  )(input);

  const fixedMatch = Option.firstSomeOf([fixed, reversed]);
  if (Option.isSome(fixedMatch)) {
    const quarterText = textAt(fixedMatch.value, Option.isSome(reversed) ? 2 : 1);
    const yearText = textAt(fixedMatch.value, Option.isSome(reversed) ? 1 : 2);
    const quarter = quarterNumber(quarterText);
    const year = validYear(yearText);
    if (quarter !== undefined && year !== undefined) {
      return Option.some(fixedQuarterPeriod(year, quarter, `Q${quarter} ${year}`));
    }
  }

  if (Option.isSome(relative)) {
    const directionText = textAt(relative.value, 2);
    const quarter = quarterNumber(textAt(relative.value, 1));
    if (quarter !== undefined) {
      const direction = relativeDirection(directionText);
      return Option.some(
        quarterOfRelativeYear(quarter, direction, `Q${quarter} ${directionText} Jahres`),
      );
    }
  }

  if (Option.isNone(standalone)) return Option.none<Period>();
  const quarter = quarterNumber(textAt(standalone.value, 1));
  return quarter === undefined
    ? Option.none<Period>()
    : Option.some(quarterOfRelativeYear(quarter, 0, `Q${quarter}`));
};

const parseBasePeriod = (input: string) => {
  if (isIsoDate(input) && input !== "9999-12-31") {
    return Option.some(fixedDatePeriod(input, input));
  }

  const namedDate = parseNamedDate(input);
  if (Option.isSome(namedDate)) return namedDate;

  const quarter = parseQuarter(input);
  if (Option.isSome(quarter)) return quarter;

  const yearMatch = EffectString.match(/^(?:(?:das )?(?:kalender)?jahr )?(\d{4})$/u)(input);
  if (Option.isSome(yearMatch)) {
    const year = validYear(textAt(yearMatch.value, 1));
    if (year !== undefined) return Option.some(fixedYearPeriod(year, String(year)));
  }

  const monthYear = EffectString.match(/^([a-zäöüß]+\.?) (\d{4})$/u)(input);
  if (Option.isSome(monthYear)) {
    const month = monthNumber(textAt(monthYear.value, 1));
    const year = validYear(textAt(monthYear.value, 2));
    if (month !== undefined && year !== undefined) {
      return Option.some(
        fixedMonthPeriod(year, month, `${title(textAt(months, month - 1))} ${year}`),
      );
    }
  }

  const relativeMonth = EffectString.match(/^([a-zäöüß]+\.?) (letzten|dieses|nächsten) jahres$/u)(
    input,
  );
  if (Option.isSome(relativeMonth)) {
    const directionText = textAt(relativeMonth.value, 2);
    const month = monthNumber(textAt(relativeMonth.value, 1));
    const direction = relativeDirection(directionText);
    if (month !== undefined) {
      return Option.some(
        monthOfRelativeYear(
          month,
          direction,
          `${title(textAt(months, month - 1))} ${directionText} Jahres`,
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

  if (input === "wochenende" || input === "dieses wochenende" || input === "am wochenende") {
    return Option.some(relativeWeekend(0, "dieses Wochenende"));
  }
  if (input === "letztes wochenende" || input === "vergangenes wochenende") {
    return Option.some(relativeWeekend(-1, "letztes Wochenende"));
  }
  if (input === "nächstes wochenende" || input === "kommendes wochenende") {
    return Option.some(relativeWeekend(1, "nächstes Wochenende"));
  }
  if (input === "vorletztes wochenende") {
    return Option.some(relativeWeekend(-2, "vorletztes Wochenende"));
  }
  if (input === "übernächstes wochenende") {
    return Option.some(relativeWeekend(2, "übernächstes Wochenende"));
  }

  const relative = unitPhrases.find(
    (entry) => entry.current === input || entry.previous === input || entry.next === input,
  );
  if (relative !== undefined) {
    let direction = 0;
    if (input === relative.previous) direction = -1;
    if (input === relative.next) direction = 1;
    return Option.some(relativePeriod(relative.unit, direction, canonicalRelative(input)));
  }

  const alias = relativeAliases.find((entry) => entry[0] === input);
  if (alias !== undefined) {
    return Option.some(relativePeriod(alias[1], alias[2], canonicalRelative(alias[3])));
  }

  return Option.none<Period>();
};

const parsePeriod = (input: string) => {
  const edge = EffectString.match(/^(anfang|beginn|ende) (.+)$/u)(input);
  if (Option.isSome(edge)) {
    const edgeName = textAt(edge.value, 1);
    const period = parseBasePeriod(textAt(edge.value, 2));
    if (Option.isSome(period)) {
      const name = edgeName === "ende" ? "Ende" : "Anfang";
      const canonical = `${name} ${withRelativeGenitive(period.value.canonical)}`;
      return Option.some(
        edgeName === "ende"
          ? periodEndDay(period.value, canonical)
          : periodStartDay(period.value, canonical),
      );
    }
  }
  const wrapper = ["im ", "am ", "für ", "während "].find((prefix) => input.startsWith(prefix));
  return parseBasePeriod(wrapper === undefined ? input : input.slice(wrapper.length));
};

const currentBoundaryCandidate = (input: string) => {
  const match = currentBoundaryPhrases.find((entry) => entry.phrase === input);
  if (match === undefined) return Option.none<ReturnType<typeof candidate>>();
  const period = relativePeriod(match.entry.unit, 0, match.entry.current);
  return Option.some(
    periodBoundaryCandidate(period, match.boundary, canonicalRelative(match.phrase)),
  );
};

const boundaryCandidate = (input: string) =>
  Option.map(
    openBoundaryCandidate(
      input,
      [
        ["seit dem beginn von ", "since"],
        ["seit dem anfang von ", "since"],
        ["seit dem jahr ", "since"],
        ["ab dem jahr ", "since"],
        ["bis zum beginn von ", "before"],
        ["bis zum anfang von ", "before"],
        ["bis zum jahr ", "before"],
        ["bis zum ende von ", "through"],
        ["nach dem ende von ", "after"],
        ["bis einschließlich ", "through"],
        ["seit beginn ", "since"],
        ["seit anfang ", "since"],
        ["ab beginn ", "since"],
        ["ab anfang ", "since"],
        ["vor beginn ", "before"],
        ["vor anfang ", "before"],
        ["bis beginn ", "before"],
        ["bis anfang ", "before"],
        ["bis ende ", "through"],
        ["nach ende ", "after"],
        ["ab ende ", "after"],
        ["seit ", "since"],
        ["vor ", "before"],
        ["nach ", "after"],
        ["bis ", "before"],
        ["ab ", "since"],
      ],
      parsePeriod,
    ),
    (result) => candidate(result.range, canonicalRelative(input)),
  );

const countedUnit = (value: string, amount: number, dative = false) =>
  unitPhrases.find((entry) => {
    if (amount === 1) return value === entry.noun;
    return value === (dative ? entry.dative : entry.plural);
  });

const parseCalendarOffset = (input: string) => {
  const singular = EffectString.match(
    /^(vor|in) (einem tag|einer woche|einem monat|einem quartal|einem jahr)$/u,
  )(input);
  if (Option.isSome(singular)) {
    const entry = unitPhrases.find((unit) => unit.indefiniteDative === textAt(singular.value, 2));
    if (entry !== undefined) {
      const isPast = textAt(singular.value, 1) === "vor";
      const direction = isPast ? -1 : 1;
      const canonical = `${isPast ? "vor" : "in"} ${canonicalRelative(entry.indefiniteDative)}`;
      return Option.some(
        candidate(periodRange(relativePeriod(entry.unit, direction, canonical)), canonical),
      );
    }
  }

  const prefixed = EffectString.match(
    /^(vor|in) ([1-9]\d*) (tag|tagen|woche|wochen|monat|monaten|quartal|quartalen|jahr|jahren)$/u,
  )(input);
  const prior = EffectString.match(
    /^([1-9]\d*) (tag|tage|woche|wochen|monat|monate|quartal|quartale|jahr|jahre) zuvor$/u,
  )(input);
  const match = Option.firstSomeOf([prefixed, prior]);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const amountText = textAt(match.value, Option.isSome(prefixed) ? 2 : 1);
  const unitText = textAt(match.value, Option.isSome(prefixed) ? 3 : 2);
  const amount = parseTrailingCount(amountText);
  if (Option.isNone(amount)) return Option.none<ReturnType<typeof candidate>>();
  const entry = countedUnit(unitText, amount.value, Option.isSome(prefixed));
  if (entry === undefined) return Option.none<ReturnType<typeof candidate>>();
  const isPast =
    Option.isSome(prior) || (Option.isSome(prefixed) && textAt(match.value, 1) === "vor");
  const direction = isPast ? -amount.value : amount.value;
  const directionName = isPast ? "vor" : "in";
  const noun = amount.value === 1 ? entry.noun : entry.dative;
  const canonical = `${directionName} ${amount.value} ${title(noun)}`;
  return Option.some(
    candidate(periodRange(relativePeriod(entry.unit, direction, canonical)), canonical),
  );
};

const parseRollingPeriod = (input: string) => {
  const past = EffectString.match(
    /^(?:(?:die letzten|letzten|letzte|vergangene|vorherige) )?([1-9]\d*) (tag|tage|woche|wochen|monat|monate|quartal|quartale|jahr|jahre)$/u,
  )(input);
  const pastDative = EffectString.match(
    /^(?:(?:in den letzten|in den vergangenen|in den vorherigen) |seit )([1-9]\d*) (tag|tagen|woche|wochen|monat|monaten|quartal|quartalen|jahr|jahren)$/u,
  )(input);
  const singularSince = EffectString.match(
    /^seit (einem tag|einer woche|einem monat|einem quartal|einem jahr)$/u,
  )(input);
  const pastGenitive = EffectString.match(
    /^während der letzten ([1-9]\d*) (tag|tage|woche|wochen|monat|monate|quartal|quartale|jahr|jahre)$/u,
  )(input);
  const future = EffectString.match(
    /^(?:die nächsten|nächsten|nächste|kommende) ([1-9]\d*) (tag|tage|woche|wochen|monat|monate|quartal|quartale|jahr|jahre)$/u,
  )(input);
  const futureDative = EffectString.match(
    /^(?:in den nächsten|in den kommenden|innerhalb von) ([1-9]\d*) (tag|tagen|woche|wochen|monat|monaten|quartal|quartalen|jahr|jahren)$/u,
  )(input);
  const singularFuture = EffectString.match(
    /^innerhalb (eines tages|einer woche|eines monats|eines quartals|eines jahres)$/u,
  )(input);
  const futureGenitive = EffectString.match(
    /^innerhalb der nächsten ([1-9]\d*) (tag|tage|woche|wochen|monat|monate|quartal|quartale|jahr|jahre)$/u,
  )(input);
  const match = Option.firstSomeOf([
    past,
    pastDative,
    singularSince,
    pastGenitive,
    future,
    futureDative,
    singularFuture,
    futureGenitive,
  ]);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const isSingular = Option.isSome(singularSince) || Option.isSome(singularFuture);
  const amount = parseTrailingCount(isSingular ? "1" : textAt(match.value, 1));
  if (Option.isNone(amount)) return Option.none<ReturnType<typeof candidate>>();
  const usesDative =
    Option.isSome(pastDative) || Option.isSome(singularSince) || Option.isSome(futureDative);
  const sinceEntry = Option.isSome(singularSince)
    ? unitPhrases.find((unit) => unit.indefiniteDative === textAt(match.value, 1))
    : undefined;
  const futureEntry = Option.isSome(singularFuture)
    ? unitPhrases.find((unit) => unit.indefiniteGenitive === textAt(match.value, 1))
    : undefined;
  const countedEntry = isSingular
    ? undefined
    : countedUnit(textAt(match.value, 2), amount.value, usesDative);
  const entry = sinceEntry ?? futureEntry ?? countedEntry;
  if (entry === undefined) return Option.none<ReturnType<typeof candidate>>();
  const isFuture =
    Option.isSome(future) ||
    Option.isSome(futureDative) ||
    Option.isSome(singularFuture) ||
    Option.isSome(futureGenitive);
  const range = isFuture
    ? futureRange(amount.value, entry.unit)
    : trailingRange(amount.value, entry.unit);
  if (amount.value === 1) {
    const phrase = isFuture
      ? `innerhalb ${canonicalRelative(entry.indefiniteGenitive)}`
      : `seit ${canonicalRelative(entry.indefiniteDative)}`;
    return Option.some(candidate(range, phrase));
  }
  const direction = isFuture ? "nächste" : "letzte";
  return Option.some(candidate(range, `${direction} ${amount.value} ${title(entry.plural)}`));
};

const parseElidedDateRange = (input: string) => {
  const match = EffectString.match(
    /^(?:vom )?([0-3]?\d)\.(?: bis |[–—-])(?:zum )?([0-3]?\d)\.? ([a-zäöüß]+\.?)(?: (\d{4}))?$/u,
  )(input);
  if (Option.isNone(match)) return Option.none();
  const lowerDay = textAt(match.value, 1);
  const upperDay = textAt(match.value, 2);
  const month = textAt(match.value, 3);
  const year = textAt(match.value, 4);
  const suffix = year.length === 0 ? "" : ` ${year}`;
  return joinedPeriodCandidate(
    `von ${lowerDay}. ${month}${suffix} bis ${upperDay}. ${month}${suffix}`,
    [["von ", " bis "]],
    parsePeriod,
    (lower, upper) => `von ${lower} bis ${upper}`,
  );
};

const parseGerman = (input: string) => {
  const remaining = remainingPeriodPhrases.find((entry) => entry.phrase === input);
  if (remaining !== undefined) {
    return Option.some(
      candidate(
        remainingPeriodRange(remaining.entry.unit),
        `Rest ${canonicalRelative(remaining.entry.genitive)}`,
      ),
    );
  }

  if (["bis heute", "bis jetzt"].includes(input)) {
    return Option.some(candidate(untilNowRange(), "bis heute"));
  }
  if (["ab jetzt", "von jetzt an"].includes(input)) {
    return Option.some(candidate(fromNowRange(), "ab jetzt"));
  }

  const offset = parseCalendarOffset(input);
  if (Option.isSome(offset)) return offset;

  const rolling = parseRollingPeriod(input);
  if (Option.isSome(rolling)) return rolling;

  const toDate = toDatePhrases.find((entry) => entry.phrase === input);
  if (toDate !== undefined) {
    return Option.some(
      candidate(periodToDateRange(toDate.entry.unit), canonicalToDate(toDate.entry)),
    );
  }

  const currentBoundary = currentBoundaryCandidate(input);
  if (Option.isSome(currentBoundary)) return currentBoundary;

  const elided = parseElidedDateRange(input);
  if (Option.isSome(elided)) return elided;

  const nowBounded = joinedNowCandidate(
    input,
    [
      ["von ", " bis heute"],
      ["vom ", " bis heute"],
      ["zwischen ", " und heute"],
    ],
    ["von heute bis ", "zwischen heute und "],
    parsePeriod,
    (period) => `von ${period} bis heute`,
    (period) => `von heute bis ${period}`,
  );
  if (Option.isSome(nowBounded)) return nowBounded;

  const bounded = joinedPeriodCandidate(
    input,
    [
      ["von ", " bis einschließlich "],
      ["vom ", " bis einschließlich "],
      ["von ", " bis zum "],
      ["vom ", " bis zum "],
      ["von ", " bis "],
      ["vom ", " bis "],
      ["zwischen ", " und "],
      ["", " bis einschließlich "],
      ["", " bis "],
      ["", " - "],
      ["", " – "],
      ["", " — "],
      ["zwischen ", "-"],
      ["", "-"],
      ["zwischen ", "–"],
      ["", "–"],
      ["zwischen ", "—"],
      ["", "—"],
      ["zwischen ", "~"],
      ["", "~"],
    ],
    parsePeriod,
    (lower, upper) => `von ${lower} bis ${upper}`,
  );
  if (Option.isSome(bounded)) return bounded;

  const boundary = boundaryCandidate(input);
  if (Option.isSome(boundary)) return boundary;

  return Option.map(parsePeriod(input), (period) =>
    candidate(periodRange(period), period.canonical),
  );
};

const staticPeriodPhrases = [
  "vorgestern",
  "dieses wochenende",
  "letztes wochenende",
  "nächstes wochenende",
  "vorletztes wochenende",
  "übernächstes wochenende",
  ...unitPhrases.flatMap((entry) => [
    entry.current,
    entry.previous,
    entry.next,
    `anfang ${entry.currentGenitive}`,
    `ende ${entry.currentGenitive}`,
    `anfang ${entry.previousGenitive}`,
    `ende ${entry.previousGenitive}`,
    `anfang ${entry.nextGenitive}`,
    `ende ${entry.nextGenitive}`,
  ]),
  ...[1, 2, 3, 4].flatMap((quarter) => [
    `q${quarter}`,
    `q${quarter} letzten jahres`,
    `q${quarter} nächsten jahres`,
  ]),
  ...months.flatMap((month) => [month, `${month} letzten jahres`, `${month} nächsten jahres`]),
];

const staticPeriods = periodsFromPhrases(staticPeriodPhrases, parsePeriod);

const boundaryPrefixes = ["seit ", "vor ", "bis einschließlich ", "nach "];

const countedSuggestions = (input: string) => {
  const amount = naturalCount(input);
  if (amount === undefined) return [];
  return unitPhrases.flatMap((entry) => {
    const noun = amount === 1 ? entry.noun : entry.plural;
    const dative = amount === 1 ? entry.noun : entry.dative;
    const rolling =
      amount === 1
        ? [`${amount} ${noun}`]
        : [`letzte ${amount} ${noun}`, `${amount} ${noun}`, `nächste ${amount} ${noun}`];
    return [...rolling, `vor ${amount} ${dative}`, `in ${amount} ${dative}`];
  });
};

const germanSuggestionPhrases = [
  ...unitPhrases.map(canonicalToDate),
  ...unitPhrases.map((entry) => `rest ${entry.genitive}`),
  ...unitPhrases.flatMap((entry) => [
    `seit ${entry.indefiniteDative}`,
    `innerhalb ${entry.indefiniteGenitive}`,
    `vor ${entry.indefiniteDative}`,
    `in ${entry.indefiniteDative}`,
  ]),
  ...staticPeriodPhrases,
  ...currentBoundaryPhrases.map((entry) => entry.phrase),
  ...declinedBoundaryPeriods.flatMap(([, , , dative, accusative]) => [
    `seit ${dative}`,
    `vor ${dative}`,
    `bis einschließlich ${accusative}`,
    `nach ${dative}`,
  ]),
  ...prefixNaturalPhrases(months, boundaryPrefixes),
  "bis heute",
  "ab jetzt",
].map((phrase) => normalizeNaturalText(phrase, "de"));

const suggestGerman = (input: string, limit: number) => {
  const fixed = fixedCalendarPeriodPhrases(input, months);
  return completeNaturalPhrases(
    input,
    [
      ...germanSuggestionPhrases,
      ...fixed,
      ...prefixNaturalPhrases(fixed, boundaryPrefixes),
      ...countedSuggestions(input),
    ],
    limit,
  );
};

const renderGerman = (range: DateRangeExpr) => {
  const offset = calendarPeriodOffset(range);
  if (Option.isSome(offset) && Math.abs(offset.value.amount) > 1) {
    const entry = unitPhrases.find((unit) => unit.unit === offset.value.unit);
    if (entry !== undefined) {
      return Option.some(
        `${offset.value.amount < 0 ? "vor" : "in"} ${Math.abs(offset.value.amount)} ${title(
          Math.abs(offset.value.amount) === 1 ? entry.noun : entry.dative,
        )}`,
      );
    }
  }

  const future = futurePeriod(range);
  if (Option.isSome(future)) {
    const entry = unitPhrases.find((unit) => unit.unit === future.value.unit);
    if (entry !== undefined) {
      return Option.some(
        future.value.amount === 1
          ? `innerhalb ${canonicalRelative(entry.indefiniteGenitive)}`
          : `nächste ${future.value.amount} ${title(entry.plural)}`,
      );
    }
  }

  const trailing = trailingPeriod(range);
  if (Option.isSome(trailing)) {
    const entry = unitPhrases.find((unit) => unit.unit === trailing.value.unit);
    if (entry !== undefined) {
      return Option.some(
        trailing.value.amount === 1
          ? `seit ${canonicalRelative(entry.indefiniteDative)}`
          : `letzte ${trailing.value.amount} ${title(entry.plural)}`,
      );
    }
  }

  const dated = [...datedPeriods(range, months), ...datedQuarterPeriods(range)];
  const periods = [
    ...staticPeriods,
    ...currentYearDatePeriods(range, currentDateLabel),
    ...periodsFromPhrases(
      [...dated, ...dated.flatMap((phrase) => [`anfang ${phrase}`, `ende ${phrase}`])],
      parsePeriod,
    ),
  ];
  return renderPeriodRange(
    range,
    [
      ...unitPhrases.map((entry) =>
        candidate(periodToDateRange(entry.unit), canonicalToDate(entry)),
      ),
      ...unitPhrases.map((entry) =>
        candidate(remainingPeriodRange(entry.unit), `Rest ${canonicalRelative(entry.genitive)}`),
      ),
    ],
    periods,
    (period) => `seit ${withRelativeCase(period, "dative")}`,
    (period) => `vor ${withRelativeCase(period, "dative")}`,
    (period) => `bis einschließlich ${withRelativeCase(period, "accusative")}`,
    (period) => `nach ${withRelativeCase(period, "dative")}`,
    (lower, upper) => `von ${lower} bis ${upper}`,
    (period) => `von ${period} bis heute`,
    (period) => `von heute bis ${period}`,
    () => "bis heute",
    () => "ab jetzt",
  );
};

export const GermanContribution = new BaseLanguageContribution({
  locale: "de",
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
    ...currentBoundaryPhrases.flatMap((entry) => entry.phrase.split(" ")),
    ...relativeAliases.flatMap((entry) => entry[0].split(" ")),
    ...unitPhrases.flatMap((entry) => [
      entry.noun,
      entry.plural,
      entry.dative,
      ...entry.indefiniteDative.split(" "),
      ...entry.indefiniteGenitive.split(" "),
      ...entry.currentGenitive.split(" "),
      ...entry.previousGenitive.split(" "),
      ...entry.nextGenitive.split(" "),
      ...entry.current.split(" "),
      ...entry.previous.split(" "),
      ...entry.next.split(" "),
    ]),
    "ab",
    "an",
    "anfang",
    "beginn",
    "bisher",
    "bis",
    "dem",
    "den",
    "die",
    "dieses",
    "einschließlich",
    "ende",
    "für",
    "im",
    "innerhalb",
    "jetzt",
    "kalenderjahr",
    "jahres",
    "kommende",
    "kommenden",
    "letzte",
    "letzten",
    "nach",
    "nächste",
    "nächsten",
    "seit",
    "vor",
    "vorherige",
    "vorherigen",
    "vergangene",
    "vergangenen",
    "vom",
    "von",
    "während",
    "wochenende",
    "zwischen",
    "zuvor",
  ],
  normalize: normalizeNaturalText,
  correct: correctWhitespaceSeparatedText,
  parseExact: parseGerman,
  suggest: suggestGerman,
  render: renderGerman,
});

export const GermanLanguage = defineLanguagePlugin({
  id: "chronolizer/language-de",
  effect: (context) =>
    Effect.asVoid(context.register("chronolizer/language-de", GermanContribution)),
});

export const GermanLanguageLayer = languagePluginsLayer([GermanLanguage]);
