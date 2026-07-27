function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * Minimal built-in HTML error page, used when a request wants text/html
 * (browser navigation) and the app hasn't supplied FastifyAdapterOptions.errorView.
 * No framework/branding assumptions — just enough not to show a raw JSON
 * blob to a visitor. Apps that care about a branded error page should pass
 * `errorView`.
 */
export function defaultErrorPage(statusCode: number, message: string, showDetails: boolean, stack?: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${statusCode} — ${escapeHtml(message)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1.5rem; color: #1a1a1a; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  p { color: #555; }
  pre { background: #f5f5f5; padding: 1rem; overflow-x: auto; border-radius: 6px; font-size: 0.85rem; }
</style>
</head>
<body>
<h1>${statusCode} — ${escapeHtml(message)}</h1>
<p>Something went wrong handling this request.</p>
${showDetails && stack ? `<pre>${escapeHtml(stack)}</pre>` : ""}
</body>
</html>`;
}
