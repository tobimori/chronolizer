import { Effect, Option } from "effect";

import type { DateRangeExpr } from "../ast/schemas.ts";
import { formatFilter } from "../filter/codec.ts";
import { NaturalLanguageParseError, NaturalLanguageRenderError } from "../language/errors.ts";
import { LanguageRegistry } from "../language/registry.ts";
import { NaturalAlternative, NaturalParseResult } from "../language/model.ts";
import type { Correction, NaturalCandidate } from "../language/model.ts";
import { correctedTexts } from "./correction.ts";
import { naturalWords, normalizeNaturalText } from "./text.ts";

export interface ParseNaturalOptions {
  readonly locale: string;
  readonly typoMode?: "strict" | "tolerant";
}

export interface FormatNaturalOptions {
  readonly locale: string;
}

const rangeKey = (range: DateRangeExpr) => {
  const filter = formatFilter(range);
  return [
    `gt:${filter.gt ?? ""}`,
    `gte:${filter.gte ?? ""}`,
    `lt:${filter.lt ?? ""}`,
    `lte:${filter.lte ?? ""}`,
  ].join("|");
};

const distinctCandidates = (candidates: ReadonlyArray<NaturalCandidate>) => {
  const keys = new Set<string>();
  const distinct: Array<NaturalCandidate> = [];
  for (const candidate of candidates) {
    const key = rangeKey(candidate.range);
    if (keys.has(key)) continue;
    keys.add(key);
    distinct.push(candidate);
  }
  return distinct;
};

const resultFromCandidates = (
  candidates: ReadonlyArray<NaturalCandidate>,
  corrections: ReadonlyArray<Correction>,
) => {
  const distinct = distinctCandidates(candidates).sort((left, right) =>
    left.canonical.localeCompare(right.canonical),
  );
  const selected = distinct[0];
  if (selected === undefined) {
    throw new Error("At least one natural-language candidate is required");
  }
  const alternatives = distinct.slice(1).map((candidate) =>
    NaturalAlternative.make({
      canonical: candidate.canonical,
      range: candidate.range,
    }),
  );
  return NaturalParseResult.make({
    range: selected.range,
    quality: alternatives.length > 0 ? "ambiguous" : corrections.length > 0 ? "corrected" : "exact",
    corrections,
    alternatives,
  });
};

export const parseNatural = (input: string, options: ParseNaturalOptions) =>
  Effect.gen(function* () {
    const registry = yield* LanguageRegistry;
    const language = yield* registry.resolve(options.locale);
    const normalized = normalizeNaturalText(input, language.locale);
    if (normalized.length === 0) {
      return yield* new NaturalLanguageParseError({
        input,
        locale: options.locale,
        message: "The complete input must contain a date-range expression",
      });
    }

    const exact = language.parseExact(normalized);
    if (exact.length > 0) return resultFromCandidates(exact, []);
    if (options.typoMode !== "tolerant") {
      return yield* new NaturalLanguageParseError({
        input,
        locale: options.locale,
        message: "The complete input is not a supported date-range expression",
      });
    }

    const corrected = correctedTexts(naturalWords(normalized), language.vocabulary);
    const successful = corrected
      .map((entry) => ({ ...entry, candidates: language.parseExact(entry.text) }))
      .filter((entry) => entry.candidates.length > 0)
      .sort((left, right) => left.cost - right.cost);
    const minimum = successful[0]?.cost;
    if (minimum === undefined) {
      return yield* new NaturalLanguageParseError({
        input,
        locale: options.locale,
        message: "No conservative typo correction produced a complete expression",
      });
    }
    const best = successful.filter((entry) => entry.cost === minimum);
    const candidates = best.flatMap((entry) => entry.candidates);
    const corrections = best[0]?.corrections ?? [];
    return resultFromCandidates(candidates, corrections);
  });

export const formatNatural = (range: DateRangeExpr, options: FormatNaturalOptions) =>
  Effect.gen(function* () {
    const registry = yield* LanguageRegistry;
    const language = yield* registry.resolve(options.locale);
    const rendered = language.render(range);
    if (Option.isSome(rendered)) return rendered.value;
    return yield* new NaturalLanguageRenderError({
      locale: options.locale,
      message: "The range has no canonical natural-language form in this locale",
    });
  });
