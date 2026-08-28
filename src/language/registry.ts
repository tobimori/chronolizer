import {
  Array as EffectArray,
  Context,
  Effect,
  Layer,
  Match,
  Option,
  Order,
  Ref,
  Result,
  Schema,
} from "effect";
import type { Scope } from "effect";

import {
  LanguageConflictError,
  LanguageRegistrationError,
  UnsupportedLocaleError,
} from "./errors.ts";
import {
  BaseLanguageMetadata,
  canonicalBaseLocale,
  LanguageContributionMetadata,
  LanguageExtensionMetadata,
} from "./model.ts";
import { normalizeNaturalText } from "../natural/text.ts";
import type {
  BaseLanguageContribution,
  CompiledLanguage,
  LanguageContribution,
  LanguageExtensionContribution,
  LanguagePlugin,
  LanguagePluginContext,
  NaturalCandidate,
} from "./model.ts";

interface RegisteredContribution {
  readonly token: symbol;
  readonly pluginId: string;
  readonly contribution: LanguageContribution;
}

interface RegisteredBase {
  readonly pluginId: string;
  readonly contribution: BaseLanguageContribution;
}

interface RegisteredExtension {
  readonly pluginId: string;
  readonly contribution: LanguageExtensionContribution;
}

export namespace LanguageRegistry {
  export interface Service {
    readonly register: (
      pluginId: string,
      contribution: LanguageContribution,
    ) => Effect.Effect<void, LanguageRegistrationError | LanguageConflictError, Scope.Scope>;
    readonly resolve: (locale: string) => Effect.Effect<CompiledLanguage, UnsupportedLocaleError>;
  }
}

export class LanguageRegistry extends Context.Service<LanguageRegistry, LanguageRegistry.Service>()(
  "chronolizer/LanguageRegistry",
) {}

const metadataOf = (contribution: LanguageContribution) =>
  Match.valueTags(contribution, {
    BaseLanguage: (base) =>
      BaseLanguageMetadata.make({
        locale: base.locale,
        vocabulary: base.vocabulary,
      }),
    LanguageExtension: (extension) =>
      LanguageExtensionMetadata.make({
        locale: extension.locale,
        priority: extension.priority,
        vocabulary: extension.vocabulary,
      }),
  });

const localeCandidates = (locale: string) => {
  const candidates = [locale];
  let parent = locale;
  while (parent.includes("-")) {
    parent = parent.slice(0, parent.lastIndexOf("-"));
    candidates.push(parent);
  }
  return candidates;
};

const compileLanguage = (locale: string, registered: ReadonlyArray<RegisteredContribution>) => {
  const locales = localeCandidates(locale);
  const bases = EffectArray.sort(
    EffectArray.filterMap<RegisteredContribution, RegisteredBase, void>(registered, (entry) => {
      const contribution = entry.contribution;
      return contribution._tag === "BaseLanguage" && locales.includes(contribution.locale)
        ? Result.succeed({ pluginId: entry.pluginId, contribution })
        : Result.failVoid;
    }),
    Order.mapInput(Order.Number, (entry: RegisteredBase) =>
      locales.indexOf(entry.contribution.locale),
    ),
  );
  const base = bases[0];
  if (base === undefined) return Option.none<CompiledLanguage>();

  const extensions = EffectArray.sort(
    EffectArray.filterMap<RegisteredContribution, RegisteredExtension, void>(
      registered,
      (entry) => {
        const contribution = entry.contribution;
        return contribution._tag === "LanguageExtension" && locales.includes(contribution.locale)
          ? Result.succeed({ pluginId: entry.pluginId, contribution })
          : Result.failVoid;
      },
    ),
    Order.combine(
      Order.mapInput(
        Order.flip(Order.Number),
        (entry: RegisteredExtension) => entry.contribution.priority,
      ),
      Order.mapInput(Order.String, (entry: RegisteredExtension) => entry.pluginId),
    ),
  );

  const vocabulary = Object.freeze(
    EffectArray.dedupe([
      ...base.contribution.vocabulary,
      ...EffectArray.flatMap(extensions, (entry) => entry.contribution.vocabulary),
    ]),
  );
  const parsers = Object.freeze([
    ...extensions.map((entry) => entry.contribution.parseExact),
    base.contribution.parseExact,
  ]);
  const parseExact = (input: string) => {
    const candidates: Array<NaturalCandidate> = [];
    for (const parser of parsers) {
      const candidate = parser(input);
      if (Option.isSome(candidate)) candidates.push(candidate.value);
    }
    return candidates;
  };

  return Option.some<CompiledLanguage>(
    Object.freeze({
      locale: base.contribution.locale,
      vocabulary,
      normalize: base.contribution.normalize ?? normalizeNaturalText,
      correct: base.contribution.correct,
      parseExact,
      render: base.contribution.render,
    }),
  );
};

const createRegistry = Effect.fn(function* () {
  const entries = yield* Ref.make<ReadonlyArray<RegisteredContribution>>([]);

  const register: LanguageRegistry.Service["register"] = Effect.fn(function* (
    pluginId: string,
    contribution: LanguageContribution,
  ) {
    if (
      pluginId.length === 0 ||
      !Schema.is(LanguageContributionMetadata)(metadataOf(contribution))
    ) {
      return yield* new LanguageRegistrationError({
        pluginId,
        locale: contribution.locale,
        message: "Invalid plugin identifier or contribution metadata",
      });
    }

    const token = Symbol(pluginId);
    yield* Effect.acquireRelease(
      Ref.modify<
        ReadonlyArray<RegisteredContribution>,
        Result.Result<symbol, LanguageConflictError>
      >(entries, (current) => {
        const conflictingBase = EffectArray.findFirst(
          current,
          (entry) =>
            contribution._tag === "BaseLanguage" &&
            entry.contribution._tag === "BaseLanguage" &&
            entry.contribution.locale === contribution.locale,
        );
        return Option.match(conflictingBase, {
          onNone: () =>
            [
              Result.succeed(token),
              EffectArray.append(current, { token, pluginId, contribution }),
            ] as const,
          onSome: (conflict) =>
            [
              Result.fail(
                new LanguageConflictError({
                  locale: contribution.locale,
                  firstPluginId: conflict.pluginId,
                  secondPluginId: pluginId,
                  message: "Only one base language can be registered for a locale",
                }),
              ),
              current,
            ] as const,
        });
      }).pipe(Effect.flatMap((result) => Effect.fromResult(result))),
      (registeredToken) =>
        Ref.update(entries, (items) =>
          EffectArray.filter(items, (entry) => entry.token !== registeredToken),
        ),
    );
  });

  const resolve: LanguageRegistry.Service["resolve"] = Effect.fn(function* (locale: string) {
    const canonical = canonicalBaseLocale(locale);
    if (Option.isSome(canonical)) {
      const compiled = compileLanguage(canonical.value, yield* Ref.get(entries));
      if (Option.isSome(compiled)) return compiled.value;
    }
    return yield* new UnsupportedLocaleError({ locale });
  });

  return LanguageRegistry.of({ register, resolve });
});

export const LanguageRegistryLayer = Layer.effect(LanguageRegistry, createRegistry());

const duplicatePluginId = (plugins: ReadonlyArray<LanguagePlugin>) => {
  const ids = new Set<string>();
  for (const plugin of plugins) {
    if (ids.has(plugin.id)) return plugin.id;
    ids.add(plugin.id);
  }
  return undefined;
};

const createPluginRegistry = Effect.fn(function* (plugins: ReadonlyArray<LanguagePlugin>) {
  const duplicate = duplicatePluginId(plugins);
  if (duplicate !== undefined) {
    return yield* new LanguageRegistrationError({
      pluginId: duplicate,
      locale: "*",
      message: "Plugin identifiers must be unique",
    });
  }
  const registry = yield* createRegistry();
  const context: LanguagePluginContext = { register: registry.register };
  const ordered = EffectArray.sortWith(plugins, (plugin) => plugin.id, Order.String);
  for (const plugin of ordered) {
    yield* plugin.effect(context);
  }
  return registry;
});

export const languagePluginsLayer = (plugins: ReadonlyArray<LanguagePlugin>) =>
  Layer.effect(LanguageRegistry, createPluginRegistry(plugins));

export const defineLanguagePlugin = (plugin: LanguagePlugin) => plugin;
