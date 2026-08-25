import { useEffect, useState } from "react";

/**
 * Real github.com/nyalajs/nyalajs star count for the header's GitHub
 * link — fetched from this app's own GET /api/github-stars
 * (DocsController.githubStars(), app/controllers/docs.controller.ts),
 * not directly from api.github.com: the production CSP (helmet,
 * packages/http/src/runtime/fastify-adapter.ts) has no connect-src
 * override, so a browser-side fetch() straight to GitHub is silently
 * blocked in production even though it works fine in dev (helmet is off
 * there) — see that route's own doc comment. Returns null while loading
 * and stays null on any failure rather than rendering "0" or an error —
 * a wrong star count would be worse than no star count at all.
 */
export function useGithubStars(): number | null {
    const [stars, setStars] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;

        fetch("/api/github-stars")
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!cancelled && typeof data?.stars === "number") {
                    setStars(data.stars);
                }
            })
            .catch(() => {
                // Stays null — see doc comment above.
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return stars;
}
