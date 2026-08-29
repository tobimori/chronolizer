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
import { canonicalBaseLocale, LanguageContributionMetadata } from "./model.ts";
import { normalizeNaturalText } from "../natural/text.ts";
import type {
  BaseLanguageContribution,
  CompiledLanguage,
  LanguageContribution,
  LanguageExtensionContribution,
  LanguagePlugin,
  LanguagePluginContext,
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

interface RegistryState {
  readonly entries: ReadonlyArray<RegisteredContribution>;
  readonly compiledLanguages: ReadonlyMap<string, CompiledLanguage>;
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
    EffectArray.filterMap<RegisteredContribution, RegisteredBase, void>(registered, (entry) =>
      Match.valueTags(entry.contribution, {
        BaseLanguage: (contribution) =>
          locales.includes(contribution.locale)
            ? Result.succeed({ pluginId: entry.pluginId, contribution })
            : Result.failVoid,
        LanguageExtension: () => Result.failVoid,
      }),
    ),
    Order.mapInput(Order.Number, (entry: RegisteredBase) =>
      locales.indexOf(entry.contribution.locale),
    ),
  );
  const base = bases[0];
  if (base === undefined) return Option.none<CompiledLanguage>();

  const extensions = EffectArray.sort(
    EffectArray.filterMap<RegisteredContribution, RegisteredExtension, void>(registered, (entry) =>
      Match.valueTags(entry.contribution, {
        BaseLanguage: () => Result.failVoid,
        LanguageExtension: (contribution) =>
          locales.includes(contribution.locale)
            ? Result.succeed({ pluginId: entry.pluginId, contribution })
            : Result.failVoid,
      }),
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
  const suggesters = Object.freeze(
    [...extensions.map((entry) => entry.contribution.suggest), base.contribution.suggest].filter(
      (suggest) => suggest !== undefined,
    ),
  );
  const parseExact = (input: string) =>
    EffectArray.flatMap(parsers, (parser) => Option.toArray(parser(input)));

  return Option.some<CompiledLanguage>(
    Object.freeze({
      locale: base.contribution.locale,
      vocabulary,
      normalize: base.contribution.normalize ?? normalizeNaturalText,
      correct: base.contribution.correct,
      parseExact,
      suggest: (input: string, limit: number) =>
        EffectArray.flatMap(suggesters, (suggest) => suggest(input, limit)),
      render: base.contribution.render,
    }),
  );
};

const createRegistry = Effect.fn(function* () {
  const state = yield* Ref.make<RegistryState>({ entries: [], compiledLanguages: new Map() });

  const register: LanguageRegistry.Service["register"] = Effect.fn(function* (
    pluginId: string,
    contribution: LanguageContribution,
  ) {
    if (pluginId.length === 0 || !Schema.is(LanguageContributionMetadata)(contribution)) {
      return yield* new LanguageRegistrationError({
        pluginId,
        locale: contribution.locale,
        message: "The plugin name or language settings are invalid",
      });
    }

    const token = Symbol(pluginId);
    yield* Effect.acquireRelease(
      Ref.modify<RegistryState, Result.Result<symbol, LanguageConflictError>>(state, (current) => {
        const conflictingBase = Match.valueTags(contribution, {
          BaseLanguage: (base) =>
            EffectArray.findFirst(current.entries, (entry) =>
              Match.valueTags(entry.contribution, {
                BaseLanguage: (registeredBase) => registeredBase.locale === base.locale,
                LanguageExtension: () => false,
              }),
            ),
          LanguageExtension: () => Option.none<RegisteredContribution>(),
        });
        return Option.match(conflictingBase, {
          onNone: () =>
            [
              Result.succeed(token),
              {
                entries: EffectArray.append(current.entries, { token, pluginId, contribution }),
                compiledLanguages: new Map(),
              },
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
        Ref.update(state, (current) => ({
          entries: EffectArray.filter(current.entries, (entry) => entry.token !== registeredToken),
          compiledLanguages: new Map(),
        })),
    );
  });

  const resolve: LanguageRegistry.Service["resolve"] = Effect.fn(function* (locale: string) {
    const canonical = canonicalBaseLocale(locale);
    if (Option.isSome(canonical)) {
      const compiled = yield* Ref.modify(state, (current) => {
        const cached = current.compiledLanguages.get(canonical.value);
        if (cached !== undefined) return [Option.some(cached), current] as const;

        const language = compileLanguage(canonical.value, current.entries);
        if (Option.isNone(language)) return [language, current] as const;
        const cache = new Map(current.compiledLanguages);
        cache.set(canonical.value, language.value);
        return [language, { entries: current.entries, compiledLanguages: cache }] as const;
      });
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
      message: "Plugin names must be unique",
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
