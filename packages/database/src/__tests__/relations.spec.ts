import "reflect-metadata";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { DatabaseService } from "../database.service";
import { Model } from "../model";
import { Table, Primary, StringColumn, IntColumn, BooleanColumn, Column } from "../schema/decorators";
import { HasMany, HasOne, BelongsTo, BelongsToMany } from "../relations/decorators";

@Table("authors")
class Author extends Model {
    @Primary() @StringColumn() id!: string;
    @StringColumn() name!: string;

    @HasMany(() => Post, "authorId")
    posts?: Post[];

    @HasOne(() => Profile, "authorId")
    profile?: Profile;

    @BelongsToMany(() => Tag, {
        pivotTable: "author_tags",
        foreignKey: "authorId",
        relatedPivotKey: "tagId",
    })
    tags?: Tag[];
}

@Table("posts")
class Post extends Model {
    @Primary() @StringColumn() id!: string;
    @StringColumn() title!: string;
    @StringColumn() authorId!: string;
    @BooleanColumn() published!: boolean;

    @BelongsTo(() => Author, "authorId")
    author?: Author;
}

@Table("profiles")
class Profile extends Model {
    @Primary() @StringColumn() id!: string;
    @StringColumn() bio!: string;
    @StringColumn() authorId!: string;
}

@Table("tags")
class Tag extends Model {
    @Primary() @StringColumn() id!: string;
    @StringColumn() name!: string;
}

describe("Model relations — real SQLite (in-memory)", () => {
    const db = new DatabaseService();

    beforeAll(async () => {
        await db.connect({ driver: "better-sqlite3", connectionString: ":memory:" });
        Model.setDatabase(db.getDb());

        // Column names default to the exact @StringColumn()-decorated property
        // key (see schema/decorators.ts's addColumnMetadata) — no camelCase-to-
        // snake_case translation — so raw DDL here must use "authorId", not
        // "author_id", to match what SchemaRegistry actually builds.
        const raw = db.getDb() as any;
        raw.run("CREATE TABLE authors (id TEXT PRIMARY KEY, name TEXT NOT NULL)");
        raw.run(
            "CREATE TABLE posts (id TEXT PRIMARY KEY, title TEXT NOT NULL, authorId TEXT NOT NULL, published INTEGER NOT NULL)"
        );
        raw.run("CREATE TABLE profiles (id TEXT PRIMARY KEY, bio TEXT NOT NULL, authorId TEXT NOT NULL)");
        raw.run("CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT NOT NULL)");
        raw.run("CREATE TABLE author_tags (authorId TEXT NOT NULL, tagId TEXT NOT NULL)");
    });

    afterAll(async () => {
        await db.disconnect();
    });

    beforeEach(async () => {
        const raw = db.getDb() as any;
        for (const table of ["posts", "profiles", "author_tags", "tags", "authors"]) {
            raw.run(`DELETE FROM ${table}`);
        }

        await Author.create({ id: "a1", name: "Ada" } as any);
        await Author.create({ id: "a2", name: "Grace" } as any);

        await Post.create({ id: "p1", title: "First", authorId: "a1", published: true } as any);
        await Post.create({ id: "p2", title: "Second", authorId: "a1", published: false } as any);
        await Post.create({ id: "p3", title: "Third", authorId: "a2", published: true } as any);

        await Profile.create({ id: "pr1", bio: "Bio of Ada", authorId: "a1" } as any);

        await Tag.create({ id: "t1", name: "tech" } as any);
        await Tag.create({ id: "t2", name: "history" } as any);
        raw.run("INSERT INTO author_tags VALUES ('a1', 't1')");
        raw.run("INSERT INTO author_tags VALUES ('a1', 't2')");
        raw.run("INSERT INTO author_tags VALUES ('a2', 't1')");
    });

    describe("hasMany", () => {
        it("eager-loads via Model.all({ with })", async () => {
            const authors = await Author.all({ with: ["posts"] });
            const ada = authors.find((a) => a.id === "a1")!;
            expect(ada.posts?.map((p) => p.id).sort()).toEqual(["p1", "p2"]);

            const grace = authors.find((a) => a.id === "a2")!;
            expect(grace.posts?.map((p) => p.id)).toEqual(["p3"]);
        });

        it("eager-loads via Model.find({ with })", async () => {
            const ada = await Author.find("a1", { with: ["posts"] });
            expect(ada?.posts).toHaveLength(2);
        });

        it("eager-loads via QueryBuilder.with()", async () => {
            const authors = await Author.query().with("posts").get();
            const ada = authors.find((a) => a.id === "a1")!;
            expect(ada.posts).toHaveLength(2);
        });

        it("lazy-loads via instance.load()", async () => {
            const ada = await Author.find("a1");
            expect(ada!.posts).toBeUndefined(); // not eager-loaded

            const posts = await ada!.load<Post[]>("posts");
            expect(posts).toHaveLength(2);
            expect(ada!.posts).toHaveLength(2); // also attached onto the instance
        });

        it("returns an empty array, not undefined, for an author with no posts", async () => {
            await Author.create({ id: "a3", name: "Nobody" } as any);
            const author = await Author.find("a3", { with: ["posts"] });
            expect(author?.posts).toEqual([]);
        });

        it("batches into one query regardless of parent row count (no N+1)", async () => {
            const raw = db.getDb() as any;
            let selectCount = 0;
            const originalSelect = raw.select.bind(raw);
            raw.select = (...args: any[]) => {
                selectCount++;
                return originalSelect(...args);
            };

            await Author.all({ with: ["posts"] }); // 2 authors, should still be 2 queries total (authors + posts), not 1 + N

            raw.select = originalSelect;
            expect(selectCount).toBe(2);
        });
    });

    describe("hasOne", () => {
        it("eager-loads a single related record, or null if none exists", async () => {
            const authors = await Author.all({ with: ["profile"] });
            const ada = authors.find((a) => a.id === "a1")!;
            const grace = authors.find((a) => a.id === "a2")!;

            expect(ada.profile?.bio).toBe("Bio of Ada");
            expect(grace.profile).toBeNull();
        });
    });

    describe("belongsTo", () => {
        it("eager-loads the owning-side record", async () => {
            const posts = await Post.query().with("author").orderBy("id").get();
            expect(posts[0].author?.name).toBe("Ada");
            expect(posts[2].author?.name).toBe("Grace");
        });
    });

    describe("belongsToMany", () => {
        it("eager-loads through the pivot table, deduplicated per parent", async () => {
            const authors = await Author.all({ with: ["tags"] });
            const ada = authors.find((a) => a.id === "a1")!;
            const grace = authors.find((a) => a.id === "a2")!;

            expect(ada.tags?.map((t) => t.name).sort()).toEqual(["history", "tech"]);
            expect(grace.tags?.map((t) => t.name)).toEqual(["tech"]);
        });
    });

    describe("QueryBuilder", () => {
        it("where() filters results", async () => {
            const published = await Post.query().where("published", true).get();
            expect(published.map((p) => p.id).sort()).toEqual(["p1", "p3"]);
        });

        it("where() with an explicit operator", async () => {
            const results = await Post.query().where("title", "!=", "First").get();
            expect(results.map((p) => p.id).sort()).toEqual(["p2", "p3"]);
        });

        it("orderBy() + limit() + offset() page through results", async () => {
            const page = await Post.query().orderBy("id", "asc").limit(1).offset(1).get();
            expect(page.map((p) => p.id)).toEqual(["p2"]);
        });

        it("first() returns the first match or null", async () => {
            const first = await Post.query().where("authorId", "a2").first();
            expect(first?.id).toBe("p3");

            const none = await Post.query().where("authorId", "does-not-exist").first();
            expect(none).toBeNull();
        });

        it("combines where() + with() in one call", async () => {
            const results = await Post.query().where("authorId", "a1").with("author").get();
            expect(results).toHaveLength(2);
            expect(results.every((p) => p.author?.name === "Ada")).toBe(true);
        });
    });
});

describe("Relation eager-loading respects tenant scoping — real SQLite (in-memory)", () => {
    // Regression coverage for a real gap found during review: RelationLoader
    // originally queried related tables with zero tenant filtering, so a
    // tenant-scoped parent row's relation would pull *every* tenant's
    // matching rows, not just the active tenant's. Proven here against a
    // real database (not a mock asserting on a captured WHERE clause) so a
    // future regression would actually leak data across tenants in this
    // test, not just fail an assertion about intent.
    @Table("tenant_teams")
    class Team extends Model {
        @Primary() @StringColumn() id!: string;
        @Column({ name: "tenant_id" }) tenantId!: string;
        @StringColumn() name!: string;

        @HasMany(() => Member, "teamId")
        members?: Member[];
    }

    @Table("tenant_members")
    class Member extends Model {
        @Primary() @StringColumn() id!: string;
        @Column({ name: "tenant_id" }) tenantId!: string;
        @StringColumn() teamId!: string;
        @StringColumn() name!: string;
    }

    const db = new DatabaseService();

    beforeAll(async () => {
        await db.connect({ driver: "better-sqlite3", connectionString: ":memory:" });
        Model.setDatabase(db.getDb());

        const raw = db.getDb() as any;
        raw.run("CREATE TABLE tenant_teams (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL)");
        raw.run(
            "CREATE TABLE tenant_members (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, teamId TEXT NOT NULL, name TEXT NOT NULL)"
        );
    });

    afterAll(async () => {
        await db.disconnect();
    });

    beforeEach(async () => {
        const { TenantContext } = await import("@nyalajs/core");
        const raw = db.getDb() as any;
        raw.run("DELETE FROM tenant_members");
        raw.run("DELETE FROM tenant_teams");

        // Same team id "shared", deliberately, in both tenants — the
        // strongest version of this test: if scoping were broken, tenant A's
        // query for team "shared" would happily attach tenant B's members
        // too, since they share the same teamId foreign key value.
        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            await Team.create({ id: "team-a", tenantId: "tenant-a", name: "Team A" } as any);
            await Member.create({ id: "m1", tenantId: "tenant-a", teamId: "team-a", name: "Alice (A)" } as any);
            await Member.create({ id: "m2", tenantId: "tenant-a", teamId: "team-a", name: "Bob (A)" } as any);
        });

        await TenantContext.run(async () => {
            TenantContext.set("tenant-b");
            await Team.create({ id: "team-b", tenantId: "tenant-b", name: "Team B" } as any);
            await Member.create({ id: "m3", tenantId: "tenant-b", teamId: "team-a", name: "Eve (B, same teamId!)" } as any);
        });
    });

    it("does not leak another tenant's related rows into an eager-loaded relation", async () => {
        const { TenantContext } = await import("@nyalajs/core");

        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            const team = await Team.find("team-a", { with: ["members"] });
            expect(team?.members?.map((m) => m.name).sort()).toEqual(["Alice (A)", "Bob (A)"]);
        });
    });

    it("via QueryBuilder.with() too", async () => {
        const { TenantContext } = await import("@nyalajs/core");

        await TenantContext.run(async () => {
            TenantContext.set("tenant-a");
            const teams = await Team.query().with("members").get();
            expect(teams).toHaveLength(1); // tenant-a only sees its own team
            expect(teams[0].members?.map((m) => m.name).sort()).toEqual(["Alice (A)", "Bob (A)"]);
        });
    });

    it("throws instead of silently loading unscoped data when no tenant is active", async () => {
        const team = new Team();
        (team as any).id = "team-a";
        await expect(team.load("members")).rejects.toThrow(/Tenant context required/);
    });
});
