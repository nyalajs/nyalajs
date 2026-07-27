import * as React from "react";
import { describe, it, expect } from "vitest";
import { view } from "../view";
import { LayoutProps } from "../layout";

function Greeting({ name }: { name: string }) {
    return <p>Hello, {name}!</p>;
}

describe("view()", () => {
    it("renders the component into a full HTML document with a doctype", () => {
        const html = view(Greeting, { name: "World" }).render();

        expect(html).toMatch(/^<!DOCTYPE html>/);
        expect(html).toContain("<html");
        expect(html).toContain("Hello, World!");
    });

    it("includes the title and meta tags from options", () => {
        const html = view(Greeting, { name: "World" }, {
            title: "My Page",
            meta: { description: "A test page" },
        }).render();

        expect(html).toContain("<title>My Page</title>");
        expect(html).toContain('name="description"');
        expect(html).toContain('content="A test page"');
    });

    it("supports a custom layout", () => {
        function CustomLayout({ children }: LayoutProps) {
            return (
                <html>
                    <body className="custom">{children}</body>
                </html>
            );
        }

        const html = view(Greeting, { name: "Custom" }, { layout: CustomLayout }).render();

        expect(html).toContain('class="custom"');
        expect(html).toContain("Hello, Custom!");
        // custom layout doesn't render a <head>, so no doctype-adjacent <head> tag
        expect(html).not.toContain("<head>");
    });

    it("exposes statusCode from options for the adapter to read", () => {
        const response = view(Greeting, { name: "X" }, { statusCode: 201 });
        expect(response.statusCode).toBe(201);
        expect(response.contentType).toBe("text/html");
    });
});
