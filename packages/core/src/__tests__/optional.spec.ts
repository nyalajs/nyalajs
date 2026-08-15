import { describe, it, expect } from "vitest";
import { Container, Injectable, Optional } from "../index";

@Injectable()
class ConfigService {
    getName() { return "ConfigService"; }
}

@Injectable()
class MetricsCollector {
    record() { return "recorded"; }
}

@Injectable()
class ServiceWithOptionalDep {
    constructor(
        public config: ConfigService,
        public metrics?: MetricsCollector
    ) { }
}
Reflect.defineMetadata("design:paramtypes", [ConfigService, MetricsCollector], ServiceWithOptionalDep);
// Applying the real decorator function to the real class, same as TypeScript's
// own emitted decorator call would — proves @Optional() itself works, not
// just the Container-side handling of hand-written metadata.
Optional()(ServiceWithOptionalDep, undefined, 1);

@Injectable()
class ServiceWithoutOptionalDep {
    constructor(
        public config: ConfigService,
        public metrics: MetricsCollector
    ) { }
}
Reflect.defineMetadata("design:paramtypes", [ConfigService, MetricsCollector], ServiceWithoutOptionalDep);

describe("@Optional()", () => {
    it("resolves an unregistered @Optional() dependency to undefined instead of throwing", () => {
        const container = new Container();
        container.register({ provide: ConfigService, useClass: ConfigService });
        container.register({ provide: ServiceWithOptionalDep, useClass: ServiceWithOptionalDep });
        // MetricsCollector deliberately never registered.

        const instance = container.resolve(ServiceWithOptionalDep);

        expect(instance.config).toBeInstanceOf(ConfigService);
        expect(instance.metrics).toBeUndefined();
    });

    it("still resolves an @Optional() dependency normally when it IS registered", () => {
        const container = new Container();
        container.register({ provide: ConfigService, useClass: ConfigService });
        container.register({ provide: MetricsCollector, useClass: MetricsCollector });
        container.register({ provide: ServiceWithOptionalDep, useClass: ServiceWithOptionalDep });

        const instance = container.resolve(ServiceWithOptionalDep);

        expect(instance.metrics).toBeInstanceOf(MetricsCollector);
    });

    it("a non-@Optional() dependency still throws when unregistered (no behavior change for existing code)", () => {
        const container = new Container();
        container.register({ provide: ConfigService, useClass: ConfigService });
        container.register({ provide: ServiceWithoutOptionalDep, useClass: ServiceWithoutOptionalDep });
        // MetricsCollector never registered, and this constructor has no @Optional().

        expect(() => container.resolve(ServiceWithoutOptionalDep)).toThrow(/Provider not found/);
    });

    it("a real failure resolving an @Optional() dependency (not just 'not found') still propagates", () => {
        const container = new Container();
        container.register({ provide: ConfigService, useClass: ConfigService });
        container.register({
            provide: MetricsCollector,
            useFactory: () => {
                throw new Error("boom: factory blew up");
            },
        });
        container.register({ provide: ServiceWithOptionalDep, useClass: ServiceWithOptionalDep });

        expect(() => container.resolve(ServiceWithOptionalDep)).toThrow("boom: factory blew up");
    });
});
