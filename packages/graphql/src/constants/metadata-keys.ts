// GraphQL-specific metadata keys. Guard/interceptor/filter metadata is
// deliberately NOT duplicated here — @UseGuards()/@UseInterceptors()/@UseFilters()
// from @nyalajs/core write to NYALA_GUARDS/NYALA_INTERCEPTORS/NYALA_FILTERS,
// and this package's dispatcher reads them via the same MetadataScanner HTTP
// and microservices use, so those decorators work unchanged on @Resolver()
// classes with no extra wiring.

export const NYALA_GQL_OBJECT_TYPE = "nyala:gql:object-type";
export const NYALA_GQL_INPUT_TYPE = "nyala:gql:input-type";
export const NYALA_GQL_FIELDS = "nyala:gql:fields";
export const NYALA_GQL_RESOLVER = "nyala:gql:resolver";
export const NYALA_GQL_OPERATIONS = "nyala:gql:operations";
export const NYALA_GQL_ARGS = "nyala:gql:args";
export const NYALA_GQL_FIELD_RESOLVERS = "nyala:gql:field-resolvers";
