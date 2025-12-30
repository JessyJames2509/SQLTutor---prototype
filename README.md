SQLTutor 🎓

Interactive SQL learning tool with real-time syntax validation, semantic hints, execution visualization, and a feedback survey.

Bachelor of Science Thesis Project
Department of Computing and Digital, University Centre Rotherham, UK

Live Demo

Try SQLTutor online: GitHub Pages Link

Table of Contents

Project Overview

Features

Technology Stack

Quickstart / Usage

Installation & Deployment

Feedback and Contributions

Screenshots

License

Academic References

Project Overview

SQLTutor is an interactive web-based SQL learning environment designed to address common challenges in learning SQL:

Syntax, logic, and semantic errors

Lack of immediate feedback in traditional tools

Difficulties visualizing query execution

By providing real-time debugging hints and step-by-step query visualization, SQLTutor supports error-based learning, reduces cognitive load, and aligns with Constructivist and Cognitive Load theories.

Features

Live SQL syntax validation

Semantic error detection and hints

Interactive schema visualization

Animated, step-by-step query execution

Built-in exercises with expected outputs

Offline SQL execution via sql.js (WebAssembly)

Horizontal layout for Query Breakdown, Execution Steps, and Results

Feedback button with survey modal

Lightweight, accessible, and open-source

Design Highlights:

Real-time debugging of missing clauses, logical errors, or incorrect syntax

Visualization of table relationships and query execution flow

Focus on learning and comprehension rather than gamification rewards

Technology Stack

Frontend: React + TypeScript

Editor: Monaco Editor

Database Engine: SQLite via sql.js (WASM)

Visualization: SVG + React-driven schema and execution animations

Quickstart / Usage

Select an exercise from the buttons at the top.

Write your SQL query in the editor.

Run the query using the "Run Query" button.

Observe:

Syntax errors (orange warnings)

Semantic hints (blue feedback)

Query execution steps (highlighted schema & step animation)

Provide feedback via the "Give Feedback" button.

Installation & Deployment
Prerequisites

Node.js v16+

npm or yarn

Local Installation
git clone https://github.com/JessyJames2509/SQLTutor---thesis.git
cd SQLTutor---thesis/sql-playground
npm install
npm run dev


Open your browser at the URL shown in the terminal (default: http://localhost:5173
).

Build & Deploy to GitHub Pages
npm run build
npm run deploy

Feedback and Contributions

Constructive feedback is welcome!

Educational effectiveness

Usability for novice learners

SQL correctness and edge cases

Suggestions for additional exercises, visualizations, or debugging support

Submit feedback via GitHub Issues
.

Screenshots

Schema Visualization


Execution Animation


Hints Example


Horizontal Layout & Feedback Button
(update with screenshot of your current layout)

License

MIT License — see the LICENSE
 file for details.

Academic References

Del-Pozo-Arcos, B., & Balderas, L. (2024). SQL Learning Challenges.

Miedema, A. (2024). Novice SQL Misconceptions.

Leventidis, V. et al. (2020). QueryVis: Visualization Tools for SQL.

Sweller, J. et al. (2019). Cognitive Load Theory in Learning.

Hattie, J., & Timperley, H. (2007). The Power of Feedback.