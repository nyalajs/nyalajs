import { describe, it, expect } from "vitest";
import { FrameDecoder, createRequestFrame, encodeFrame } from "../transports/wire-protocol";

const trace = { requestId: "req-1", traceId: "trace-1" };

describe("FrameDecoder", () => {
    it("decodes a single complete frame", () => {
        const decoder = new FrameDecoder();
        const frame = createRequestFrame("ping", { n: 1 }, trace);

        const result = decoder.feed(encodeFrame(frame));

        expect(result).toEqual([frame]);
    });

    it("buffers a frame split across multiple chunks", () => {
        const decoder = new FrameDecoder();
        const frame = createRequestFrame("ping", { n: 1 }, trace);
        const encoded = encodeFrame(frame);
        const splitPoint = Math.floor(encoded.length / 2);

        const first = decoder.feed(encoded.slice(0, splitPoint));
        expect(first).toEqual([]);

        const second = decoder.feed(encoded.slice(splitPoint));
        expect(second).toEqual([frame]);
    });

    it("decodes multiple frames delivered in one chunk", () => {
        const decoder = new FrameDecoder();
        const frameA = createRequestFrame("a", 1, trace);
        const frameB = createRequestFrame("b", 2, trace);

        const result = decoder.feed(encodeFrame(frameA) + encodeFrame(frameB));

        expect(result).toEqual([frameA, frameB]);
    });
});
