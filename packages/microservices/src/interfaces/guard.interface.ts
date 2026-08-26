import { MicroserviceExecutionContext } from "../context/microservice-execution-context";

/**
 * Same contract as @nyalajs/http's Guard, applied to @MessagePattern /
 * @EventPattern handlers instead of routes. Register with @UseGuards()
 * (the same decorator core already exports for HTTP) on a controller class
 * or individual handler method.
 */
export interface MicroserviceGuard {
    canActivate(context: MicroserviceExecutionContext): Promise<boolean> | boolean;
}
