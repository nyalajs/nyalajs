export function getEventTemplate(className: string): string {
    return `export class ${className} {
  constructor(public readonly payload: Record<string, unknown> = {}) {}
}
`;
}
