import { Module } from "@nyalajs/core";
import { UsersModule } from "./users/users.module";
import { ChatModule } from "./chat/chat.module";

@Module({
    imports: [UsersModule, ChatModule],
})
export class AppModule { }
