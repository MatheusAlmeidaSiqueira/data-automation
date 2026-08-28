from __future__ import annotations

import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

FRONTEND_DIR = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = FRONTEND_DIR / "drizzle"
D1_STATE_DIR = (
    FRONTEND_DIR / ".wrangler" / "state" / "v3" / "d1" / "miniflare-D1DatabaseObject"
)


def find_database() -> Path:
    databases = [
        path
        for path in D1_STATE_DIR.glob("*.sqlite")
        if path.name.lower() != "metadata.sqlite"
    ]

    if not databases:
        raise SystemExit(
            "Banco D1 local não encontrado.\n"
            "Execute 'npm run dev' uma vez, encerre com Ctrl+C "
            "e tente novamente."
        )

    return max(databases, key=lambda path: path.stat().st_mtime)


def table_exists(connection: sqlite3.Connection, table: str) -> bool:
    result = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone()
    return result is not None


def column_exists(
    connection: sqlite3.Connection,
    table: str,
    column: str,
) -> bool:
    if not table_exists(connection, table):
        return False

    columns = connection.execute(f'PRAGMA table_info("{table}")').fetchall()

    return any(row[1] == column for row in columns)


def migration_already_present(
    connection: sqlite3.Connection,
    sql: str,
) -> bool:
    created_tables = re.findall(
        r"CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+[`\"\[]?([\w]+)",
        sql,
        flags=re.IGNORECASE,
    )

    added_columns = re.findall(
        r"ALTER\s+TABLE\s+[`\"\[]?([\w]+)[`\"\]]?"
        r"\s+ADD\s+(?:COLUMN\s+)?[`\"\[]?([\w]+)",
        sql,
        flags=re.IGNORECASE,
    )

    checks: list[bool] = []

    checks.extend(table_exists(connection, table) for table in created_tables)

    checks.extend(
        column_exists(connection, table, column) for table, column in added_columns
    )

    return bool(checks) and all(checks)


def apply_migrations(database: Path) -> None:
    migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))

    if not migration_files:
        raise SystemExit("Nenhuma migração SQL foi encontrada em drizzle/.")

    with sqlite3.connect(database) as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS __weatherflow_local_migrations (
                filename TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL
            )
            """)

        applied = {
            row[0]
            for row in connection.execute(
                "SELECT filename FROM __weatherflow_local_migrations"
            )
        }

        for migration in migration_files:
            if migration.name in applied:
                print(f"[OK] {migration.name} já aplicada.")
                continue

            sql = migration.read_text(encoding="utf-8")

            if migration_already_present(connection, sql):
                print(f"[OK] {migration.name} já existia no banco.")
            else:
                connection.executescript(sql)
                print(f"[APLICADA] {migration.name}")

            connection.execute(
                """
                INSERT OR REPLACE INTO __weatherflow_local_migrations
                (filename, applied_at)
                VALUES (?, ?)
                """,
                (
                    migration.name,
                    datetime.now(timezone.utc).isoformat(),
                ),
            )

        connection.commit()

    print("\nBanco D1 local preparado com sucesso.")
    print(f"Arquivo: {database}")


if __name__ == "__main__":
    apply_migrations(find_database())
