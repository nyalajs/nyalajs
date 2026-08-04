import * as fs from "fs-extra";
import * as path from "path";
import { AiMessage } from "../providers/types";
import { TranscriptStore } from "./transcript-store";

/** Default TranscriptStore — one JSON file per run under <cwd>/.nyala/resolve-runs/. */
export class FileTranscriptStore implements TranscriptStore {
    constructor(private readonly root: string = path.join(process.cwd(), ".nyala", "resolve-runs")) {}

    async save(runId: string, transcript: AiMessage[]): Promise<void> {
        await fs.ensureDir(this.root);
        await fs.writeJson(this.filePath(runId), transcript, { spaces: 2 });
    }

    async load(runId: string): Promise<AiMessage[] | null> {
        const filePath = this.filePath(runId);
        if (!(await fs.pathExists(filePath))) return null;
        return fs.readJson(filePath);
    }

    async list(): Promise<string[]> {
        if (!(await fs.pathExists(this.root))) return [];
        const files = await fs.readdir(this.root);
        return files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length));
    }

    private filePath(runId: string): string {
        return path.join(this.root, `${runId}.json`);
    }
}
