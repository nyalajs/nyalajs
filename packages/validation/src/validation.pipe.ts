import { UnprocessableEntityException } from "@nyalajs/http";
import { ZodError, ZodSchema } from "zod";

export class ValidationPipe {
    /**
     * Executes the Zod schema against the data.
     * Returns the parsed (and potentially transformed/stripped) data if valid.
     * Throws UnprocessableEntityException if invalid.
     */
    static validate(schema: ZodSchema, data: unknown): any {
        try {
            return schema.parse(data);
        } catch (error) {
            if (error instanceof ZodError) {
                const details = error.errors.map((err) => ({
                    path: err.path.join("."),
                    message: err.message,
                }));
                throw new UnprocessableEntityException("Validation failed", details);
            }
            throw error;
        }
    }
}
