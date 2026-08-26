import { GraphQLFieldConfigArgumentMap, GraphQLInputType } from "graphql";
import { getGqlParamMetadata, GqlParamType } from "../decorators/params";

/**
 * Builds a field's GraphQL `args` config from its handler's @Args(name, type)
 * parameter decorators. Only SINGLE_ARG params produce a schema argument —
 * @Args() with no name (the whole-args-object form), @Ctx(), @Parent(), and
 * @Info() are all resolver-side concerns with nothing to add to the schema.
 */
export function buildArgsConfig(
    target: Function,
    handlerName: string,
    toInputType: (raw: any, options?: { nullable?: boolean }) => GraphQLInputType
): GraphQLFieldConfigArgumentMap {
    const paramMeta = getGqlParamMetadata(target, handlerName);
    const args: GraphQLFieldConfigArgumentMap = {};

    for (const meta of paramMeta) {
        if (meta.type !== GqlParamType.SINGLE_ARG || !meta.argName) continue;
        if (!meta.typeThunk) {
            throw new Error(
                `[nyala/graphql] @Args("${meta.argName}") on "${handlerName}" needs a type, ` +
                `e.g. @Args("${meta.argName}", () => String).`
            );
        }
        args[meta.argName] = {
            type: toInputType(meta.typeThunk(), { nullable: meta.nullable }),
        };
    }

    return args;
}
