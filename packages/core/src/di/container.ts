import "reflect-metadata";
import { Type, Token } from "../types/common";
import { ProviderDefinition, ProviderRecord, Scope } from "../types/provider";
import { NYALA_INJECT_TOKENS } from "../constants/metadata-keys";

export class Container {
    private readonly providers = new Map<Token, ProviderRecord>();

    constructor(
        private readonly parent?: Container,
        private readonly scopeCache = new Map<Token, any>()
    ) { }

    register(def: ProviderDefinition): void {
        const record = this.normalize(def);

        if (this.providers.has(record.token)) {
            throw new Error(
                `Provider already registered: ${String(record.token)}`
            );
        }

        this.providers.set(record.token, record);
    }

    resolve<T>(token: Token<T>): T {
        return this.resolveInternal(token, []);
    }

    getProviders(): Map<Token, ProviderRecord> {
        return this.providers;
    }

    createRequestScope(): Container {
        return new Container(this);
    }

    private normalize(def: ProviderDefinition): ProviderRecord {
        if (typeof def === "function") {
            return {
                token: def,
                useClass: def,
                scope: Scope.SINGLETON,
            };
        }

        return {
            token: def.provide,
            useClass: def.useClass,
            useValue: def.useValue,
            useFactory: def.useFactory,
            useExisting: def.useExisting,
            inject: def.inject ?? [],
            scope: def.scope ?? Scope.SINGLETON,
        };
    }

    private resolveInternal<T>(token: Token<T>, stack: Token[]): T {
        if (stack.includes(token)) {
            throw new Error(
                `Circular provider dependency: ${[
                    ...stack.map(String),
                    String(token),
                ].join(" -> ")}`
            );
        }

        const owner = this.findOwner(token);

        if (!owner) {
            throw new Error(`Provider not found: ${String(token)}`);
        }

        const { container: ownerContainer, record } = owner;

        // SINGLETON: one instance per app, cached on the container that
        // actually registered the provider — so every request-scope child
        // resolving the same token shares it instead of rebuilding it.
        if (record.scope === Scope.SINGLETON) {
            const cached = ownerContainer.scopeCache.get(token);
            if (cached) {
                return cached;
            }

            const instance = this.instantiate(record, [...stack, token]);
            ownerContainer.scopeCache.set(token, instance);
            return instance;
        }

        // REQUEST: one instance per request-scope container (i.e. per HTTP
        // request), cached on `this` — the container the resolution chain
        // for this request entered on.
        if (record.scope === Scope.REQUEST) {
            const cached = this.scopeCache.get(token);
            if (cached) {
                return cached;
            }

            const instance = this.instantiate(record, [...stack, token]);
            this.scopeCache.set(token, instance);
            return instance;
        }

        // TRANSIENT: never cached.
        return this.instantiate(record, [...stack, token]);
    }

    private findOwner(token: Token): { container: Container; record: ProviderRecord } | undefined {
        const record = this.providers.get(token);
        if (record) {
            return { container: this, record };
        }
        return this.parent?.findOwner(token);
    }

    private instantiate(record: ProviderRecord, stack: Token[]): any {
        if (record.useValue !== undefined) {
            return record.useValue;
        }

        if (record.useExisting) {
            return this.resolveInternal(record.useExisting, stack);
        }

        if (record.useFactory) {
            const deps = record.inject!.map((dep) =>
                this.resolveInternal(dep, stack)
            );

            return record.useFactory(...deps);
        }

        if (record.useClass) {
            return this.instantiateClass(record.useClass, stack);
        }

        throw new Error(`Invalid provider: ${String(record.token)}`);
    }

    private instantiateClass(type: Type, stack: Token[]): any {
        const designTypes: Token[] =
            Reflect.getMetadata("design:paramtypes", type) ?? [];

        const injectTokens =
            Reflect.getMetadata(NYALA_INJECT_TOKENS, type) ?? {};

        const deps = designTypes.map((dep: Token, index: number) =>
            this.resolveInternal(injectTokens[index] ?? dep, stack)
        );

        return new type(...deps);
    }
}
