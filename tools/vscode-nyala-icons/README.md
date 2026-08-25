# Nyala.js Icons

A VS Code file icon theme that shows the Nyala.js antelope logo on files that follow the Nyala.js framework's naming conventions — the same idea as `vscode-nestjs-files` for NestJS.

## What gets the icon

Any file ending in one of these suffixes:

`*.controller.ts`, `*.service.ts`, `*.module.ts`, `*.repository.ts`, `*.model.ts`, `*.dto.ts`, `*.validator.ts`, `*.guard.ts`, `*.middleware.ts`, `*.interceptor.ts`, `*.pipe.ts`, `*.provider.ts`, `*.decorator.ts`, `*.interface.ts`, `*.seeder.ts`, `*.command.ts`, `*.helper.ts`, `*.manager.ts`

Everything else falls back to a minimal neutral file/folder icon so the rest of your workspace stays legible.

## Install

From a packaged `.vsix`:

```bash
npx @vscode/vsce package
code --install-extension vscode-nyala-icons-0.1.0.vsix
```

Then in VS Code: **Ctrl/Cmd+Shift+P → "Preferences: File Icon Theme" → "Nyala.js Icons"**.

## Adding more suffixes

Edit `nyala-icon-theme.json` and add the new suffix (without the leading dot) under `fileExtensions`, mapped to `_nyala_file`.
