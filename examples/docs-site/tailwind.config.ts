import type { Config } from "tailwindcss";

/**
 * Standard shadcn/ui Tailwind config — CSS variables for theming (see
 * resources/js/app.css's :root/.dark blocks), tailwindcss-animate for the
 * primitives' open/close transitions (Dialog, DropdownMenu, Tooltip, ...).
 */
export default {
    darkMode: ["class"],
    content: ["./resources/js/**/*.{ts,tsx}"],
    // wrapCodeBlock() (app/services/docs.service.ts) emits these class
    // names as literal strings server-side, in a Shiki-rendered markdown
    // pipeline — outside this content glob entirely, since that file is
    // backend TypeScript, not resources/js/. Tailwind's scanner only sees
    // class names referenced somewhere the content glob covers, so these
    // silently got purged as "unused" (confirmed live: .code-block-header
    // and .code-block-lang were entirely missing from the built CSS,
    // leaving the header bar with no background). @Show.tsx's own
    // useCodeBlockCopy() hook referencing ".code-block"/".code-block-copy"
    // as JS selector strings is what accidentally saved those two from
    // the same fate — not a reliable mechanism to depend on.
    safelist: [
        "code-block",
        "code-block-header",
        "code-block-lang",
        "code-block-copy",
        "code-block-copy-icon",
        "code-block-copy-icon-check",
        "code-block-copy--copied",
    ],
    theme: {
        container: {
            center: true,
            // Tailwind's container corePlugin reads container.screens
            // *instead of* theme.screens when present, so a padding key not
            // in this (deliberately narrowed, shadcn-default) screens set
            // is silently dropped rather than falling back to theme.screens
            // — verified against node_modules/tailwindcss/lib/corePlugins.js.
            // Every padding breakpoint used below must have a matching entry
            // here.
            padding: {
                DEFAULT: "1rem",
                sm: "1.5rem",
                lg: "2rem",
            },
            screens: {
                sm: "640px",
                lg: "1024px",
                "2xl": "1400px",
            },
        },
        extend: {
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                // Nyala brand gold (#f5b847) — a separate token from
                // shadcn's own `accent` (a neutral gray hover-state color
                // every primitive already reads from), used explicitly via
                // bg-accent-brand/text-accent-brand where real brand color
                // is wanted (hero gradient, "coming soon" badges).
                "accent-brand": {
                    DEFAULT: "hsl(var(--accent-brand))",
                    foreground: "hsl(var(--accent-brand-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                sidebar: {
                    DEFAULT: "hsl(var(--sidebar-background))",
                    foreground: "hsl(var(--sidebar-foreground))",
                    primary: "hsl(var(--sidebar-primary))",
                    "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
                    accent: "hsl(var(--sidebar-accent))",
                    "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
                    border: "hsl(var(--sidebar-border))",
                    ring: "hsl(var(--sidebar-ring))",
                },
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            keyframes: {
                "accordion-down": {
                    from: { height: "0" },
                    to: { height: "var(--radix-accordion-content-height)" },
                },
                "accordion-up": {
                    from: { height: "var(--radix-accordion-content-height)" },
                    to: { height: "0" },
                },
            },
            animation: {
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
            },
            typography: {
                // Tunes @tailwindcss/typography's own defaults for a
                // Laravel/VitePress-docs reading rhythm — Docs/Show.tsx's
                // `prose prose-neutral dark:prose-invert` was otherwise
                // left at the plugin's out-of-the-box spacing. Code block
                // styling itself is handled by app.css's .code-block rules
                // (DocsService.wrapCodeBlock()'s own markup), not here —
                // `prose-pre:*` on the article element only reaches
                // Shiki's inner <pre>, so this just removes the default
                // pseudo-content backtick styling from *inline* code
                // (`code:not(pre code)`) in favor of a subtle background
                // pill, closer to how Laravel's docs render inline code.
                DEFAULT: {
                    css: {
                        "--tw-prose-body": "hsl(var(--foreground) / 0.85)",
                        maxWidth: "none",
                        lineHeight: "1.75",
                        "h1, h2, h3, h4": {
                            fontWeight: "600",
                            letterSpacing: "-0.01em",
                        },
                        h2: { marginTop: "2.5em", marginBottom: "1em" },
                        h3: { marginTop: "2em", marginBottom: "0.75em" },
                        "code:not(pre code)": {
                            backgroundColor: "hsl(var(--muted))",
                            borderRadius: "0.3em",
                            padding: "0.15em 0.4em",
                            fontWeight: "500",
                            fontSize: "0.875em",
                        },
                        "code:not(pre code)::before": { content: "none" },
                        "code:not(pre code)::after": { content: "none" },
                        a: { fontWeight: "500", textUnderlineOffset: "3px" },
                    },
                },
            },
        },
    },
    plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
