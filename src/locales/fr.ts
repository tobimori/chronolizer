import { Effect, Option, String as EffectString } from "effect";

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
  sequentialCountAliases,
  countAliasVocabulary,
  currentYearDatePeriods,
  datedPeriods,
  datedQuarterPeriods,
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
  periodBoundaryCandidate,
  periodDay,
  periodEndDay,
  periodRange,
  periodsFromPhrases,
  periodStartDay,
  periodToDateRange,
  quarterOfRelativeYear,
  relativePeriod,
  relativeWeekday,
  relativeWeekend,
  remainingPeriodRange,
  renderPeriodRange,
  compileCountAliasNormalizer,
  decomposeShiftedPeriodRange,
  shiftPeriod,
  textAt,
  trailingPeriod,
  trailingRange,
  untilNowRange,
  validYear,
} from "./shared.ts";
import type { CountAlias, Period } from "./shared.ts";

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

const weekdays = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;

const nextWeekdayPhrases = weekdays.map((weekday) => `${weekday} prochain`);

const frenchCountWords = [
  ["deux"],
  ["trois"],
  ["quatre"],
  ["cinq"],
  ["six"],
  ["sept"],
  ["huit"],
  ["neuf"],
  ["dix"],
  ["onze"],
  ["douze"],
  ["treize"],
  ["quatorze"],
  ["quinze"],
  ["seize"],
  ["dix-sept"],
  ["dix-huit"],
  ["dix-neuf"],
  ["vingt"],
] as const;
const frenchCompoundCountAliases = () => {
  const words = [
    "",
    "un",
    "deux",
    "trois",
    "quatre",
    "cinq",
    "six",
    "sept",
    "huit",
    "neuf",
    "dix",
    "onze",
    "douze",
    "treize",
    "quatorze",
    "quinze",
    "seize",
    "dix-sept",
    "dix-huit",
    "dix-neuf",
  ] as const;
  const aliases: Array<CountAlias> = [];
  for (let amount = 21; amount <= 99; amount += 1) {
    const tens = Math.floor(amount / 10);
    const remainder = amount % 10;
    let phrase = "";
    if (tens <= 6) {
      const tensWord = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"][tens];
      if (tensWord === undefined) continue;
      if (remainder === 0) phrase = tensWord;
      else phrase = remainder === 1 ? `${tensWord} et un` : `${tensWord}-${words[remainder] ?? ""}`;
    } else if (tens === 7) {
      phrase = remainder === 1 ? "soixante et onze" : `soixante-${words[10 + remainder] ?? ""}`;
    } else if (tens === 8) {
      phrase = remainder === 0 ? "quatre-vingts" : `quatre-vingt-${words[remainder] ?? ""}`;
    } else {
      phrase = `quatre-vingt-${words[10 + remainder] ?? ""}`;
    }
    aliases.push([phrase, amount], [phrase.replaceAll("-", " "), amount]);
    if (amount % 10 === 1) aliases.push([phrase.replace(/un$/u, "une"), amount]);
  }
  return aliases;
};
const frenchCountAliases = [
  ...sequentialCountAliases(frenchCountWords, 2),
  ...frenchCompoundCountAliases(),
];
const normalizeFrenchCounts = compileCountAliasNormalizer(frenchCountAliases);
const frenchCountVocabulary = new Set(countAliasVocabulary(frenchCountAliases));
const correctFrench = (input: string, vocabulary: ReadonlyArray<string>) =>
  correctWhitespaceSeparatedText(input, vocabulary, frenchCountVocabulary);

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
  readonly rollingSingular: string;
  readonly rollingPlural: string;
  readonly rollingGender: "masculine" | "feminine";
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
    rollingSingular: "jour",
    rollingPlural: "jours",
    rollingGender: "masculine",
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
    rollingSingular: "semaine",
    rollingPlural: "semaines",
    rollingGender: "feminine",
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
    rollingSingular: "mois",
    rollingPlural: "mois",
    rollingGender: "masculine",
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
    rollingSingular: "trimestre",
    rollingPlural: "trimestres",
    rollingGender: "masculine",
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
    rollingSingular: "année",
    rollingPlural: "années",
    rollingGender: "feminine",
    current: "cette année",
    previous: "l'année dernière",
    next: "l'année prochaine",
    toDate: "année à ce jour",
    remaining: "reste de l'année",
  },
];

const rollingArticle = (entry: UnitForms) => (entry.rollingGender === "feminine" ? "la" : "le");

const indefiniteArticle = (entry: UnitForms) => (entry.unit === "week" ? "une" : "un");

const rollingModifier = (entry: UnitForms, future: boolean, plural: boolean) => {
  if (future) {
    if (entry.rollingGender === "feminine") return plural ? "prochaines" : "prochaine";
    return plural ? "prochains" : "prochain";
  }
  if (entry.rollingGender === "feminine") return plural ? "dernières" : "dernière";
  return plural ? "derniers" : "dernier";
};

const withDe = (period: string) => {
  if (period.startsWith("le ")) return `du ${period.slice(3)}`;
  if (period.startsWith("les ")) return `des ${period.slice(4)}`;
  if (period.startsWith("la ")) return `de la ${period.slice(3)}`;
  if (period.startsWith("l'")) return `de ${period}`;
  return `de ${period}`;
};

const withA = (period: string) => {
  if (period.startsWith("le ")) return `au ${period.slice(3)}`;
  if (period.startsWith("les ")) return `aux ${period.slice(4)}`;
  if (period.startsWith("la ")) return `à la ${period.slice(3)}`;
  if (period.startsWith("l'")) return `à ${period}`;
  return `à ${period}`;
};

const afterDe = (period: string) => {
  if (period.startsWith("du ")) return `le ${period.slice(3)}`;
  if (period.startsWith("de la ")) return `la ${period.slice(6)}`;
  if (period.startsWith("de l'")) return `l'${period.slice(5)}`;
  return period.startsWith("de ") ? period.slice(3) : period;
};

const startsWithDay = (period: string) =>
  period[0] !== undefined && period[0] >= "0" && period[0] <= "9";

const rangeLabel = (lower: string, upper: string) => {
  const from = startsWithDay(lower) ? `du ${lower}` : withDe(lower);
  const to = startsWithDay(upper) ? `au ${upper}` : withA(upper);
  return `${from} ${to}`;
};

const untilLabel = (period: string) => `jusqu'${withA(period)}`;

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
    /^(?:le )?(1er|[0-3]?\d)(?: de)? ([a-zàâçéèêëîïôûùüÿœ]+\.?),?(?: de)? (\d{4})$/u,
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
    return namedDatePeriod(
      textAt(numeric.value, 3),
      textAt(numeric.value, 2),
      textAt(numeric.value, 1),
      Number,
      dateLabel,
    );
  }

  const current = EffectString.match(
    /^(?:le )?(1er|[0-3]?\d)(?: de)? ([a-zàâçéèêëîïôûùüÿœ]+\.?)$/u,
  )(input);
  if (Option.isSome(current)) {
    return namedCurrentYearDatePeriod(
      textAt(current.value, 2),
      textAt(current.value, 1).replace(/er$/u, ""),
      monthNumber,
      currentDateLabel,
    );
  }

  const relative = EffectString.match(/^(?:le )?(1er|[0-3]?\d) (de .+|du .+)$/u)(input);
  if (Option.isNone(relative)) return Option.none<Period>();
  const periodText = afterDe(textAt(relative.value, 2));
  const alias = periodAliases.find((entry) => entry[0] === periodText && entry[1] === "month");
  if (alias === undefined) return Option.none<Period>();
  const day = Number(textAt(relative.value, 1).replace(/er$/u, ""));
  const month = relativePeriod(alias[1], alias[2], alias[3]);
  return periodDay(month, day, `${day === 1 ? "1er" : day} ${withDe(alias[3])}`);
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

const parseDatedPeriod = (input: string) => {
  const knownPeriod = Option.firstSomeOf([
    absoluteDatePeriod(input, "fr"),
    parseNamedDate(input),
    parseQuarter(input),
  ]);
  if (Option.isSome(knownPeriod)) return knownPeriod;

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
      return Option.some(fixedMonthPeriod(year, month, `${textAt(months, month - 1)} ${year}`));
    }
  }

  return Option.none<Period>();
};

const parseBasePeriod = (input: string) => {
  const datedPeriod = parseDatedPeriod(input);
  if (Option.isSome(datedPeriod)) return datedPeriod;

  const suffixedRelativeMonth = EffectString.match(
    /^([a-zàâçéèêëîïôûùüÿœ]+\.?) (dernier|prochain)$/u,
  )(input);
  if (Option.isSome(suffixedRelativeMonth)) {
    const month = monthNumber(textAt(suffixedRelativeMonth.value, 1));
    if (month !== undefined) {
      const modifier = textAt(suffixedRelativeMonth.value, 2);
      const direction = modifier === "dernier" ? -1 : 1;
      return Option.some(
        monthOfRelativeYear(month, direction, `${textAt(months, month - 1)} ${modifier}`),
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
          `${textAt(months, month - 1)} de ${relativeYearName(direction)}`,
        ),
      );
    }
  }

  const standaloneMonth = monthNumber(input);
  if (standaloneMonth !== undefined) {
    return Option.some(
      monthOfRelativeYear(standaloneMonth, 0, textAt(months, standaloneMonth - 1)),
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

  const weekday = nextWeekdayPhrases.indexOf(input);
  return weekday === -1
    ? Option.none<Period>()
    : Option.some(relativeWeekday(weekday, 1, nextWeekdayPhrases[weekday] ?? input));
};

// RETURN TYPE: Recursive period offsets require an explicit result type.
const parsePeriod = (input: string): Option.Option<Period> => {
  const shifted = EffectString.match(
    /^(.+) (il y a|dans) ([1-9]\d*) (jour|jours|semaine|semaines|mois|trimestre|trimestres|an|ans|année|annee|années|annees)$/u,
  )(input);
  if (Option.isSome(shifted)) {
    const amount = parseTrailingCount(textAt(shifted.value, 3));
    const alias = unitAliases.find((unit) => unit[0] === textAt(shifted.value, 4));
    const entry = alias === undefined ? undefined : units.find((unit) => unit.unit === alias[1]);
    const period = parsePeriod(textAt(shifted.value, 1));
    if (Option.isSome(amount) && entry !== undefined && Option.isSome(period)) {
      const past = textAt(shifted.value, 2) === "il y a";
      const direction = past ? -amount.value : amount.value;
      const noun = amount.value === 1 ? entry.singular : entry.plural;
      const canonical = `${period.value.canonical} ${past ? "il y a" : "dans"} ${amount.value} ${noun}`;
      return Option.some(shiftPeriod(period.value, direction, entry.unit, canonical));
    }
  }

  const edge = EffectString.match(
    /^(?:le |la |l')?(début|debut|commencement|fin)(?: du | de la | de l'| de )(.+)$/u,
  )(input);
  if (Option.isSome(edge)) {
    const edgeName = textAt(edge.value, 1);
    const periodText = textAt(edge.value, 2);
    const basePeriod = parseBasePeriod(periodText);
    const implicitUnit = unitAliases.find((entry) => entry[0] === periodText)?.[1];
    const implicit = units.find((entry) => entry.unit === implicitUnit);
    const period =
      Option.isSome(basePeriod) || implicit === undefined
        ? basePeriod
        : Option.some(relativePeriod(implicit.unit, 0, implicit.current));
    if (Option.isSome(period)) {
      const isEnd = edgeName === "fin";
      const canonical = `${isEnd ? "fin" : "début"} ${withDe(period.value.canonical)}`;
      return Option.some(
        isEnd ? periodEndDay(period.value, canonical) : periodStartDay(period.value, canonical),
      );
    }
  }
  const wrapper = ["pendant ", "en ", "tout ", "tout le ", "toute la "].find((prefix) =>
    input.startsWith(prefix),
  );
  const base = parseBasePeriod(wrapper === undefined ? input : input.slice(wrapper.length));
  return Option.isSome(base) ? base : parseCalendarOffset(input);
};

const countedUnit = (value: string, amount: number) => {
  const plural = value === "mois" || value.endsWith("s");
  if (value !== "mois" && plural === (amount === 1)) return undefined;
  const unit = unitAliases.find((entry) => entry[0] === value)?.[1];
  return unit === undefined ? undefined : units.find((entry) => entry.unit === unit);
};

const rollingPastModifierPattern =
  "derni(?:ers|ères|eres)|pass(?:és|ées|es)|pr[eé]c[eé]dent(?:s|es)";
const rollingFutureModifierPattern = "prochain(?:s|es)|suivant(?:s|es)";
const rollingModifierPattern = `${rollingPastModifierPattern}|${rollingFutureModifierPattern}`;
const rollingModifierMatchPattern = new RegExp(`(?:^| )(${rollingModifierPattern})(?: |$)`, "u");

const modifierAgreesWithNoun = (input: string, noun: string) => {
  const match = EffectString.match(rollingModifierMatchPattern)(input);
  if (Option.isNone(match)) return true;
  const modifier = textAt(match.value, 1);
  const feminineNoun =
    noun.startsWith("semaine") || noun.startsWith("année") || noun.startsWith("annee");
  return feminineNoun === modifier.endsWith("es");
};

const compilePattern = (source: string) => new RegExp(source, "u");

const calendarPastPattern = /^il y a ([1-9]\d*) ([^ ]+)$/u;
const calendarFuturePattern = /^dans ([1-9]\d*) ([^ ]+)$/u;
const rollingSincePattern = /^depuis ([1-9]\d*) ([^ ]+)$/u;
const rollingBarePattern = /^([1-9]\d*) ([^ ]+)$/u;
const rollingPastPatterns = [
  compilePattern(`^(?:(?:les|la) )?(?:${rollingPastModifierPattern}) ([1-9]\\d*) ([^ ]+)$`),
  compilePattern(
    `^(?:(?:les|la|au cours des|pendant les) )?([1-9]\\d*) (?:${rollingPastModifierPattern}) ([^ ]+)$`,
  ),
  compilePattern(`^([1-9]\\d*) ([^ ]+) (?:${rollingPastModifierPattern})$`),
];
const rollingFuturePatterns = [
  compilePattern(`^(?:(?:les|la) )?(?:${rollingFutureModifierPattern}) ([1-9]\\d*) ([^ ]+)$`),
  compilePattern(
    `^(?:(?:les|la|au cours des|pendant les) )?([1-9]\\d*) (?:${rollingFutureModifierPattern}) ([^ ]+)$`,
  ),
  compilePattern(`^([1-9]\\d*) ([^ ]+) (?:${rollingFutureModifierPattern}|à venir)$`),
];

const firstPatternMatch = (input: string, patterns: ReadonlyArray<RegExp>) =>
  Option.firstSomeOf(patterns.map((pattern) => EffectString.match(pattern)(input)));

const relativeCountPhrase = (amount: number, entry: UnitForms, future: boolean) => {
  if (amount === 1) return singularRollingCanonical(entry, future);
  return `les ${amount} ${rollingModifier(entry, future, true)} ${entry.rollingPlural}`;
};

const singularRollingCanonical = (entry: UnitForms, future: boolean) => {
  const article = indefiniteArticle(entry);
  return future
    ? `à partir de maintenant pendant ${article} ${entry.singular}`
    : `depuis ${article} ${entry.singular}`;
};

const singularRollingPhrases = units.flatMap((entry) => {
  const period = `${rollingArticle(entry)} ${rollingModifier(entry, false, false)} ${entry.rollingSingular}`;
  const futurePeriod = `${rollingArticle(entry)} ${rollingModifier(entry, true, false)} ${entry.rollingSingular}`;
  const article = indefiniteArticle(entry);
  return [
    { phrase: period, entry, future: false },
    { phrase: `au cours ${withDe(period)}`, entry, future: false },
    { phrase: `depuis ${article} ${entry.singular}`, entry, future: false },
    { phrase: `pendant ${futurePeriod}`, entry, future: true },
    {
      phrase: `à partir de maintenant pendant ${article} ${entry.singular}`,
      entry,
      future: true,
    },
  ];
});

const singularCalendarOffsets = units.flatMap((entry) => {
  const quantity = `${indefiniteArticle(entry)} ${entry.singular}`;
  return [
    { phrase: `il y a ${quantity}`, entry, direction: -1 },
    { phrase: `dans ${quantity}`, entry, direction: 1 },
  ];
});

const parseCalendarOffset = (input: string) => {
  const singular = singularCalendarOffsets.find((entry) => entry.phrase === input);
  if (singular !== undefined) {
    return Option.some(relativePeriod(singular.entry.unit, singular.direction, singular.phrase));
  }
  const past = EffectString.match(calendarPastPattern)(input);
  const future = EffectString.match(calendarFuturePattern)(input);
  const match = Option.firstSomeOf([past, future]);
  if (Option.isNone(match)) return Option.none<Period>();
  const amount = parseTrailingCount(textAt(match.value, 1));
  if (Option.isNone(amount)) return Option.none<Period>();
  const entry = countedUnit(textAt(match.value, 2), amount.value);
  if (entry === undefined) return Option.none<Period>();
  const direction = Option.isSome(past) ? -amount.value : amount.value;
  const noun = amount.value === 1 ? entry.singular : entry.plural;
  const canonical =
    direction < 0 ? `il y a ${amount.value} ${noun}` : `dans ${amount.value} ${noun}`;
  return Option.some(relativePeriod(entry.unit, direction, canonical));
};

const parseRollingPeriod = (input: string) => {
  const singular = singularRollingPhrases.find((entry) => entry.phrase === input);
  if (singular !== undefined) {
    const range = singular.future
      ? futureRange(1, singular.entry.unit)
      : trailingRange(1, singular.entry.unit);
    return Option.some(candidate(range, singularRollingCanonical(singular.entry, singular.future)));
  }
  const since = EffectString.match(rollingSincePattern)(input);
  const past = firstPatternMatch(input, rollingPastPatterns);
  const bare = EffectString.match(rollingBarePattern)(input);
  const future = firstPatternMatch(input, rollingFuturePatterns);
  const match = Option.firstSomeOf([since, past, bare, future]);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const amount = parseTrailingCount(textAt(match.value, 1));
  if (Option.isNone(amount)) return Option.none<ReturnType<typeof candidate>>();
  const noun = textAt(match.value, 2);
  const entry = countedUnit(noun, amount.value);
  if (entry === undefined || !modifierAgreesWithNoun(input, noun)) {
    return Option.none<ReturnType<typeof candidate>>();
  }
  const isFuture = Option.isSome(future);
  const range = isFuture
    ? futureRange(amount.value, entry.unit)
    : trailingRange(amount.value, entry.unit);
  return Option.some(candidate(range, relativeCountPhrase(amount.value, entry, isFuture)));
};

const parseElidedDateRange = (input: string) => {
  const joined = EffectString.match(
    /^(?:du (1er|[0-3]?\d) au|entre le (1er|[0-3]?\d) et le) (1er|[0-3]?\d) (.+)$/u,
  )(input);
  const dashed = EffectString.match(/^(1er|[0-3]?\d)[–—-](1er|[0-3]?\d) (.+)$/u)(input);
  const match = Option.firstSomeOf([joined, dashed]);
  if (Option.isNone(match)) return Option.none<ReturnType<typeof candidate>>();
  const isJoined = Option.isSome(joined);
  const lowerDay = textAt(match.value, 1) || textAt(match.value, 2);
  const upperDay = textAt(match.value, isJoined ? 3 : 2);
  const period = afterDe(textAt(match.value, isJoined ? 4 : 3));
  const isRelativeMonth = periodAliases.some(
    (entry) => entry[0] === period && entry[1] === "month",
  );
  const datePeriod = isRelativeMonth ? withDe(period) : period;
  return joinedPeriodCandidate(
    `du ${lowerDay} ${datePeriod} au ${upperDay} ${datePeriod}`,
    [["du ", " au "]],
    parsePeriod,
    rangeLabel,
  );
};

const boundaryCandidate = (input: string) => {
  const included = EffectString.match(/^jusqu'à (.+) (?:inclus|incluse|inclusivement)$/u)(input);
  if (Option.isSome(included)) {
    const period = parsePeriod(textAt(included.value, 1));
    if (Option.isSome(period)) {
      return Option.some(
        periodBoundaryCandidate(period.value, "through", untilLabel(period.value.canonical)),
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
  const rolling = parseRollingPeriod(input);
  if (Option.isSome(rolling)) return rolling;
  const toDate = toDatePhrases.find((entry) => entry.phrase === input);
  if (toDate !== undefined) {
    return Option.some(candidate(periodToDateRange(toDate.entry.unit), toDate.entry.toDate));
  }

  const elided = parseElidedDateRange(input);
  if (Option.isSome(elided)) return elided;

  const nowBounded = joinedNowCandidate(
    input,
    [
      ["depuis ", " jusqu'à maintenant"],
      ["depuis ", " jusqu'à aujourd'hui"],
      ["entre ", " et aujourd'hui"],
    ],
    ["d'aujourd'hui à ", "de maintenant à ", "entre aujourd'hui et ", "maintenant à "],
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
    rangeLabel,
  );
  if (Option.isSome(bounded)) return bounded;
  const boundary = boundaryCandidate(input);
  if (Option.isSome(boundary)) return boundary;
  return parsePeriod(input).pipe(
    Option.map((period) => candidate(periodRange(period), period.canonical)),
  );
};

const weekendPhrases = [
  "ce week-end",
  "le week-end dernier",
  "le week-end prochain",
  "l'avant-dernier week-end",
  "le week-end après le prochain",
];

const edgePeriodPhrases = [
  ...units
    .filter((entry) => entry.unit !== "day")
    .flatMap((entry) => [entry.current, entry.previous, entry.next]),
  ...weekendPhrases,
  ...months,
].flatMap((period) => [`début ${withDe(period)}`, `fin ${withDe(period)}`]);

const staticPeriodPhrases = [
  ...periodAliases.map((entry) => entry[0]),
  ...weekendPhrases,
  ...edgePeriodPhrases,
  ...[1, 2, 3, 4].flatMap((quarter) => [
    `t${quarter}`,
    `t${quarter} de cette année`,
    `t${quarter} de l'année dernière`,
    `t${quarter} de l'année prochaine`,
  ]),
  ...months.flatMap((month) => [
    month,
    `${month} dernier`,
    `${month} prochain`,
    `${month} de l'année dernière`,
    `${month} de l'année prochaine`,
  ]),
  ...nextWeekdayPhrases,
];

const staticPeriods = periodsFromPhrases(staticPeriodPhrases, parsePeriod);
const boundaryPrefixes = ["depuis ", "avant ", "jusqu'à ", "après "];

const countedSuggestions = (input: string) => {
  const amount = naturalCount(input);
  if (amount === undefined) return [];
  return units.flatMap((entry) => {
    const noun = amount === 1 ? entry.singular : entry.plural;
    const rollingNoun = amount === 1 ? entry.rollingSingular : entry.rollingPlural;
    const past = rollingModifier(entry, false, amount !== 1);
    const future = rollingModifier(entry, true, amount !== 1);
    return [
      relativeCountPhrase(amount, entry, false),
      `${amount} ${past} ${rollingNoun}`,
      `${amount} ${noun}`,
      relativeCountPhrase(amount, entry, true),
      `${amount} ${future} ${rollingNoun}`,
      `${amount} ${rollingNoun} à venir`,
      `il y a ${amount} ${noun}`,
      `dans ${amount} ${noun}`,
    ];
  });
};

const frenchSuggestionPhrases = [
  ...units.map((entry) => entry.toDate),
  ...units.map((entry) => entry.remaining),
  ...singularRollingPhrases.map((entry) => entry.phrase),
  ...singularCalendarOffsets.map((entry) => entry.phrase),
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

// RETURN TYPE: Recursive shifted-period rendering requires an explicit result type.
const renderFrench = (range: DateRangeExpr): Option.Option<string> => {
  const shifted = decomposeShiftedPeriodRange(range);
  if (Option.isSome(shifted)) {
    const base = renderFrench(shifted.value.baseRange);
    const entry = units.find((unit) => unit.unit === shifted.value.unit);
    if (Option.isSome(base) && entry !== undefined) {
      const amount = Math.abs(shifted.value.amount);
      const noun = amount === 1 ? entry.singular : entry.plural;
      const direction = shifted.value.amount < 0 ? "il y a" : "dans";
      return Option.some(`${base.value} ${direction} ${amount} ${noun}`);
    }
  }

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
      return Option.some(
        future.value.amount === 1
          ? singularRollingCanonical(entry, true)
          : relativeCountPhrase(future.value.amount, entry, true),
      );
    }
  }
  const trailing = trailingPeriod(range);
  if (Option.isSome(trailing)) {
    const entry = units.find((unit) => unit.unit === trailing.value.unit);
    if (entry !== undefined) {
      return Option.some(
        trailing.value.amount === 1
          ? singularRollingCanonical(entry, false)
          : relativeCountPhrase(trailing.value.amount, entry, false),
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
      ...units.map((entry) => candidate(periodToDateRange(entry.unit), entry.toDate)),
      ...units.map((entry) => candidate(remainingPeriodRange(entry.unit), entry.remaining)),
    ],
    periods,
    (period) => `depuis ${period}`,
    (period) => `avant ${period}`,
    untilLabel,
    (period) => `après ${period}`,
    rangeLabel,
    (period) => `depuis ${period} jusqu'à maintenant`,
    (period) => `de maintenant à ${period}`,
    () => "jusqu'à maintenant",
    () => "depuis maintenant",
  );
};

const normalizeFrench = (input: string, locale: string) =>
  normalizeFrenchCounts(normalizeNaturalText(input, locale).replaceAll("’", "'"));

export const FrenchContribution = new BaseLanguageContribution({
  locale: "fr",
  vocabulary: [
    ...months,
    ...weekdays,
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
  correct: correctFrench,
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
