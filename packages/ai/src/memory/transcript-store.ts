import { AiMessage } from "../providers/types";

/**
 * Deliberately dumb — save/load/list, nothing smarter. Fixes an already-
 * felt problem (a resolve run's entire reasoning vanishes the moment the
 * process exits, with no way to ever inspect it again), without guessing
 * at a memory system nobody's asked for yet. Any future semantic/vector/
 * episodic memory reads through an interface like this, it doesn't replace
 * it — see ARCHITECTURE.md.
 */
export interface TranscriptStore {
    save(runId: string, transcript: AiMessage[]): Promise<void>;
    load(runId: string): Promise<AiMessage[] | null>;
    list(): Promise<string[]>;
}
