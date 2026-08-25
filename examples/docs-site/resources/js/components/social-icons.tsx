import { SVGProps } from "react";

/**
 * Brand marks for the header's social-link cluster (docs-layout.tsx).
 * lucide-react@0.395.0's own `Github` export is deprecated upstream
 * (recommends switching to inline SVG — see its own JSDoc, verified
 * against the installed package's .d.ts) and it has no Discord/X icons at
 * all, so all four here are small inline SVGs (Simple Icons' single-path
 * brand marks, MIT-licensed) instead of mixing icon sources. Sized/colored
 * via className exactly like a lucide icon (`h-4 w-4`, `text-foreground`,
 * ...) since they're dropped into the same Button icon-slot pattern used
 * everywhere else in the header.
 */
type IconProps = SVGProps<SVGSVGElement>;

export function GithubIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.605-2.665-.303-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.51 11.51 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.625-5.479 5.921.43.372.823 1.103.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.696.825.577C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
        </svg>
    );
}

export function DiscordIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
            <path d="M20.317 4.37a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.74 19.74 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.245.198.373.292a.077.077 0 01-.006.127 12.3 12.3 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.84 19.84 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.673-3.549-13.66a.06.06 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.332-.955 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.42 0 1.332-.946 2.418-2.157 2.418z" />
        </svg>
    );
}

export function XIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
    );
}

export function NpmIcon(props: IconProps) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
            <path d="M0 7.334v8.332h6.999V17.5H12v-1.834h12V7.334zm6.999 6.998H5.333v-5h1.666zm4.001 0h-1.667v-5h1.667zM11 8.667v3.333h-1.667V8.667h1.667zm5.333 5.665v-5h1.667v6.998H9.333v-6.998H11v5zm5.334 0h-1.667v-5h1.667z" />
        </svg>
    );
}
