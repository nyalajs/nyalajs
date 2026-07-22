export type Type<T = any> = new (...args: any[]) => T;
export type Token<T = any> = Type<T> | string | symbol;
export type Abstract<T = any> = abstract new (...args: any[]) => T;
