import "reflect-metadata";
import { NYALA_ROUTES } from "../constants/metadata-keys";

export interface RouteDefinition {
    method: string;
    path: string;
    handlerName: string | symbol;
}

function createRouteDecorator(method: string) {
    return (path = ""): MethodDecorator =>
        (target, propertyKey) => {
            const routes =
                Reflect.getMetadata(NYALA_ROUTES, target.constructor) ?? [];

            routes.push({
                method,
                path,
                handlerName: propertyKey,
            });

            Reflect.defineMetadata(NYALA_ROUTES, routes, target.constructor);
        };
}

export const Get = createRouteDecorator("GET");
export const Post = createRouteDecorator("POST");
export const Put = createRouteDecorator("PUT");
export const Delete = createRouteDecorator("DELETE");
export const Patch = createRouteDecorator("PATCH");
export const Options = createRouteDecorator("OPTIONS");
export const Head = createRouteDecorator("HEAD");
