import { Type, Token } from "../types/common";
import { ModuleNode } from "../types/module";
import { ProviderDefinition } from "../types/provider";
import { MetadataScanner } from "../metadata/metadata-scanner";
import { ModuleGraph } from "./module-graph";

export class ModuleLoader {
  constructor(
    private readonly metadataScanner: MetadataScanner,
    private readonly graph: ModuleGraph
  ) {}

  load(rootModule: Type): void {
    this.visit(rootModule, []);
  }

  private visit(moduleType: Type, stack: Type[]): void {
    if (stack.includes(moduleType)) {
      throw new Error(
        `Circular module dependency detected: ${[
          ...stack.map((m) => m.name),
          moduleType.name,
        ].join(" -> ")}`
      );
    }

    if (this.graph.has(moduleType)) {
      return;
    }

    const metadata = this.metadataScanner.getModuleMetadata(moduleType);

    if (!metadata) {
      throw new Error(`${moduleType.name} is not a valid module`);
    }

    const node: ModuleNode = {
      id: moduleType.name,
      type: moduleType,
      metadata,
      imports: [],
      providers: new Map(),
      exports: new Set(metadata.exports ?? []),
    };

    this.graph.add(node);

    const nextStack = [...stack, moduleType];

    for (const importedModule of metadata.imports ?? []) {
      this.visit(importedModule, nextStack);

      const importedNode = this.graph.get(importedModule)!;
      node.imports.push(importedNode);
    }

    this.registerProviders(node);
    this.validateExports(node);
  }

  private registerProviders(node: ModuleNode): void {
    for (const provider of node.metadata.providers ?? []) {
      const token = this.getProviderToken(provider);

      if (node.providers.has(token)) {
        throw new Error(
          `Duplicate provider "${String(token)}" in module "${node.id}"`
        );
      }

      node.providers.set(token, provider);
    }
  }

  private validateExports(node: ModuleNode): void {
    for (const exportToken of node.exports) {
      if (!node.providers.has(exportToken)) {
        throw new Error(
          `Module "${node.id}" exports "${String(exportToken)}" but does not provide it`
        );
      }
    }
  }

  private getProviderToken(provider: ProviderDefinition): Token {
    if (typeof provider === "function") {
      return provider;
    }

    return provider.provide;
  }
}
