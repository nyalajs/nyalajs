export interface ModuleInfo {
    name: string;
    imports: string[];
    providers: string[];
    controllers: string[];
}

export interface RouteInfo {
    method: string;
    path: string;
    controller: string;
    handler: string;
}

export interface ProjectStructure {
    modules: ModuleInfo[];
    routes: RouteInfo[];
}
