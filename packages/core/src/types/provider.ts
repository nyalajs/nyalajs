import { Type, Token } from "./common";

export enum Scope {
    SINGLETON = "singleton",
    REQUEST = "request",
    TRANSIENT = "transient",
}

export type ProviderDefinition =
    | Type
    | {
        provide: Token;
        useClass?: Type;
        useValue?: any;
        useFactory?: (...args: any[]) => any;
        useExisting?: Token;
        inject?: Token[];
        scope?: Scope;
    };

export interface ProviderRecord {
    token: Token;
    scope: Scope;
    useClass?: Type;
    useValue?: any;
    useFactory?: (...args: any[]) => any;
    useExisting?: Token;
    inject?: Token[];
    instance?: any;
}
