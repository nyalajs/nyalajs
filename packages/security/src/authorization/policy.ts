import "reflect-metadata";
import { Type } from "@nyalajs/core";

const POLICY_METADATA = "nyala:policy";

/**
 * Abstract base class for ABAC policies — §4.12.
 *
 * Subclass this and implement the actions your resource supports.
 * The `before()` hook (optional) can short-circuit all action checks.
 *
 * @example
 *   export class PostPolicy extends Policy {
 *     update(user: UserIdentity, post: Post): boolean {
 *       return post.authorId === user.userId;
 *     }
 *   }
 */
export abstract class Policy {
    /**
     * Called before any action method. Return `true` to allow unconditionally,
     * `false` to deny unconditionally, or `undefined` to fall through to the
     * specific action method.
     */
    before?(user: any, resource?: any): boolean | undefined;

    /** Default CRUD action stubs — override the ones your resource uses. */
    view?(user: any, resource?: any): boolean | Promise<boolean>;
    create?(user: any, resource?: any): boolean | Promise<boolean>;
    update?(user: any, resource?: any): boolean | Promise<boolean>;
    delete?(user: any, resource?: any): boolean | Promise<boolean>;

    /** Catch-all for custom actions (e.g. 'publish', 'approve'). */
    handle?(action: string, user: any, resource?: any): boolean | Promise<boolean>;
}

/**
 * Attach a policy class to a controller class or individual route handler.
 *
 * @param PolicyClass  The policy class to evaluate.
 * @param action       The policy method to call (default: derived from HTTP verb).
 * @param resourceArg  Optional index of the handler argument holding the resource.
 *
 * @example
 *   @UsePolicy(PostPolicy, "update")
 *   @Put("/:id")
 *   update(@Param("id") id: string, @Body() dto: UpdatePostDto) { ... }
 */
export function UsePolicy(
    PolicyClass: Type<Policy>,
    action?: string,
    resourceArg?: number
): MethodDecorator & ClassDecorator {
    return (target: any, propertyKey?: string | symbol) => {
        const meta = { PolicyClass, action, resourceArg };
        if (propertyKey !== undefined) {
            Reflect.defineMetadata(POLICY_METADATA, meta, target.constructor, propertyKey);
        } else {
            Reflect.defineMetadata(POLICY_METADATA, meta, target);
        }
    };
}

export function getPolicyMetadata(
    target: any,
    propertyKey?: string | symbol
): { PolicyClass: Type<Policy>; action?: string; resourceArg?: number } | undefined {
    if (propertyKey !== undefined) {
        return Reflect.getMetadata(POLICY_METADATA, target, propertyKey);
    }
    return Reflect.getMetadata(POLICY_METADATA, target);
}

/** Map HTTP verb → default policy action name. */
export function defaultActionForMethod(method: string): string {
    switch (method.toUpperCase()) {
        case "GET":    return "view";
        case "POST":   return "create";
        case "PUT":
        case "PATCH":  return "update";
        case "DELETE": return "delete";
        default:       return "handle";
    }
}
