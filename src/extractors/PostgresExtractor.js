// src/extractors/PostgresExtractor.js
import { JsDocParser } from '../JsDocParser.js';

/**
 * Extracts all schema metadata from a PostgreSQL database.
 * Uses pg_catalog and information_schema — no superuser required.
 * All methods are static; an instance is never needed externally.
 */
export class PostgresExtractor {
  /** @param {import('../DbClient.js').DbClient} client */
  static async extractAll(client, schemas) {
    const schemaList = schemas.split(',').map(s => s.trim());
    const schemaParam = schemaList.map(s => `'${s}'`).join(', ');

    const [tables, views, functions, types, sequences, extensions] = await Promise.all([
      PostgresExtractor.#getTables(client, schemaParam),
      PostgresExtractor.#getViews(client, schemaParam),
      PostgresExtractor.#getFunctions(client, schemaParam),
      PostgresExtractor.#getTypes(client, schemaParam),
      PostgresExtractor.#getSequences(client, schemaParam),
      PostgresExtractor.#getExtensions(client),
    ]);

    // Attach per-table details in parallel
    await Promise.all(tables.map(async tbl => {
      const [columns, indexes, fks, triggers] = await Promise.all([
        PostgresExtractor.#getColumns(client, tbl.schema, tbl.name),
        PostgresExtractor.#getIndexes(client, tbl.schema, tbl.name),
        PostgresExtractor.#getForeignKeys(client, tbl.schema, tbl.name),
        PostgresExtractor.#getTriggers(client, tbl.schema, tbl.name),
      ]);
      tbl.columns  = columns;
      tbl.indexes  = indexes;
      tbl.fks      = fks;
      tbl.triggers = triggers;
    }));

    // Parse JSDoc from each function body
    for (const fn of functions) {
      fn.jsdoc = JsDocParser.parse(fn.body || '');
    }

    return { tables, views, functions, types, sequences, extensions };
  }

  // ── Private query methods ────────────────────────────────────────────────

  static async #getTables(client, schemaParam) {
    return client.queryRaw(`
      SELECT
        n.nspname                                        AS schema,
        c.relname                                        AS name,
        obj_description(c.oid, 'pg_class')               AS comment,
        c.reltuples::bigint                              AS row_estimate,
        pg_size_pretty(pg_total_relation_size(c.oid))   AS total_size
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname IN (${schemaParam})
      ORDER BY n.nspname, c.relname
    `);
  }

  static async #getColumns(client, schema, table) {
    return client.queryRaw(`
      SELECT
        a.attnum                                          AS num,
        a.attname                                         AS name,
        pg_catalog.format_type(a.atttypid, a.atttypmod)  AS type,
        NOT a.attnotnull                                  AS nullable,
        pg_get_expr(ad.adbin, ad.adrelid)                 AS default_val,
        col_description(c.oid, a.attnum)                  AS comment,
        EXISTS (
          SELECT 1 FROM pg_constraint pc
          WHERE pc.conrelid = c.oid AND pc.contype = 'p'
            AND a.attnum = ANY(pc.conkey)
        ) AS is_pk,
        EXISTS (
          SELECT 1 FROM pg_constraint pc
          WHERE pc.conrelid = c.oid AND pc.contype = 'u'
            AND a.attnum = ANY(pc.conkey)
        ) AS is_unique
      FROM pg_attribute a
      JOIN pg_class c     ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
      WHERE n.nspname = '${schema}'
        AND c.relname = '${table}'
        AND a.attnum  > 0
        AND NOT a.attisdropped
      ORDER BY a.attnum
    `);
  }

  static async #getIndexes(client, schema, table) {
    return client.queryRaw(`
      SELECT
        i.relname                        AS name,
        ix.indisunique                   AS is_unique,
        ix.indisprimary                  AS is_primary,
        am.amname                        AS type,
        pg_get_indexdef(ix.indexrelid)   AS definition
      FROM pg_index ix
      JOIN pg_class c   ON c.oid  = ix.indrelid
      JOIN pg_class i   ON i.oid  = ix.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_am am     ON am.oid  = i.relam
      WHERE n.nspname = '${schema}' AND c.relname = '${table}'
      ORDER BY i.relname
    `);
  }

  static async #getForeignKeys(client, schema, table) {
    return client.queryRaw(`
      SELECT
        con.conname                      AS name,
        kcu.column_name                  AS column,
        ccu.table_schema                 AS ref_schema,
        ccu.table_name                   AS ref_table,
        ccu.column_name                  AS ref_column,
        con.confupdtype                  AS on_update,
        con.confdeltype                  AS on_delete
      FROM pg_constraint con
      JOIN pg_namespace n  ON n.oid  = con.connamespace
      JOIN pg_class c      ON c.oid  = con.conrelid
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = con.conname
       AND kcu.table_schema    = n.nspname
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = con.conname
      WHERE con.contype = 'f'
        AND n.nspname   = '${schema}'
        AND c.relname   = '${table}'
      ORDER BY con.conname
    `);
  }

  static async #getTriggers(client, schema, table) {
    return client.queryRaw(`
      SELECT
        t.tgname    AS name,
        CASE t.tgtype & 2 WHEN 2 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
        CASE
          WHEN t.tgtype & 4  = 4  THEN 'INSERT'
          WHEN t.tgtype & 8  = 8  THEN 'DELETE'
          WHEN t.tgtype & 16 = 16 THEN 'UPDATE'
          ELSE 'UNKNOWN'
        END         AS event,
        p.proname   AS function_name,
        t.tgenabled != 'D' AS enabled
      FROM pg_trigger t
      JOIN pg_class c     ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p      ON p.oid = t.tgfoid
      WHERE NOT t.tgisinternal
        AND n.nspname = '${schema}'
        AND c.relname = '${table}'
      ORDER BY t.tgname
    `);
  }

  static async #getViews(client, schemaParam) {
    return client.queryRaw(`
      SELECT
        table_schema     AS schema,
        table_name       AS name,
        view_definition  AS definition
      FROM information_schema.views
      WHERE table_schema IN (${schemaParam})
      ORDER BY table_schema, table_name
    `);
  }

  static async #getFunctions(client, schemaParam) {
    return client.queryRaw(`
    SELECT
      n.nspname                         AS schema,
      p.proname                         AS name,
      pg_get_function_arguments(p.oid)  AS arguments,
      pg_get_function_result(p.oid)     AS return_type,
      l.lanname                         AS language,
      p.prosecdef                       AS security_definer,
      obj_description(p.oid, 'pg_proc') AS comment,
      pg_get_functiondef(p.oid)                          AS body
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l  ON l.oid = p.prolang
    WHERE n.nspname = ${schemaParam}
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
  `);
  }

  static async #getTypes(client, schemaParam) {
    return client.queryRaw(`
      SELECT
        n.nspname  AS schema,
        t.typname  AS name,
        t.typtype  AS kind,
        ARRAY(
          SELECT e.enumlabel
          FROM pg_enum e
          WHERE e.enumtypid = t.oid
          ORDER BY e.enumsortorder
        )          AS enum_values,
        obj_description(t.oid, 'pg_type') AS comment
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname IN (${schemaParam})
        AND t.typtype IN ('e', 'd', 'c')
        AND NOT EXISTS (
          SELECT 1 FROM pg_class c WHERE c.oid = t.typrelid AND c.relkind != 'c'
        )
      ORDER BY n.nspname, t.typname
    `);
  }

  static async #getSequences(client, schemaParam) {
    try {
      return await client.queryRaw(`
        SELECT
          sequence_schema AS schema,
          sequence_name   AS name,
          data_type,
          start_value,
          minimum_value,
          maximum_value,
          increment
        FROM information_schema.sequences
        WHERE sequence_schema IN (${schemaParam})
        ORDER BY sequence_schema, sequence_name
      `);
    } catch { return []; }
  }

  static async #getExtensions(client) {
    return client.queryRaw(`
      SELECT extname AS name, extversion AS version
      FROM pg_extension ORDER BY extname
    `);
  }
}
