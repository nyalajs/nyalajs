import * as path from "path";
import { Transporter, MessageHandler, EventHandler, IncomingCall } from "../transporter.interface";

export interface GrpcTransporterOptions {
    port: number;
    host?: string;
    /**
     * Path to a .proto file. Defaults to the framework's own generic
     * nyala-rpc.proto (a single "Call"/"Emit" RPC keyed by pattern) — pass
     * your own to interop with an existing service contract or a non-Nyala
     * gRPC client, as long as it exposes the same Request/Reply/Empty shape
     * (see nyala-rpc.proto's header comment).
     */
    protoPath?: string;
    package?: string;
    service?: string;
    /** TLS credentials. Defaults to insecure (plaintext) — fine on a private network/service mesh, not for a public endpoint. */
    credentials?: any;
}

const DEFAULT_PROTO_PATH = path.join(__dirname, "nyala-rpc.proto");
const DEFAULT_PACKAGE = "nyala";
const DEFAULT_SERVICE = "NyalaRpcService";

/**
 * Server-side gRPC transport. Unlike TCP/Redis, gRPC is schema-first: the
 * wire contract is the .proto file, not something this transport invents
 * per call. By default it loads the framework's own generic proto (see
 * nyala-rpc.proto) so any @MessagePattern/@EventPattern controller works
 * unchanged — the pattern name selects the handler, exactly like the other
 * transports, while the payload travels as a JSON string inside the
 * protobuf message. Pass a custom protoPath/package/service to expose a
 * real typed contract to non-Nyala gRPC clients instead.
 */
export class GrpcTransporter implements Transporter {
    private server?: any;
    private readonly messageHandlers = new Map<string, MessageHandler>();
    private readonly eventHandlers = new Map<string, EventHandler>();
    private inFlight = 0;
    private closing = false;
    private boundPort?: number;

    constructor(private readonly options: GrpcTransporterOptions) {}

    addMessageHandler(pattern: string, handler: MessageHandler): void {
        this.messageHandlers.set(pattern, handler);
    }

    addEventHandler(pattern: string, handler: EventHandler): void {
        this.eventHandlers.set(pattern, handler);
    }

    async listen(): Promise<void> {
        const grpc = this.loadGrpc();
        const protoLoader = this.loadProtoLoader();

        const packageDef = protoLoader.loadSync(this.options.protoPath ?? DEFAULT_PROTO_PATH, {
            keepCase: false,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true,
        });
        const proto = grpc.loadPackageDefinition(packageDef);
        const packageName = this.options.package ?? DEFAULT_PACKAGE;
        const serviceName = this.options.service ?? DEFAULT_SERVICE;
        const serviceDef = this.resolveServiceDefinition(proto, packageName, serviceName);

        this.server = new grpc.Server();
        this.server.addService(serviceDef.service, {
            Call: (call: any, callback: any) => this.handleCall(call, callback),
            Emit: (call: any, callback: any) => this.handleEmit(call, callback),
        });

        const address = `${this.options.host ?? "0.0.0.0"}:${this.options.port}`;
        const credentials = this.options.credentials ?? grpc.ServerCredentials.createInsecure();

        this.boundPort = await new Promise<number>((resolve, reject) => {
            this.server.bindAsync(address, credentials, (err: Error | null, port: number) => {
                if (err) reject(err);
                else resolve(port);
            });
        });
    }

    async isHealthy(): Promise<boolean> {
        return !!this.server && !this.closing && this.boundPort !== undefined;
    }

    /**
     * grpc-js has no built-in "stop accepting new calls but finish in-flight
     * ones" primitive on tryShutdown — tryShutdown itself already waits for
     * in-flight calls, so this defers to it directly (unlike TCP/Redis,
     * which need a manual drain loop). forceShutdown() is the fallback if
     * tryShutdown hangs past drainTimeoutMs.
     */
    async close(): Promise<void> {
        if (!this.server) return;
        this.closing = true;

        const drainTimeoutMs = 10_000;
        const server = this.server;

        await Promise.race([
            new Promise<void>((resolve) => server.tryShutdown(() => resolve())),
            new Promise<void>((resolve) =>
                setTimeout(() => {
                    server.forceShutdown();
                    resolve();
                }, drainTimeoutMs)
            ),
        ]);
    }

    private resolveServiceDefinition(proto: any, packageName: string, serviceName: string): any {
        const segments = packageName.split(".");
        let node = proto;
        for (const segment of segments) {
            node = node?.[segment];
        }
        const serviceCtor = node?.[serviceName];
        if (!serviceCtor) {
            throw new Error(
                `gRPC service "${packageName}.${serviceName}" not found in loaded proto definition`
            );
        }
        return serviceCtor;
    }

    private async handleCall(call: any, callback: any): Promise<void> {
        const request = call.request;
        const handler = this.messageHandlers.get(request.pattern);

        if (!handler) {
            callback(null, {
                payload: "",
                errorMessage: `No @MessagePattern handler registered for "${request.pattern}"`,
                errorName: "Error",
                hasError: true,
            });
            return;
        }

        const incomingCall: IncomingCall = {
            payload: request.payload ? JSON.parse(request.payload) : undefined,
            trace: {
                requestId: request.requestId || request.pattern,
                traceId: request.traceId || request.requestId || request.pattern,
                tenantId: request.tenantId || undefined,
            },
        };

        this.inFlight++;
        try {
            const result = await handler(incomingCall);
            callback(null, {
                payload: JSON.stringify(result ?? null),
                errorMessage: "",
                errorName: "",
                hasError: false,
            });
        } catch (error) {
            callback(null, {
                payload: "",
                errorMessage: (error as Error).message,
                errorName: (error as Error).name,
                hasError: true,
            });
        } finally {
            this.inFlight--;
        }
    }

    private async handleEmit(call: any, callback: any): Promise<void> {
        const request = call.request;
        const handler = this.eventHandlers.get(request.pattern);

        callback(null, {});

        if (!handler) return;

        const incomingCall: IncomingCall = {
            payload: request.payload ? JSON.parse(request.payload) : undefined,
            trace: {
                requestId: request.requestId || request.pattern,
                traceId: request.traceId || request.requestId || request.pattern,
                tenantId: request.tenantId || undefined,
            },
        };

        this.inFlight++;
        try {
            await handler(incomingCall);
        } catch (error) {
            console.error(
                JSON.stringify({
                    level: "error",
                    message: "Unhandled @EventPattern handler error",
                    pattern: request.pattern,
                    error: (error as Error).message,
                })
            );
        } finally {
            this.inFlight--;
        }
    }

    private loadGrpc(): any {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require("@grpc/grpc-js");
        } catch {
            throw new Error(
                'GrpcTransporter requires the optional "@grpc/grpc-js" peer dependency. Install it with: npm install @grpc/grpc-js @grpc/proto-loader'
            );
        }
    }

    private loadProtoLoader(): any {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require("@grpc/proto-loader");
        } catch {
            throw new Error(
                'GrpcTransporter requires the optional "@grpc/proto-loader" peer dependency. Install it with: npm install @grpc/grpc-js @grpc/proto-loader'
            );
        }
    }
}
