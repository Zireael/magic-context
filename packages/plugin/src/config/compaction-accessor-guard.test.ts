import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// isCompactionEnabled (config/agent-disable.ts) is the ONLY non-schema reader
// of the `compaction.enabled` config path. Every gate site (pi-plugin, cli,
// plugin boot, session hooks) must IMPORT it and never re-derive the value.
// This guard asserts no other source file reads `compaction.enabled` or
// `compaction?.enabled` directly. Precedent: the runMigrations import guard
// (packages/cli/src/lib/migration-import-guard.test.ts).
//
// The schema file (config/schema/magic-context.ts) is the single producer of
// the path and is excluded; the accessor file (config/agent-disable.ts) is the
// single consumer and is excluded. The storage helpers read a DB column
// (compaction_mode_record), not the config path, so they are not in scope.

const REPOSITORY_ROOT = resolve(import.meta.dir, "../../../..");
const SOURCE_ROOTS = ["packages/cli/src", "packages/plugin/src", "packages/pi-plugin/src"];

const ALLOWED_READERS = new Set<string>([
    // The accessor itself — the one permitted non-schema reader.
    "packages/plugin/src/config/agent-disable.ts",
    // The Zod schema that defines the path.
    "packages/plugin/src/config/schema/magic-context.ts",
    // project-security.ts references the path NAME in a warning string when it
    // strips the project-tier field; it never reads the parsed config path.
    // The strip operates on a raw Record<string, unknown> by key name, not on
    // a parsed MagicContextConfig.
    "packages/plugin/src/config/project-security.ts",
    // OMP's own setting key appears only as an external CLI string literal;
    // these files never read Magic Context's parsed compaction config.
    "packages/cli/src/lib/omp-helpers.ts",
    "packages/cli/src/commands/setup-omp.ts",
    "packages/cli/src/commands/doctor-omp.ts",
]);

/**
 * Normalize a relative path to POSIX separators on every platform.
 *
 * `path.relative` returns the PLATFORM separator. On Windows that is a
 * backslash, so a repository-relative path came out as
 * `packages\\plugin\\src\\...` while ALLOWED_READERS is written with forward
 * slashes. `Set.has` compares strings exactly, so every sanctioned exception
 * stopped matching and the guard reported its OWN allow-list as six offenders.
 *
 * The symptom is a permanently failing test, which is the state a guard is
 * usually "fixed" by deleting rather than by repairing. Matching on a
 * separator-independent form keeps the allow-list meaningful on every
 * platform, which is the whole point of having one.
 */
function toPosixPath(path: string): string {
    return path.replace(/\\/g, "/");
}

function sourceFiles(directory: string): string[] {
    const result: string[] = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            result.push(...sourceFiles(path));
        } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
            result.push(path);
        }
    }
    return result;
}

// Conservatively matches the textual token `compaction.enabled` or
// `compaction?.enabled`, including string literals. False positives are
// allow-listed only after confirming they do not read Magic Context's parsed
// config path.
// It does NOT match the DB column `compaction_mode_record`, the accessor name
// `isCompactionEnabled`, or the schema's own `.object({ enabled: ... })`.
const COMPACTION_ENABLED_READ = /\bcompaction\??\s*\.\s*enabled\b(?!_)/;

describe("compaction.enabled accessor exclusivity (issue #266)", () => {
    it("no non-schema source file reads compaction.enabled directly", () => {
        const offenders: string[] = [];
        for (const root of SOURCE_ROOTS) {
            for (const path of sourceFiles(resolve(REPOSITORY_ROOT, root))) {
                const relativePath = toPosixPath(relative(REPOSITORY_ROOT, path));
                if (ALLOWED_READERS.has(relativePath)) continue;
                const source = readFileSync(path, "utf8");
                if (COMPACTION_ENABLED_READ.test(source)) {
                    offenders.push(relativePath);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("normalizes path separators so the allow-list matches on Windows", () => {
        // The bug this pins: `relative()` hands back backslashes on Windows,
        // so without normalization ALLOWED_READERS grants no exception at all
        // and the guard is red for reasons that have nothing to do with the
        // rule it exists to enforce. Written separator-explicitly so it fails
        // on every platform, not only where the separator happens to differ.
        expect(toPosixPath("packages\\plugin\\src\\config\\agent-disable.ts")).toBe(
            "packages/plugin/src/config/agent-disable.ts",
        );
        expect(
            ALLOWED_READERS.has(toPosixPath("packages\\plugin\\src\\config\\agent-disable.ts")),
        ).toBe(true);
        // A POSIX path must survive unchanged.
        expect(toPosixPath("packages/cli/src/lib/omp-helpers.ts")).toBe(
            "packages/cli/src/lib/omp-helpers.ts",
        );
    });

    it("allow-lists only files that still exist", () => {
        // An entry naming a moved or deleted file is dead weight that hides the
        // entry someone still needs to add.
        const missing = [...ALLOWED_READERS].filter(
            (entry) => !existsSync(resolve(REPOSITORY_ROOT, entry)),
        );
        expect(missing).toEqual([]);
    });

    it("grants every allow-listed file the exception it claims", () => {
        // Each entry is only legitimate if the file really does mention the
        // config path; otherwise it is a hole, not an exception.
        const inert = [...ALLOWED_READERS].filter(
            (entry) =>
                !COMPACTION_ENABLED_READ.test(
                    readFileSync(resolve(REPOSITORY_ROOT, entry), "utf8"),
                ),
        );
        expect(inert).toEqual([]);
    });

    it("isCompactionEnabled is exported from the accessor module", async () => {
        const mod = await import("../config/agent-disable");
        expect(typeof mod.isCompactionEnabled).toBe("function");
    });

    it("isCompactionEnabled resolves default-on for absent block and explicit true, off for false", async () => {
        const { isCompactionEnabled } = await import("../config/agent-disable");
        expect(isCompactionEnabled({})).toBe(true);
        expect(isCompactionEnabled({ compaction: {} })).toBe(true);
        expect(isCompactionEnabled({ compaction: { enabled: true } })).toBe(true);
        expect(isCompactionEnabled({ compaction: { enabled: false } })).toBe(false);
        expect(isCompactionEnabled({ compaction: null })).toBe(true);
    });
});
