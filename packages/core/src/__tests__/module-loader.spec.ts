import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Controller, Get, Module } from "../index";
import { MetadataScanner } from "../metadata/metadata-scanner";
import { ModuleGraph } from "../module/module-graph";
import { ModuleLoader } from "../module/module-loader";

@Controller("/things")
class ThingsController {
    @Get()
    list() {}
}

@Module({ controllers: [ThingsController] })
class ThingsModule {}

describe("ModuleLoader", () => {
    it("registers controllers in the module graph so they're resolvable through the container", () => {
        const scanner = new MetadataScanner();
        const graph = new ModuleGraph();
        const loader = new ModuleLoader(scanner, graph);

        loader.load(ThingsModule);

        const node = graph.get(ThingsModule);
        expect(node?.providers.has(ThingsController)).toBe(true);
    });
});
