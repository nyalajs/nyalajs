import { PaymentGateway, PaymentEvent } from "../gateway.interface";

export interface MountWebhookRouteOptions {
    /** URL path the webhook is mounted at, e.g. "/webhooks/stripe". */
    path: string;
    /** Called for every verified event. Not called at all for a failed/unverifiable webhook (see verifyWebhook()'s contract). */
    onEvent: (event: PaymentEvent) => Promise<void> | void;
}

/**
 * Mounts one gateway's webhook receiver onto an existing Fastify instance
 * — the piece that actually gets the raw request bytes into
 * `gateway.verifyWebhook()`. Registers its own scoped
 * `addContentTypeParser` so this ONE route sees the untouched raw body
 * (required for signature verification — see PaymentGateway.verifyWebhook's
 * doc comment on why a re-serialized JSON body never verifies), without
 * affecting how every other route on the same Fastify instance parses
 * JSON — confirmed against a real Fastify instance that a normal route
 * registered outside this scope still gets its usual parsed body object.
 *
 * A gateway that rejects verification (bad/missing signature, tampered
 * body) gets a 401 response and `onEvent` is never called — this is the
 * actual fraud-prevention boundary, not just an implementation detail.
 *
 * @example
 * ```ts
 * import { FastifyAdapter } from "@nyalajs/http";
 * import { mountWebhookRoute } from "@nyalajs/payments";
 *
 * await mountWebhookRoute(httpAdapter.getInstance(), stripeGateway, {
 *   path: "/webhooks/stripe",
 *   onEvent: async (event) => {
 *     if (event.type === "payment.succeeded") {
 *       await orders.markPaid(event.reference);
 *     }
 *   },
 * });
 * ```
 */
export async function mountWebhookRoute(fastifyInstance: any, gateway: PaymentGateway, options: MountWebhookRouteOptions): Promise<void> {
    await fastifyInstance.register(async (instance: any) => {
        instance.addContentTypeParser(
            "application/json",
            { parseAs: "buffer" },
            (_req: any, body: Buffer, done: (err: Error | null, body?: Buffer) => void) => done(null, body)
        );
        // Mollie's webhook body is form-encoded, not JSON — parse it as a
        // raw buffer the same way so MollieGateway.verifyWebhook() (which
        // expects application/x-www-form-urlencoded bytes, see its doc
        // comment) gets the untouched body too.
        instance.addContentTypeParser(
            "application/x-www-form-urlencoded",
            { parseAs: "buffer" },
            (_req: any, body: Buffer, done: (err: Error | null, body?: Buffer) => void) => done(null, body)
        );

        instance.post(options.path, async (request: any, reply: any) => {
            const rawBody: Buffer = Buffer.isBuffer(request.body) ? request.body : Buffer.from(String(request.body ?? ""));

            const event = await gateway.verifyWebhook(rawBody, request.headers);
            if (!event) {
                reply.status(401).send({ error: "Webhook signature verification failed" });
                return;
            }

            await options.onEvent(event);
            reply.status(200).send({ received: true });
        });
    });
}
