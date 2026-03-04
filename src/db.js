import pg from 'pg';
const { Pool } = pg;

export async function createPool(opts) {
  const config = opts.url
    ? { connectionString: opts.url }
    : {
        host:     opts.host,
        port:     parseInt(opts.port, 10),
        database: opts.database,
        user:     opts.user,
        password: opts.password,
        ssl:      opts.ssl ? { rejectUnauthorized: false } : false,
      };

  const pool = new Pool({ ...config, max: 3, connectionTimeoutMillis: 8000 });

  // verify connection + get server version
  const client = await pool.connect();
  const { rows } = await client.query(`SELECT version(), current_database() AS db`);
  client.release();

  pool.serverVersion = rows[0].version;
  pool.dbName        = rows[0].db;
  return pool;
}
