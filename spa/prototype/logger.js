//#region CONTRACT — logger.js [DOMAIN(9):Logging; CONCEPT(9):DualCapture; TECH(8):StructuredLog]
/**
 * @module logger.js
 * @category Logging
 *
 * @Purpose Двухуровневое логирование для AI-отладки:
 *  1. window.appLogs — массив в памяти, доступный через page.evaluate()
 *  2. POST /api/logs/frontend — отправка на бекенд в debug-режиме
 *
 * @Rationale
 * - Массив в памяти (не sessionStorage/IndexedDB) — чтобы Playwright
 *   мог забрать page.evaluate("() => window.appLogs") без разбора DOM.
 * - Два режима: debug (мгновенная отправка) и normal (только в память).
 *   Режим определяется по ?debug=true в URL или window.__PLAYWRIGHT__.
 * - Без внешних зависимостей — работает с любым фреймворком.
 * - Уровни: DEBUG, INFO, WARNING, ERROR — совместимы с structlog.
 *
 * @See server.py POST /api/logs/frontend, log-test.html
 *
 * @Structure init() → window.appLogs[]
 *           log(level, msg, ctx) → push → debug? → fetch POST
 *           getLogs() → page.evaluate() target
 */
//#endregion CONTRACT
// GREP_SUMMARY: logger applogs debug dual logging frontend playwright evaluate

(function () {
  "use strict";

  // ── config ──────────────────────────────────────────────────
  const API_BASE = window.location.origin || "";
  const isDebug =
    window.location.search.includes("debug=true") ||
    window.__PLAYWRIGHT__ === true;

  // ── init global log store ───────────────────────────────────
  if (!window.appLogs) {
    window.appLogs = [];
  }

  // Циклический буфер: храним не более 300 последних записей
  const MAX_LOG_COUNT = 300;

  // ── log levels ──────────────────────────────────────────────
  const LEVELS = { DEBUG: 0, INFO: 1, WARNING: 2, ERROR: 3 };
  const COLORS = {
    DEBUG: "#64748b",
    INFO: "#38bdf8",
    WARNING: "#fbbf24",
    ERROR: "#f87171",
  };

  // ── core log function ───────────────────────────────────────
  function log(level, message, context) {
    const entry = {
      timestamp: new Date().toISOString(),
      level: level,
      message: message,
      context: context || null,
    };

    // 1. Всегда пишем в память (доступ для Playwright)
    window.appLogs.push(entry);
    if (window.appLogs.length > MAX_LOG_COUNT) {
      window.appLogs.shift();
    }

    // 2. console — для человека
    const color = COLORS[level] || "#94a3b8";
    console.log(`%c[${level}]%c ${message}`, `color:${color};font-weight:bold`, "color:#94a3b8", context || "");

    // 3. В debug-режиме — мгновенно на бекенд
    if (isDebug) {
      fetch(`${API_BASE}/api/logs/frontend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      }).catch(() => {
        /* silent — логгер не должен ломать приложение */
      });
    }
  }

  // ── public API ──────────────────────────────────────────────

  window.logger = {
    debug:   (msg, ctx) => log("DEBUG",   msg, ctx),
    info:    (msg, ctx) => log("INFO",    msg, ctx),
    warning: (msg, ctx) => log("WARNING", msg, ctx),
    error:   (msg, ctx) => log("ERROR",   msg, ctx),

    /** Для Playwright: page.evaluate("() => logger.getAll()") */
    getAll: () => window.appLogs.slice(),

    /** Для Playwright: page.evaluate("() => logger.getByLevel('ERROR')") */
    getByLevel: (level) => window.appLogs.filter((e) => e.level === level),

    /** Очистить логи */
    clear: () => { window.appLogs = []; },

    /** Показать скрытую debug-панель в DOM (для визуальных агентов) */
    showPanel: () => {
      let panel = document.getElementById("ai-debug-panel");
      if (!panel) {
        panel = document.createElement("div");
        panel.id = "ai-debug-panel";
        panel.style.cssText =
          "position:fixed;bottom:0;right:0;width:50%;height:40vh;" +
          "background:#0f172a;color:#e2e8f0;font-family:monospace;font-size:11px;" +
          "border:1px solid #334155;border-radius:8px 0 0 0;padding:8px;" +
          "overflow-y:auto;z-index:99999;display:none;";
        document.body.appendChild(panel);
      }
      panel.style.display = "block";
      panel.innerHTML = window.appLogs
        .map(
          (e) =>
            `<div style="color:${COLORS[e.level] || '#94a3b8'};padding:1px 0">` +
            `[${e.level}] ${e.message}` +
            (e.context ? ` <span style="color:#64748b">${JSON.stringify(e.context)}</span>` : "") +
            `</div>`
        )
        .join("");
      panel.scrollTop = panel.scrollHeight;
    },

    /** Скрыть debug-панель */
    hidePanel: () => {
      const panel = document.getElementById("ai-debug-panel");
      if (panel) panel.style.display = "none";
    },
  };

  // ── startup marker ──────────────────────────────────────────
  window.logger.info("Logger initialized", {
    debugMode: isDebug,
    logsInMemory: 0,
  });
})();
