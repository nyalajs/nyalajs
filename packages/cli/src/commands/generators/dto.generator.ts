export function getDtoTemplate(className: string): string {
    return `/**
 * ${className}
 *
 * Data Transfer Object — the shape a request body is expected to have once
 * it's been validated (see @nyalajs/validation's @ValidateBody() and a
 * matching Zod schema in app/validators/). Add fields below; "!" marks a
 * required field, "?" an optional one — see app/dto/ in the starter
 * templates for real examples.
 */
export class ${className} {
    // id!: string;
}
`;
}
