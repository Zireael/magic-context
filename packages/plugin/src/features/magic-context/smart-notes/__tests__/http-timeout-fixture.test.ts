import { expect, spyOn } from "bun:test";
import { execFileSync } from "node:child_process";
import * as dns from "node:dns/promises";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import * as http from "node:http";
import * as https from "node:https";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { Database } from "../../../../shared/sqlite";
import { runMigrations } from "../../migrations";
import { initializeDatabase } from "../../storage-db";

export const TIMEOUT_URL = "https://smart-note-timeout.test/resource";
export const HTTP_CHECK = `function check(cap) {
    return {met: JSON.parse(cap.httpGet("${TIMEOUT_URL}").body).ready};
}`;
export const COMPILER_OUTPUT = JSON.stringify({
    compiled_check: HTTP_CHECK,
    manifest: { capabilities: ["httpGet"], urls: [TIMEOUT_URL] },
    check_cron: "*/15 * * * *",
});

/** Only the final connector is redirected; the real guard and transport still execute. */
export async function withLocalHttpServer<T>(
    delayMs: number | null,
    run: (requests: () => number) => Promise<T>,
): Promise<T> {
    let requests = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const server = http.createServer((_request, response) => {
        requests++;
        if (delayMs === null) return;
        const timer = setTimeout(() => {
            timers.delete(timer);
            response.end('{"ready":false}');
        }, delayMs);
        timers.add(timer);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test server address");
    const lookup = spyOn(dns, "lookup").mockImplementation((async (hostname: string) => {
        if (hostname !== "smart-note-timeout.test") throw new Error(`unexpected DNS: ${hostname}`);
        return [{ address: "1.1.1.1", family: 4 }];
    }) as typeof dns.lookup);
    const request = spyOn(https, "request").mockImplementation(((
        options: https.RequestOptions,
        callback: (response: http.IncomingMessage) => void,
    ) => {
        if (options.hostname !== "smart-note-timeout.test")
            throw new Error(`unexpected network destination: ${options.hostname}`);
        // SSRF policy stays production-strict. Only this test connector may reach
        // loopback, and no DNS, TLS or socket is opened against a public service.
        return http.request(
            {
                ...options,
                protocol: "http:",
                hostname: "127.0.0.1",
                port: address.port,
                lookup: undefined,
                agent: false,
            },
            callback,
        );
    }) as typeof https.request);
    try {
        return await run(() => requests);
    } finally {
        request.mockRestore();
        lookup.mockRestore();
        for (const timer of timers) clearTimeout(timer);
        const closed = new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
        );
        server.closeAllConnections();
        await closed;
    }
}

let isolationProven = false;
export function timeoutTestDatabase(): { db: Database; dispose: () => void } {
    const configuredRoot = process.env.MAGIC_CONTEXT_TEST_DATA_DIR;
    if (!configuredRoot) throw new Error("test preload must isolate storage");
    const root = realpathSync(configuredRoot);
    if (relative(realpathSync(tmpdir()), root).startsWith(".."))
        throw new Error("test preload must isolate storage below the temp directory");
    const directory = mkdtempSync(join(root, "smart-note-http-"));
    const path = join(directory, "timeout.db");
    const db = new Database(path);
    initializeDatabase(db);
    runMigrations(db);
    if (!isolationProven) {
        const output = execFileSync("lsof", ["-p", String(process.pid)], {
            encoding: "utf8",
            timeout: 10_000,
            windowsHide: true,
        });
        const dbLines = output.split("\n").filter((line) => /\.db(?:[-\s]|$)/.test(line));
        expect(dbLines.some((line) => line.includes(path))).toBe(true);
        for (const line of dbLines) expect(line).toContain(root);
        console.log(`lsof -p ${process.pid}: isolated database descriptors\n${dbLines.join("\n")}`);
        isolationProven = true;
    }
    return {
        db,
        dispose: () => {
            db.close();
            rmSync(directory, { recursive: true, force: true });
        },
    };
}
