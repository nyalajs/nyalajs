import { Injectable } from "@nyala/core";

@Injectable()
export class UsersService {
    findAll() {
        return [
            { id: 1, name: "John Doe" },
            { id: 2, name: "Jane Smith" },
        ];
    }

    findOne(id: number) {
        return { id, name: "John Doe" };
    }
}
