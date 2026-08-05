import { describe, it, expect } from "vitest";
import { shareProps, getSharedProps } from "../shared-props";

describe("shareProps()/getSharedProps()", () => {
    it("returns an empty object when nothing was shared", () => {
        expect(getSharedProps({})).toEqual({});
    });

    it("stores props on the request object, retrievable via getSharedProps", () => {
        const req: any = {};
        shareProps(req, { user: { id: 1 } });

        expect(getSharedProps(req)).toEqual({ user: { id: 1 } });
    });

    it("merges across multiple calls instead of overwriting", () => {
        const req: any = {};
        shareProps(req, { user: { id: 1 } });
        shareProps(req, { flash: { success: "ok" } });

        expect(getSharedProps(req)).toEqual({ user: { id: 1 }, flash: { success: "ok" } });
    });

    it("a later call's key overwrites an earlier one with the same key", () => {
        const req: any = {};
        shareProps(req, { user: { id: 1 } });
        shareProps(req, { user: { id: 2 } });

        expect(getSharedProps(req)).toEqual({ user: { id: 2 } });
    });

    it("is isolated per request object — sharing on one request doesn't affect another", () => {
        const reqA: any = {};
        const reqB: any = {};
        shareProps(reqA, { user: { id: 1 } });

        expect(getSharedProps(reqA)).toEqual({ user: { id: 1 } });
        expect(getSharedProps(reqB)).toEqual({});
    });
});
