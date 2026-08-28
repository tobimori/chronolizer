import { Array as EffectArray, Effect, Option, Order } from "effect";

import type { DateRangeExpr } from "../ast/schemas.ts";
import { rangeKey } from "../filter/codec.ts";
import { NaturalLanguageParseError, NaturalLanguageRenderError } from "../language/errors.ts";
import { LanguageRegistry } from "../language/registry.ts";
import { NaturalAlternative, NaturalParseResult } from "../language/model.ts";
import type { Correction, NaturalCandidate } from "../language/model.ts";

export interface ParseNaturalOptions {
  readonly locale: string;
  readonly typoMode?: "strict" | "tolerant";
}

export interface FormatNaturalOptions {
  readonly locale: string;
}

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

export const parseNatural = Effect.fn("chronolizer.parseNatural")(function* (
  input: string,
  options: ParseNaturalOptions,
) {
  const registry = yield* LanguageRegistry;
  const language = yield* registry.resolve(options.locale);
  const normalized = language.normalize(input, language.locale);
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

  const corrected = language.correct?.(normalized, language.vocabulary) ?? [];
  const parsedCorrections = EffectArray.map(corrected, (entry) => ({
    ...entry,
    candidates: language.parseExact(entry.text),
  }));
  const successfulCorrections = EffectArray.filter(
    parsedCorrections,
    (entry) => entry.candidates.length > 0,
  );
  const successful = EffectArray.sortWith(
    successfulCorrections,
    (entry) => entry.cost,
    Order.Number,
  );
  const first = EffectArray.head(successful);
  if (Option.isNone(first)) {
    return yield* new NaturalLanguageParseError({
      input,
      locale: options.locale,
      message: "No conservative typo correction produced a complete expression",
    });
  }
  const best = EffectArray.filter(successful, (entry) => entry.cost === first.value.cost);
  if (!EffectArray.isReadonlyArrayNonEmpty(best)) {
    return yield* new NaturalLanguageParseError({
      input,
      locale: options.locale,
      message: "No minimum-cost typo correction was available",
    });
  }
  const candidates = EffectArray.flatMap(best, (entry) => entry.candidates);
  if (!EffectArray.isReadonlyArrayNonEmpty(candidates)) {
    return yield* new NaturalLanguageParseError({
      input,
      locale: options.locale,
      message: "No corrected input produced a date-range candidate",
    });
  }
  return resultFromCandidates(candidates, EffectArray.headNonEmpty(best).corrections);
});

export const formatNatural = Effect.fn("chronolizer.formatNatural")(function* (
  range: DateRangeExpr,
  options: FormatNaturalOptions,
) {
  const registry = yield* LanguageRegistry;
  const language = yield* registry.resolve(options.locale);
  const rendered = language.render(range);
  if (Option.isSome(rendered)) return rendered.value;
  return yield* new NaturalLanguageRenderError({
    locale: options.locale,
    message: "The range has no canonical natural-language form in this locale",
  });
});
