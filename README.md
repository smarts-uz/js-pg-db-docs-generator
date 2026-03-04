# pgdocgen

PostgreSQL database documentation generator — CLI tool, zero UI, pure JS.

## Install

```bash
npm install
```

## Usage

```bash
# .env orqali (tavsiya)
cp .env.example .env
# .env ni to'ldiring
node bin/pgdocgen.js generate

# Yoki flaglar orqali
node bin/pgdocgen.js generate \
  --host localhost \
  --database myapp \
  --user postgres \
  --password secret \
  --schemas public,analytics \
  --output ./docs/database.html

# Connection URL bilan
node bin/pgdocgen.js generate \
  --url "postgresql://user:pass@localhost:5432/mydb" \
  --output ./docs/db.html

# SSL bilan (RDS, Supabase, Neon)
node bin/pgdocgen.js generate \
  --url "postgresql://..." \
  --ssl
```

## Flags

| Flag             | Default      | Description                        |
|------------------|--------------|------------------------------------|
| `--url`          | —            | Full PostgreSQL connection URL      |
| `--host`         | localhost    | DB host                             |
| `--port`         | 5432         | DB port                             |
| `-d, --database` | $PGDATABASE  | Database name                       |
| `-U, --user`     | postgres     | DB user                             |
| `-W, --password` | $PGPASSWORD  | DB password                         |
| `-s, --schemas`  | public       | Schemas (comma-separated)           |
| `-o, --output`   | ./db-docs.html | Output HTML file path             |
| `--title`        | DB name      | Page title                          |
| `--ssl`          | false        | Enable SSL                          |

## What gets documented

- Tables with columns (type, nullable, default, PK/UK badges, comment)
- Indexes (type, uniqueness, definition)
- Foreign keys (with clickable links)
- Triggers
- Views (with SQL definition)
- Functions & procedures (signature + body preview)
- Custom types (ENUMs with values, domains, composites)
- Sequences
- Installed extensions

## Requirements

- Node.js >= 18
- PostgreSQL 10–16
- Read-only DB access (no superuser needed)
