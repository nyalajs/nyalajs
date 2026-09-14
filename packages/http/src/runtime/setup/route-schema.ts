export function buildRouteSchema(route: any): any {
    const schema: any = {};

    // Operation metadata
    const operationMeta = Reflect.getMetadata("nyala:swagger:operation", route.controller.prototype[route.handlerName]);
    if (operationMeta) {
        Object.assign(schema, operationMeta);
    }

    // Responses metadata
    const responsesMeta = Reflect.getMetadata("nyala:swagger:responses", route.controller.prototype[route.handlerName]);
    if (responsesMeta && responsesMeta.length > 0) {
        schema.response = {};
        for (const resp of responsesMeta) {
            schema.response[resp.status] = {
                description: resp.description,
                type: resp.type || "object",
            };
        }
    }

    // Validation metadata (map Zod to JSON Schema)
    const validationRules = Reflect.getMetadata("nyala:validation", route.controller.prototype, route.handlerName);
    if (validationRules) {
        for (const rule of validationRules) {
            // Simplistic mapping: if it's a zod schema, it might have a description or we just leave it generic.
            // A full integration would use zod-to-json-schema here.
            schema[rule.target] = { type: "object", additionalProperties: true };
        }
    }

    return schema;
}
