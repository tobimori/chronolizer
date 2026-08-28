import { Schema } from "effect";

export class UnsupportedLocaleError extends Schema.TaggedError<UnsupportedLocaleError>()(
  "UnsupportedLocaleError",
  {
    locale: Schema.String,
  },
) {}

export class LanguageConflictError extends Schema.TaggedError<LanguageConflictError>()(
  "LanguageConflictError",
  {
    locale: Schema.String,
    firstPluginId: Schema.String,
    secondPluginId: Schema.String,
    message: Schema.String,
  },
) {}

export class LanguageRegistrationError extends Schema.TaggedError<LanguageRegistrationError>()(
  "LanguageRegistrationError",
  {
    pluginId: Schema.String,
    locale: Schema.String,
    message: Schema.String,
  },
) {}

export class NaturalLanguageParseError extends Schema.TaggedError<NaturalLanguageParseError>()(
  "NaturalLanguageParseError",
  {
    input: Schema.String,
    locale: Schema.String,
    message: Schema.String,
  },
) {}

export class AmbiguousNaturalLanguageError extends Schema.TaggedError<AmbiguousNaturalLanguageError>()(
  "AmbiguousNaturalLanguageError",
  {
    input: Schema.String,
    locale: Schema.String,
    alternatives: Schema.Array(Schema.String),
  },
) {}

export class NaturalLanguageRenderError extends Schema.TaggedError<NaturalLanguageRenderError>()(
  "NaturalLanguageRenderError",
  {
    locale: Schema.String,
    message: Schema.String,
  },
) {}
