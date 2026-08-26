import "reflect-metadata";
import { NYALA_GQL_OBJECT_TYPE, NYALA_GQL_INPUT_TYPE, NYALA_GQL_FIELDS } from "../constants/metadata-keys";
import { FieldTypeOptions, TypeThunk } from "../schema/type-mapping";

export interface ObjectTypeOptions {
    /** Defaults to the class name. */
    name?: string;
    description?: string;
}

export interface FieldMetadata {
    propertyKey: string;
    typeThunk: TypeThunk;
    options: FieldTypeOptions;
    description?: string;
}

export function ObjectType(options: ObjectTypeOptions = {}): ClassDecorator {
    return (target) => {
        Reflect.defineMetadata(NYALA_GQL_OBJECT_TYPE, { name: options.name ?? target.name, description: options.description }, target);
    };
}

export function InputType(options: ObjectTypeOptions = {}): ClassDecorator {
    return (target) => {
        Reflect.defineMetadata(NYALA_GQL_INPUT_TYPE, { name: options.name ?? target.name, description: options.description }, target);
    };
}

export interface FieldDecoratorOptions extends FieldTypeOptions {
    description?: string;
}

/**
 * Marks a class property as a GraphQL field. `typeThunk` is REQUIRED — e.g.
 * `@Field(() => String) name!: string;` or `@Field(() => [Post]) posts!: Post[];`.
 *
 * This deliberately does not fall back to reading TypeScript's
 * `design:type` reflect-metadata the way @nyalajs/http's DTO auto-validation
 * does: `design:type` only reports a property's bare *class* (an array
 * becomes plain `Array`, with no element type — useless for building a real
 * list type), and — more importantly — it is only emitted at all when the
 * code was compiled by `tsc` with `emitDecoratorMetadata`. Under esbuild/SWC
 * transforms (which is what this package's own test suite, and most
 * consuming apps' dev-mode tooling, actually run on), that metadata is
 * silently absent, so a fallback here would work in production builds and
 * fail invisibly — resolving to `undefined` — everywhere else. Requiring the
 * thunk always fails the same way (a clear error at schema-build time, once,
 * not a mysterious `undefined` deep inside graphql-js) regardless of how the
 * code was compiled.
 */
export function Field(typeThunk: TypeThunk, options: FieldDecoratorOptions = {}): PropertyDecorator {
    return (target, propertyKey) => {
        const ctor = target.constructor;
        const fields: FieldMetadata[] = Reflect.getMetadata(NYALA_GQL_FIELDS, ctor) ?? [];

        if (typeof typeThunk !== "function") {
            throw new Error(
                `[nyala/graphql] @Field() on "${ctor.name}.${String(propertyKey)}" needs a type thunk, ` +
                `e.g. @Field(() => String) or @Field(() => [Post]).`
            );
        }

        fields.push({
            propertyKey: propertyKey as string,
            typeThunk,
            options: {
                nullable: options.nullable ?? false,
                list: options.list ?? false,
                nullableItems: options.nullableItems ?? false,
            },
            description: options.description,
        });

        Reflect.defineMetadata(NYALA_GQL_FIELDS, fields, ctor);
    };
}

export function getObjectTypeMetadata(target: any): { name: string; description?: string } | undefined {
    return Reflect.getMetadata(NYALA_GQL_OBJECT_TYPE, target);
}

export function getInputTypeMetadata(target: any): { name: string; description?: string } | undefined {
    return Reflect.getMetadata(NYALA_GQL_INPUT_TYPE, target);
}

export function getFieldsMetadata(target: any): FieldMetadata[] {
    return Reflect.getMetadata(NYALA_GQL_FIELDS, target) ?? [];
}
