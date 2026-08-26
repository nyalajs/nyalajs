import { Module } from "@nyalajs/core";
import { NotificationsController } from "./notifications.controller";

@Module({
    controllers: [NotificationsController],
})
export class NotificationsModule { }
