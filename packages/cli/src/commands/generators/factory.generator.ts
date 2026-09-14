import { toPascalCase, toKebabCase } from "../../utils/naming";

export function getFactoryTemplate(className: string, name: string): string {
    const modelName = toPascalCase(name);
    return `import { faker } from "@faker-js/faker";
import { Factory } from "@nyalajs/database";
// import { ${modelName} } from "../../app/models/${toKebabCase(name)}";

/**
 * ${className}
 *
 * Generates fake ${modelName} instances for seeders and tests — see
 * @faker-js/faker's docs (https://fakerjs.dev/api/) for every field type
 * available beyond the examples below. Requires @faker-js/faker as a
 * devDependency (already in every starter template's package.json).
 */
export class ${className} extends Factory<any /* ${modelName} */> {
    model = Object as any; // TODO: replace with ${modelName}

    definition(): any /* Partial<${modelName}> */ {
        return {
            // Delete/replace with real ${modelName} fields:
            id: faker.string.uuid(),
            createdAt: faker.date.recent(),
        };
    }
}
`;
}
