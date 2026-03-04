#!/usr/bin/env node
import 'dotenv/config';
import { program } from 'commander';
import { generate } from '../src/generate.js';

program
  .name('pgdocgen')
  .description('PostgreSQL database documentation generator')
  .version('1.0.0');

program
  .command('generate')
  .alias('gen')
  .description('Generate HTML documentation for a PostgreSQL database')
  .option('--host <host>',       'DB host',     process.env.PGHOST     || 'localhost')
  .option('--port <port>',       'DB port',     process.env.PGPORT     || '5432')
  .option('-d, --database <db>', 'Database name', process.env.PGDATABASE)
  .option('-U, --user <user>',   'DB user',     process.env.PGUSER     || 'postgres')
  .option('-W, --password <pw>', 'DB password', process.env.PGPASSWORD || 'admin')
  .option('--url <url>',         'Full connection URL (overrides other flags)')
  .option('-s, --schemas <list>','Schemas to document (comma-separated)', 'public')
  .option('-o, --output <path>', 'Output HTML file path', './db-docs.html')
  .option('--title <title>',     'Documentation title')
  .option('--ssl',               'Enable SSL')
  .action(async (opts) => {
    try {
      await generate(opts);
    } catch (err) {
      console.error('\n❌ Error:', err.message);
      process.exit(1);
    }
  });

program.parse();
