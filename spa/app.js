/* global React, ReactDOM */

const { useState, useEffect, useRef, useCallback, createElement: h } = React;

// ── config ────────────────────────────────────────────────────

const API_BASE = "";
const API_TOKEN = "clear-refine-demo-token-2026";

function apiHeaders() {
  return { Authorization: `Bearer ${API_TOKEN}`, "Content-Type": "application/json" };
}

// ── small components ──────────────────────────────────────────

function Icon({ name, className = "" }) {
  const m = {
    folder: "\uD83D\uDCC1", file: "\uD83D\uDCC4", check: "\u2705",
    clock: "\u23F3", error: "\u274C", cancel: "\u26A0\uFE0F",
    process: "\uD83D\uDD04", pending: "\u25AB", start: "\u25B6",
    stop: "\u23F9", refresh: "\uD83D\uDD04", back: "\u2190",
  };
  return h("span", { className: `icon ${className}` }, m[name] || "\u2753");
}

function Spinner() {
  return h("span", { className: "spin" }, "\u23F3");
}

function Button({ label, primary, danger, small, disabled, onClick }) {
  const cls = [
    "btn",
    primary && "btn-primary",
    danger && "btn-danger",
    small && "btn-sm",
  ].filter(Boolean).join(" ");
  return h("button", { className: cls, disabled, onClick }, label);
}

// ── Path browser ──────────────────────────────────────────────

function PathBrowser({ value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const [dirs, setDirs] = useState([]);
  const [images, setImages] = useState([]);
  const [currentPath, setCurrentPath] = useState(value || "C:\\");
  const [inputText, setInputText] = useState(value || "");

  async function browse(path) {
    if (!path) return;
    try {
      const url = `${API_BASE}/api/browse?path=${encodeURIComponent(path)}`;
      const resp = await fetch(url, { headers: apiHeaders() });
      if (!resp.ok) return;
      const data = await resp.json();
      setDirs(data.dirs);
      setImages(data.images);
      setCurrentPath(data.path);
    } catch {}
  }

  useEffect(() => {
    setInputText(value || "");
    setCurrentPath(value || "C:\\");
  }, [value]);

  useEffect(() => {
    if (open) {
      const startPath = value || "C:\\";
      setCurrentPath(startPath);
      browse(startPath);
      setInputText(value || "");
    }
  }, [open]);

  function pickDir(name) {
    const sep = currentPath.endsWith("\\") || currentPath.endsWith("/") ? "" : "\\";
    const newPath = currentPath + sep + name;
    setCurrentPath(newPath);
    browse(newPath);
  }

  function goUp() {
    const normalized = currentPath.replace(/\//g, "\\").replace(/\\+$/, "");
    if (/^[a-zA-Z]:\\?$/.test(normalized)) return;
    const parent = normalized.substring(0, normalized.lastIndexOf("\\"));
    const result = parent.length === 2 ? parent + "\\" : parent;
    setCurrentPath(result);
    browse(result);
  }

  function handleInputChange(e) {
    const val = e.target.value;
    setInputText(val);
  }

  function handleInputKeyDown(e) {
    if (e.key === "Enter" && inputText) {
      setCurrentPath(inputText);
      browse(inputText);
    }
  }

  function handleInputBlur() {
    if (inputText && inputText !== currentPath) {
      setCurrentPath(inputText);
      browse(inputText);
    }
  }

  function selectThis() {
    onChange(currentPath);
    setOpen(false);
  }

  function toggleOpen() {
    if (!open) {
      const startPath = value || "C:\\";
      setCurrentPath(startPath);
      setInputText(value || "");
    }
    setOpen(!open);
  }

  return h("div", { className: "path-browser" },
    h("div", { className: "path-row" },
      h("input", {
        value: inputText,
        onChange: handleInputChange,
        onKeyDown: handleInputKeyDown,
        onBlur: handleInputBlur,
        placeholder: "Enter path or Browse... e.g. C:\\",
      }),
      h(Button, { label: "Browse...", small: true, onClick: toggleOpen }),
    ),
    open && h("div", { className: "dir-browser" },
      h("div", { className: "dir-entry dir", onClick: goUp },
        h(Icon, { name: "back" }), ".."),
      dirs.map(d => h("div", {
        key: d, className: "dir-entry dir",
        onClick: () => pickDir(d),
      }, h(Icon, { name: "folder" }), d)),
      images.map(f => h("div", {
        key: f, className: "dir-entry file",
      }, h(Icon, { name: "file" }), f)),
      h("div", { style: { display: "flex", gap: "0.5rem", padding: "0.4rem 0.6rem", borderTop: "1px solid #334155" } },
        h(Button, { label: "Select this folder", small: true, primary: true, onClick: selectThis }),
      ),
    ),
  );
}

// ── Log panel ────────────────────────────────────────────────

function LogPanel() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const bottomRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/logs?n=200`);
        const data = await resp.json();
        setLogs(data.logs || []);
      } catch {}
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const levels = { INFO: "38bdf8", WARNING: "fbbf24", ERROR: "f87171", DEBUG: "475569" };

  function parseLine(line) {
    const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) \[(\w+)\] (\w+): (.*)/);
    if (!match) return { ts: "", lvl: "", msg: line };
    const lvl = match[2];
    if (filter !== "ALL" && lvl !== filter) return null;
    return { ts: match[1], lvl, name: match[3], msg: match[4] };
  }

  function handleClear() { setLogs([]); }

  const filtered = logs.map(parseLine).filter(Boolean);

  const counts = {};
  logs.forEach(line => {
    const m = line.match(/^.*\[(\w+)\]/);
    if (m) counts[m[1]] = (counts[m[1]] || 0) + 1;
  });

  return h("div", { className: "log-panel" },
    h("div", { className: "log-header" },
      h("span", null, "Server Log"),
      h("div", { style: { display: "flex", gap: "0.3rem", alignItems: "center" } },
        ["ALL", "INFO", "WARNING", "ERROR"].map(l =>
          h("button", {
            key: l, className: "log-clear-btn",
            style: filter === l ? { background: "#475569" } : {},
            onClick: () => setFilter(l),
          }, `${l}${l !== "ALL" ? ` (${counts[l] || 0})` : ""}`)
        ),
        h("button", { className: "log-clear-btn", onClick: handleClear }, "Clear"),
        h("button", {
          className: "log-clear-btn",
          onClick: () => setAutoScroll(!autoScroll),
        }, autoScroll ? "Auto" : "Manual"),
      ),
    ),
    h("div", { className: "log-content", onScroll: e => {
      const el = e.target;
      setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
    } },
      filtered.length === 0 && h("div", { className: "log-line", style: { color: "#475569" } }, "(no log entries)"),
      filtered.map((entry, i) =>
        !entry ? null : h("div", { key: i, className: "log-line" },
          h("span", { className: "ts" }, entry.ts),
          " ",
          h("span", { className: `lvl-${entry.lvl}` }, `[${entry.lvl}]`),
          " ",
          h("span", { style: { color: "#64748b" } }, entry.name),
          " ",
          entry.msg,
        )
      ),
      h("div", { ref: bottomRef }),
    ),
  );
}


// ── main app ──────────────────────────────────────────────────

function App() {
  const [inputDir, setInputDir] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [posPrompt, setPosPrompt] = useState(
    "hyper realism, photo realism, HDR, natural skin colour, great contrast, great colour saturation, five fingers on both hands"
  );
  const [negPrompt, setNegPrompt] = useState(
    "bad quality, blurry, messy, low resolution, artifacts, deformed fingers, female, girl, makeup"
  );
  const [maxImages, setMaxImages] = useState(0);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(null);
  const pollRef = useRef(null);

  const canStart = !running && inputDir;

  function startProcessing() {
    if (!canStart) return;

    fetch(`${API_BASE}/api/queue`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        input_dir: inputDir,
        output_dir: outputDir,
        output_prefix: "refined_",
        positive_prompt: posPrompt,
        negative_prompt: negPrompt,
        max_images: maxImages > 0 ? maxImages : null,
      }),
    })
      .then(r => r.json())
      .then(data => {
        setRunning(true);
        setStatus({ batch_id: data.batch_id, total: data.total, done: 0, current: "", results: [], status: "queued" });
        startPolling(data.batch_id);
      })
      .catch(err => alert("Failed to start: " + err.message));
  }

  function cancelProcessing() {
    if (!status || !status.batch_id) return;
    fetch(`${API_BASE}/api/cancel/${status.batch_id}`, {
      method: "POST", headers: apiHeaders(),
    }).catch(() => {});
  }

  function startPolling(batchId) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      fetch(`${API_BASE}/api/status/${batchId}`, { headers: apiHeaders() })
        .then(r => r.json())
        .then(s => {
          setStatus(s);
          if (["completed", "failed", "cancelled", "completed_with_errors"].includes(s.status)) {
            setRunning(false);
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
          }
        })
        .catch(() => {});
    }, 1500);
  }

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function statusIcon(item) {
    if (item.status === "ok") return "check";
    if (item.status === "cancelled") return "cancel";
    if (item.status?.startsWith("error")) return "error";
    return "pending";
  }

  function statusClass(item) {
    if (item.status === "ok") return "status-ok";
    if (item.status?.startsWith("error")) return "status-error";
    if (item.status === "cancelled") return "status-cancelled";
    return "status-pending";
  }

  const total = status?.total || 0;
  const done = status?.done || 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const left = h("div", { className: "app-left" },
    h("header", null,
      h("h1", null, h("span", null, "\uD83D\uDD04"), "ClearRefine"),
      h("p", null, "Batch image refinement via ComfyUI"),
    ),

    h("div", { className: "card" },
      h("h2", null, "Input Directory"),
      h(PathBrowser, { value: inputDir, onChange: setInputDir }),
    ),

    h("div", { className: "card" },
      h("h2", null, "Output Directory",
        h("span", { style: { color: "#64748b", fontSize: "0.75rem", marginLeft: "0.5rem", fontWeight: 400, textTransform: "none", letterSpacing: 0 } },
          "(leave empty for ComfyUI default)")),
      h(PathBrowser, { value: outputDir, onChange: setOutputDir }),
    ),

    h("div", { className: "card" },
      h("h2", null, "Prompts"),
      h("div", { className: "prompt-grid" },
        h("div", null,
          h("label", null, "Positive prompt"),
          h("textarea", {
            value: posPrompt, rows: 3,
            onChange: e => setPosPrompt(e.target.value),
          }),
        ),
        h("div", null,
          h("label", null, "Negative prompt"),
          h("textarea", {
            value: negPrompt, rows: 3,
            onChange: e => setNegPrompt(e.target.value),
          }),
        ),
      ),
    ),

    h("div", { className: "card" },
      h("h2", null, "Limits"),
      h("div", { style: { display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem" } },
        h("label", null, "Max files:"),
        h("input", {
          type: "number", min: 0, max: 999, step: 1,
          value: maxImages,
          onChange: e => setMaxImages(Math.max(0, parseInt(e.target.value) || 0)),
          style: { width: "4rem", background: "#0f172a", border: "1px solid #334155",
            borderRadius: "0.35rem", padding: "0.3rem 0.5rem", color: "#e2e8f0", fontSize: "0.82rem" },
        }),
        h("span", { style: { color: "#64748b", fontSize: "0.78rem" } },
          maxImages > 0 ? `process first ${maxImages} file(s)` : "no limit (all files)"),
      ),
    ),

    h("div", { className: "card" },
      h("div", { className: "start-row" },
        h(Button, {
          label: running ? "Processing..." : "\u25B6 Start Processing",
          primary: true,
          disabled: !canStart,
          onClick: startProcessing,
        }),
        running && h(Button, {
          label: "\u23F9 Cancel",
          danger: true,
          disabled: !running,
          onClick: cancelProcessing,
        }),
      ),
    ),

    status && h("div", { className: "card" },
      h("h2", null, "Progress"),
      h("div", { className: "progress-track" },
        h("div", { className: "progress-bar" },
          h("div", { className: "progress-fill", style: { width: `${pct}%` } }),
        ),
        h("div", { className: "progress-info" },
          running ? `Processing: ${status.current || "..."} (${done}/${total})` : `${done} images done`,
          status.status === "cancelled" && " \u2014 cancelled",
        ),
      ),
      status.results && status.results.length > 0 && h("div", { className: "result-list" },
        status.results.map((r, i) =>
          h("div", { key: i, className: `result-row ${statusClass(r)}` },
            h("span", { className: "status-icon" },
              statusClass(r).includes("processing")
                ? h(Spinner, null)
                : h(Icon, { name: statusIcon(r) }),
            ),
            h("span", { className: "img-name" }, r.image),
            r.status === "ok" && h("span", { className: "time" }, `${r.outputs?.length || 0} file(s)`),
          )
        ),
      ),
      !status.results?.length && h("div", { className: "empty-state" }, "Waiting for results..."),
    ),

    !status && h("div", { className: "card" },
      h("div", { className: "empty-state" },
        "Select an input directory with images and press Start",
      ),
    ),
  );

  const right = h("div", { className: "app-right" },
    h(LogPanel, null),
  );

  return h("div", null,
    h("div", { className: "app-layout" }, left, right),
  );
}

// ── mount ─────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
