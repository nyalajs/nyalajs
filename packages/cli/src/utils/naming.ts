/**
 * Splits any of kebab-case, snake_case, space separated, camelCase, or
 * PascalCase input into individual words. Needed because CLI generator
 * names are commonly passed as PascalCase (e.g. "UserController",
 * "CreateUserRequest" per docs/requirements.md §4.23) rather than kebab.
 */
function splitWords(str: string): string[] {
    return str
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .split(/[-_\s]+/)
        .filter(Boolean);
}

export function toPascalCase(str: string): string {
    return splitWords(str)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join("");
}

export function toKebabCase(str: string): string {
    return splitWords(str)
        .map((word) => word.toLowerCase())
        .join("-");
}

export function toCamelCase(str: string): string {
    const pascal = toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
