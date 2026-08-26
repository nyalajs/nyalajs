import { Module } from "@nyalajs/core";
import { ChatGateway } from "./chat.gateway";

@Module({
    providers: [ChatGateway],
})
export class ChatModule { }
