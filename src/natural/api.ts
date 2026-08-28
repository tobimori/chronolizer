import { Array as EffectArray, Effect, Option, Order } from "effect";

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

const distinctCandidates = (candidates: EffectArray.NonEmptyReadonlyArray<NaturalCandidate>) =>
  EffectArray.dedupeWith(
    candidates,
    (left, right) => rangeKey(left.range) === rangeKey(right.range),
  );

const resultFromCandidates = (
  candidates: EffectArray.NonEmptyReadonlyArray<NaturalCandidate>,
  corrections: ReadonlyArray<Correction>,
) => {
  const distinct = EffectArray.sortWith(
    distinctCandidates(candidates),
    (candidate) => candidate.canonical,
    Order.String,
  );
  const selected = EffectArray.headNonEmpty(distinct);
  const alternatives = EffectArray.tailNonEmpty(distinct).map((candidate) =>
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
    if (EffectArray.isReadonlyArrayNonEmpty(exact)) return resultFromCandidates(exact, []);
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
    if (!EffectArray.isReadonlyArrayNonEmpty(best)) {
      return yield* new NaturalLanguageParseError({
        input,
        locale: options.locale,
        message: "No minimum-cost typo correction was available",
      });
    }
    const candidates = best.flatMap((entry) => entry.candidates);
    if (!EffectArray.isReadonlyArrayNonEmpty(candidates)) {
      return yield* new NaturalLanguageParseError({
        input,
        locale: options.locale,
        message: "No corrected input produced a date-range candidate",
      });
    }
    return resultFromCandidates(candidates, EffectArray.headNonEmpty(best).corrections);
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
