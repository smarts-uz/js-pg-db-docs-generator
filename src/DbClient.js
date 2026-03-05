// src/DbClient.js
import { PrismaClient } from '@prisma/client';

/**
 * Thin wrapper around PrismaClient.
 * Exposes a unified queryRaw() that works for both PostgreSQL and MySQL.
 * The caller never touches PrismaClient directly — all DB access goes through this class.
 */
export class DbClient {
  /** @type {PrismaClient} */
  #prisma = null;
  /** @type {'postgresql'|'mysql'} */
  #dialect = 'postgresql';
  /** @type {string} */
  #database = '';
  /** @type {string} */
  serverVersion = '';

  /**
   * @param {'postgresql'|'mysql'} dialect
   */
  constructor(dialect = 'postgresql') {
    this.#dialect = dialect;
  }

  get dialect() { return this.#dialect; }
  get database() { return this.#database; }
  get isPostgres() { return this.#dialect === 'postgresql'; }
  get isMySQL()    { return this.#dialect === 'mysql'; }

  /**
   * Connect and verify the connection.
   * Must be called once before any queries.
   */
  async connect() {
    this.#prisma = new PrismaClient();
    await this.#prisma.$connect();

    if (this.isPostgres) {
      const rows = await this.queryRaw(
        `SELECT version() AS ver, current_database() AS db`
      );
      this.serverVersion = rows[0].ver;
      this.#database     = rows[0].db;
    } else {
      const rows = await this.queryRaw(
        `SELECT VERSION() AS ver, DATABASE() AS db`
      );
      this.serverVersion = rows[0].ver;
      this.#database     = rows[0].db;
    }
  }

  /**
   * Execute a raw SQL query and return plain objects (no Prisma metadata).
   * @param {string} sql
   * @param {any[]} [params]
   * @returns {Promise<Record<string, any>[]>}
   */
  async queryRaw(sql, params = []) {
    const result = await this.#prisma.$queryRawUnsafe(sql, ...params);
    // Prisma returns BigInt for some numeric columns — normalise them
    return JSON.parse(JSON.stringify(result, (_, v) =>
      typeof v === 'bigint' ? Number(v) : v
    ));
  }

  /** Disconnect from the database. */
  async disconnect() {
    await this.#prisma?.$disconnect();
    this.#prisma = null;
  }
}
