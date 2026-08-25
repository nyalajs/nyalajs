import { RefObject, useEffect } from "react";

/**
 * Wires up copy-to-clipboard for every code block DocsService's
 * wrapCodeBlock() (app/services/docs.service.ts) emits inside the given
 * container — `<div class="code-block" data-code="...">` with a
 * `.code-block-copy` button in its header bar. Event delegation on the
 * container (not a listener per button) because this content arrives via
 * dangerouslySetInnerHTML — there's no React tree to attach individual
 * handlers to, and delegation means it keeps working even if the HTML is
 * replaced wholesale (e.g. navigating to a different doc).
 */
export function useCodeBlockCopy(containerRef: RefObject<HTMLElement>) {
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        function onClick(e: MouseEvent) {
            const button = (e.target as HTMLElement).closest<HTMLButtonElement>(".code-block-copy");
            if (!button || !container?.contains(button)) return;

            const block = button.closest<HTMLElement>(".code-block");
            const encoded = block?.dataset.code;
            if (!encoded) return;

            // wrapCodeBlock() base64-encodes the original, un-highlighted
            // code (not Shiki's <span>-wrapped markup) specifically so
            // this never has to strip highlighting spans back out of the
            // DOM to get plain text.
            const code = atob(encoded);
            navigator.clipboard.writeText(code).then(() => {
                // Toggles which of wrapCodeBlock()'s two stacked icon
                // <span>s (app.css's .code-block-copy-icon /
                // -icon-check) is visible — an icon swap, not a text
                // swap, since the button has no text label to update.
                button.classList.add("code-block-copy--copied");
                button.disabled = true;
                setTimeout(() => {
                    button.classList.remove("code-block-copy--copied");
                    button.disabled = false;
                }, 1500);
            });
        }

        container.addEventListener("click", onClick);
        return () => container.removeEventListener("click", onClick);
    }, [containerRef]);
}
