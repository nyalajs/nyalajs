import { describe, it, expect } from "vitest";
import { ConfigService } from "../config.service";

describe("ConfigService", () => {
    it("should instantiate without errors", () => {
        const configService = new ConfigService();
        expect(configService).toBeDefined();
    });
});
