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

        const record = this.providers.get(token) ?? this.parent?.getProvider(token);

        if (!record) {
            throw new Error(`Provider not found: ${String(token)}`);
        }

        if (record.scope !== Scope.TRANSIENT) {
            const cached = this.scopeCache.get(token);
            if (cached) {
                return cached;
            }
        }

        const instance = this.instantiate(record, [...stack, token]);

        if (record.scope !== Scope.TRANSIENT) {
            this.scopeCache.set(token, instance);
        }

        return instance;
    }

    private getProvider(token: Token): ProviderRecord | undefined {
        return this.providers.get(token) ?? this.parent?.getProvider(token);
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
