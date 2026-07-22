import { Type } from "../types/common";
import { ModuleNode } from "../types/module";

export class ModuleGraph {
    private readonly modules = new Map<Type, ModuleNode>();

    add(node: ModuleNode): void {
        this.modules.set(node.type, node);
    }

    get(type: Type): ModuleNode | undefined {
        return this.modules.get(type);
    }

    has(type: Type): boolean {
        return this.modules.has(type);
    }

    values(): ModuleNode[] {
        return [...this.modules.values()];
    }
}
