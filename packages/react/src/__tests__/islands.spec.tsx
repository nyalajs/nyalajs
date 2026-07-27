import * as React from "react";
import { describe, it, expect, beforeAll } from "vitest";
import { view } from "../view";
import { island } from "../islands/island";
import { defineIsland } from "../islands/registry";
import { setIslandFileManifest } from "../islands/manifest-cache";

function Greeting({ name }: { name: string }) {
    return <p>Hello, {name}!</p>;
}

function SearchBox({ initialQuery }: { initialQuery: string }) {
    return <input defaultValue={initialQuery} />;
}
defineIsland("SearchBox", SearchBox);

function StaticPage({ name }: { name: string }) {
    return <Greeting name={name} />;
}

function PageWithIsland({ name }: { name: string }) {
    return (
        <div>
            <Greeting name={name} />
            {island("SearchBox", { initialQuery: "hello" })}
        </div>
    );
}

describe("island()", () => {
    it("throws for an unregistered island name", () => {
        expect(() => island("NotRegistered", {})).toThrow(/Unknown island "NotRegistered"/);
    });

    it("throws a clear error when a view uses an island but no build manifest was loaded", () => {
        setIslandFileManifest(null);
        expect(() => view(PageWithIsland, { name: "World" }).render()).toThrow(
            /no island bundle manifest is loaded/
        );
    });

    describe("with a build manifest loaded", () => {
        beforeAll(() => {
            setIslandFileManifest({
                islands: { SearchBox: "SearchBox-abc12345.js" },
                bootstrap: "_nyala-islands-def67890.js",
            });
        });

        it("wraps the rendered component in a data-nyala-island marker with JSON props", () => {
            const html = view(PageWithIsland, { name: "World" }).render();

            expect(html).toContain('data-nyala-island="SearchBox"');
            expect(html).toContain("data-nyala-props=");
            expect(html).toContain("hello"); // the serialized prop value made it into the HTML
            expect(html).toContain("<input"); // the island's own markup rendered inline
        });

        it("does not include the hydration script when no island is used", () => {
            const html = view(StaticPage, { name: "World" }).render();
            expect(html).not.toContain("_nyala-islands-");
        });

        it("includes the current (hashed) hydration script exactly once when an island is used", () => {
            const html = view(PageWithIsland, { name: "World" }).render();
            const matches = html.match(/_nyala-islands-[a-f0-9]+\.js/g) ?? [];
            expect(matches).toHaveLength(1);
            expect(html).toContain(
                '<script type="module" src="/public/_nyala-islands-def67890.js"></script></body>'
            );
        });

        it("isolates island tracking between separate render() calls", () => {
            const withIsland = view(PageWithIsland, { name: "A" }).render();
            const withoutIsland = view(StaticPage, { name: "B" }).render();

            expect(withIsland).toContain("_nyala-islands-def67890.js");
            expect(withoutIsland).not.toContain("_nyala-islands-");
        });
    });
});
