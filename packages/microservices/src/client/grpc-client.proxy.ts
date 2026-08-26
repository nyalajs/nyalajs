import * as path from "path";
import { ClientProxy } from "./client-proxy";
import { outgoingTrace } from "../context/trace-propagation";

export interface GrpcClientOptions {
    port: number;
    host?: string;
    protoPath?: string;
    package?: string;
    service?: string;
    credentials?: any;
}

const DEFAULT_PROTO_PATH = path.join(__dirname, "..", "transports", "grpc", "nyala-rpc.proto");
const DEFAULT_PACKAGE = "nyala";
const DEFAULT_SERVICE = "NyalaRpcService";
const DEFAULT_TIMEOUT_MS = 10_000;

/** Client-side counterpart to GrpcTransporter. See grpc.transporter.ts for the wire contract. */
export class GrpcClientProxy extends ClientProxy {
    private client?: any;

    constructor(private readonly options: GrpcClientOptions) {
        super();
    }

    async connect(): Promise<void> {
        if (this.client) return;

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

        const segments = packageName.split(".");
        let node = proto;
        for (const segment of segments) {
            node = node?.[segment];
        }
        const ServiceCtor = node?.[serviceName];
        if (!ServiceCtor) {
            throw new Error(`gRPC service "${packageName}.${serviceName}" not found in loaded proto definition`);
        }

        const address = `${this.options.host ?? "127.0.0.1"}:${this.options.port}`;
        const credentials = this.options.credentials ?? grpc.credentials.createInsecure();
        this.client = new ServiceCtor(address, credentials);

        await new Promise<void>((resolve, reject) => {
            const deadline = Date.now() + 10_000;
            grpc.waitForClientReady(this.client, deadline, (err: Error | undefined) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async close(): Promise<void> {
        this.client?.close();
        this.client = undefined;
    }

    async isHealthy(): Promise<boolean> {
        if (!this.client) return false;
        try {
            const grpc = this.loadGrpc();
            const state = this.client.getChannel().getConnectivityState(false);
            return state === grpc.connectivityState.READY || state === grpc.connectivityState.IDLE;
        } catch {
            return false;
        }
    }

    async send<TResult = any, TPayload = any>(
        pattern: string,
        payload: TPayload,
        timeoutMs = DEFAULT_TIMEOUT_MS
    ): Promise<TResult> {
        await this.connect();

        const trace = outgoingTrace();
        const request = {
            pattern,
            payload: JSON.stringify(payload ?? null),
            traceId: trace.traceId,
            requestId: trace.requestId,
            tenantId: trace.tenantId ?? "",
        };

        return new Promise<TResult>((resolve, reject) => {
            const deadline = new Date(Date.now() + timeoutMs);
            this.client.Call(request, { deadline }, (err: Error | null, response: any) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (response.hasError) {
                    const error = new Error(response.errorMessage);
                    error.name = response.errorName || "Error";
                    reject(error);
                    return;
                }
                resolve(response.payload ? JSON.parse(response.payload) : undefined);
            });
        });
    }

    async emit<TPayload = any>(pattern: string, payload: TPayload): Promise<void> {
        await this.connect();

        const trace = outgoingTrace();
        const request = {
            pattern,
            payload: JSON.stringify(payload ?? null),
            traceId: trace.traceId,
            requestId: trace.requestId,
            tenantId: trace.tenantId ?? "",
        };

        return new Promise<void>((resolve, reject) => {
            this.client.Emit(request, (err: Error | null) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    private loadGrpc(): any {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require("@grpc/grpc-js");
        } catch {
            throw new Error(
                'GrpcClientProxy requires the optional "@grpc/grpc-js" peer dependency. Install it with: npm install @grpc/grpc-js @grpc/proto-loader'
            );
        }
    }

    private loadProtoLoader(): any {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require("@grpc/proto-loader");
        } catch {
            throw new Error(
                'GrpcClientProxy requires the optional "@grpc/proto-loader" peer dependency. Install it with: npm install @grpc/grpc-js @grpc/proto-loader'
            );
        }
    }
}
