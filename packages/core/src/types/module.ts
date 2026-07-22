import { Type } from "./common";
import { ProviderDefinition } from "./provider";

export interface ModuleMetadata {
    imports?: Type[];
    providers?: ProviderDefinition[];
    controllers?: Type[];
    exports?: (Type | string | symbol)[];
}

export interface ModuleNode {
    id: string;
    type: Type;
    metadata: ModuleMetadata;
    imports: ModuleNode[];
    providers: Map<any, ProviderDefinition>;
    exports: Set<any>;
}
