#!/usr/bin/env node
// bin/pgdocgen.js — CLI entry point
// ⚠️  This file contains ONLY argument parsing and delegation.
//     All business logic lives in src/Generator.js and imported classes.

import 'dotenv/config';
import { program } from 'commander';
import { Generator } from '../src/Generator.js';

program
  .name('pgdocgen')
  .description('PostgreSQL / MySQL database documentation generator')
  .version('2.0.0');

program
  .command('generate')
  .option('-s, --schemas <list>',   'Comma-separated schemas', 'public')
  .option('-o, --output <path>',    'Output HTML file',  './db-docs.html')
  .option('--title <title>',        'Documentation page title')
  .action(async (opts) => {
    if (!opts.url && !process.env.DATABASE_URL) {
      const dialect = (opts.dialect === 'mysql') ? 'mysql' : 'postgresql';
      const ssl     = opts.ssl ? '?sslmode=require' : '';
      process.env.DATABASE_URL =
        `${dialect}://${opts.user}:${encodeURIComponent(opts.password || '')}` +
        `@${opts.host}:${opts.port}/${opts.database}${ssl}`;
    } else if (opts.url) {
      process.env.DATABASE_URL = opts.url;
    }

    try {
      await Generator.run(opts);
    } catch (err) {
      console.error('\n❌', err.message);
      process.exit(1);
    }
  });

program.parse();
