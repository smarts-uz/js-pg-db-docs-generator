import { createPool }    from './db.js';
import { extractSchema } from './extractor.js';
import { renderHTML }    from './renderer.js';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve }        from 'path';

export async function generate(opts) {
  // 1. Connect
  process.stdout.write(`\n🔌 Connecting to PostgreSQL…`);
  const pool = await createPool(opts);
  console.log(` ✓ ${pool.serverVersion.split('\n')[0]}`);
  console.log(`   Database: ${pool.dbName}`);

  // 2. Extract
  process.stdout.write(`📦 Extracting schema (${opts.schemas})…`);
  const data = await extractSchema(pool, opts.schemas);
  await pool.end();
  console.log(` ✓`);
  console.log(`   Tables: ${data.tables.length} | Views: ${data.views.length} | Functions: ${data.functions.length}`);

  // 3. Render
  process.stdout.write(`🖊  Rendering HTML…`);
  const html = renderHTML({
    ...data,
    serverVersion: pool.serverVersion,
  }, { ...opts, database: pool.dbName });
  console.log(` ✓`);

  // 4. Write
  const outPath = resolve(opts.output);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf8');

  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`\n✅ Done! Wrote ${kb} KB → ${outPath}\n`);
}
