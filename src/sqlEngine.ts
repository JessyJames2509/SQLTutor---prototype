import initSqlJs from "sql.js";
import type { Database } from "sql.js";

interface DatabaseWithExport extends Database {
  export(): Uint8Array;
}

let db: DatabaseWithExport | null = null;
let SQLPromise: ReturnType<typeof initSqlJs> | null = null;

export async function initDB(): Promise<DatabaseWithExport> {
  if (db) return db;

  if (!SQLPromise) {
    SQLPromise = initSqlJs({
      locateFile: (file) => `https://sql.js.org/dist/${file}`,
    });
  }

  const SQL = await SQLPromise;

  const saved = localStorage.getItem("sql_tutor_db");

  if (saved) {
    const bytes = new Uint8Array(JSON.parse(saved));
    // ⚡ TypeScript workaround: constructor does accept bytes at runtime
    db = new (SQL.Database as any)(bytes) as DatabaseWithExport;
    console.log("Loaded existing session DB");
  } else {
    db = new SQL.Database() as DatabaseWithExport;
    console.log("Created fresh in-memory DB");

    db.run(`
      CREATE TABLE students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        grade INTEGER
      );

      INSERT INTO students (name, grade) VALUES
      ('Alice', 10),
      ('Bob', 11),
      ('Charlie', 10);
    `);

    persist();
  }

  return db;
}

/**
 * Run any SQL the learner types
 */
export function runQuery(query: string) {
  if (!db) throw new Error("Database not initialised");

  try {
    const result = db.exec(query);

    persist();
    logQuery(query, null);

    return { result, error: null };
  } catch (err: any) {
    logQuery(query, err.message);
    return { result: null, error: err.message };
  }
}

/**
 * Save DB snapshot to browser storage
 */
function persist(): void {
  if (!db) return;

  try {
    const data: Uint8Array = db.export(); // ✅ now typed correctly
    const jsonData: number[] = Array.from(data);
    localStorage.setItem("sql_tutor_db", JSON.stringify(jsonData));
  } catch (err) {
    console.error("Failed to persist DB:", err);
  }
}

/**
 * Log activity for evaluation
 */
function logQuery(query: string, error: string | null) {
  const history = JSON.parse(localStorage.getItem("query_log") || "[]");

  history.push({
    query,
    error,
    timestamp: new Date().toISOString(),
  });

  localStorage.setItem("query_log", JSON.stringify(history));
}

/**
 * Allow user to reset sandbox
 */
export function resetDB() {
  localStorage.removeItem("sql_tutor_db");
  window.location.reload();
}

/**
 * Export session log
 */
export function downloadLog() {
  const log = localStorage.getItem("query_log") || "[]";
  const blob = new Blob([log], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  window.open(url);
}