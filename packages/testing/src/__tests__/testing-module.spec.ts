import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Controller, Get } from "@nyalajs/core";
import { TestingModule } from "../testing-module";
import { HttpTestClient } from "../http-test-client";

@Controller("/widgets")
class WidgetsController {
    @Get("/")
    list() {
        return { widgets: ["a", "b"] };
    }
}

describe("TestingModule route binding", () => {
    it("binds decorated controller routes so HttpTestClient can hit them", async () => {
        const moduleRef = await TestingModule.create({
            controllers: [WidgetsController],
        }).compile();

        const client = new HttpTestClient(moduleRef.createNyalaApplication());
        const res = await client.get("/widgets");

        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ widgets: ["a", "b"] });
    });

    it("returns 404 for a route that was never registered (sanity check)", async () => {
        const moduleRef = await TestingModule.create({
            controllers: [WidgetsController],
        }).compile();

        const client = new HttpTestClient(moduleRef.createNyalaApplication());
        const res = await client.get("/does-not-exist");

        expect(res.statusCode).toBe(404);
    });
});
