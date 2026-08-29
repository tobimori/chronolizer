import { Data, Option, Result, Schema } from "effect";
import type { Effect, Scope } from "effect";

import { DateRangeExpr } from "../ast/schemas.ts";
import type { DateRangeExpr as DateRangeExprType } from "../ast/schemas.ts";
import type { LanguageConflictError, LanguageRegistrationError } from "./errors.ts";

export const ParseQuality = Schema.Literals(["exact", "corrected", "ambiguous"]);
export type ParseQuality = typeof ParseQuality.Type;

export const Correction = Schema.Struct({
  original: Schema.String,
  replacement: Schema.String,
  distance: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  offset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type Correction = typeof Correction.Type;

export const NaturalCorrectionCandidate = Schema.Struct({
  text: Schema.String,
  corrections: Schema.Array(Correction),
  cost: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
});
export type NaturalCorrectionCandidate = typeof NaturalCorrectionCandidate.Type;

export const NaturalCandidate = Schema.Struct({
  range: DateRangeExpr,
  canonical: Schema.String,
});
export type NaturalCandidate = typeof NaturalCandidate.Type;

export const NaturalAlternative = NaturalCandidate;
export type NaturalAlternative = NaturalCandidate;

export const NaturalParseResult = Schema.Struct({
  range: DateRangeExpr,
  quality: ParseQuality,
  corrections: Schema.Array(Correction),
  alternatives: Schema.Array(NaturalAlternative),
});
export type NaturalParseResult = typeof NaturalParseResult.Type;

export const NaturalSuggestion = Schema.Struct({
  text: Schema.String,
  range: DateRangeExpr,
});
export type NaturalSuggestion = typeof NaturalSuggestion.Type;

export class BaseLanguageContribution extends Data.TaggedClass("BaseLanguage")<{
  readonly locale: string;
  readonly vocabulary: ReadonlyArray<string>;
  readonly normalize?: (input: string, locale: string) => string;
  readonly correct?: (
    input: string,
    vocabulary: ReadonlyArray<string>,
  ) => ReadonlyArray<NaturalCorrectionCandidate>;
  readonly parseExact: (input: string) => Option.Option<NaturalCandidate>;
  readonly suggest?: (input: string, limit: number) => ReadonlyArray<string>;
  readonly render: (range: DateRangeExprType) => Option.Option<string>;
}> {}

export class LanguageExtensionContribution extends Data.TaggedClass("LanguageExtension")<{
  readonly locale: string;
  readonly priority: number;
  readonly vocabulary: ReadonlyArray<string>;
  readonly parseExact: (input: string) => Option.Option<NaturalCandidate>;
  readonly suggest?: (input: string, limit: number) => ReadonlyArray<string>;
}> {}

export type LanguageContribution = BaseLanguageContribution | LanguageExtensionContribution;

export const canonicalBaseLocale = (input: string) =>
  Result.getSuccess(Result.try(() => new Intl.Locale(input).baseName));

export const Locale = Schema.String.check(
  Schema.makeFilter((value) => Option.contains(canonicalBaseLocale(value), value), {
    expected: "a canonical BCP 47 base locale identifier",
  }),
).annotate({ identifier: "Locale" });

export const BaseLanguageMetadata = Schema.TaggedStruct("BaseLanguage", {
  locale: Locale,
  vocabulary: Schema.Array(Schema.String),
});

export const LanguageExtensionMetadata = Schema.TaggedStruct("LanguageExtension", {
  locale: Locale,
  priority: Schema.Int,
  vocabulary: Schema.Array(Schema.String),
});

export const LanguageContributionMetadata = Schema.Union([
  BaseLanguageMetadata,
  LanguageExtensionMetadata,
]);

export interface LanguagePluginContext {
  readonly register: (
    pluginId: string,
    contribution: LanguageContribution,
  ) => Effect.Effect<void, LanguageRegistrationError | LanguageConflictError, Scope.Scope>;
}

export interface LanguagePlugin {
  readonly id: string;
  readonly effect: (
    context: LanguagePluginContext,
  ) => Effect.Effect<void, LanguageRegistrationError | LanguageConflictError, Scope.Scope>;
}

export interface CompiledLanguage {
  readonly locale: string;
  readonly vocabulary: ReadonlyArray<string>;
  readonly normalize: (input: string, locale: string) => string;
  readonly correct:
    | ((
        input: string,
        vocabulary: ReadonlyArray<string>,
      ) => ReadonlyArray<NaturalCorrectionCandidate>)
    | undefined;
  readonly parseExact: (input: string) => ReadonlyArray<NaturalCandidate>;
  readonly suggest: (input: string, limit: number) => ReadonlyArray<string>;
  readonly render: (range: DateRangeExprType) => Option.Option<string>;
}
