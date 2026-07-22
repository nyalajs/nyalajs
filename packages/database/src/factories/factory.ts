export abstract class Factory<T extends Record<string, any>> {
    /**
     * The model associated with this factory.
     */
    abstract model: new () => T;

    /**
     * Define the model's default state.
     */
    abstract definition(): Partial<T>;

    /**
     * Make a single instance of the model without saving it to the database.
     */
    make(overrides: Partial<T> = {}): T {
        const instance = new this.model();
        Object.assign(instance, this.definition(), overrides);
        return instance;
    }

    /**
     * Make multiple instances without saving.
     */
    makeMany(count: number, overrides: Partial<T> = {}): T[] {
        return Array.from({ length: count }).map(() => this.make(overrides));
    }

    /**
     * Create a single instance and save it to the database.
     * Note: This requires the model to have a .save() method, like Nyala's Active Record Model.
     */
    async create(overrides: Partial<T> = {}): Promise<T> {
        const instance = this.make(overrides);
        if (typeof (instance as any).save === "function") {
            await (instance as any).save();
        }
        return instance;
    }

    /**
     * Create multiple instances and save them.
     */
    async createMany(count: number, overrides: Partial<T> = {}): Promise<T[]> {
        const instances = this.makeMany(count, overrides);
        return Promise.all(
            instances.map(async (instance) => {
                if (typeof (instance as any).save === "function") {
                    await (instance as any).save();
                }
                return instance;
            })
        );
    }
}
