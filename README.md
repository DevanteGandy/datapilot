# DataPilot — Local SQL over CSV (DuckDB-WASM)

**What it is:** In-browser SQL studio. Upload CSV, run SQL locally, chart results, export.  
**Why it matters:** Zero backend. Fast. Private (data never leaves your browser).

## Demo

1. Load example → Run → Pick `month` (X) and `sales` (Y) → Export PNG.
2. Upload your own CSV and run any SQL (DuckDB dialect).

## Stack

- Next.js (App Router) + TypeScript
- DuckDB-WASM (Apache Arrow tables)
- Recharts + html2canvas
- TailwindCSS

## Features

- Upload CSV (local-first, no uploads)
- SQL editor with templates + Ctrl/Cmd+Enter to run
- Results table (first 200 rows)
- Chart builder (Line/Bar) with X/Y selectors
- Export chart to PNG
- Saved queries (localStorage)
- Example dataset button
