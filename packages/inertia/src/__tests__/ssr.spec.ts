import { describe, it, expect, vi, afterEach } from "vitest";
import { renderViaSsrServer } from "../ssr";
import { InertiaPage } from "../types";

function samplePage(): InertiaPage {
    return {
        component: "Home",
        props: { errors: {} },
        url: "/",
        version: "v1",
        clearHistory: false,
        encryptHistory: false,
    };
}

describe("renderViaSsrServer()", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("POSTs the page to <url>/render and returns the parsed {head, body}", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ head: ["<title>SSR</title>"], body: "<div>rendered</div>" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await renderViaSsrServer(samplePage(), { url: "http://127.0.0.1:13714" });

        expect(fetchMock).toHaveBeenCalledWith(
            "http://127.0.0.1:13714/render",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify(samplePage()),
            })
        );
        expect(result).toEqual({ head: ["<title>SSR</title>"], body: "<div>rendered</div>" });
    });

    it("defaults to http://127.0.0.1:13714 (the real @inertiajs/core/server default port)", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ head: [], body: "" }) });
        vi.stubGlobal("fetch", fetchMock);

        await renderViaSsrServer(samplePage());

        expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:13714/render", expect.anything());
    });

    it("returns null when the SSR server responds with a non-OK status", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

        const result = await renderViaSsrServer(samplePage());
        expect(result).toBeNull();
    });

    it("returns null (falls back to CSR) when the request throws, e.g. SSR server isn't running", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

        const result = await renderViaSsrServer(samplePage());
        expect(result).toBeNull();
    });

    it("returns null when the request times out", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }) => {
                return new Promise((_resolve, reject) => {
                    init.signal.addEventListener("abort", () => reject(new Error("aborted")));
                });
            })
        );

        const result = await renderViaSsrServer(samplePage(), { timeoutMs: 5 });
        expect(result).toBeNull();
    });
});
