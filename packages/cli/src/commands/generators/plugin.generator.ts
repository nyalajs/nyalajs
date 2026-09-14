import { toPascalCase } from "../../utils/naming";

export function getPluginTemplate(name: string): string {
    const className = toPascalCase(name) + "Plugin";
    return `import { NyalaPlugin, NyalaApplication } from "@nyalajs/core";

export default class ${className} implements NyalaPlugin {
  name = "${name}";

  /**
   * Called once during application boot (before HTTP server starts).
   * Register services, routes, or middleware here.
   */
  async register(app: NyalaApplication): Promise<void> {
    // TODO: register plugin services
    // app.get(SomeService).configure({...});
    console.log("[${name}] Plugin registered.");
  }

  /**
   * Called after all plugins are registered.
   * Safe to depend on other plugins here.
   */
  async boot(app: NyalaApplication): Promise<void> {
    // TODO: run post-registration startup logic
  }
}
`;
}
