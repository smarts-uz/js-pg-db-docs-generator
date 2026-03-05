// src/extractors/MySQLExtractor.js
import { JsDocParser } from '../JsDocParser.js';

/**
 * Extracts all schema metadata from a MySQL / MariaDB database.
 * Uses information_schema exclusively — no special privileges needed.
 */
export class MySQLExtractor {
  /** @param {import('../DbClient.js').DbClient} client */
  static async extractAll(client, schemas) {
    const schemaList  = schemas.split(',').map(s => s.trim());
    const schemaParam = schemaList.map(s => `'${s}'`).join(', ');

    const [tables, views, functions, routines, triggers, types] = await Promise.all([
      MySQLExtractor.#getTables(client, schemaParam),
      MySQLExtractor.#getViews(client, schemaParam),
      MySQLExtractor.#getFunctions(client, schemaParam),
      MySQLExtractor.#getProcedures(client, schemaParam),
      MySQLExtractor.#getTriggerList(client, schemaParam),
      MySQLExtractor.#getEnums(client, schemaParam),
    ]);

    // Attach columns + indexes + FKs per table
    await Promise.all(tables.map(async tbl => {
      const [columns, indexes, fks] = await Promise.all([
        MySQLExtractor.#getColumns(client, tbl.schema, tbl.name),
        MySQLExtractor.#getIndexes(client, tbl.schema, tbl.name),
        MySQLExtractor.#getForeignKeys(client, tbl.schema, tbl.name),
      ]);
      tbl.columns  = columns;
      tbl.indexes  = indexes;
      tbl.fks      = fks;
      tbl.triggers = triggers.filter(t => t.table === tbl.name && t.schema === tbl.schema);
    }));

    // Merge functions + procedures, parse JSDoc
    const allFunctions = [...functions, ...routines];
    for (const fn of allFunctions) {
      fn.jsdoc = JsDocParser.parse(fn.body || '');
    }

    return {
      tables,
      views,
      functions: allFunctions,
      types,
      sequences: [],   // MySQL doesn't have sequences
      extensions: [],  // No pg_extension equivalent
    };
  }

  // ── Private query methods ────────────────────────────────────────────────

  static async #getTables(client, schemaParam) {
    return client.queryRaw(`
      SELECT
        TABLE_SCHEMA              AS \`schema\`,
        TABLE_NAME                AS name,
        TABLE_COMMENT             AS comment,
        TABLE_ROWS                AS row_estimate,
        CONCAT(
          ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2), ' MB'
        )                         AS total_size
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA IN (${schemaParam})
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);
  }

  static async #getColumns(client, schema, table) {
    return client.queryRaw(`
      SELECT
        ORDINAL_POSITION          AS num,
        COLUMN_NAME               AS name,
        COLUMN_TYPE               AS type,
        IS_NULLABLE = 'YES'       AS nullable,
        COLUMN_DEFAULT            AS default_val,
        COLUMN_COMMENT            AS comment,
        COLUMN_KEY = 'PRI'        AS is_pk,
        COLUMN_KEY = 'UNI'        AS is_unique
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = '${schema}'
        AND TABLE_NAME   = '${table}'
      ORDER BY ORDINAL_POSITION
    `);
  }

  static async #getIndexes(client, schema, table) {
    return client.queryRaw(`
      SELECT
        INDEX_NAME                            AS name,
        NON_UNIQUE = 0                        AS is_unique,
        INDEX_NAME = 'PRIMARY'                AS is_primary,
        INDEX_TYPE                            AS type,
        GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS definition
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = '${schema}'
        AND TABLE_NAME   = '${table}'
      GROUP BY INDEX_NAME, NON_UNIQUE, INDEX_TYPE
      ORDER BY INDEX_NAME
    `);
  }

  static async #getForeignKeys(client, schema, table) {
    return client.queryRaw(`
      SELECT
        kcu.CONSTRAINT_NAME       AS name,
        kcu.COLUMN_NAME           AS \`column\`,
        kcu.REFERENCED_TABLE_SCHEMA AS ref_schema,
        kcu.REFERENCED_TABLE_NAME   AS ref_table,
        kcu.REFERENCED_COLUMN_NAME  AS ref_column,
        rc.UPDATE_RULE            AS on_update,
        rc.DELETE_RULE            AS on_delete
      FROM information_schema.KEY_COLUMN_USAGE kcu
      JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
        ON rc.CONSTRAINT_NAME   = kcu.CONSTRAINT_NAME
       AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
      WHERE kcu.TABLE_SCHEMA = '${schema}'
        AND kcu.TABLE_NAME   = '${table}'
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY kcu.CONSTRAINT_NAME
    `);
  }

  static async #getTriggerList(client, schemaParam) {
    return client.queryRaw(`
      SELECT
        TRIGGER_SCHEMA  AS schema,
        EVENT_OBJECT_TABLE AS \`table\`,
        TRIGGER_NAME    AS name,
        ACTION_TIMING   AS timing,
        EVENT_MANIPULATION AS event,
        ''              AS function_name,
        TRUE            AS enabled
      FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA IN (${schemaParam})
      ORDER BY TRIGGER_NAME
    `);
  }

  static async #getViews(client, schemaParam) {
    return client.queryRaw(`
      SELECT
        TABLE_SCHEMA    AS schema,
        TABLE_NAME      AS name,
        VIEW_DEFINITION AS definition
      FROM information_schema.VIEWS
      WHERE TABLE_SCHEMA IN (${schemaParam})
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);
  }

  static async #getFunctions(client, schemaParam) {
    return client.queryRaw(`
      SELECT
        ROUTINE_SCHEMA  AS schema,
        ROUTINE_NAME    AS name,
        PARAM_LIST      AS arguments,
        RETURNS         AS return_type,
        'sql'           AS language,
        FALSE           AS security_definer,
        ROUTINE_COMMENT AS comment,
        ROUTINE_BODY    AS body,
        'FUNCTION'      AS kind
      FROM information_schema.ROUTINES
      WHERE ROUTINE_SCHEMA IN (${schemaParam})
        AND ROUTINE_TYPE = 'FUNCTION'
      ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
    `);
  }

  static async #getProcedures(client, schemaParam) {
    return client.queryRaw(`
      SELECT
        ROUTINE_SCHEMA  AS schema,
        ROUTINE_NAME    AS name,
        PARAM_LIST      AS arguments,
        ''              AS return_type,
        'sql'           AS language,
        FALSE           AS security_definer,
        ROUTINE_COMMENT AS comment,
        ROUTINE_BODY    AS body,
        'PROCEDURE'     AS kind
      FROM information_schema.ROUTINES
      WHERE ROUTINE_SCHEMA IN (${schemaParam})
        AND ROUTINE_TYPE = 'PROCEDURE'
      ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
    `);
  }

  static async #getEnums(client, schemaParam) {
    // MySQL stores ENUMs inline in column definitions — extract unique ones
    try {
      const rows = await client.queryRaw(`
        SELECT DISTINCT
          TABLE_SCHEMA  AS schema,
          COLUMN_NAME   AS name,
          COLUMN_TYPE   AS definition,
          'e'           AS kind,
          ''            AS comment
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA IN (${schemaParam})
          AND DATA_TYPE = 'enum'
        ORDER BY TABLE_SCHEMA, COLUMN_NAME
      `);
      return rows.map(r => ({
        ...r,
        enum_values: r.definition
          .replace(/^enum\(|\)$/gi, '')
          .split(',')
          .map(v => v.replace(/^'|'$/g, '')),
      }));
    } catch { return []; }
  }
}
