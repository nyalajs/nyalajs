# Nyala.js Theme

A VS Code color theme built from the Nyala.js brand palette — teal green (`#1a4d3e`) and golden yellow (`#f5b847`), the same colors used on the [docs site](../../website/docs/.vitepress/theme/custom.css) and in the antelope logo.

Ships two variants:

- **Nyala Dark** — near-black green editor background, gold cursor/line-number accent, teal UI chrome.
- **Nyala Light** — warm off-white background, the same brand colors inverted for light-mode contrast.

## Install

```bash
cd tools/vscode-nyala-theme
npx @vscode/vsce package
code --install-extension vscode-nyala-theme-0.1.0.vsix
```

Then in VS Code: **Ctrl/Cmd+Shift+P → "Preferences: Color Theme" → "Nyala Dark"** (or **"Nyala Light"**).

Pair it with [Nyala.js Icons](../vscode-nyala-icons) for the full look.
