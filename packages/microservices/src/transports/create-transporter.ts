import { Transporter } from "./transporter.interface";
import { TcpTransporter, TcpTransporterOptions } from "./tcp/tcp.transporter";
import { RedisTransporter, RedisTransporterOptions } from "./redis/redis.transporter";
import { GrpcTransporter, GrpcTransporterOptions } from "./grpc/grpc.transporter";
import { NatsTransporter, NatsTransporterOptions } from "./nats/nats.transporter";
import { KafkaTransporter, KafkaTransporterOptions } from "./kafka/kafka.transporter";

export type MicroserviceOptions =
    | { transport: "tcp"; options: TcpTransporterOptions }
    | { transport: "redis"; options?: RedisTransporterOptions }
    | { transport: "grpc"; options: GrpcTransporterOptions }
    | { transport: "nats"; options: NatsTransporterOptions }
    | { transport: "kafka"; options: KafkaTransporterOptions };

export function createTransporter(config: MicroserviceOptions): Transporter {
    switch (config.transport) {
        case "tcp":
            return new TcpTransporter(config.options);
        case "redis":
            return new RedisTransporter(config.options);
        case "grpc":
            return new GrpcTransporter(config.options);
        case "nats":
            return new NatsTransporter(config.options);
        case "kafka":
            return new KafkaTransporter(config.options);
        default:
            throw new Error(`Unknown microservice transport: "${(config as MicroserviceOptions).transport}"`);
    }
}
