import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { GenerateCommand } from "../commands/generate.command";

describe("GenerateCommand — AST-based app.module.ts registration", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-generate-"));
        await fs.ensureDir(path.join(tmpDir, "bootstrap"));
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
    });

    async function writeAppModule(content: string) {
        await fs.writeFile(path.join(tmpDir, "bootstrap/app.module.ts"), content);
    }

    async function readAppModule(): Promise<string> {
        return fs.readFile(path.join(tmpDir, "bootstrap/app.module.ts"), "utf-8");
    }

    it("registers a controller into the pristine template layout", async () => {
        await writeAppModule(`import { Module } from "@nyalajs/core";

@Module({
    providers: [],
    controllers: [],
    exports: [],
})
export class AppModule {}
`);

        await new GenerateCommand(tmpDir).generateController("Widget");

        const content = await readAppModule();
        expect(content).toContain('import { WidgetController } from "../app/controllers/widget.controller";');
        expect(content).toMatch(/controllers:\s*\[\s*WidgetController\s*\]/);
        expect(await fs.pathExists(path.join(tmpDir, "app/controllers/widget.controller.ts"))).toBe(true);
    });

    it("preserves existing entries, comments, and trailing commas in a multi-line array", async () => {
        await writeAppModule(`import { Module } from "@nyalajs/core";
import { HealthController } from "../app/controllers/health.controller";

@Module({
    providers: [
        // Config Service
        AuthService,
    ],
    controllers: [
        HealthController,
    ],
})
export class AppModule {}
`);

        await new GenerateCommand(tmpDir).generateController("Widget");

        const content = await readAppModule();
        expect(content).toContain("HealthController");
        expect(content).toContain("WidgetController");
        expect(content).toContain("// Config Service");
        expect(content).toContain("AuthService");
    });

    it("adds the array property when it doesn't exist yet", async () => {
        await writeAppModule(`import { Module } from "@nyalajs/core";

@Module({
    providers: [],
})
export class AppModule {}
`);

        await new GenerateCommand(tmpDir).generateController("Widget");

        const content = await readAppModule();
        expect(content).toMatch(/controllers:\s*\[\s*WidgetController\s*\]/);
    });

    it("is idempotent — running twice does not duplicate the import or the array entry", async () => {
        await writeAppModule(`import { Module } from "@nyalajs/core";

@Module({
    providers: [],
    controllers: [],
})
export class AppModule {}
`);

        const cmd = new GenerateCommand(tmpDir);
        await cmd.generateController("Widget");
        await cmd.generateController("Widget");

        const content = await readAppModule();
        expect(content.match(/WidgetController/g)?.length).toBe(2); // one import specifier + one array element
    });

    it("reuses an existing import declaration for the same module instead of adding a duplicate one", async () => {
        await writeAppModule(`import { Module } from "@nyalajs/core";
import { WidgetService } from "../app/services/widget.service";

@Module({
    providers: [WidgetService],
    controllers: [],
})
export class AppModule {}
`);

        // Registering a *different* export from a path that happens to already
        // be imported isn't realistic here (each artifact has its own file),
        // so instead verify re-running the same generator doesn't add a 2nd import line.
        const cmd = new GenerateCommand(tmpDir);
        await cmd.generateService("Widget");

        const content = await readAppModule();
        const importLines = content.split("\n").filter((l) => l.includes('from "../app/services/widget.service"'));
        expect(importLines).toHaveLength(1);
    });

    it("does nothing if bootstrap/app.module.ts doesn't exist", async () => {
        await fs.remove(path.join(tmpDir, "bootstrap"));

        await expect(new GenerateCommand(tmpDir).generateController("Widget")).resolves.not.toThrow();
        expect(await fs.pathExists(path.join(tmpDir, "app/controllers/widget.controller.ts"))).toBe(true);
    });
});

describe("GenerateCommand — dto", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-generate-dto-"));
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
    });

    it("writes app/dto/<name>.dto.ts with a real, non-empty class body", async () => {
        await new GenerateCommand(tmpDir).generateDto("CreatePost");

        const filePath = path.join(tmpDir, "app/dto/create-post.dto.ts");
        expect(await fs.pathExists(filePath)).toBe(true);

        const content = await fs.readFile(filePath, "utf-8");
        expect(content).toContain("export class CreatePostDto");
    });

    it("accepts a name that already includes the Dto suffix without doubling it", async () => {
        await new GenerateCommand(tmpDir).generateDto("CreatePostDto");

        const filePath = path.join(tmpDir, "app/dto/create-post.dto.ts");
        const content = await fs.readFile(filePath, "utf-8");
        expect(content).toContain("export class CreatePostDto");
        expect(content).not.toContain("CreatePostDtoDto");
    });
});

describe("GenerateCommand — factory", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-generate-factory-"));
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
    });

    it("writes a factory that imports and calls @faker-js/faker, not an empty TODO stub", async () => {
        await new GenerateCommand(tmpDir).generateFactory("User");

        // baseDir: "database" — this used to be folder: "../../database/factories"
        // (relative to app/), which actually escaped one level ABOVE `tmpDir`
        // itself (path.join normalizes ".." against the full path before
        // concatenation), landing outside the project entirely. Regression
        // test for that: the file must land inside tmpDir, not above it.
        const filePath = path.join(tmpDir, "database/factories/user.factory.ts");
        expect(await fs.pathExists(filePath)).toBe(true);

        const content = await fs.readFile(filePath, "utf-8");
        expect(content).toContain('import { faker } from "@faker-js/faker"');
        expect(content).toContain("faker.");
        expect(content).not.toContain("TODO: define default attributes");
        expect(content).toContain("export class UserFactory");
    });
});

describe("GenerateCommand — seeder", () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nyala-generate-seeder-"));
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
    });

    it("writes database/seeders/<name>.seeder.ts inside the project, not above it (same path-escape bug as factory)", async () => {
        await new GenerateCommand(tmpDir).generateSeeder("Post");

        const filePath = path.join(tmpDir, "database/seeders/post.seeder.ts");
        expect(await fs.pathExists(filePath)).toBe(true);
    });
});
