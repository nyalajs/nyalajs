import { Container, Module, ModuleMetadata, Type, NyalaApplication, NyalaFactory } from "@nyala/core";
import { FastifyAdapter } from "@nyala/http";

export class TestingModuleBuilder {
    private readonly metadata: ModuleMetadata;

    constructor(metadata: ModuleMetadata) {
        this.metadata = {
            imports: metadata.imports ?? [],
            providers: metadata.providers ?? [],
            controllers: metadata.controllers ?? [],
        };
    }

    /**
     * Override a provider in the testing module.
     * Use this to swap real services with mocks.
     */
    overrideProvider(token: any, useValue: any): this {
        const index = this.metadata.providers!.findIndex((p) =>
            typeof p === "function" ? p === token : p.provide === token
        );

        if (index >= 0) {
            this.metadata.providers![index] = { provide: token, useValue };
        } else {
            this.metadata.providers!.push({ provide: token, useValue });
        }

        return this;
    }

    /**
     * Compile the module and return a TestingModule instance.
     */
    async compile(): Promise<TestingModule> {
        @Module(this.metadata)
        class RootTestModule {}

        const app = await NyalaFactory.create(RootTestModule);
        app.setHttpAdapter(new FastifyAdapter(app.getKernel().getContainer()));
        
        return new TestingModule(app);
    }
}

export class TestingModule {
    constructor(private readonly app: NyalaApplication) {}

    /** Get a provider or controller from the DI container. */
    get<T>(token: Type<T> | string | symbol): T {
        return this.app.get<T>(token);
    }

    /** Get the underlying NyalaApplication instance. */
    createNyalaApplication(): NyalaApplication {
        return this.app;
    }

    /**
     * Helper to create a TestingModuleBuilder.
     */
    static create(metadata: ModuleMetadata): TestingModuleBuilder {
        return new TestingModuleBuilder(metadata);
    }
}
