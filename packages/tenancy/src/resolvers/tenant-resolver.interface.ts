export interface TenantResolver {
    resolve(request: any): Promise<string | undefined>;
}
