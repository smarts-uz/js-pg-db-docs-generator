// src/Generator.js
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve }        from 'path';
import { DbClient }                from './DbClient.js';
import { HtmlRenderer }            from './HtmlRenderer.js';
import { PostgresExtractor }       from './extractors/PostgresExtractor.js';
import { MySQLExtractor }          from './extractors/MySQLExtractor.js';

/**
 * Top-level orchestrator.
 * Wires together: DbClient → Extractor → HtmlRenderer → file writer.
 * Contains zero SQL and zero HTML.
 */
export class Generator {
  /**
   * @param {object} opts  Parsed CLI options
   */
  static async run(opts) {
    const dialect = Generator.#resolveDialect(opts);

    // 1. Connect
    process.stdout.write(`\n🔌 Connecting (${dialect})…`);
    const client = new DbClient(dialect);
    await client.connect();
    console.log(` ✓  ${client.serverVersion.split('\n')[0]}`);
    console.log(`   Database : ${client.database}`);
    console.log(`   Schemas  : ${opts.schemas}`);

    try {
      // 2. Extract
      process.stdout.write(`📦 Extracting schema…`);
      const Extractor = dialect === 'mysql' ? MySQLExtractor : PostgresExtractor;
      const schema    = await Extractor.extractAll(client, opts.schemas);
      schema.database      = client.database;
      schema.serverVersion = client.serverVersion;
      console.log(` ✓`);
      console.log(`   Tables    : ${schema.tables.length}`);
      console.log(`   Views     : ${schema.views.length}`);
      console.log(`   Functions : ${schema.functions.length}`);

      // 3. Render
      process.stdout.write(`🖊  Rendering HTML…`);
      const html = HtmlRenderer.render(schema, { ...opts, dialect });
      console.log(` ✓`);

      // 4. Write
      const outPath = resolve(opts.output);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, html, 'utf8');
      const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
      console.log(`\n✅ Done! ${kb} KB → ${outPath}\n`);

    } finally {
      await client.disconnect();
    }
  }

  /**
   * Determine dialect from --dialect flag or DATABASE_URL prefix.
   * @returns {'postgresql'|'mysql'}
   */
  static #resolveDialect(opts) {
    if (opts.dialect) return opts.dialect;
    const url = opts.url || process.env.DATABASE_URL || '';
    if (url.startsWith('mysql://') || url.startsWith('mariadb://')) return 'mysql';
    return 'postgresql';
  }
}
