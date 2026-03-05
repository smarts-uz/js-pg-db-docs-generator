// ─── Schema Extractor ────────────────────────────────────────────────────────
// Uses pg_catalog & information_schema — no superuser needed, works PG 10-16

export async function extractSchema(pool, schemas) {
  const schemaList = schemas.split(',').map(s => s.trim());

  const [tables, views, functions, types, sequences, extensions] = await Promise.all([
    getTables(pool, schemaList),
    getViews(pool, schemaList),
    getFunctions(pool, schemaList),
    getTypes(pool, schemaList),
    getSequences(pool, schemaList),
    getExtensions(pool),
  ]);

  // attach columns + indexes + FK per table
  for (const tbl of tables) {
    const [cols, indexes, fks, triggers] = await Promise.all([
      getColumns(pool, tbl.schema, tbl.name),
      getIndexes(pool, tbl.schema, tbl.name),
      getForeignKeys(pool, tbl.schema, tbl.name),
      getTriggers(pool, tbl.schema, tbl.name),
    ]);
    tbl.columns  = cols;
    tbl.indexes  = indexes;
    tbl.fks      = fks;
    tbl.triggers = triggers;
  }

  return { tables, views, functions, types, sequences, extensions };
}

// ── Tables ──────────────────────────────────────────────────────────────────
async function getTables(pool, schemas) {
  const { rows } = await pool.query(`
    SELECT
      n.nspname                            AS schema,
      c.relname                            AS name,
      obj_description(c.oid, 'pg_class')  AS comment,
      c.reltuples::bigint                  AS row_estimate,
      pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname = ANY($1)
    ORDER BY n.nspname, c.relname
  `, [schemas]);
  return rows;
}

// ── Columns ─────────────────────────────────────────────────────────────────
async function getColumns(pool, schema, table) {
  const { rows } = await pool.query(`
    SELECT
      a.attnum                                      AS num,
      a.attname                                     AS name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
      NOT a.attnotnull                              AS nullable,
      pg_get_expr(ad.adbin, ad.adrelid)             AS default_val,
      col_description(c.oid, a.attnum)              AS comment,
      EXISTS (
        SELECT 1 FROM pg_constraint pc
        WHERE pc.conrelid = c.oid
          AND pc.contype = 'p'
          AND a.attnum = ANY(pc.conkey)
      ) AS is_pk,
      EXISTS (
        SELECT 1 FROM pg_constraint pc
        WHERE pc.conrelid = c.oid
          AND pc.contype = 'u'
          AND a.attnum = ANY(pc.conkey)
      ) AS is_unique
    FROM pg_attribute a
    JOIN pg_class c     ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
    WHERE n.nspname = $1
      AND c.relname  = $2
      AND a.attnum   > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  `, [schema, table]);
  return rows;
}

// ── Indexes ──────────────────────────────────────────────────────────────────
async function getIndexes(pool, schema, table) {
  const { rows } = await pool.query(`
    SELECT
      i.relname          AS name,
      ix.indisunique     AS is_unique,
      ix.indisprimary    AS is_primary,
      am.amname          AS type,
      pg_get_indexdef(ix.indexrelid) AS definition
    FROM pg_index ix
    JOIN pg_class c  ON c.oid  = ix.indrelid
    JOIN pg_class i  ON i.oid  = ix.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_am am    ON am.oid = i.relam
    WHERE n.nspname = $1 AND c.relname = $2
    ORDER BY i.relname
  `, [schema, table]);
  return rows;
}

// ── Foreign Keys ─────────────────────────────────────────────────────────────
async function getForeignKeys(pool, schema, table) {
  const { rows } = await pool.query(`
    SELECT
      con.conname                       AS name,
      kcu.column_name                   AS column,
      ccu.table_schema                  AS ref_schema,
      ccu.table_name                    AS ref_table,
      ccu.column_name                   AS ref_column,
      con.confupdtype                   AS on_update,
      con.confdeltype                   AS on_delete
    FROM pg_constraint con
    JOIN pg_namespace n  ON n.oid  = con.connamespace
    JOIN pg_class c      ON c.oid  = con.conrelid
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name  = con.conname
     AND kcu.table_schema     = n.nspname
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name  = con.conname
    WHERE con.contype = 'f'
      AND n.nspname   = $1
      AND c.relname   = $2
    ORDER BY con.conname
  `, [schema, table]);
  return rows;
}

// ── Triggers ─────────────────────────────────────────────────────────────────
async function getTriggers(pool, schema, table) {
  const { rows } = await pool.query(`
    SELECT
      t.tgname                AS name,
      CASE t.tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
      CASE
        WHEN t.tgtype & 4  = 4 THEN 'INSERT'
        WHEN t.tgtype & 8  = 8 THEN 'DELETE'
        WHEN t.tgtype & 16 = 16 THEN 'UPDATE'
        ELSE 'UNKNOWN'
      END                     AS event,
      p.proname               AS function_name,
      t.tgenabled != 'D'      AS enabled
    FROM pg_trigger t
    JOIN pg_class c      ON c.oid = t.tgrelid
    JOIN pg_namespace n  ON n.oid = c.relnamespace
    JOIN pg_proc p       ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal
      AND n.nspname = $1
      AND c.relname = $2
    ORDER BY t.tgname
  `, [schema, table]);
  return rows;
}

// ── Views ────────────────────────────────────────────────────────────────────
async function getViews(pool, schemas) {
  const { rows } = await pool.query(`
    SELECT
      table_schema  AS schema,
      table_name    AS name,
      view_definition AS definition
    FROM information_schema.views
    WHERE table_schema = ANY($1)
    ORDER BY table_schema, table_name
  `, [schemas]);
  return rows;
}

// ── Functions ────────────────────────────────────────────────────────────────
async function getFunctions(pool, schemas) {
  const { rows } = await pool.query(`
    SELECT
      n.nspname                         AS schema,
      p.proname                         AS name,
      pg_get_function_arguments(p.oid)  AS arguments,
      pg_get_function_result(p.oid)     AS return_type,
      l.lanname                         AS language,
      p.prosecdef                       AS security_definer,
      obj_description(p.oid, 'pg_proc') AS comment,
      p.prosrc                          AS body
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l  ON l.oid = p.prolang
    WHERE n.nspname = ANY($1)
      AND p.prokind IN ('f','p')

      -- system schema
      AND n.nspname NOT IN ('pg_catalog','information_schema')

      -- internal helper functions
      AND p.proname NOT LIKE 'pg_%'
      AND p.proname NOT LIKE 'gin_%'
      AND p.proname NOT LIKE 'gen_%'
      AND p.proname NOT LIKE 'gist_%'
      AND p.proname NOT LIKE 'gtrgm_%'
      AND p.proname NOT LIKE 'ghstore_%'
      AND p.proname NOT LIKE 'hstore%'
      AND p.proname NOT LIKE 'uuid%'

      -- extension functions
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        JOIN pg_extension e ON e.oid = d.refobjid
        WHERE d.objid = p.oid
      )

    ORDER BY n.nspname, p.proname
  `, [schemas]);

  return rows;
}

// ── Custom Types & Enums ─────────────────────────────────────────────────────
async function getTypes(pool, schemas) {
  const { rows } = await pool.query(`
    SELECT
      n.nspname  AS schema,
      t.typname  AS name,
      t.typtype  AS kind,
      ARRAY(
        SELECT e.enumlabel
        FROM pg_enum e
        WHERE e.enumtypid = t.oid
        ORDER BY e.enumsortorder
      ) AS enum_values,
      obj_description(t.oid, 'pg_type') AS comment
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = ANY($1)
      AND t.typtype IN ('e', 'd', 'c')
      AND NOT EXISTS (
        SELECT 1 FROM pg_class c WHERE c.oid = t.typrelid AND c.relkind != 'c'
      )
    ORDER BY n.nspname, t.typname
  `, [schemas]);
  return rows;
}

// ── Sequences ────────────────────────────────────────────────────────────────
async function getSequences(pool, schemas) {
  try {
    const { rows } = await pool.query(`
      SELECT
        sequence_schema AS schema,
        sequence_name   AS name,
        data_type,
        start_value,
        minimum_value,
        maximum_value,
        increment
      FROM information_schema.sequences
      WHERE sequence_schema = ANY($1)
      ORDER BY sequence_schema, sequence_name
    `, [schemas]);
    return rows;
  } catch {
    return []; // pg < 10 fallback
  }
}

// ── Extensions ───────────────────────────────────────────────────────────────
async function getExtensions(pool) {
  const { rows } = await pool.query(`
    SELECT extname AS name, extversion AS version
    FROM pg_extension
    ORDER BY extname
  `);
  return rows;
}
