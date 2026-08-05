/** Data Transfer Object for creating/updating a post. */
export class PostDto {
    title!: string;
    body!: string;
    published?: boolean;
}
