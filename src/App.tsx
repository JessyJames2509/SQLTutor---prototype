import React, { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { initDB } from "./sqlEngine";
import type { Database } from "sql.js";

/* =======================
   Syntax Validation
======================= */
const validateSyntax = (
  query: string,
  commandType?: "DDL" | "DML" | "DQL" | "TCL" | "DCL"
): string[] => {
  const errors: string[] = [];
  if (!query.trim()) return ["Query is empty."];

  switch (commandType) {
    case "DQL": // SELECT queries
      if (!/SELECT/i.test(query)) errors.push("Missing SELECT clause.");
      if (/SELECT/i.test(query) && !/FROM/i.test(query))
        errors.push("SELECT must be followed by FROM.");
      if (/WHERE/i.test(query) && !/=|<|>|LIKE/i.test(query))
        errors.push("WHERE clause appears incomplete.");
      if (/JOIN/i.test(query) && !/ON/i.test(query))
        errors.push("JOIN requires an ON condition.");
      if (/SELECT\s+[^,]+[^,\s]\s+[^,]+\s+FROM/i.test(query))
        errors.push("Possible missing comma between selected columns.");
      break;

    case "DDL": // CREATE, ALTER, DROP TABLE
      if (!/(CREATE|ALTER|DROP)\s+TABLE/i.test(query))
        errors.push("Expected DDL command: CREATE, ALTER, or DROP TABLE.");
      break;

    case "DML": // INSERT, UPDATE, DELETE
      if (!/(INSERT|UPDATE|DELETE)/i.test(query))
        errors.push("Expected DML command: INSERT, UPDATE, or DELETE.");
      break;

    default:
      break;
  }

  return errors;
};

// -----------------------
  // Extract affected tables & columns
  // -----------------------
  const parseAffectedTablesAndColumns = (query: string, command: string) => {
    const tables: string[] = [];
    const columns: string[] = [];

    const cleanQuery = query.replace(/'[^']*'|"[^"]*"/g, "");

    const tablePatterns: RegExp[] = [
      /FROM\s+([^\s,;()]+)/gi,
      /JOIN\s+([^\s,;()]+)/gi,
      /UPDATE\s+([^\s,;()]+)/gi,
      /INSERT\s+INTO\s+([^\s(]+)/gi,
      /DELETE\s+FROM\s+([^\s;]+)/gi,
      /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([^\s(]+)/gi,
      /ALTER\s+TABLE\s+([^\s]+)/gi,
      /DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+([^\s;]+)/gi
    ];

    tablePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(cleanQuery)) !== null) {
        const t = match[1].trim().replace(/[`'"]/g, "");
        if (t && !tables.includes(t)) tables.push(t);
      }
    });

    if (command === "ALTER TABLE") {
      const colMatch = query.match(/ADD\s+COLUMN\s+([^\s;]+)/i);
      if (colMatch) columns.push(colMatch[1].trim().replace(/[`'"]/g, ""));
    } else if (command === "INSERT") {
      const colMatch = query.match(/INSERT\s+INTO\s+[^\s(]+\s*\(([^)]+)\)/i);
      if (colMatch) {
        colMatch[1].split(",").forEach(c => columns.push(c.trim()));
      }
    } else if (command === "UPDATE") {
      const setMatches = query.matchAll(/SET\s+([^\s=]+)\s*=/gi);
      for (const m of setMatches) columns.push(m[1].trim());
    }

    return { tables, columns };
  };

/* =======================
   Query Parsing
======================= */
const parseQueryParts = (query: string) => {
  const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
  const fromMatch = query.match(/FROM\s+([^\s;]+)/i);

  // Capture JOIN tables and optional aliases
  const joinMatches = [...query.matchAll(/JOIN\s+([^\s]+)(?:\s+AS\s+|\s+)?([^\s]+)?/gi)];

  const joins = joinMatches.map(j => ({
    table: j[1],
    alias: j[2] || null,
  }));

  // FROM table + alias
  const fromTable = fromMatch?.[1].split(/\s+AS\s+|\s+/i)[0] || "";
  const fromAlias = fromMatch?.[1].split(/\s+AS\s+|\s+/i)[1] || null;

  const where = query.match(/WHERE\s+(.+?)(?:;|$)/i)?.[1] || "";

  return {
    SELECT: selectMatch?.[1] || "",
    FROM: { table: fromTable, alias: fromAlias },
    JOIN: joins,
    WHERE: where,
  };
};

/* =======================
   Build Execution Steps
   Works for DDL, DML, DQL
======================= */
const buildExecutionSteps = (
  command: string,
  query: string,
  schema: { table: string; columns: string[] }[]
) => {
  const steps: string[] = [];

  if (command === "SELECT") {
    const parts = parseQueryParts(query);
    if (parts.FROM) steps.push(`FROM ${parts.FROM}`);
    parts.JOIN.forEach(j => steps.push(`JOIN ${j}`));
    if (parts.WHERE) steps.push(`WHERE ${parts.WHERE}`);
    if (parts.SELECT) steps.push(`SELECT ${parts.SELECT}`);
  } 
    else if (["INSERT", "UPDATE", "DELETE"].includes(command)) {
    schema.forEach(t => {
      if (query.includes(t.table)) steps.push(`${command} on table ${t.table}`);
    });
  } else if (["CREATE TABLE", "ALTER TABLE", "DROP TABLE"].includes(command)) {
    steps.push(`${command} executed`);
  }

  return steps;
};


  /* =======================
    Hint Generator (Enhanced)
  ======================= */
  const generateHints = (
    query: string,
    rows: any[][],
    _expected: any[][],
    schema: { table: string; columns: string[] }[],
    command?: string
  ): string[] => {
    const hints: string[] = [];

    // -----------------------
    // Special handling for ALTER TABLE
    // -----------------------
    if (command?.toUpperCase() === "ALTER TABLE") {
      const tableMatch = query.match(/ALTER\s+TABLE\s+([^\s]+)/i);
      const columnMatch =
        query.match(/ADD\s+COLUMN\s+([^\s]+)/i) || query.match(/ADD\s+([^\s]+)/i);

      if (tableMatch && columnMatch) {
        const tableName = tableMatch[1].replace(/[`'";]/g, "").trim();
        const columnName = columnMatch[1].replace(/[`'";]/g, "").trim();

        const table = schema.find(
          (t) => t.table.toLowerCase() === tableName.toLowerCase()
        );
        if (table && table.columns.includes(columnName)) {
          hints.push(
            `✅ Column "${columnName}" successfully added to "${tableName}".`
          );
          hints.push(
            `💡 New column will be NULL for existing rows. Use UPDATE to set values.`
          );
        }
      }
      return hints;
    }

    // -----------------------
    // No results returned
    // -----------------------
    if (rows.length === 0 && command?.toUpperCase() === "SELECT") {
      const match = query.match(/FROM\s+([^\s;]+)/i);
      const fromTable = match?.[1]?.replace(/[`'";]/g, "").trim();

      const tableExists = fromTable
        ? schema.some((t) => t.table.toLowerCase() === fromTable.toLowerCase())
        : false;

      if (tableExists) {
        hints.push(
          `✅ Table "${fromTable}" exists but contains no rows. Use INSERT to add data.`
        );
      } else {
        hints.push(
          "Your query returned no rows. Check filtering conditions or table name."
        );
      }
    } else if (rows.length === 0 && ["UPDATE", "DELETE"].includes(command || "")) {
      const affectedTable = schema.find((t) => query.includes(t.table));
      if (affectedTable) {
        hints.push(
          `Table "${affectedTable.table}" exists but has no rows to modify.`
        );
      } else {
        hints.push("No rows were affected. Check your query conditions.");
      }
    }

    // -----------------------
    // Column count mismatch
    // -----------------------
    if (command?.toUpperCase() === "SELECT" && rows[0]) {
      const selectedColsText =
        query.match(/SELECT\s+(.+?)\s+FROM/i)?.[1]?.trim() || "";

      let selectedColsCount: number;
      if (!selectedColsText || selectedColsText === "*") {
        selectedColsCount = rows[0].length; // SELECT * matches actual columns
      } else {
        selectedColsCount = selectedColsText.split(",").map((c) => c.trim()).length;
      }

      if (selectedColsCount !== rows[0].length) {
        hints.push("Selected column count does not match expected output.");
      }
    }

    // -----------------------
    // Column used without table reference
    // -----------------------
    if (command?.toUpperCase() === "SELECT") {
      const parts = parseQueryParts(query);
      const referencedTables = [parts.FROM.table, ...parts.JOIN.map((j) => j.table)];

      schema.forEach((t) => {
        t.columns.forEach((c) => {
          if (parts.SELECT === "*" || !query.match(new RegExp(`\\b${c}\\b`, "i")))
            return;

          if (!referencedTables.includes(t.table)) {
            hints.push(
              `Column "${c}" is used but table "${t.table}" is not referenced in this query.`
            );
          }
        });
      });
    }

    // -----------------------
    // Aggregate functions without GROUP BY
    // -----------------------
    if (
      command?.toUpperCase() === "SELECT" &&
      /SELECT\s+.*(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(query) &&
      !/GROUP BY/i.test(query)
    ) {
      hints.push("Aggregate function detected but GROUP BY clause is missing.");
    }

    // -----------------------
    // Generic DDL/DML hints
    // -----------------------
    const ddlDmlCommands: Record<string, RegExp> = {
      "CREATE TABLE": /CREATE\s+TABLE\s+(IF NOT EXISTS\s+)?([^\s(]+)/i,
      "ALTER TABLE": /ALTER\s+TABLE\s+([^\s]+)/i,
      "DROP TABLE": /DROP\s+TABLE\s+(IF EXISTS\s+)?([^\s;]+)/i,
      INSERT: /INSERT\s+INTO\s+([^\s(]+)/i,
      UPDATE: /UPDATE\s+([^\s]+)/i,
      DELETE: /DELETE\s+FROM\s+([^\s;]+)/i,
    };

    Object.entries(ddlDmlCommands).forEach(([cmdName, regex]) => {
      if (command?.toUpperCase().startsWith(cmdName.split(" ")[0])) {
        const match = query.match(regex);
        const tableName = match?.[2] || match?.[1];
        if (tableName) {
          const cleanTableName = tableName.replace(/[`'";]/g, "").trim();
          if (cmdName === "CREATE TABLE") {
            hints.push(`Table "${cleanTableName}" has been created (currently empty).`);
          } else if (cmdName === "ALTER TABLE") {
            hints.push(`Table "${cleanTableName}" has been altered. Check updated columns.`);
          } else if (cmdName === "DROP TABLE") {
            hints.push(`Table "${cleanTableName}" has been deleted from the schema.`);
          } else if (cmdName === "INSERT") {
            hints.push(`Row(s) inserted into table "${cleanTableName}".`);
          } else if (cmdName === "UPDATE") {
            hints.push(`UPDATE executed on table "${cleanTableName}". Check affected rows.`);
          } else if (cmdName === "DELETE") {
            hints.push(`DELETE executed on table "${cleanTableName}". Check if rows were removed.`);
          }
        } else {
          hints.push(`${cmdName} executed (table name not detected).`);
        }
      }
    });     

    return hints;
  };

const commandSyntax: Record<string, string> = {
      "SELECT": "SELECT column1, column2 FROM table [JOIN table2 ON condition] [WHERE condition] [GROUP BY column] [ORDER BY column];",
      "INSERT": "INSERT INTO table (col1, col2) VALUES (val1, val2);",
      "UPDATE": "UPDATE table SET col1 = val1, col2 = val2 WHERE condition;",
      "DELETE": "DELETE FROM table WHERE condition;",
      "CREATE TABLE": "CREATE TABLE table_name (column1 TYPE, column2 TYPE, ...);",
      "ALTER TABLE": "ALTER TABLE table_name ADD COLUMN column_name TYPE;",
      "DROP TABLE": "DROP TABLE table_name;"
    };

const generateHintsWithSyntax = (
      query: string,
      rows: any[][],
      _expected: any[][],
      schema: { table: string; columns: string[] }[],
      command?: string
    ) => {
      const hints = generateHints(query, rows, _expected, schema, command);
      const syntaxTips: string[] = [];

      if (!command) return { hints, syntaxTips };

      // Add syntax tip for main command
      if (commandSyntax[command.toUpperCase()]) {
        syntaxTips.push(commandSyntax[command.toUpperCase()]);
      }

      // Detect aggregate / JOIN usage for more context
      if (/JOIN/i.test(query)) syntaxTips.push("💡 JOIN syntax: table1 JOIN table2 ON condition");
      if (/AVG|SUM|COUNT|MIN|MAX/i.test(query)) syntaxTips.push("💡 Aggregates require SELECT ... FROM ... [GROUP BY ...]");

      return { hints, syntaxTips };
    };

/*tree*/
const sqlCommandTree = {
  DDL: { description: "Define database structure", commands: ["CREATE TABLE", "ALTER TABLE", "DROP TABLE"] },
  DML: { description: "Manipulate stored data", commands: ["INSERT", "UPDATE", "DELETE"] },
  DQL: { description: "Query data", commands: ["SELECT"] },
  TCL: { description: "Transaction Control (Future Work)", commands: [] },
  DCL: { description: "Access Control (Future Work)", commands: [] }
};

  
/* =======================
   App
======================= */
function App() {
  const [db, setDb] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const database = await initDB();
      setDb(database);
      updateSchemaFromDB(database);
    })();
  }, []);
  // Core query + results
  const [query, setQuery] = useState("SELECT * FROM students;");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<any[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [syntaxHints, setSyntaxHints] = useState<string[]>([]);

  // Execution steps animation
  const [executionSteps, setExecutionSteps] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [activeTables, setActiveTables] = useState<Set<string>>(new Set());
  const executionLock = React.useRef(false);

  // Schema + hover
  type TableSchema = {
    table: string;
    columns: string[];
    pk?: string;
    fk?: string[];
    ref?: React.RefObject<HTMLDivElement | null>;
  };
  const [schema, setSchema] = useState<TableSchema[]>([]);
  const [syntaxErrors, setSyntaxErrors] = useState<string[]>([]);
  const [hoveredTable, setHoveredTable] = useState<string | null>(null);

  // UI state
  const [showSurvey, setShowSurvey] = useState(false);
  type SqlCategory = keyof typeof sqlCommandTree;

  const [selectedCategory, setSelectedCategory] =
    useState<SqlCategory | null>(null);
  const [selectedCommand, setSelectedCommand] = useState<string | null>(null);

  // Command templates
  const commandTemplates: Record<string, string> = {
    "CREATE TABLE": `
      CREATE TABLE IF NOT EXISTS new_table (
        id INTEGER PRIMARY KEY,
        name TEXT
      );`,

    "ALTER TABLE": `
      ALTER TABLE new_table
      ADD COLUMN created_at TEXT;`,

    "DROP TABLE": `
      DROP TABLE IF EXISTS new_table;`,

    "INSERT": `
      INSERT INTO students (name, grade)
      VALUES ('New Student', 10);`,

    "UPDATE": `
      UPDATE students
      SET grade = 11
      WHERE name = 'Alice';`,

    "DELETE": `
      DELETE FROM students
      WHERE name = 'Bob';`,

    "SELECT": `
      SELECT * FROM students;`
  };
  const loadCommand = (cmd: string) => {
    setSelectedCommand(cmd);
    setQuery(commandTemplates[cmd]);
    setRows([]);
    setFeedback(null);
  };


    /* =======================
    Anonymous Session ID
  ======================= */
  const [sessionId] = useState(() => {
    const existing = localStorage.getItem("sqlTutorSession");
    if (existing) return existing;

    const newId = crypto.randomUUID();
    localStorage.setItem("sqlTutorSession", newId);
    return newId;
  });

  // =======================
// LogOuts
// =======================
  const [sessionStart] = useState<number>(Date.now());
  const [attemptCount, setAttemptCount] = useState(0);
  const [successCount, setSuccessCount] = useState(0);
  const [syntaxErrorCount, setSyntaxErrorCount] = useState(0);
  const [runtimeErrorCount, setRuntimeErrorCount] = useState(0);
  const [sessionLog, setSessionLog] = useState<any[]>([]);

const taskStartTime = React.useRef<number | null>(null);

const exportSessionToGoogleForm = async () => {
  const formUrl =
    "https://docs.google.com/forms/d/e/1FAIpQLSeMi643PDgIHbMdkZ51V0vy5gZ7YttXaQfeRgeQsUz9nz3TPA/formResponse";
    
  const formData = new FormData();
  formData.append("entry.1551736835", sessionId);
  formData.append("entry.2064822524", sessionStart.toString());
  formData.append("entry.470939570", Date.now().toString());
  formData.append("entry.247120678", attemptCount.toString());
  formData.append("entry.1937591829", successCount.toString());
  formData.append("entry.1301925902", syntaxErrorCount.toString());
  formData.append("entry.472636069", runtimeErrorCount.toString());
  formData.append("entry.214384545", JSON.stringify(sessionLog));

  try {
    await fetch(formUrl, {
      method: "POST",
      mode: "no-cors",
      body: formData,
    });
    console.log("Session logs exported to Google Form ✅");
  } catch (err) {
    console.error("Failed to export session logs:", err);
  }
};


  /* =======================
     Live Validation
  ======================= */
    useEffect(() => {
      // Only syntax validation, no automatic SELECT execution
      const syntaxErrs = selectedCategory
        ? validateSyntax(query, selectedCategory as any)
        : [];
      setSyntaxErrors(syntaxErrs);

      // Clear previous feedback if query changed but do not execute SELECT
      setFeedback(null);
    }, [query, selectedCategory]);



      const updateSchemaFromDB = (database: Database) => {
        const res = database.exec(`SELECT name FROM sqlite_master WHERE type='table';`);
        if (!res[0]) return;

        const tables: TableSchema[] = res[0].values
          .map(([tableName]) => {
            const cleanTable = tableName.toString();
            if (cleanTable === "sqlite_sequence") return null; // hide internal SQLite table

            // Get all columns dynamically
            const colRes = database.exec(`PRAGMA table_info(${cleanTable});`);
            const cols = colRes[0]?.values.map((c: any) => c[1]) || [];
            const pk = colRes[0]?.values.find((c: any) => c[5] === 1)?.[1] || undefined;

            return {
              table: cleanTable,
              columns: cols,
              pk,
              fk: [],
              ref: React.createRef<HTMLDivElement | null>(),
            };
          })
          .filter(Boolean) as TableSchema[];

        setSchema(tables);
      };

      const runSelect = () => {
        setExecutionSteps([]);
        setCurrentStep(-1);
        if (!db) return;

        // Helper: extract table names
        const extractTableNames = (query: string): string[] => {
          const tables: string[] = [];
          const cleanQuery = query.replace(/'[^']*'|"[^"]*"/g, ''); // remove string literals

          const patterns = [
            /FROM\s+([^\s,;()]+)/gi,
            /JOIN\s+([^\s,;()]+)/gi
          ];

          patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(cleanQuery)) !== null) {
              const tableName = match[1].trim().replace(/[`'"]/g, '');
              if (tableName && !tables.includes(tableName)) tables.push(tableName);
            }
          });

          return tables;
        };

        try {
          const res = db.exec(query);

          if (!res.length || !res[0]) {
            setColumns([]);
            setRows([]);

            const { hints, syntaxTips } = generateHintsWithSyntax(query, res[0]?.values || [], [], schema, "SELECT");

            setFeedback(
              hints.length > 0
                ? hints.join(" • ")
                : "✅ Query executed successfully."
            );
            setSyntaxHints(syntaxTips);

            return;
          }

          setColumns(res[0].columns);
          setRows(res[0].values);

          const hints = generateHints(query, res[0].values, [], schema, "SELECT");

          setFeedback(
            hints.length
              ? hints.join(" • ")
              : "✅ Query executed successfully."
          );

          const tables = extractTableNames(query);
          if (tables.length) setActiveTables(new Set(tables));

        } catch (e: any) {
          setError(e.message);
        }
      };

      /* =======================
        Decide What To Execute
        (Prevents auto SELECT after mutations)
      ======================= */
      const handleRun = () => {
        setAttemptCount(prev => prev + 1); 
        if (!db) return;
        // Start timer on first interaction
        if (!taskStartTime.current) {
          taskStartTime.current = Date.now();
        }

        // Count attempt
        
        const cmd = (selectedCommand ?? query)
          .trim()
          .split(" ")[0]
          .toUpperCase();

        if (cmd === "SELECT") {
          runSelect();   // ONLY read data
        } else {
          runQuery();    // ONLY mutate database
        }
      };

      /* =======================
      Run Query
    ======================= */
    
const runQuery = async () => {
  // 🚫 Ignore React StrictMode replay
  if (executionLock.current) return;

  executionLock.current = true;
  if (!db) {
    executionLock.current = false; // release lock
    return;
  }

  // Reset states
  setExecutionSteps([]);
  setCurrentStep(-1);
  setError(null);
  setFeedback(null);

  const upper = query.trim().toUpperCase();

  let command = "";
  if (upper.startsWith("CREATE TABLE")) command = "CREATE TABLE";
  else if (upper.startsWith("ALTER TABLE")) command = "ALTER TABLE";
  else if (upper.startsWith("DROP TABLE")) command = "DROP TABLE";
  else if (upper.startsWith("INSERT")) command = "INSERT";
  else if (upper.startsWith("UPDATE")) command = "UPDATE";
  else if (upper.startsWith("DELETE")) command = "DELETE";
  else if (upper.startsWith("SELECT")) command = "SELECT";

  // -----------------------
  // Validate syntax
  // -----------------------
  const syntaxErrs = validateSyntax(query, selectedCategory as any);
  setSyntaxErrors(syntaxErrs);
  if (syntaxErrs.length > 0) {
    setSyntaxErrorCount(prev => prev + 1);
    setFeedback("⚠ Fix syntax errors before running the query.");
    executionLock.current = false;
    return;
  }

  const { tables: affectedTables, columns: affectedColumns } =
    parseAffectedTablesAndColumns(query, command);

  // -----------------------
  // Table/column existence checks
  // -----------------------
  if (command === "CREATE TABLE" && affectedTables.length > 0) {
    const tableName = affectedTables[0];
    const tableExistsRes = db.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}';`
    );
    if (tableExistsRes[0]?.values?.length) {
      setFeedback(`⚠ Table "${tableName}" already exists.`);
      executionLock.current = false;
      return;
    }
  }

  if (command === "ALTER TABLE" && affectedTables.length > 0 && affectedColumns.length > 0) {
    const tableName = affectedTables[0];
    const colName = affectedColumns[0];
    const colRes = db.exec(`PRAGMA table_info(${tableName});`);
    const existingCols: string[] = colRes[0]?.values.map((c: any) => c[1]) || [];

    if (existingCols.includes(colName)) {
      setFeedback(`⚠ Column "${colName}" already exists in table "${tableName}".`);
      executionLock.current = false;
      return;
    }
  }

  if (command === "DROP TABLE" && affectedTables.length > 0) {
    const tableName = affectedTables[0];
    const tableExistsRes = db.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}';`
    );
    if (!tableExistsRes[0]?.values?.length) {
      setFeedback(`⚠ Table "${tableName}" does not exist.`);
      executionLock.current = false;
      return;
    }
  }

  if (["INSERT", "UPDATE", "DELETE"].includes(command) && affectedTables.length > 0) {
    const tableName = affectedTables[0];
    const tableExistsRes = db.exec(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}';`
    );
    if (!tableExistsRes[0]?.values?.length) {
      setFeedback(`⚠ Table "${tableName}" does not exist.`);
      executionLock.current = false;
      return;
    }
  }

  if (command === "INSERT" && affectedTables.length > 0 && affectedColumns.length > 0) {
    const tableName = affectedTables[0];
    const colRes = db.exec(`PRAGMA table_info(${tableName});`);
    const existingCols: string[] = colRes[0]?.values.map((c: any) => c[1]) || [];
    const invalidCols: string[] = affectedColumns.filter((c: string) => !existingCols.includes(c));
    if (invalidCols.length > 0) {
      setFeedback(`⚠ Column(s) ${invalidCols.join(", ")} do not exist in table "${tableName}".`);
      executionLock.current = false;
      return;
    }
  }

  if (command === "UPDATE" && affectedTables.length > 0 && affectedColumns.length > 0) {
    const tableName = affectedTables[0];
    const colRes = db.exec(`PRAGMA table_info(${tableName});`);
    const existingCols: string[] = colRes[0]?.values.map((c: any) => c[1]) || [];
    const invalidCols: string[] = affectedColumns.filter((c: string) => !existingCols.includes(c));
    if (invalidCols.length > 0) {
      setFeedback(`⚠ Column(s) ${invalidCols.join(", ")} do not exist in table "${tableName}".`);
      executionLock.current = false;
      return;
    }
  }

  if (command === "SELECT" && affectedTables.length > 0) {
    const missingTables: string[] = affectedTables.filter(
      (t: string) =>
        !db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${t}';`)[0]?.values?.length
    );
    if (missingTables.length > 0) {
      setFeedback(`⚠ Table(s) ${missingTables.join(", ")} do not exist.`);
      executionLock.current = false;
      return;
    }
  }

  try {
    // -----------------------
    // Build execution steps
    // -----------------------
    const steps = buildExecutionSteps(command, query, schema);
    setExecutionSteps(steps);

    // Animate steps visually
    for (let i = 0; i < steps.length; i++) {
      await new Promise(r => {
        setCurrentStep(i);
        const step = steps[i];
        const nextActive = new Set<string>();
        schema.forEach(t => { if (step.includes(t.table)) nextActive.add(t.table); });
        setActiveTables(nextActive);
        setTimeout(r, 400);
      });
    }

    // Store row count before operation for DML commands
    let beforeCount = 0;
    if (["INSERT", "UPDATE", "DELETE"].includes(command) && affectedTables.length > 0) {
      try {
        const countRes = db.exec(`SELECT COUNT(*) FROM ${affectedTables[0]};`);
        if (countRes[0] && countRes[0].values[0]) {
          beforeCount = countRes[0].values[0][0] as number;
        }
      } catch (err) {
        console.error("Failed to get row count:", err);
      }
    }

    // -----------------------
    // Prevent duplicate columns for ALTER TABLE
    // -----------------------
    if (command === "ALTER TABLE" && affectedTables.length > 0 && affectedColumns.length > 0) {
      const tableName = affectedTables[0];
      const colName = affectedColumns[0];
      const colRes = db.exec(`PRAGMA table_info(${tableName});`);
      const existingCols = colRes[0]?.values.map((c: any) => c[1]) || [];
      if (existingCols.includes(colName)) {
        setFeedback(`⚠ Column "${colName}" already exists in table "${tableName}".`);
        return;
      }
    }

    // -----------------------
    // Execute query
    // -----------------------
    try {
      db.exec(query); // Execute DDL/DML
      updateSchemaFromDB(db);

      // Highlight affected tables
      if (affectedTables.length > 0) {
        const tableName = affectedTables[0];
        setActiveTables(new Set(affectedTables));

        try {
          // Always get columns first
          const tableInfo = db.exec(`PRAGMA table_info(${tableName});`);
          const columnNames = tableInfo[0]?.values.map((col: any) => col[1]) || [];
          setColumns(columnNames);

          // Fetch rows; empty array if none
          const dataRes = db.exec(`SELECT * FROM ${tableName} LIMIT 50;`);
          setRows(dataRes?.[0]?.values || []);
        } catch (err) {
          console.error(`Failed to fetch data from ${tableName}:`, err);
          setColumns([]);
          setRows([]);
        }
      }
    } catch (e: any) {
      setRuntimeErrorCount(prev => prev + 1);
      setError(e.message);
      executionLock.current = false;
      return;
    }

    // -----------------------
    // Calculate rows affected for DML commands
    // -----------------------
    let rowsAffected = 0;
    if (["INSERT", "UPDATE", "DELETE"].includes(command) && affectedTables.length > 0) {
      try {
        const afterCountRes = db.exec(`SELECT COUNT(*) FROM ${affectedTables[0]};`);
        if (afterCountRes[0] && afterCountRes[0].values[0]) {
          const afterCount = afterCountRes[0].values[0][0] as number;

          if (command === "INSERT") {
            rowsAffected = afterCount - beforeCount;
          } else if (command === "DELETE") {
            rowsAffected = beforeCount - afterCount;
          } else if (command === "UPDATE") {
            try {
              const whereClause = query.match(/WHERE\s+(.+?)(?:;|$)/i)?.[1] || "1=1";
              const affectedRes = db.exec(`SELECT COUNT(*) FROM ${affectedTables[0]} WHERE ${whereClause};`);
              if (affectedRes[0] && affectedRes[0].values[0]) {
                rowsAffected = affectedRes[0].values[0][0] as number;
              }
            } catch (err) {
              console.error("Failed to count affected rows for UPDATE:", err);
              rowsAffected = -1;
            }
          }
        }
      } catch (err) {
        console.error("Failed to calculate rows affected:", err);
      }
    }

    // -----------------------
    // Command-specific feedback
    // -----------------------
    if (command === "CREATE TABLE") {
      setFeedback(`✅ Table "${affectedTables[0] || ''}" created successfully but needs populating it to see fully.`);
    } else if (command === "ALTER TABLE") {
      setFeedback(`✅ Column "${affectedColumns[0] || ''}" added to table "${affectedTables[0] || ''}". Use INSERT/UPDATE to add data.`);
    } else if (command === "DROP TABLE") {
      setFeedback(`✅ Table "${affectedTables[0] || ''}" dropped successfully.`);
    } else if (command === "INSERT") {
      setFeedback(`✅ ${rowsAffected} row(s) inserted into "${affectedTables[0] || 'table'}".`);
    } else if (command === "UPDATE") {
      setFeedback(rowsAffected > 0
        ? `✅ ${rowsAffected} row(s) updated in "${affectedTables[0] || 'table'}".`
        : `✅ UPDATE executed. No rows matched the WHERE condition.`);
    } else if (command === "DELETE") {
      setFeedback(rowsAffected > 0
        ? `✅ ${rowsAffected} row(s) deleted from "${affectedTables[0] || 'table'}".`
        : `✅ DELETE executed. No rows matched the WHERE condition.`);
    } else {
      const { hints, syntaxTips } = generateHintsWithSyntax(query, rows, [], schema, command);
      setFeedback(hints.length > 0 ? hints.join(" • ") : `✅ ${command} executed successfully.`);
      setSyntaxHints(syntaxTips);
    }

    setSuccessCount(prev => prev + 1);

  } catch (e: any) {
    setError(e.message);

    setSessionLog(prev => [
      ...prev,
      {
        timestamp: Date.now(),
        query,
        command,
        syntaxErrors: syntaxErrs,
        feedback,
        hints: generateHints(query, rows, [], schema, command),
        rowsReturned: rows.length || 0
      }
    ]);

  } finally {
    executionLock.current = false;
  }
};
  /* =======================
     UI
  ======================= */
return (
<div
  style={{
    padding: 20,
    backgroundColor: "#f3f6fb",
    borderRadius: 12,
    boxShadow: "0 3px 12px rgba(0,0,0,0.08)",
    marginBottom: 20,
    width: "100vw",       // full viewport width
    maxWidth: "100vw",    // never shrink
    boxSizing: "border-box" // include padding in width
  }}
>
  <div
    style={{
      background: "linear-gradient(135deg, #1976d2, #4b0082)", // blue to indigo
      color: "white",
      padding: "20px 20px",
      borderRadius: "0 0 30px 30px",
      textAlign: "center",
      maxWidth: "900px",
      margin: "0 auto",
      boxShadow: "0 10px 25px rgba(0,0,0,0.2)"
    }}
  >
    <h1 style={{ fontSize: "3rem", marginBottom: "12px", fontWeight: "bold" }}>
      SQLTutor
    </h1>
    <p style={{ fontSize: "1.2rem", fontWeight: "normal", opacity: 0.9, marginBottom: "24px" }}>
      / Tutoring app-prototype under construction /
    </p>
    <p style={{ fontSize: "1rem", lineHeight: 1.6, opacity: 0.85 }}>
      This tool allows you to explore SQL by selecting command categories and experimenting with live queries. 
      Instead of solving fixed exercises, you can observe how each SQL command affects the database structure and results in real time.
    </p>
  </div>

  {/* Optional: small call-to-action or tip */}
  <div
    style={{
      backgroundColor: "#f0f4ff", // lighter than hero
      borderLeft: "4px solid #1976d2",
      borderRadius: 8,
      color: "#1976d2",
      fontStyle: "italic",
      padding: "12px 16px",
      maxWidth: 650,
      margin: "20px auto 0 auto", // space from hero
      boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
    }}
  >
    Tip: Click on a category to explore its commands!!!  <span style={{ color: "red", fontWeight: "bold" }}>DO NOT RELOAD the App AFTER START!!!</span> 
  </div>
{/* ===== Categories + Commands Accordion ===== */}
<div
  style={{
    display: "grid",
    gridTemplateColumns: `repeat(${Object.keys(sqlCommandTree).length}, 1fr)`,
    gap: 12,
    marginTop: 20,
  }}
>
  {Object.entries(sqlCommandTree).map(([category, data]) => (
    <div key={category} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Main Category Button */}
      <button
        onClick={() =>
          setSelectedCategory(selectedCategory === category ? null : (category as keyof typeof sqlCommandTree))
        }
        style={{
          fontWeight: "bold",
          color: "#1976d2",
          padding: "10px 16px",
          borderRadius: 8,
          border: "2px solid #1976d2",
          backgroundColor:
            selectedCategory === category ? "#e3f2fd" : "#f5f5f5",
          cursor: "pointer",
          width: "100%",
          textAlign: "center",
        }}
      >
        {category}
      </button>

      {/* Commands Under Category */}
      {selectedCategory === category && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.commands.length > 0 ? (
            data.commands.map(cmd => (
              <button
                key={cmd}
                onClick={() => {
                  loadCommand(cmd);           // load command in editor
                  setSelectedCategory(null);  // collapse the command buttons
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid #1976d2",
                  backgroundColor: selectedCommand === cmd ? "#1976d2" : "#e3f2fd",
                  color: selectedCommand === cmd ? "white" : "#1976d2",
                  cursor: "pointer",
                  width: "100%",              // full width
                  textAlign: "center",
                }}
              >
                {cmd}
              </button>
            ))
          ) : (
            <div
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px dashed #1976d2",
                color: "#888",
                textAlign: "center",
                fontStyle: "italic",
              }}
            >
              No commands yet
            </div>
          )}
        </div>
      )}  
    </div>
  ))}
</div>

  {/* ===== MAIN WORKSPACE ===== */}
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 30,
      marginTop: 30,
      alignItems: "flex-start"
    }}
  >

  {/* ===== LEFT SIDE : SQL COMPILER ===== */}
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      width: "100%"
    }}
  >

  {/* SQL Editor */}
  <div
    style={{
      width: "100%",
      maxWidth: 650,
      borderRadius: 8,
      overflow: "hidden",
      border: "1px solid #1976d2",
      backgroundColor: "#f5f7fa",
      boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
    }}
  >
    <Editor
      height="220px"
      language="sql"
      value={query}
      onChange={v => setQuery(v || "")}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        lineHeight: 20
      }}
    />
  </div>

  {/* Run Query Button */}
  <button
    disabled={syntaxErrors.length > 0}
    onClick={handleRun}
    style={{
      marginTop: 12,
      width: "100%",
      maxWidth: 650,
      padding: 12,
      borderRadius: 8,
      border: "2px solid #1976d2",
      backgroundColor: syntaxErrors.length > 0 ? "#e0e0e0" : "#e3f2fd",
      color: syntaxErrors.length > 0 ? "#888" : "#1976d2",
      cursor: syntaxErrors.length > 0 ? "not-allowed" : "pointer",
      fontWeight: "bold"
    }}
  >
    Run Query
  </button>

  {/* ===== Syntax + Feedback Row ===== */}
  <div
    style={{
      display: "flex",
      gap: 12,
      marginTop: 12,
      width: "100%",
      flexWrap: "wrap",
    }}
  >
    {/* Left Half: Syntax Hint */}
    {selectedCommand && (
      <div
        style={{
          flex: 1,
          minWidth: 300,
          padding: "12px 16px",
          backgroundColor: "#f0f4f8",
          borderLeft: "4px solid #1976d2",
          borderRadius: 6,
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
          overflowX: "auto",
        }}
      >
        <strong>Syntax Hint:</strong>
        <pre style={{ margin: 0 }}>{commandTemplates[selectedCommand]}</pre>
      </div>
    )}

    {/* Right Half: Syntax Warnings + Feedback */}
    {(syntaxErrors.length > 0 || feedback || error || syntaxHints.length > 0) && (
      <div
        style={{
          flex: 1,
          minWidth: 300,
          padding: 12,
          backgroundColor: "#f0f4f8",
          borderLeft: "4px solid #1976d2",
          borderRadius: 6,
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
          overflowX: "auto",
        }}
      >
        {/* Syntax Warnings */}
        {syntaxErrors.map((e, i) => (
          <p key={i} style={{ color: "orange", margin: "4px 0" }}>
            ⚠ {e}
          </p>
        ))}

        {/* Feedback / Error */}
        {(feedback || error) && (
          <p
            style={{
              margin: "6px 0",
              color: error ? "#d32f2f" : "#1976d2",
              fontWeight: 500,
            }}
          >
            {error ? "❌" : "✅"} {error || feedback}
          </p>
        )}

        {/* Animated Syntax Tips */}
        {syntaxHints.length > 0 && (
          <ul style={{ marginTop: 6, paddingLeft: 20, color: "#388e3c" }}>
            {syntaxHints.map((tip, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: 0,
                  animation: `fadeInTip 0.4s ease forwards`,
                  animationDelay: `${i * 0.3}s`,
                }}
              >
                💡 {tip}
              </li>
            ))}
          </ul>
        )}
      </div>
    )}

    {/* Scoped CSS for animation */}
    <style>{`
      @keyframes fadeInTip {
        to {
          opacity: 1;
        }
      }
    `}</style>
  </div>

  {/* Execution Step Animation */}
  {executionSteps.length > 0 &&
    currentStep >= 0 &&
    currentStep < executionSteps.length && (
      <p style={{ fontStyle: "italic", color: "#555" }}>
        🔹 Step {currentStep + 1}/{executionSteps.length}:{" "}
        {executionSteps[currentStep]}
      </p>
  )}

  </div>


  {/* ===== RIGHT SIDE: DATABASE SCHEMA + RESULTS ===== */}
  <div
    style={{
      flex: 1,
      display: "flex",
      flexDirection: "column", // stack schema + results vertically
      maxHeight: "90vh",
      overflowY: "auto",
      minWidth: 300,
      paddingRight: 10,
    }}
  >
    {/* ===== Database Schema Visualizer ===== */}
    <h2>Database Schema</h2>

    <div style={{ display: "flex", flexWrap: "wrap", gap: 20, position: "relative" }}>
      {schema.map(t => (
        <div
          key={t.table}
          ref={t.ref as React.RefObject<HTMLDivElement>}
          onMouseEnter={() => setHoveredTable(t.table)}
          onMouseLeave={() => setHoveredTable(null)}
          style={{
            border: "2px solid #333",
            borderRadius: 8,
            padding: 12,
            minWidth: 220,
            backgroundColor: activeTables.has(t.table) ? "#fff3cd" : "#fafafa",
            borderColor:
              hoveredTable === t.table
                ? "#ff9800"
                : activeTables.has(t.table)
                ? "#ffb300"
                : "#333",
            transition: "all 0.2s",
            boxShadow: hoveredTable === t.table ? "0 4px 12px rgba(0,0,0,0.1)" : "",
          }}
        >
          <h3 style={{ marginTop: 0 }}>{t.table}</h3>

          {t.pk && <div style={{ color: "green", fontWeight: "bold" }}>PK: {t.pk}</div>}

          {t.fk && t.fk.length > 0 && (
            <div style={{ color: "blue", fontWeight: "bold" }}>FK: {t.fk.join(", ")}</div>
          )}

          <ul style={{ paddingLeft: 18 }}>
            {t.columns.map(col => (
              <li key={col}>{col}</li>
            ))}
          </ul>
        </div>
      ))}

      {/* ===== FK Relationship Lines ===== */}
      <svg
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "500px",
          pointerEvents: "none",
        }}
      >
        {schema.map(t =>
          t.fk?.map(fkCol => {
            const targetTable = schema.find(tbl => tbl.pk === fkCol);
            if (!t.ref?.current || !targetTable?.ref?.current) return null;

            const tRect = t.ref.current.getBoundingClientRect();
            const targetRect = targetTable.ref.current.getBoundingClientRect();
            const parentRect = t.ref.current.parentElement?.getBoundingClientRect();
            if (!parentRect) return null;

            const x1 = tRect.left + tRect.width / 2 - parentRect.left;
            const y1 = tRect.top + tRect.height / 2 - parentRect.top;
            const x2 = targetRect.left + targetRect.width / 2 - parentRect.left;
            const y2 = targetRect.top + targetRect.height / 2 - parentRect.top;

            const isActive =
              activeTables.has(t.table) && activeTables.has(targetTable.table);

            return (
              <line
                key={`${t.table}-${fkCol}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={
                  isActive
                    ? "red"
                    : hoveredTable === t.table || hoveredTable === targetTable.table
                    ? "orange"
                    : "#ccc"
                }
                strokeWidth={isActive ? 3 : 2}
              />
            );
          })
        )}
      </svg>
    </div>

    {/* ===== Results Table UNDER SCHEMA ===== */}
    <div
      style={{
        marginTop: 20,
        padding: 16,
        backgroundColor: "#f5f7fa",
        borderRadius: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        overflowX: "auto",
        width: "100%",
      }}
    >
      <h3 style={{ marginBottom: 12, color: "#1976d2" }}>Results</h3>

      {rows.length === 0 && <p style={{ color: "#555" }}>No results yet.</p>}

      {rows.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {columns.map(c => (
                <th
                  key={c}
                  style={{
                    textAlign: "left",
                    padding: "6px 12px",
                    backgroundColor: "#e3f2fd",
                    borderRadius: "6px 6px 0 0",
                    color: "#1976d2",
                  }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f0f4f8" }}
              >
                {r.map((c, j) => (
                  <td key={j} style={{ padding: "6px 12px", borderBottom: "1px solid #e0e0e0" }}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  </div>

  </div>

    {/* ===== Feedback Button ===== */}
    <div
      style={{
        marginTop: 20,
        display: "flex",
        justifyContent: "center", // center horizontally
      }}
    >
      <button
        onClick={async () => {
          try {
            // 1️⃣ Export session logs invisibly
            await exportSessionToGoogleForm();

            // 2️⃣ Open survey with only session ID prefilled
            const surveyUrl = `https://docs.google.com/forms/d/e/1FAIpQLSew607JecHfhQmGcrs-G8lxix8HGnZneUCDzMjeKfRaqOueEA/viewform?usp=pp_url&entry.1662198417=${sessionId}`;
            window.open(surveyUrl, "_blank");
          } catch (err) {
            console.error("Failed to log session or open survey:", err);
            // fallback: still open survey even if logging fails
            window.open(
              "https://docs.google.com/forms/d/e/1FAIpQLSew607JecHfhQmGcrs-G8lxix8HGnZneUCDzMjeKfRaqOueEA/viewform",
              "_blank"
            );
          }
        }}
        style={{
          padding: "10px 16px",
          fontSize: 16,
          backgroundColor: "#1976d2",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        📋 Give Feedback on This Tutor
      </button>
    </div>

    {/* ===== Survey Modal ===== */}
    {showSurvey && (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "rgba(0,0,0,0.6)",
          zIndex: 1000,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: 10,
        }}
      >
        <div
          style={{
            background: "white",
            padding: 20,
            borderRadius: 12,
            width: "100%",
            maxWidth: 800,
            position: "relative",
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            maxHeight: "90vh",
            overflowY: "auto",
          }}
        >
          {/* Close Button */}
          <button
            onClick={() => setShowSurvey(false)}
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              fontSize: 20,
              border: "none",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            ✖
          </button>

          <h2 style={{ marginTop: 0 }}>Evaluation Survey</h2>
          <p>
            Your feedback helps improve this SQL learning tool. This survey takes
            less than 2 minutes.
          </p>

          <p style={{ fontWeight: "bold", marginBottom: 10 }}>
            Please copy this Session ID into the first question of the survey: <br />
            {sessionId}
          </p>

          <iframe
            src={`https://docs.google.com/forms/d/e/1FAIpQLSew607JecHfhQmGcrs-G8lxix8HGnZneUCDzMjeKfRaqOueEA/viewform?usp=pp_url&entry.1551736835=${sessionId}&embedded=true`}
            width="100%"
            height="500"
            frameBorder="0"
            style={{ borderRadius: 8 }}
            title="SQL Tutor Feedback Form"
          >
            Loading…
          </iframe>
        </div>
      </div>
    )}
      
    </div>
  
  );

}
export default App;