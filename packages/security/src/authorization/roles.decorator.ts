import "reflect-metadata";

const ROLES_METADATA = "nyala:roles";

export function Roles(...roles: string[]): MethodDecorator {
    return (target, propertyKey, descriptor) => {
        Reflect.defineMetadata(ROLES_METADATA, roles, target.constructor, propertyKey);
        return descriptor;
    };
}

export function getRolesMetadata(target: any, propertyKey: string | symbol): string[] {
    return Reflect.getMetadata(ROLES_METADATA, target, propertyKey) ?? [];
}
