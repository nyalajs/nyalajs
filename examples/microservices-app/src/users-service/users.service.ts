import { Injectable } from "@nyalajs/core";

@Injectable()
export class UsersService {
    private readonly users = [
        { id: "1", name: "John Doe" },
        { id: "2", name: "Jane Smith" },
    ];

    findOne(id: string) {
        return this.users.find((user) => user.id === id) ?? null;
    }

    findAll() {
        return this.users;
    }
}
