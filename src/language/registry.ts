import {
  Array as EffectArray,
  Context,
  Effect,
  Layer,
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
  LanguageContributionMetadata,
  LanguageExtensionMetadata,
} from "./model.ts";
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

const metadataOf = (contribution: LanguageContribution) => {
  if (contribution._tag === "BaseLanguage") {
    return BaseLanguageMetadata.make({
      locale: contribution.locale,
      vocabulary: contribution.vocabulary,
    });
  }
  return LanguageExtensionMetadata.make({
    locale: contribution.locale,
    priority: contribution.priority,
    vocabulary: contribution.vocabulary,
  });
};

const localeCandidates = (locale: string) => {
  const separator = locale.indexOf("-");
  return separator === -1 ? [locale] : [locale, locale.slice(0, separator)];
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

  const vocabulary = Object.freeze([
    ...new Set([
      ...base.contribution.vocabulary,
      ...extensions.flatMap((entry) => entry.contribution.vocabulary),
    ]),
  ]);
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
      parseExact,
      render: base.contribution.render,
    }),
  );
};

const createRegistry = Effect.gen(function* () {
  const entries = yield* Ref.make<ReadonlyArray<RegisteredContribution>>([]);

  const register: LanguageRegistry.Service["register"] = (pluginId, contribution) =>
    Effect.gen(function* () {
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

      const current = yield* Ref.get(entries);
      const conflictingBase = current.find(
        (entry) =>
          contribution._tag === "BaseLanguage" &&
          entry.contribution._tag === "BaseLanguage" &&
          entry.contribution.locale === contribution.locale,
      );
      if (conflictingBase !== undefined) {
        return yield* new LanguageConflictError({
          locale: contribution.locale,
          firstPluginId: conflictingBase.pluginId,
          secondPluginId: pluginId,
          message: "Only one base language can be registered for a locale",
        });
      }

      const token = Symbol(pluginId);
      yield* Ref.update(entries, (items) => [...items, { token, pluginId, contribution }]);
      yield* Effect.addFinalizer(() =>
        Ref.update(entries, (items) => items.filter((entry) => entry.token !== token)),
      );
    });

  const resolve: LanguageRegistry.Service["resolve"] = (locale) =>
    Effect.gen(function* () {
      const compiled = compileLanguage(locale, yield* Ref.get(entries));
      if (Option.isSome(compiled)) return compiled.value;
      return yield* new UnsupportedLocaleError({ locale });
    });

  return LanguageRegistry.of({ register, resolve });
});

export const LanguageRegistryLayer = Layer.effect(LanguageRegistry, createRegistry);

const duplicatePluginId = (plugins: ReadonlyArray<LanguagePlugin>) => {
  const ids = new Set<string>();
  for (const plugin of plugins) {
    if (ids.has(plugin.id)) return plugin.id;
    ids.add(plugin.id);
  }
  return undefined;
};

export const languagePluginsLayer = (plugins: ReadonlyArray<LanguagePlugin>) =>
  Layer.effect(
    LanguageRegistry,
    Effect.gen(function* () {
      const duplicate = duplicatePluginId(plugins);
      if (duplicate !== undefined) {
        return yield* new LanguageRegistrationError({
          pluginId: duplicate,
          locale: "*",
          message: "Plugin identifiers must be unique",
        });
      }
      const registry = yield* createRegistry;
      const context: LanguagePluginContext = { register: registry.register };
      for (const plugin of [...plugins].sort((left, right) => left.id.localeCompare(right.id))) {
        yield* plugin.effect(context);
      }
      return registry;
    }),
  );

export const defineLanguagePlugin = (plugin: LanguagePlugin) => plugin;
