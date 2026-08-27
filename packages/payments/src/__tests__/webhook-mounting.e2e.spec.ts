import { describe, it, expect, afterEach } from "vitest";
import Fastify from "fastify";
import Stripe from "stripe";
import { StripeGateway } from "../gateways/stripe/stripe.gateway";
import { mountWebhookRoute } from "../webhooks/mount-webhook-route";
import { PaymentEvent } from "../gateway.interface";

// Real end-to-end proof over real HTTP: a real Fastify server, a real
// signed webhook request sent via fetch() (not a mocked request object),
// through mountWebhookRoute()'s raw-body content-type parser, into
// StripeGateway.verifyWebhook()'s real HMAC-SHA256 check, calling a real
// onEvent handler. Also proves the raw-body parser doesn't corrupt a
// SEPARATE, normal JSON route mounted on the same Fastify instance.

const FAKE_SECRET_KEY = "sk_test_does_not_need_to_be_real_for_these_tests";
const WEBHOOK_SECRET = "whsec_e2e_test_secret";

describe("mountWebhookRoute (e2e, real Fastify server + real HMAC verification)", () => {
    let app: ReturnType<typeof Fastify> | undefined;

    afterEach(async () => {
        await app?.close();
        app = undefined;
    });

    it("a genuinely-signed webhook reaches onEvent with the normalized PaymentEvent, and responds 200", async () => {
        app = Fastify();
        const gateway = new StripeGateway({ secretKey: FAKE_SECRET_KEY, webhookSecret: WEBHOOK_SECRET });

        const receivedEvents: PaymentEvent[] = [];
        await mountWebhookRoute(app, gateway, {
            path: "/webhooks/stripe",
            onEvent: (event) => {
                receivedEvents.push(event);
            },
        });
        await app.listen({ port: 0, host: "127.0.0.1" });
        const address = app.server.address() as any;
        const baseUrl = `http://127.0.0.1:${address.port}`;

        const stripeClient = new Stripe(FAKE_SECRET_KEY);
        const payload = JSON.stringify({
            id: "evt_e2e_1",
            type: "checkout.session.completed",
            data: { object: { id: "cs_e2e_1", client_reference_id: "order-e2e-1", amount_total: 4200, currency: "usd", metadata: {} } },
        });
        const signatureHeader = stripeClient.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });

        const res = await fetch(`${baseUrl}/webhooks/stripe`, {
            method: "POST",
            headers: { "content-type": "application/json", "stripe-signature": signatureHeader },
            body: payload,
        });

        expect(res.status).toBe(200);
        expect(receivedEvents).toHaveLength(1);
        expect(receivedEvents[0].reference).toBe("order-e2e-1");
        expect(receivedEvents[0].amountMinor).toBe(4200);
    });

    it("a request with a WRONG signature is rejected 401 and onEvent is never called", async () => {
        app = Fastify();
        const gateway = new StripeGateway({ secretKey: FAKE_SECRET_KEY, webhookSecret: WEBHOOK_SECRET });

        let called = false;
        await mountWebhookRoute(app, gateway, {
            path: "/webhooks/stripe",
            onEvent: () => {
                called = true;
            },
        });
        await app.listen({ port: 0, host: "127.0.0.1" });
        const address = app.server.address() as any;
        const baseUrl = `http://127.0.0.1:${address.port}`;

        const stripeClient = new Stripe(FAKE_SECRET_KEY);
        const payload = JSON.stringify({ id: "evt_e2e_2", type: "checkout.session.completed", data: { object: { id: "cs_e2e_2" } } });
        const wrongSignature = stripeClient.webhooks.generateTestHeaderString({ payload, secret: "whsec_totally_wrong" });

        const res = await fetch(`${baseUrl}/webhooks/stripe`, {
            method: "POST",
            headers: { "content-type": "application/json", "stripe-signature": wrongSignature },
            body: payload,
        });

        expect(res.status).toBe(401);
        expect(called).toBe(false);
    });

    it("a webhook route's raw-body parser does NOT leak into a normal JSON route on the same server", async () => {
        app = Fastify();
        const gateway = new StripeGateway({ secretKey: FAKE_SECRET_KEY, webhookSecret: WEBHOOK_SECRET });

        await mountWebhookRoute(app, gateway, { path: "/webhooks/stripe", onEvent: () => {} });

        // A completely ordinary route, registered directly on the same
        // Fastify instance, expecting Fastify's normal parsed-JSON body.
        app.post("/api/orders", async (request: any) => {
            return { receivedType: typeof request.body, isPlainObject: !Buffer.isBuffer(request.body) };
        });

        await app.listen({ port: 0, host: "127.0.0.1" });
        const address = app.server.address() as any;
        const baseUrl = `http://127.0.0.1:${address.port}`;

        const res = await fetch(`${baseUrl}/api/orders`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ item: "widget" }),
        });
        const body = (await res.json()) as { receivedType: string; isPlainObject: boolean };

        expect(res.status).toBe(200);
        expect(body.receivedType).toBe("object");
        expect(body.isPlainObject).toBe(true);
    });

    it("an oversized request body is rejected before it ever reaches verifyWebhook() — real DoS-protection boundary, not something this package has to implement itself", async () => {
        // Fastify enforces `bodyLimit` (default 1MB in @nyalajs/http's
        // FastifyAdapter — see fastify-adapter.ts) at the framework level,
        // BEFORE any addContentTypeParser (including this route's
        // raw-body one) ever runs — a webhook route registered via
        // mountWebhookRoute() gets this protection automatically, with no
        // extra code needed here. Explicitly proven with a real oversized
        // body over real HTTP, not assumed from reading Fastify's source.
        app = Fastify({ bodyLimit: 1024 }); // deliberately tiny, to keep the test fast — proves the LIMIT is honored, not any specific size
        const gateway = new StripeGateway({ secretKey: FAKE_SECRET_KEY, webhookSecret: WEBHOOK_SECRET });

        let called = false;
        await mountWebhookRoute(app, gateway, {
            path: "/webhooks/stripe",
            onEvent: () => {
                called = true;
            },
        });
        await app.listen({ port: 0, host: "127.0.0.1" });
        const address = app.server.address() as any;
        const baseUrl = `http://127.0.0.1:${address.port}`;

        const oversizedPayload = JSON.stringify({
            id: "evt_e2e_oversized",
            type: "checkout.session.completed",
            data: { object: { id: "cs_e2e_oversized", client_reference_id: "order-oversized", padding: "x".repeat(10_000) } },
        });
        expect(oversizedPayload.length).toBeGreaterThan(1024); // sanity-check the test's own premise

        const res = await fetch(`${baseUrl}/webhooks/stripe`, {
            method: "POST",
            headers: { "content-type": "application/json", "stripe-signature": "irrelevant-never-reached" },
            body: oversizedPayload,
        });

        // Fastify's own bodyLimit rejection is HTTP 413, distinct from
        // this package's own 401 (signature verification never even ran).
        expect(res.status).toBe(413);
        expect(called).toBe(false);
    });
});
