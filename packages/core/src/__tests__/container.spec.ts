import { describe, it, expect } from "vitest";
import { Container, Injectable, Scope } from "../index";

@Injectable()
class ConfigService {
    getName() { return "ConfigService"; }
}

@Injectable()
class DatabaseService {
    constructor(public config: ConfigService) {}
}
Reflect.defineMetadata("design:paramtypes", [ConfigService], DatabaseService);

@Injectable()
class TransientService {
    id = Math.random();
}

@Injectable()
class RequestScopedService {
    id = Math.random();
}

describe("DI Container", () => {
    it("resolves a simple singleton provider", () => {
        const container = new Container();
        container.register({ provide: ConfigService, useClass: ConfigService });

        const config1 = container.resolve(ConfigService);
        const config2 = container.resolve(ConfigService);

        expect(config1).toBeInstanceOf(ConfigService);
        expect(config1).toBe(config2); // Should be singleton by default
    });

    it("resolves dependencies recursively", () => {
        const container = new Container();
        container.register({ provide: ConfigService, useClass: ConfigService });
        container.register({ provide: DatabaseService, useClass: DatabaseService });

        const db = container.resolve(DatabaseService);
        expect(db).toBeInstanceOf(DatabaseService);
        expect(db.config).toBeInstanceOf(ConfigService);
    });

    it("resolves transient providers with new instances each time", () => {
        const container = new Container();
        container.register({ provide: TransientService, useClass: TransientService, scope: Scope.TRANSIENT });

        const svc1 = container.resolve(TransientService);
        const svc2 = container.resolve(TransientService);

        expect(svc1).toBeInstanceOf(TransientService);
        expect(svc2).toBeInstanceOf(TransientService);
        expect(svc1).not.toBe(svc2);
    });

    it("shares a singleton across separate request-scope child containers", () => {
        const root = new Container();
        root.register({ provide: ConfigService, useClass: ConfigService });

        const request1 = root.createRequestScope();
        const request2 = root.createRequestScope();

        const config1 = request1.resolve(ConfigService);
        const config2 = request2.resolve(ConfigService);

        expect(config1).toBe(config2);
        expect(config1).toBe(root.resolve(ConfigService));
    });

    it("gives request-scoped providers one instance per request container, not per app", () => {
        const root = new Container();
        root.register({ provide: RequestScopedService, useClass: RequestScopedService, scope: Scope.REQUEST });

        const request1 = root.createRequestScope();
        const request2 = root.createRequestScope();

        const a1 = request1.resolve(RequestScopedService);
        const a2 = request1.resolve(RequestScopedService);
        const b1 = request2.resolve(RequestScopedService);

        expect(a1).toBe(a2); // same request -> same instance
        expect(a1).not.toBe(b1); // different request -> different instance
    });
});
