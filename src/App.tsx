import React, { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import initSqlJs from "sql.js";
import type { Database } from "sql.js";

/* =======================
   Syntax Validation
======================= */
const validateSyntax = (query: string): string[] => {
  const errors: string[] = [];
  if (!query.trim()) return ["Query is empty."];
  if (!/SELECT/i.test(query)) errors.push("Missing SELECT clause.");
  if (/SELECT/i.test(query) && !/FROM/i.test(query))
    errors.push("SELECT must be followed by FROM.");
  if (/WHERE/i.test(query) && !/=|<|>|LIKE/i.test(query))
    errors.push("WHERE clause appears incomplete.");
  if (/JOIN/i.test(query) && !/ON/i.test(query))
    errors.push("JOIN requires an ON condition.");
  if (/SELECT\s+[^,]+[^,\s]\s+[^,]+\s+FROM/i.test(query))
    errors.push("Possible missing comma between selected columns.");
  return errors;
};

/* =======================
   Query Parsing
======================= */
const parseQueryParts = (query: string) => ({
  SELECT: query.match(/SELECT\s+(.+?)\s+FROM/i)?.[1] || "",
  FROM: query.match(/FROM\s+([^\s;]+)/i)?.[1] || "",
  WHERE: query.match(/WHERE\s+(.+?)(?:;|$)/i)?.[1] || "",
  JOIN: [...query.matchAll(/JOIN\s+([^\s]+)\s+ON\s+([^\s;]+)/gi)].map(
    (j) => `${j[1]} ON ${j[2]}`
  ),
});

/* =======================
   Hint Generator
======================= */
const generateHints = (
  query: string,
  rows: any[][],
  expected: any[][],
  schema: { table: string; columns: string[] }[]
) => {
  const hints: string[] = [];

  // No results returned
  if (rows.length === 0) {
    hints.push("Your query returned no rows. Check filtering conditions.");
  }

  // Column count mismatch
  const selectedCols =
    query.match(/SELECT\s+(.+?)\s+FROM/i)?.[1]?.split(",").length;
  if (selectedCols && expected[0] && selectedCols !== expected[0].length) {
    hints.push("Selected column count does not match expected output.");
  }

  // Column used without table reference (semantic clarity)
  schema.forEach((t) =>
    t.columns.forEach((c) => {
      if (query.includes(c) && !query.includes(t.table)) {
        hints.push(
          `Column "${c}" is used but table "${t.table}" is not referenced.`
        );
      }
    })
  );

  // Missing JOIN when multiple tables are expected
  if (expected[0]?.length > 1 && !/JOIN/i.test(query)) {
    hints.push("This task likely requires a JOIN between tables.");
  }

  // Aggregate functions without GROUP BY (semantic debugging)
  if (
    /SELECT\s+.*(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(query) &&
    !/GROUP BY/i.test(query)
  ) {
    hints.push(
      "Aggregate function detected but GROUP BY clause is missing."
    );
  }

  return hints;
};
/* =======================
   App
======================= */
function App() {
  const [db, setDb] = useState<Database | null>(null);
  const [query, setQuery] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<any[][]>([]);
  const [schema, setSchema] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [syntaxErrors, setSyntaxErrors] = useState<string[]>([]);
  const [queryParts, setQueryParts] = useState<any>({});
  const [hoveredTable, setHoveredTable] = useState<string | null>(null);
  const [executionSteps, setExecutionSteps] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(-1);

  /* =======================
     Exercises
  ======================= */
  const exercises = [
    {
      label: "All Students",
      query: "SELECT * FROM students;",
      expected: [
        [1, "Alice", 10],
        [2, "Bob", 10],
        [3, "Charlie", 11],
        [4, "David", 12],
      ],
    },
    {
      label: "Grade 10 Students",
      query: "SELECT name FROM students WHERE grade = 10;",
      expected: [["Alice"], ["Bob"]],
    },
    {
      label: "Top Scores",
      query:
        "SELECT s.name, c.title, e.score FROM enrollments e JOIN students s ON e.student_id = s.id JOIN courses c ON e.course_id = c.id WHERE e.score >= 90;",
      expected: [["Alice", "Math", 95]],
    },
    {
      label: "Teachers and Departments",
      query:
        "SELECT t.name, d.name FROM teachers t JOIN departments d ON t.department_id = d.id;",
      expected: [["Mr. Smith", "Math"], ["Ms. Johnson", "Science"]],
    },
    {
      label: "Courses in Classrooms",
      query:
        "SELECT c.title, r.name FROM courses c JOIN classrooms r ON c.id = r.id;", // simple example mapping courses to classrooms by ID
      expected: [["Math", "Room A"], ["Science", "Room B"]],
    },
  ];

  const [exerciseIndex, setExerciseIndex] = useState(0);

  /* =======================
     Init Database
  ======================= */
  useEffect(() => {
    initSqlJs({
      locateFile: (file) =>
        new URL(`/node_modules/sql.js/dist/${file}`, import.meta.url).toString(),
    }).then((SQL) => {
      const database = new SQL.Database();

      // Create all tables including new ones
      database.run(`
        CREATE TABLE students(id INTEGER PRIMARY KEY, name TEXT, grade INTEGER);
        CREATE TABLE courses(id INTEGER PRIMARY KEY, title TEXT);
        CREATE TABLE enrollments(id INTEGER PRIMARY KEY, student_id INTEGER, course_id INTEGER, score INTEGER);
        CREATE TABLE teachers(id INTEGER PRIMARY KEY, name TEXT, department_id INTEGER);
        CREATE TABLE departments(id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE classrooms(id INTEGER PRIMARY KEY, name TEXT, capacity INTEGER);

        INSERT INTO students VALUES
          (1,'Alice',10),(2,'Bob',10),(3,'Charlie',11),(4,'David',12);

        INSERT INTO courses VALUES
          (1,'Math'),(2,'Science');

        INSERT INTO enrollments VALUES
          (1,1,1,95),(2,2,2,88),(3,3,1,75),(4,4,2,60);

        INSERT INTO departments VALUES
          (1,'Math'),(2,'Science');

        INSERT INTO teachers VALUES
          (1,'Mr. Smith',1),(2,'Ms. Johnson',2);

        INSERT INTO classrooms VALUES
          (1,'Room A',30),(2,'Room B',25);
      `);

      const tables = database
        .exec("SELECT name FROM sqlite_master WHERE type='table'")
        [0].values.map(([t]: any) => ({
          table: t,
          columns: database.exec(`PRAGMA table_info(${t})`)[0].values.map(
            (c: any) => c[1]
          ),
          ref: React.createRef<HTMLDivElement>(),
        }));

      setSchema(tables);
      setDb(database);
      setQuery(exercises[0].query);
    });
  }, []);

  /* =======================
     Live Validation
  ======================= */
useEffect(() => {
  const syntaxErrs = validateSyntax(query);
  setSyntaxErrors(syntaxErrs);

  if (db && syntaxErrs.length === 0) {
    try {
      const res = db.exec(query);
      const expected = exercises[exerciseIndex].expected;
      const hints = res.length
        ? generateHints(query, res[0].values, expected, schema)
        : [];
      setFeedback(hints.join(" • "));
    } catch {
      // ignore while typing
    }
  }
}, [query, db]);

  /* =======================
     Run Query
  ======================= */
  const runQuery = async () => {
    if (!db || syntaxErrors.length > 0) return;
    setExecutionSteps([]);
    setCurrentStep(-1);

    try {
      setError(null);
      setFeedback(null);

      const parts = parseQueryParts(query);

      // Animate steps
      const steps: string[] = [];
      if (parts.FROM) steps.push(`FROM ${parts.FROM}`);
      parts.JOIN.forEach((j) => steps.push(`JOIN ${j}`));
      if (parts.WHERE) steps.push(`WHERE ${parts.WHERE}`);
      if (parts.SELECT) steps.push(`SELECT ${parts.SELECT}`);
      setExecutionSteps(steps);

      for (let i = 0; i < steps.length; i++) {
        setCurrentStep(i);
        await new Promise((r) => setTimeout(r, 400));
      }

      const res = db.exec(query);
      setQueryParts(parts);

      if (!res.length) {
        setRows([]);
        setFeedback("No results returned.");
        return;
      }

      setColumns(res[0].columns);
      setRows(res[0].values);

      const expected = exercises[exerciseIndex].expected;
      const correct = JSON.stringify(res[0].values) === JSON.stringify(expected);
      setFeedback(
        correct
          ? "✅ Correct!"
          : generateHints(query, res[0].values, expected, schema).join(" • ")
      );
    } catch (e: any) {
      setError(e.message);
    }
  };

  /* =======================
     UI
  ======================= */
return (
  <div style={{ padding: 20 }}>
    <h1>Educational SQL Tutor</h1>

    {/* Exercise Buttons */}
    {exercises.map((e, i) => (
      <button
        key={i}
        onClick={() => {
          setExerciseIndex(i);
          setQuery(e.query);
          setRows([]);
          setFeedback(null);
        }}
        style={{
          marginRight: 5,
          backgroundColor: i === exerciseIndex ? "#4caf50" : "#ccc",
          color: i === exerciseIndex ? "white" : "black",
        }}
      >
        {e.label}
      </button>
    ))}

    {/* Editor */}
    <Editor
      height="220px"
      language="sql"
      value={query}
      onChange={(v) => setQuery(v || "")}
    />

    {/* Syntax warnings (real-time) */}
    {syntaxErrors.map((e, i) => (
      <p key={i} style={{ color: "orange", margin: "4px 0" }}>
        ⚠ {e}
      </p>
    ))}

    {/* Semantic / Debugging feedback (real-time & post-run) */}
    {feedback && (
      <p style={{ color: "blue", marginTop: 6 }}>
        💡 {feedback}
      </p>
    )}

    <button disabled={syntaxErrors.length > 0} onClick={runQuery}>
      Run Query
    </button>

    {error && <p style={{ color: "red" }}>{error}</p>}

    {/* Schema Cards */}
    <div style={{ position: "relative", marginTop: 20 }}>
      <h2>Database Schema</h2>
      <div
        style={{
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        {schema.map((t: any) => (
          <div
            key={t.table}
            ref={t.ref}
            onMouseEnter={() => setHoveredTable(t.table)}
            onMouseLeave={() => setHoveredTable(null)}
            style={{
              border: "2px solid #333",
              borderRadius: 8,
              padding: 12,
              minWidth: 220,
              backgroundColor: "#fafafa",
              transition: "border-color 0.2s",
              ...(hoveredTable === t.table ? { borderColor: "#ff9800" } : {}),
            }}
          >
            <h3 style={{ marginTop: 0 }}>{t.table}</h3>
            {t.pk && (
              <div style={{ color: "green", fontWeight: "bold" }}>
                PK: {t.pk}
              </div>
            )}
            {t.fk && t.fk.length > 0 && (
              <div style={{ color: "blue", fontWeight: "bold" }}>
                FK: {t.fk.join(", ")}
              </div>
            )}
            <ul style={{ paddingLeft: 18 }}>
              {t.columns.map((col: string) => (
                <li key={col}>{col}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* FK lines */}
      <svg
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        {schema.map((t: any) =>
          t.fk?.map((fkCol: string) => {
            const targetTable = schema.find((tbl: any) => tbl.pk === fkCol);
            if (!t.ref?.current || !targetTable?.ref?.current) return null;

            const tRect = t.ref.current.getBoundingClientRect();
            const targetRect = targetTable.ref.current.getBoundingClientRect();
            const parentRect =
              t.ref.current.parentElement?.getBoundingClientRect();
            if (!parentRect) return null;

            const x1 = tRect.left + tRect.width / 2 - parentRect.left;
            const y1 = tRect.top + tRect.height / 2 - parentRect.top;
            const x2 =
              targetRect.left + targetRect.width / 2 - parentRect.left;
            const y2 =
              targetRect.top + targetRect.height / 2 - parentRect.top;

            return (
              <line
                key={`${t.table}-${fkCol}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={
                  hoveredTable === t.table ||
                  hoveredTable === targetTable.table
                    ? "red"
                    : "orange"
                }
                strokeWidth={2}
              />
            );
          })
        )}
      </svg>
    </div>

    {/* Query Breakdown */}
    <h2>Query Breakdown</h2>
    {Object.entries(queryParts).map(([k, v]: any) => (
      <p key={k}>
        <b>{k}</b>: {Array.isArray(v) ? v.join(" | ") : v}
      </p>
    ))}

    {/* Execution Animation */}
    {executionSteps.length > 0 && (
      <div style={{ marginTop: 10 }}>
        <h3>Execution Steps</h3>
        <ol>
          {executionSteps.map((s, i) => (
            <li
              key={i}
              style={{
                color: i === currentStep ? "green" : "black",
                fontWeight: i === currentStep ? "bold" : "normal",
              }}
            >
              {s}
            </li>
          ))}
        </ol>
      </div>
    )}

    {/* Results Table */}
    {rows.length > 0 && (
      <table border={1} style={{ marginTop: 10 }}>
        <thead>
          <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c: any, j: number) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
);
}

export default App;