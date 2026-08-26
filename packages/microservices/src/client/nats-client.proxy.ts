import { ClientProxy } from "./client-proxy";
import { outgoingTrace } from "../context/trace-propagation";
import { NatsTransporterOptions } from "../transports/nats/nats.transporter";

const DEFAULT_TIMEOUT_MS = 10_000;

/** Client-side counterpart to NatsTransporter — uses NATS's native request-reply for send(), plain publish for emit(). */
export class NatsClientProxy extends ClientProxy {
    private readonly subjectPrefix: string;
    private connection?: any;
    private codec?: any;

    constructor(private readonly options: NatsTransporterOptions) {
        super();
        this.subjectPrefix = options.subjectPrefix ?? "nyala.rpc";
    }

    async connect(): Promise<void> {
        if (this.connection) return;

        const { connect, StringCodec } = this.loadNats();
        this.codec = StringCodec();
        this.connection = await connect({
            servers: this.options.servers,
            user: this.options.user,
            pass: this.options.pass,
            token: this.options.token,
        });
    }

    async close(): Promise<void> {
        if (!this.connection) return;
        await this.connection.drain();
        this.connection = undefined;
    }

    async isHealthy(): Promise<boolean> {
        return !!this.connection && !this.connection.isClosed();
    }

    async send<TResult = any, TPayload = any>(
        pattern: string,
        payload: TPayload,
        timeoutMs = DEFAULT_TIMEOUT_MS
    ): Promise<TResult> {
        await this.connect();

        const envelope = { payload, trace: outgoingTrace() };
        const reply = await this.connection.request(
            this.subject(pattern),
            this.codec.encode(JSON.stringify(envelope)),
            { timeout: timeoutMs }
        );

        const decoded = JSON.parse(this.codec.decode(reply.data));
        if (decoded.error) {
            const error = new Error(decoded.error.message);
            error.name = decoded.error.name;
            throw error;
        }
        return decoded.payload;
    }

    async emit<TPayload = any>(pattern: string, payload: TPayload): Promise<void> {
        await this.connect();
        const envelope = { payload, trace: outgoingTrace() };
        this.connection.publish(this.subject(pattern), this.codec.encode(JSON.stringify(envelope)));
    }

    private subject(pattern: string): string {
        return `${this.subjectPrefix}.${pattern}`;
    }

    private loadNats(): any {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require("nats");
        } catch {
            throw new Error(
                'NatsClientProxy requires the optional "nats" peer dependency. Install it with: npm install nats'
            );
        }
    }
}
