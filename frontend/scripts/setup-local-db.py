from __future__ import annotations

import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS = ROOT / "drizzle"
D1_STATE = ROOT / ".wrangler" / "state" / "v3" / "d1" / "miniflare-D1DatabaseObject"


def find_database() -> Path:
    databases = [path for path in D1_STATE.glob("*.sqlite") if path.name.lower() != "metadata.sqlite"]
    if not databases:
        raise SystemExit("Banco D1 não encontrado. Execute 'npm run dev' uma vez e tente novamente.")
    return max(databases, key=lambda path: path.stat().st_mtime)


def table_exists(connection: sqlite3.Connection, table: str) -> bool:
    return connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone() is not None


def column_exists(connection: sqlite3.Connection, table: str, column: str) -> bool:
    return table_exists(connection, table) and any(
        row[1] == column for row in connection.execute(f'PRAGMA table_info("{table}")')
    )


def migration_present(connection: sqlite3.Connection, sql: str) -> bool:
    tables = re.findall(r"CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+[`\"\[]?([\w]+)", sql, re.I)
    columns = re.findall(
        r"ALTER\s+TABLE\s+[`\"\[]?([\w]+)[`\"\]]?\s+ADD\s+(?:COLUMN\s+)?[`\"\[]?([\w]+)", sql, re.I
    )
    checks = [table_exists(connection, table) for table in tables]
    checks.extend(column_exists(connection, table, column) for table, column in columns)
    return bool(checks) and all(checks)


def apply_migrations(database: Path) -> None:
    files = sorted(MIGRATIONS.glob("*.sql"))
    if not files:
        raise SystemExit("Nenhuma migração encontrada em drizzle/.")
    with sqlite3.connect(database) as connection:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS __weatherflow_local_migrations "
            "(filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
        )
        applied = {row[0] for row in connection.execute("SELECT filename FROM __weatherflow_local_migrations")}
        for migration in files:
            if migration.name in applied:
                print(f"[OK] {migration.name} já aplicada.")
                continue
            sql = migration.read_text(encoding="utf-8")
            if migration_present(connection, sql):
                print(f"[OK] {migration.name} já existia no banco.")
            else:
                connection.executescript(sql)
                print(f"[APLICADA] {migration.name}")
            connection.execute(
                "INSERT OR REPLACE INTO __weatherflow_local_migrations VALUES (?, ?)",
                (migration.name, datetime.now(timezone.utc).isoformat()),
            )
        connection.commit()
    print(f"\nBanco D1 local preparado com sucesso.\nArquivo: {database}")


if __name__ == "__main__":
    apply_migrations(find_database())
