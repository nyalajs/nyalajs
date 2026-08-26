import { ClientProxy } from "./client-proxy";
import { TcpClientProxy, TcpClientOptions } from "./tcp-client.proxy";
import { RedisClientProxy } from "./redis-client.proxy";
import { RedisTransporterOptions } from "../transports/redis/redis.transporter";
import { GrpcClientProxy, GrpcClientOptions } from "./grpc-client.proxy";
import { NatsClientProxy } from "./nats-client.proxy";
import { NatsTransporterOptions } from "../transports/nats/nats.transporter";
import { KafkaClientProxy } from "./kafka-client.proxy";
import { KafkaTransporterOptions } from "../transports/kafka/kafka.transporter";

export type ClientOptions =
    | { transport: "tcp"; options: TcpClientOptions }
    | { transport: "redis"; options?: RedisTransporterOptions }
    | { transport: "grpc"; options: GrpcClientOptions }
    | { transport: "nats"; options: NatsTransporterOptions }
    | { transport: "kafka"; options: KafkaTransporterOptions };

export class ClientProxyFactory {
    static create(config: ClientOptions): ClientProxy {
        switch (config.transport) {
            case "tcp":
                return new TcpClientProxy(config.options);
            case "redis":
                return new RedisClientProxy(config.options);
            case "grpc":
                return new GrpcClientProxy(config.options);
            case "nats":
                return new NatsClientProxy(config.options);
            case "kafka":
                return new KafkaClientProxy(config.options);
            default:
                throw new Error(`Unknown microservice transport: "${(config as ClientOptions).transport}"`);
        }
    }
}
