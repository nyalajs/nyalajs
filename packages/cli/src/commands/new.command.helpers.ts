// Helper methods for NewCommand configuration generation

export function getEslintConfig(): any {
    return {
        parser: "@typescript-eslint/parser",
        parserOptions: {
            project: "tsconfig.json",
            sourceType: "module",
        },
        plugins: ["@typescript-eslint/eslint-plugin"],
        extends: ["plugin:@typescript-eslint/recommended"],
        root: true,
        env: {
            node: true,
            jest: true,
        },
        ignorePatterns: [".eslintrc.js", "dist", "node_modules"],
        rules: {
            "@typescript-eslint/interface-name-prefix": "off",
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/explicit-module-boundary-types": "off",
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_" },
            ],
        },
    };
}

export function getPrettierConfig(): any {
    return {
        semi: true,
        trailingComma: "es5",
        singleQuote: false,
        printWidth: 100,
        tabWidth: 2,
        useTabs: false,
        arrowParens: "always",
        endOfLine: "lf",
    };
}

export function getVitestConfig(): string {
    return `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.spec.ts",
        "**/*.test.ts",
        "**/test/**",
      ],
    },
  },
});
`;
}

export function getEditorConfig(): string {
    return `root = true

[*]
charset = utf-8
indent_style = space
indent_size = 2
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
`;
}

export function getPreCommitHook(): string {
    return `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
`;
}
