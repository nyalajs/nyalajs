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
 * Removes any existing parser for the same content type in this scope
 * before adding the raw-buffer one: a global body-parsing plugin
 * registered on the parent instance (@fastify/formbody, which any real app
 * using @nyalajs/http's FastifyAdapter has — it registers
 * application/x-www-form-urlencoded via `fastify-plugin`, which bypasses
 * normal encapsulation) would otherwise make Fastify's own
 * `addContentTypeParser` throw `FST_ERR_CTP_ALREADY_PRESENT` here, crashing
 * boot entirely — reproduced and confirmed against a real Fastify instance
 * with @fastify/formbody registered.
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
        const rawBufferParser = (_req: any, body: Buffer, done: (err: Error | null, body?: Buffer) => void) => done(null, body);

        for (const contentType of ["application/json", "application/x-www-form-urlencoded"]) {
            // A parser for this type may already exist at the parent scope
            // (e.g. @fastify/formbody, registered globally by
            // FastifyAdapter) — remove it first, scoped to this nested
            // instance only, so re-adding below doesn't throw
            // FST_ERR_CTP_ALREADY_PRESENT. Encapsulation means this removal
            // + re-add is local to this route; every other route on the
            // parent instance keeps its normal parser untouched.
            if (instance.hasContentTypeParser(contentType)) {
                instance.removeContentTypeParser(contentType);
            }
            // Mollie's webhook body is form-encoded, not JSON — both need
            // the raw, untouched buffer so MollieGateway.verifyWebhook()
            // (which expects application/x-www-form-urlencoded bytes, see
            // its own doc comment) and every JSON-body gateway's signature
            // verification both see exactly the bytes the sender signed.
            instance.addContentTypeParser(contentType, { parseAs: "buffer" }, rawBufferParser);
        }

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
