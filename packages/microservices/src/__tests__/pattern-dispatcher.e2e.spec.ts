import "reflect-metadata";
import { describe, it, expect, afterEach } from "vitest";
import { Controller, Injectable, Module, UseGuards, UseInterceptors, UseFilters, Catch } from "@nyalajs/core";
import { MessagePattern } from "../decorators/message-pattern";
import { Payload, Ctx } from "../decorators/payload";
import { MicroserviceFactory } from "../microservice-factory";
import { NyalaMicroserviceApplication } from "../microservice-application";
import { ClientProxyFactory } from "../client/client-proxy.factory";
import { ClientProxy } from "../client/client-proxy";
import { MicroserviceGuard } from "../interfaces/guard.interface";
import { MicroserviceInterceptor } from "../interfaces/interceptor.interface";
import { MicroserviceExceptionFilter } from "../interfaces/exception-filter.interface";
import { MicroserviceExecutionContext } from "../context/microservice-execution-context";

class DomainError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "DomainError";
    }
}

@Injectable()
class AllowGuard implements MicroserviceGuard {
    canActivate(): boolean {
        return true;
    }
}

@Injectable()
class DenyGuard implements MicroserviceGuard {
    canActivate(): boolean {
        return false;
    }
}

const interceptorLog: string[] = [];

@Injectable()
class LoggingInterceptor implements MicroserviceInterceptor {
    async intercept(context: MicroserviceExecutionContext, next: () => Promise<any>) {
        interceptorLog.push(`before:${context.ctx.pattern}`);
        const result = await next();
        interceptorLog.push(`after:${context.ctx.pattern}`);
        return result;
    }
}

@Injectable()
@Catch(DomainError)
class DomainErrorFilter implements MicroserviceExceptionFilter<DomainError> {
    catch(error: DomainError) {
        return { handledByFilter: true, message: error.message };
    }
}

@Controller()
@UseGuards(AllowGuard)
class SecuredController {
    @MessagePattern("secured.allowed")
    allowed(@Payload() msg: string) {
        return `ok:${msg}`;
    }

    @MessagePattern("secured.denied")
    @UseGuards(DenyGuard)
    denied() {
        return "should never run";
    }

    @MessagePattern("secured.intercepted")
    @UseInterceptors(LoggingInterceptor)
    intercepted(@Payload() msg: string) {
        return `intercepted:${msg}`;
    }

    @MessagePattern("secured.throws")
    @UseFilters(DomainErrorFilter)
    throws() {
        throw new DomainError("domain broke");
    }

    @MessagePattern("secured.ctx")
    withContext(@Payload() msg: string, @Ctx() ctx: any) {
        return { msg, pattern: ctx.pattern, transport: ctx.transport };
    }
}

@Module({
    providers: [AllowGuard, DenyGuard, LoggingInterceptor, DomainErrorFilter],
    controllers: [SecuredController],
})
class AppModule {}

function getFreePort(): number {
    return 49000 + Math.floor(Math.random() * 5000);
}

describe("Message pattern guards/interceptors/filters", () => {
    let app: NyalaMicroserviceApplication | undefined;
    let client: ClientProxy | undefined;

    afterEach(async () => {
        await client?.close();
        await app?.close();
        app = undefined;
        client = undefined;
        interceptorLog.length = 0;
    });

    it("allows a call through when the guard returns true", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();
        client = ClientProxyFactory.create({ transport: "tcp", options: { port } });

        const result = await client.send<string>("secured.allowed", "hi");
        expect(result).toBe("ok:hi");
    });

    it("rejects a call when the guard returns false", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();
        client = ClientProxyFactory.create({ transport: "tcp", options: { port } });

        await expect(client.send("secured.denied", {})).rejects.toThrow(/Access denied/);
    });

    it("runs interceptors around the handler in order", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();
        client = ClientProxyFactory.create({ transport: "tcp", options: { port } });

        const result = await client.send<string>("secured.intercepted", "hi");

        expect(result).toBe("intercepted:hi");
        expect(interceptorLog).toEqual(["before:secured.intercepted", "after:secured.intercepted"]);
    });

    it("routes a matching thrown error through @UseFilters()/@Catch() instead of the default error reply", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();
        client = ClientProxyFactory.create({ transport: "tcp", options: { port } });

        const result = await client.send<any>("secured.throws", {});
        expect(result).toEqual({ handledByFilter: true, message: "domain broke" });
    });

    it("injects MicroserviceContext via @Ctx()", async () => {
        const port = getFreePort();
        app = await MicroserviceFactory.create(AppModule, { transport: "tcp", options: { port } });
        await app.listen();
        client = ClientProxyFactory.create({ transport: "tcp", options: { port } });

        const result = await client.send<any>("secured.ctx", "hi");
        expect(result).toEqual({ msg: "hi", pattern: "secured.ctx", transport: "tcp" });
    });
});
