"""Copy all data from one database to another, empty one.

Use it to move to Neon from a SQLite file (e.g. a backup downloaded from
Submissions -> Backup), or to restore a backup into a fresh database:

    python -m app.copydb praabhaav-backup-2026-10-09.db "postgresql://...neon.tech/neondb?sslmode=require"

SOURCE and DEST are each a SQLite file path or a postgres:// URL. The
destination must be empty; nothing is ever merged or overwritten.
"""

import sys

from .db import Database


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__)
        return 2
    source, dest = (Database(target) for target in argv)
    try:
        counts = source.copy_into(dest)
    except ValueError as exc:
        print(f"Stopped: {exc}")
        return 1
    for table, n in counts.items():
        print(f"{table:18} {n:6} rows")
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
