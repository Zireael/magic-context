"""Copy-only acquisition; the sole SQL against live stores is VACUUM INTO.

The destination contains private transcripts even after auth tables are removed.
Run under an outer timeout and remove the destination after writing the report.
"""
from datetime import datetime
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import time


def sql(path, command):
    subprocess.run(["sqlite3", str(path), command], check=True, timeout=1800)


def main():
    os.umask(0o077)
    since = sys.argv[1] if len(sys.argv) > 1 else "2026-09-27T00:00:00Z"
    until = sys.argv[2] if len(sys.argv) > 2 else "2026-10-04T23:59:59.999Z"
    bounds = [int(datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp() * 1000)
              for v in [since, until]]
    root = Path(os.environ.get("TMPDIR", "/tmp")) / "magic-context/reasoning-diff"
    root.mkdir(parents=True, exist_ok=False)
    source = Path.home() / ".local/share/opencode"
    inventory = []
    # Named channel stores only, not archives, auth files or service registrations.
    for path in sorted(source.glob("opencode*.db")):
        destination = root / path.name
        escaped = str(destination).replace("'", "''")
        sql(path, f"VACUUM INTO '{escaped}'")
        sql(destination, "DROP TABLE IF EXISTS credential; DROP TABLE IF EXISTS account; "
            "DROP TABLE IF EXISTS account_state; DROP TABLE IF EXISTS control_account;")
        with sqlite3.connect(str(destination)) as db:
            tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")]
            # The full v1 store can be tens of GB. Keep all rows and parts in the
            # requested window in a reduced copy before the final VACUUM, avoiding
            # a second full-size rebuild. No additional SQL touches the live DB.
            if "message" in tables and "part" in tables:
                reduced = root / "reduced.db"
                db.execute("ATTACH DATABASE ? AS reduced", [str(reduced)])
                db.execute("CREATE TABLE reduced.message AS SELECT * FROM main.message "
                           "WHERE time_created >= ? AND time_created <= ?", bounds)
                db.execute("CREATE TABLE reduced.part AS SELECT p.* FROM main.part p "
                           "JOIN reduced.message m ON m.id=p.message_id")
                db.execute("CREATE INDEX reduced.part_message ON part(message_id)")
                db.execute("CREATE INDEX reduced.message_session ON message(session_id,time_created,id)")
                db.commit()
            else:
                reduced = None
        if reduced:
            destination.unlink()
            reduced.rename(destination)
        sql(destination, "VACUUM; PRAGMA quick_check;")
        inventory.append({"file": path.name, "bytes": destination.stat().st_size,
                          "sourceTables": tables, "reducedV1Window": bool(reduced)})
        print(f"Sanitized {path.name}", flush=True)
    sessions = Path.home() / ".pi/agent/sessions"
    files = list(sessions.glob("*/*.jsonl"))
    selected = [p for p in files if p.stat().st_mtime >= time.time() - 7 * 86400]
    (root / "pi").mkdir()
    for path in selected:
        destination = root / "pi" / path.relative_to(sessions)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, destination)
    (root / "inventory.json").write_text(json.dumps({
        "copiedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "since": since, "until": until, "databases": inventory,
        "piFilesInventoried": len(files), "piFilesCopied": len(selected),
        "piSelection": "mtime within seven days of acquisition; entry timestamps filtered in analysis",
        "piFiles": [str(p.relative_to(sessions)) for p in selected],
    }, indent=2))
    print(f"Copied {len(selected)} of {len(files)} Pi files to {root}", flush=True)


if __name__ == "__main__":
    main()
