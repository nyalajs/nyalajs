import { Injectable } from "@nyalajs/core";
import * as dotenv from "dotenv";
import * as Joi from "joi";
import * as fs from "fs";
import * as path from "path";

export interface ConfigOptions {
    envFilePath?: string;
    schema?: Joi.ObjectSchema;
    ignoreEnvFile?: boolean;
}

@Injectable()
export class ConfigService {
    private config: Record<string, any> = {};
    private namespaces: Record<string, Record<string, any>> = {};

    constructor(options: ConfigOptions = {}) {
        this.loadConfiguration(options);
    }

    /**
     * Registers a namespaced config object (e.g. the default export of
     * config/database.ts) so it can be read via get("database.host") or
     * getNamespace("database"). See docs/requirements.md §9.
     */
    load(namespace: string, values: Record<string, any>): void {
        this.namespaces[namespace] = values;
    }

    getNamespace<T = Record<string, any>>(namespace: string): T {
        const values = this.namespaces[namespace];

        if (values === undefined) {
            throw new Error(`Configuration namespace "${namespace}" not loaded`);
        }

        return values as T;
    }

    private loadConfiguration(options: ConfigOptions): void {
        // Load from .env file
        if (!options.ignoreEnvFile) {
            const envPath = options.envFilePath ?? ".env";
            if (fs.existsSync(envPath)) {
                dotenv.config({ path: envPath });
            }

            // Load environment-specific file
            const env = process.env.NODE_ENV ?? "development";
            const envSpecificPath = `.env.${env}`;
            if (fs.existsSync(envSpecificPath)) {
                dotenv.config({ path: envSpecificPath });
            }
        }

        // Merge with process.env
        this.config = { ...process.env };

        // Validate against schema
        if (options.schema) {
            const { error, value } = options.schema.validate(this.config, {
                allowUnknown: true,
                abortEarly: false,
            });

            if (error) {
                throw new Error(
                    `Configuration validation failed: ${error.details
                        .map((d) => d.message)
                        .join(", ")}`
                );
            }

            this.config = value;
        }
    }

    /**
     * Reads a raw env var (get("PORT")) or, for dotted keys, a value out of
     * a namespace registered via load() (get("database.host") reads
     * namespaces["database"].host, with support for further nesting).
     */
    get<T = any>(key: string, defaultValue?: T): T {
        const value = key.includes(".") ? this.getNamespacedValue(key) : this.config[key];

        if (value === undefined) {
            if (defaultValue !== undefined) {
                return defaultValue;
            }
            throw new Error(`Configuration key "${key}" not found`);
        }

        return value as T;
    }

    private getNamespacedValue(key: string): any {
        const [namespace, ...path] = key.split(".");
        let current: any = this.namespaces[namespace];

        for (const segment of path) {
            if (current === undefined || current === null) {
                return undefined;
            }
            current = current[segment];
        }

        return current;
    }

    getOrThrow<T = any>(key: string): T {
        const value = this.config[key];

        if (value === undefined) {
            throw new Error(`Required configuration key "${key}" not found`);
        }

        return value as T;
    }

    has(key: string): boolean {
        return this.config[key] !== undefined;
    }

    getAll(): Record<string, any> {
        return { ...this.config };
    }
}
