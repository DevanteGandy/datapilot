"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getConnection, registerCSV } from "@/lib/duck";
import {
  Download,
  Play,
  Upload as UploadIcon,
  BarChart2,
  LineChart as LineIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

// Use Apache Arrow types (DuckDB returns Arrow Tables)
import type { Table, Field, Vector } from "apache-arrow";

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;

function tableToObjects(table: Table): Row[] {
  const fields: readonly Field[] = table.schema.fields;
  const cols = fields.map((f: Field) => f.name);
  const vectors: (Vector | null)[] = cols.map((_, i) => table.getChildAt(i));
  const rowCount = table.numRows;

  const out: Row[] = [];
  for (let r = 0; r < rowCount; r++) {
    const obj: Row = {};
    for (let c = 0; c < vectors.length; c++) {
      const vec = vectors[c];
      const raw = vec ? (vec.get(r) as unknown) : undefined;
      obj[cols[c]] =
        typeof raw === "string" ||
        typeof raw === "number" ||
        typeof raw === "boolean" ||
        raw == null
          ? (raw as Cell)
          : raw !== undefined
          ? String(raw)
          : null;
    }
    out.push(obj);
  }
  return out;
}

export default function Page() {
  const [ready, setReady] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [sql, setSql] = useState<string>("SELECT * FROM data LIMIT 200;");
  const [rows, setRows] = useState<Row[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [xKey, setXKey] = useState<string>("");
  const [yKey, setYKey] = useState<string>("");
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getConnection().then(() => setReady(true));
  }, []);

  useEffect(() => {
    const s = localStorage.getItem("datapilot.sql");
    if (s) setSql(s);
  }, []);
  useEffect(() => {
    localStorage.setItem("datapilot.sql", sql);
  }, [sql]);
  type SavedQuery = { id: string; name: string; sql: string };
  const [saved, setSaved] = useState<SavedQuery[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem("datapilot.saved");
    if (raw) setSaved(JSON.parse(raw));
  }, []);
  useEffect(() => {
    localStorage.setItem("datapilot.saved", JSON.stringify(saved));
  }, [saved]);

  function saveCurrentQuery(name: string) {
    const n = name.trim();
    if (!n) return;
    setSaved((prev) => [...prev, { id: crypto.randomUUID(), name: n, sql }]);
  }

  function deleteSaved(id: string) {
    setSaved((prev) => prev.filter((q) => q.id !== id));
  }

  async function handleUpload(file: File) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const safe =
      file.name.replace(/[^a-z0-9_.-]/gi, "_").toLowerCase() || "data.csv";
    await registerCSV(safe, buf);
    setFileName(file.name);
    await run("SELECT * FROM data LIMIT 200;");
  }

  async function run(q: string) {
    const conn = await getConnection();
    const res = await conn.query(q); // Arrow Table
    const schemaCols = res.schema.fields.map((f: Field) => f.name);
    const data = tableToObjects(res as unknown as Table);

    setRows(data);
    setCols(schemaCols);

    if (!xKey && schemaCols.length > 0) setXKey(schemaCols[0]);
    if (!yKey && schemaCols.length > 1) {
      const numericCandidate = schemaCols.find(
        (k) => typeof data[0]?.[k] === "number"
      );
      setYKey(numericCandidate ?? schemaCols[1]);
    }
  }

  const chartData: Row[] = useMemo(() => {
    if (!xKey || !yKey) return [];
    return rows.slice(0, 500);
  }, [rows, xKey, yKey]);

  async function exportPNG() {
    const container = chartRef.current;
    if (!container) return;

    const svg = container.querySelector("svg");
    if (!svg) return;

    // Serialize the SVG
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svg);

    if (!source.match(/^<svg[^>]+xmlns=/)) {
      source = source.replace(
        "<svg",
        '<svg xmlns="http://www.w3.org/2000/svg"'
      );
    }

    // Blob -> Image
    const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.decoding = "sync";

    img.onload = () => {
      const rect = svg.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(rect.width * scale);
      canvas.height = Math.ceil(rect.height * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);

      // Background (dark UI fallback)
      const bg = getComputedStyle(container).backgroundColor || "#0a0a0a";
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.drawImage(img, 0, 0, rect.width, rect.height);
      URL.revokeObjectURL(url);

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "chart.png";
      a.click();
    };

    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  async function loadExample() {
    const csv = `city,month,sales
NYC,1,120
NYC,2,180
NYC,3,150
SF,1,90
SF,2,130
SF,3,160
LA,1,110
LA,2,140
LA,3,170`;
    const encoder = new TextEncoder();
    await registerCSV("example.csv", encoder.encode(csv));
    setFileName("example.csv");
    await run("SELECT * FROM data LIMIT 200;");
  }

  return (
    <main className="min-h-dvh bg-neutral-950 text-neutral-100">
      <div className="max-w-6xl mx-auto p-6 space-y-8">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">
            DataPilot — Local SQL over CSV (DuckDB-WASM)
          </h1>
          <div className="text-sm opacity-80">
            {ready ? "DB ready" : "Loading DB..."}
          </div>
        </header>

        {/* Upload */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2 border border-neutral-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">Upload CSV</h2>
              <button
                onClick={loadExample}
                className="text-xs px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
              >
                Load example
              </button>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) =>
                  e.target.files?.[0] && handleUpload(e.target.files[0])
                }
              />
              <span className="inline-flex items-center gap-2 px-3 py-2 rounded bg-neutral-800 hover:bg-neutral-700">
                <UploadIcon size={16} /> Choose CSV
              </span>
              <span className="text-sm opacity-80">
                {fileName || "No file selected"}
              </span>
            </label>
            <p className="mt-2 text-xs opacity-60">
              Local-first. Your data never leaves the browser.
            </p>
          </div>

          <div className="border border-neutral-800 rounded-lg p-4">
            <h3 className="font-medium mb-2">Templates</h3>
            <div className="grid gap-2 text-sm">
              <button
                onClick={() => setSql("SELECT * FROM data LIMIT 200;")}
                className="text-left px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
              >
                Preview first 200
              </button>
              <button
                onClick={() =>
                  setSql("SELECT * FROM data ORDER BY 1 LIMIT 200;")
                }
                className="text-left px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
              >
                Order by first column
              </button>
              <button
                onClick={() => setSql("SELECT * FROM data LIMIT 1000;")}
                className="text-left px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
              >
                Top 1000 rows
              </button>
            </div>
          </div>
        </section>
        <section className="border border-neutral-800 rounded-lg p-4">
          <h3 className="font-medium mb-2">Saved</h3>
          <div className="flex gap-2 mb-2">
            <input
              id="sqn"
              placeholder="Name..."
              className="h-9 px-2 rounded bg-neutral-900 border border-neutral-800 text-sm"
            />
            <button
              className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-sm"
              onClick={() =>
                saveCurrentQuery(
                  (document.getElementById("sqn") as HTMLInputElement).value
                )
              }
            >
              Save
            </button>
          </div>
          {saved.length === 0 ? (
            <div className="text-sm opacity-60">No saved queries yet.</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {saved.map((q) => (
                <li key={q.id} className="flex items-center justify-between">
                  <button
                    className="underline"
                    onClick={() => {
                      setSql(q.sql);
                      void run(q.sql);
                    }}
                  >
                    {q.name}
                  </button>

                  <button
                    className="opacity-70 hover:opacity-100"
                    onClick={() => deleteSaved(q.id)}
                  >
                    delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* SQL */}
        <section className="border border-neutral-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium">SQL</h2>
            <button
              onClick={() => void run(sql)}
              disabled={!ready}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
            >
              <Play size={16} /> Run
            </button>
          </div>
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            className="w-full h-32 p-3 rounded bg-neutral-900 border border-neutral-800 font-mono text-sm"
            spellCheck={false}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void run(sql);
              }
            }}
          />
        </section>

        {/* Results & Chart */}
        <section className="grid gap-6 md:grid-cols-2">
          <div className="border border-neutral-800 rounded-lg p-4 overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-medium">Results ({rows.length})</h2>
            </div>
            {rows.length === 0 ? (
              <div className="text-sm opacity-60">
                Run a query to see results.
              </div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-neutral-950">
                  <tr>
                    {cols.map((c: string) => (
                      <th
                        key={c}
                        className="text-left px-2 py-1 border-b border-neutral-800"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((r, i) => (
                    <tr key={i} className="odd:bg-neutral-900/40">
                      {cols.map((c) => (
                        <td
                          key={c}
                          className="px-2 py-1 border-b border-neutral-900"
                        >
                          {String(r[c] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="border border-neutral-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">Chart</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setChartType("line")}
                  className={`px-2 py-1 rounded ${
                    chartType === "line"
                      ? "bg-neutral-700"
                      : "bg-neutral-800 hover:bg-neutral-700"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    <LineIcon size={14} /> Line
                  </span>
                </button>
                <button
                  onClick={() => setChartType("bar")}
                  className={`px-2 py-1 rounded ${
                    chartType === "bar"
                      ? "bg-neutral-700"
                      : "bg-neutral-800 hover:bg-neutral-700"
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    <BarChart2 size={14} /> Bar
                  </span>
                </button>
                <button
                  onClick={() => void exportPNG()}
                  className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 inline-flex items-center gap-2"
                >
                  <Download size={14} /> Export PNG
                </button>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="text-sm opacity-60">
                Run a query and select axes.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <select
                    className="h-9 rounded bg-neutral-900 border border-neutral-800 px-2 text-sm"
                    value={xKey}
                    onChange={(e) => setXKey(e.target.value)}
                  >
                    {cols.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded bg-neutral-900 border border-neutral-800 px-2 text-sm"
                    value={yKey}
                    onChange={(e) => setYKey(e.target.value)}
                  >
                    {cols.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div
                  ref={chartRef}
                  className="h-64 w-full border border-neutral-800 rounded"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    {chartType === "line" ? (
                      <LineChart
                        data={chartData}
                        margin={{ top: 10, right: 20, bottom: 0, left: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey={yKey}
                          dot={false}
                          strokeWidth={2}
                        />
                      </LineChart>
                    ) : (
                      <BarChart
                        data={chartData}
                        margin={{ top: 10, right: 20, bottom: 0, left: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey={yKey} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        </section>

        <footer className="text-xs opacity-60">
          Local-first • No backend • DuckDB-WASM
        </footer>
      </div>
    </main>
  );
}
