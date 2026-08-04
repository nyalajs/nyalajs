let installed = false;

/**
 * Ensures an uncaught exception or unhandled rejection is always logged
 * clearly before the process exits, instead of surfacing as a raw Node
 * stack trace with no framework context. Node's own guidance is that a
 * process must exit after 'uncaughtException' — its internal state can no
 * longer be trusted — so this does not change whether the process exits,
 * only whether that exit is ever explained.
 *
 * Installed once per process. Skipped under NODE_ENV=test: test runners
 * (this framework's own suite included, via TestingModule.compile() ->
 * NyalaFactory.create()) already report unhandled rejections themselves,
 * and process.exit() here would abort the whole test run instead of
 * failing just the one test.
 */
export function installProcessErrorHandlers(): void {
    if (installed || process.env.NODE_ENV === "test") return;
    installed = true;

    process.on("uncaughtException", (error: Error) => {
        console.error(
            "[nyala] Uncaught exception — exiting because the process's state can no longer be trusted:",
            error
        );
        process.exit(1);
    });

    process.on("unhandledRejection", (reason: unknown) => {
        console.error("[nyala] Unhandled promise rejection — exiting:", reason);
        process.exit(1);
    });
}
