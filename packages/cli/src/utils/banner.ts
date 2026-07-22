import chalk from "chalk";

/**
 * NyalaJS CLI banner.
 * Renders "NyalaJS" in ANSI Shadow block font with a green→gold colour ramp.
 * Style: clean, like Laravel's artisan splash.
 */

// ── 6-row colour ramp (dark green → bright green, top → bottom) ──────────────
const ROW_COLORS = [
  chalk.hex("#0E5C2F"),
  chalk.hex("#1A7A3F"),
  chalk.hex("#229950"),
  chalk.hex("#2BB562"),
  chalk.hex("#35CF76"),
  chalk.bold.hex("#44E887"),
];

const GOLD = chalk.hex("#D4A017");
const SILVER = chalk.hex("#9BA8A0");
const GREEN = chalk.hex("#2BB562");
const BRIGHT = chalk.bold.hex("#44E887");
const DIM = chalk.hex("#1A6B3A");

// ── ANSI Shadow font, 6 rows each ─────────────────────────────────────────────
const FONT: Record<string, string[]> = {
  N: [
    "███╗   ██╗",
    "████╗  ██║",
    "██╔██╗ ██║",
    "██║╚██╗██║",
    "██║ ╚████║",
    "╚═╝  ╚═══╝",
  ],
  y: [
    "██╗   ██╗",
    "╚██╗ ██╔╝",
    " ╚████╔╝ ",
    "  ╚██╔╝  ",
    "   ██║   ",
    "   ╚═╝   ",
  ],
  a: [
    " █████╗ ",
    "██╔══██╗",
    "███████║",
    "██╔══██║",
    "██║  ██║",
    "╚═╝  ╚═╝",
  ],
  l: [
    "██╗     ",
    "██║     ",
    "██║     ",
    "██║     ",
    "███████╗",
    "╚══════╝",
  ],
  J: [
    "     ██╗",
    "     ██║",
    "     ██║",
    "██   ██║",
    "╚█████╔╝",
    " ╚════╝ ",
  ],
  S: [
    "███████╗",
    "██╔════╝",
    "███████╗",
    "╚════██║",
    "███████║",
    "╚══════╝",
  ],
  ".": [
    "   ",
    "   ",
    "   ",
    "   ",
    "██╗",
    "╚═╝",
  ],
};

// Word to render — "Nyala.js"
const WORD: string[] = ["N", "y", "a", "l", "a", ".", "J", "S"];
const GAP = "  ";

function buildWordmark(): string[] {
  return Array.from({ length: 6 }, (_, r) =>
    ROW_COLORS[r](
      WORD.map((ch, i) => (i ? GAP : "") + FONT[ch][r]).join("")
    )
  );
}

function rule(n = 62): string {
  return GOLD("  " + "─".repeat(n));
}

// ── public API ────────────────────────────────────────────────────────────────

/** Main banner — shown on every `nyala` invocation. */
export function printBanner(): void {
  const rows = buildWordmark();
  console.log();
  rows.forEach((r) => console.log("  " + r));
  console.log();
  console.log(
    "  " +
    SILVER("Enterprise TypeScript Framework  ") +
    GOLD("·") +
    SILVER("  batteries-included  ") +
    GOLD("·") +
    SILVER("  SaaS-ready")
  );
  console.log(rule());
  console.log("  " + DIM("v0.1.0") + SILVER("  ·  ") + DIM("@nyala/cli"));
  console.log();
}

/** Welcome splash shown after `nyala new <name>`. */
export function printWelcomeBanner(appName: string): void {
  console.log();
  console.log(rule());
  console.log();
  console.log("  " + BRIGHT("🎉  Congratulations! Your Nyala project is ready!"));
  console.log();
  console.log("  " + SILVER("   Project : ") + BRIGHT(appName));
  console.log("  " + SILVER("   Location: ") + GREEN(`./${appName}`));
  console.log();
  console.log(rule());
  console.log();

  // Next steps
  console.log("  " + GOLD("⚡ Quick Start"));
  console.log();

  const step = (n: string, cmd: string, note: string) =>
    "  " +
    GOLD(n + "  ") +
    GREEN(cmd.padEnd(26)) +
    SILVER(note);

  console.log(step("①", `cd ${appName}`, "navigate to your project"));
  console.log(step("②", "npm install", "install dependencies"));
  console.log(step("③", "cp .env.example .env", "configure environment"));
  console.log(step("④", "npm run dev", "start development server"));
  console.log();
  console.log("  " + SILVER("Your app will be running at ") + BRIGHT("http://localhost:3000"));
  console.log();

  // Generators
  console.log(rule());
  console.log();
  console.log("  " + GOLD("📦 Code Generators"));
  console.log();
  console.log("  " + SILVER("Scaffold new components instantly:"));
  console.log();

  const gen = (type: string, arg: string, dest: string) =>
    "  " +
    SILVER("$ nyala generate ") +
    BRIGHT(type.padEnd(12)) +
    GOLD(arg.padEnd(8)) +
    SILVER("→  " + dest);

  console.log(gen("controller", "User", "app/controllers/user.controller.ts"));
  console.log(gen("service", "User", "app/services/user.service.ts"));
  console.log(gen("middleware", "Auth", "app/middleware/auth.middleware.ts"));
  console.log(gen("model", "User", "app/models/user.model.ts"));
  console.log(gen("repository", "User", "app/repositories/user.repository.ts"));
  console.log();

  // Resources
  console.log(rule());
  console.log();
  console.log("  " + GOLD("📚 Resources"));
  console.log();
  console.log("  " + SILVER("Documentation  ") + BRIGHT("https://nyalajs.dev"));
  console.log("  " + SILVER("GitHub         ") + BRIGHT("https://github.com/nyalajs/nyala"));
  console.log("  " + SILVER("Discord        ") + BRIGHT("https://discord.gg/nyalajs"));
  console.log("  " + SILVER("Examples       ") + BRIGHT("https://github.com/nyalajs/examples"));
  console.log();

  // Footer
  console.log(rule());
  console.log();
  console.log("  " + BRIGHT("✨  Welcome to the Nyala community!"));
  console.log("  " + SILVER("    Build something amazing.") + GOLD("  🚀"));
  console.log();
}
