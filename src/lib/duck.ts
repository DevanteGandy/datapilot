import * as duckdb from "@duckdb/duckdb-wasm";

let dbP: Promise<duckdb.AsyncDuckDB> | null = null;
let connP: Promise<duckdb.AsyncDuckDBConnection> | null = null;

export async function getDB(): Promise<duckdb.AsyncDuckDB> {
  if (dbP) return dbP;
  dbP = (async () => {
    const logger = new duckdb.ConsoleLogger();
    const bundles: duckdb.DuckDBBundles = {
      eh: {
        mainWorker: "/duckdb/duckdb-browser-eh.worker.js",
        mainModule: "/duckdb/duckdb-eh.wasm",
      },
      mvp: {
        mainWorker: "/duckdb/duckdb-browser-mvp.worker.js",
        mainModule: "/duckdb/duckdb-mvp.wasm",
      },
    };
    const bundle = await duckdb.selectBundle(bundles);
    const worker = new Worker(bundle.mainWorker!); // IMPORTANT: classic worker, not module
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule!);
    return db;
  })();
  return dbP;
}

export async function getConnection(): Promise<duckdb.AsyncDuckDBConnection> {
  if (connP) return connP;

  connP = (async () => {
    const db = await getDB();
    const conn = await db.connect();

    // Some builds (MVP) have no threads; setting it throws.
    // Try for EH, otherwise ignore.
    try {
      await conn.query("PRAGMA threads=2;");
    } catch {
      /* no-op: leave default */
    }

    return conn;
  })();

  return connP;
}

export async function registerCSV(name: string, buf: Uint8Array) {
  const db = await getDB();
  const conn = await getConnection();
  await db.registerFileBuffer(name, buf);
  await conn.query(`
    CREATE OR REPLACE TABLE data AS
    SELECT * FROM read_csv_auto('${name}', HEADER=TRUE);
  `);
}
