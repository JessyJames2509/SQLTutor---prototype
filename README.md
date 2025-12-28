# Design and Evaluation of an Interactive SQL Learning Tool with Real-Time Visualisation and Debugging Feedback 🎓

A Thesis Submitted in Partial Fulfillment of the Requirements for the Degree of  
**Bachelor of Science in Computing and Systems Development**  
Department of Computing and Digital, University Centre Rotherham, Rotherham, UK

---

## 1. Project Overview

SQLTutor is an interactive web-based SQL learning environment designed to address common challenges in learning SQL, including syntax, logic, and semantic errors. Traditional approaches rely on static examples or gamified platforms that focus on rewards rather than understanding. SQLTutor provides real-time debugging feedback and visualisation of queries to support students in developing accurate mental models and deeper comprehension of SQL.

By visualising query execution and relationships between tables, the tool reduces cognitive load, supports error-based learning, and aligns with Constructivist and Cognitive Load theories.

---

## 2. Background and Motivation

- Learners struggle with SQL syntax, logical, and semantic errors (Miedema, 2023; Del-Pozo-Arcos & Balderas, 2024).  
- Existing gamified platforms often provide limited or post-execution feedback.  
- Visualisation has been shown to improve comprehension and reduce errors (Leventidis et al., 2020; Jeyaraj, Kumar, & Srinivasan, 2022).  
- Real-time debugging hints and execution visualisation enhance understanding and support formative learning.

**Problem:** Current platforms often fail to combine immediate feedback, visualisation, and accessibility, leaving students with persistent misconceptions.

---

## 3. Aim and Objectives

**Aim:**  
To design and evaluate an interactive SQL tool with real-time debugging feedback and visualisation of query outputs, and determine its effectiveness in improving student understanding compared to traditional static and gamified methods.

**Objectives:**

1. Develop a live query execution and visualisation SQL tool.  
2. Incorporate a real-time semantic feedback mechanism for debugging.  
3. Conduct a small user study to evaluate comprehension improvements.

**Research Question:**  
Can an interactive SQL tool with real-time debugging and visualisation improve student learning outcomes compared to traditional and gamified approaches?

**Scope:**  
Focuses on students at University Centre Rotherham with basic SQL knowledge. Includes prototype development and small-scale evaluation.

**Limitations:**  
- Limited participants  
- Short-term evaluation  
- Limited SQL experience

---

## 4. Educational Design Principles

SQLTutor is grounded in evidence-based educational theories:

- **Immediate Feedback:** Syntax and semantic errors highlighted while typing and executing queries.  
- **Formative Assessment:** Progressive exercises with hints and feedback.  
- **Error-Based Learning:** Students learn by correcting mistakes.  
- **Cognitive Scaffolding:** Visualisations reduce cognitive load and gradually guide learners.  
- **Visual Learning Aids:** Step-by-step execution and schema diagrams externalise query logic.

The tool aligns with:

- **Cognitive Load Theory (Sweller et al., 2019)** – reduces memory overload  
- **Constructivist Theory (McLeod, 2025)** – learning through experience and mental models  
- **Formative Feedback Theory (Hattie & Timperley, 2007)** – feedback enhances learning before execution  
- **Universal Design for Learning** – accessible, lightweight, and intuitive

---

## 5. Features of SQLTutor

- **Live SQL syntax validation**  
- **Semantic error detection and hints**  
- **Interactive schema visualisation**  
- **Animated, step-by-step query execution**  
- **Built-in exercises with expected outputs**  
- **Offline SQL execution via sql.js (WebAssembly)**  
- **Lightweight, accessible, and open-source**

**Design Highlights:**

- Real-time debugging of missing clauses, logical errors, or incorrect syntax  
- Visualization of table relationships and query execution flow  
- Focus on learning and comprehension rather than gamification rewards  

---

## 6. Comparative Research Gap

| Tool | Visualization | Real-Time Feedback | Debugging Support | Notes |
|------|---------------|-----------------|-----------------|------|
| SQLZoo | Minimal | No | No | Engagement-focused, limited conceptual feedback |
| SQLBolt | Static | No | No | Syntax practice only |
| QueryVis | Yes (post-execution) | No | No | Concept visualization, no live correction |
| SQLTutor (Proposed) | Dynamic | Yes | Yes | Prototype, accessible, integrates visualisation and debugging |

**Research Gap:** Existing tools do not fully integrate **real-time feedback** with **dynamic visualisation** for accessible SQL learning. SQLTutor addresses this gap.

---

## 7. Technology Stack

- **Frontend:** React + TypeScript  
- **Editor:** Monaco Editor  
- **Database Engine:** SQLite via sql.js (WASM)  
- **Visualization:** SVG + React-driven schema and execution animations

---

## 8. Getting Started

### Prerequisites

- Node.js v16+  
- npm or yarn

### Installation

```bash
git clone https://github.com/JessyJames2509/SQLTutor---thesis.git
cd SQLTutor---thesis/sql-playground
npm install
npm run dev
```

### Accessing the App

Open your browser and navigate to the URL shown in the terminal (default: <http://localhost:5173>).

### Stopping the Server

Press `Ctrl + C` in the terminal to stop the development server.


## 9. Feedback and Contributions

Constructive feedback is welcome, especially regarding:

- Educational effectiveness  
- Usability for novice learners  
- SQL correctness and edge cases  
- Suggestions for additional exercises, visualisations, or debugging support  

Submit feedback via [GitHub Issues](https://github.com/JessyJames2509/SQLTutor---thesis/issues).

## 10. Screenshots / Visual Aids

![Schema Visualization](docs/schema.png)
![Execution Animation](docs/execution.gif)
![Hints Example](docs/hints.png)

## 11. License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 12. References

- Del-Pozo-Arcos, B., & Balderas, L. (2024). SQL Learning Challenges.  
- Miedema, A. (2024). Novice SQL Misconceptions.  
- Leventidis, V. et al. (2020). QueryVis: Visualization Tools for SQL.  
- Sweller, J. et al. (2019). Cognitive Load Theory in Learning.  
- Hattie, J., & Timperley, H. (2007). The Power of Feedback.