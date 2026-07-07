//#region CONTRACT — app.js [DOMAIN(9):ChatUI; CONCEPT(9):SplitScreen; TECH(9):ReactUMD]
/**
 * @module app.js
 * @category Application
 *
 * @Purpose Сплит-экран: слева чат с SSE-стримингом, справа iframe-песочница
 * для динамических артефактов. PostMessage bridge для iframe API-запросов.
 *
 * @Rationale
 * - React 18 UMD (CDN) — без бандлера, file:// совместимость.
 * - SSE через EventSource не подходит — нужны tool_call события.
 *   Используем fetch + ReadableStream reader для ручного парсинга SSE.
 * - iframe с sandbox="allow-scripts" (без allow-same-origin) — изоляция.
 * - PostMessage bridge — единственный способ API-запросов из null-origin.
 * - Error Boundary в iframe ловит ошибки рендера, отправляет родителю.
 *
 * @See index.html (шаблон), chat_server.py (API), styles.css
 *
 * @Structure App (splitter) → ChatPanel (left) + Sandbox (right)
 *           ChatPanel → MessageList + ChatInput
 *           Sandbox → iframe (srcdoc с React + Babel CDN)
 */
//#endregion CONTRACT
// GREP_SUMMARY: chat sse streaming iframe sandbox artifact postmessage bridge

const { createElement: h, useState, useEffect, useRef, useCallback, useMemo } = React;
const MAX_RETRIES = 3; // must match chat_config.json max_correction_retries

// ── simple Markdown renderer ────────────────────────────────
// Без внешних библиотек. Преобразует Markdown-текст в HTML.
function renderMarkdown(text) {
  if (!text) return "";
  var html = text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  // inline code `code`
  html = html.replace(/\x60([^\x60]+)\x60/g, "<code class=\"md-code\">$1</code>");
  // bold **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // italic *text*
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // headings
  html = html.replace(/^### (.+)$/gm, "<h4 class=\"md-h\">$1</h4>");
  html = html.replace(/^## (.+)$/gm, "<h3 class=\"md-h\">$1</h3>");
  html = html.replace(/^# (.+)$/gm, "<h2 class=\"md-h\">$1</h2>");
  // list items
  html = html.replace(/^[\*-] (.+)$/gm, "<li class=\"md-li\">$1</li>");
  // hr
  html = html.replace(/^---+$/gm, "<hr class=\"md-hr\">");
  // paragraphs: double newline
  html = html.replace(/\n\n/g, "</p><p class=\"md-p\">");
  // single newline -> br
  html = html.replace(/\n/g, "<br>");
  // wrap in paragraph tags if needed
  if (html.indexOf("</p><p") !== -1) {
    html = "<p class=\"md-p\">" + html + "</p>";
  }
  // group consecutive li into ul
  html = html.replace(/((?:<li[^>]*>.*?<\/li>\s*)+)/g, "<ul class=\"md-ul\">$1</ul>");
  return html;
}

// Helper for JSX: converts markdown to HTML string
function htmlFromMarkdown(text) {
  return renderMarkdown(text);
}

// ── SSE parser for fetch-based streaming ─────────────────────
// Используем fetch вместо EventSource, чтобы парсить кастомные SSE-события
// (text, tool_start, tool_result, error, done, max_retries)

async function* parseSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Разделяем по двойным newline (SSE delimiter)
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || ""; // последний неполный чанк остаётся в буфере

    for (const part of parts) {
      if (!part.trim()) continue;
      const lines = part.split("\n");
      let event = null;
      let data = null;

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          event = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          try {
            data = JSON.parse(line.slice(6));
          } catch {
            data = line.slice(6);
          }
        }
      }

      if (event && data !== null) {
        yield { event, data };
      }
    }
  }

  // обрабатываем остаток буфера
  if (buffer.trim()) {
    const lines = buffer.split("\n");
    let event = null;
    let data = null;
    for (const line of lines) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      else if (line.startsWith("data: ")) {
        try { data = JSON.parse(line.slice(6)); }
        catch { data = line.slice(6); }
      }
    }
    if (event && data !== null) yield { event, data };
  }
}


//#region ToolCallStatus [DOMAIN(7):Status; CONCEPT(7):ToolExecution]
/** @Purpose Типы статусов вызова инструмента для UI. */
const ToolPhase = {
  IDLE: "idle",
  CALLING: "calling",
  EXECUTING: "executing",
  DONE: "done",
  ERROR: "error",
};
//#endregion ToolCallStatus


//#region SRCDOC_TEMPLATE [DOMAIN(9):Sandbox; CONCEPT(9):IframeTemplate; TECH(8):HTML]
/**
 * @Purpose Шаблон srcdoc для iframe-песочницы.
 * Жёстко прописаны: React UMD, @babel/standalone, Tailwind Play CDN,
 * Error Boundary, PostMessage bridge.
 *
 * @Rationale
 * - CDN-ссылки — без установки, обновляются автоматически.
 * - Tailwind Play CDN — стили "на лету", без билд-шага.
 * - ErrorBoundary — единственный способ отловить ошибки рендера
 *   в null-origin iframe (они не всплывают наружу).
 * - window.safeApiCall — прокси для fetch через родителя.
 * - window.onerror перехватывает runtime-ошибки и шлёт родителю.
 */
function buildSrcdoc(code) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone/babel.min.js">${"</"+"script>"}
<script src="https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js">${"</"+"script>"}
<script src="https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js">${"</"+"script>"}
<script src="https://cdn.tailwindcss.com">${"</"+"script>"}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; overflow: hidden; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  #error-ui { padding: 1rem; background: #1e1e1e; color: #f48771; font-family: monospace; font-size: 0.82rem; white-space: pre-wrap; }
</style>
</head>
<body>
<div id="sandbox-root"></div>
<script>
  // ── PostMessage Bridge ──
  window.safeApiCall = function(endpoint, params) {
    return new Promise(function(resolve, reject) {
      var requestId = "req_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      function handler(e) {
        if (e.data && e.data.type === "API_RESPONSE" && e.data.requestId === requestId) {
          window.removeEventListener("message", handler);
          if (e.data.error) reject(new Error(e.data.error));
          else resolve(e.data.data);
        }
      }
      window.addEventListener("message", handler);
      window.parent.postMessage({ type: "API_REQUEST", requestId: requestId, endpoint: endpoint, params: params || {} }, "*");
      // Timeout fallback
      setTimeout(function() { window.removeEventListener("message", handler); reject(new Error("API call timeout: " + endpoint)); }, 15000);
    });
  };

  // ── Logging bridge ──
  var _origLog = console.log;
  var _origError = console.error;
  var _origWarn = console.warn;

  console.log = function() {
    window.parent.postMessage({ type: "IFRAME_LOG", level: "info", message: Array.prototype.map.call(arguments, String).join(" ") }, "*");
    _origLog.apply(console, arguments);
  };
  console.warn = function() {
    window.parent.postMessage({ type: "IFRAME_LOG", level: "warn", message: Array.prototype.map.call(arguments, String).join(" ") }, "*");
    _origWarn.apply(console, arguments);
  };
  console.error = function() {
    window.parent.postMessage({ type: "IFRAME_LOG", level: "error", message: Array.prototype.map.call(arguments, String).join(" ") }, "*");
    _origError.apply(console, arguments);
  };

  // ── Error handlers ──
  window.onerror = function(msg, url, line, col, err) {
    window.parent.postMessage({ type: "IFRAME_ERROR", error: { message: msg, stack: err ? err.stack : "", phase: "runtime", line: line, col: col } }, "*");
  };
  window.onunhandledrejection = function(e) {
    window.parent.postMessage({ type: "IFRAME_ERROR", error: { message: "Unhandled Promise rejection: " + String(e.reason), phase: "promise" } }, "*");
  };

  // ── Error Boundary ──
  class ErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { error: null, info: null }; }
    componentDidCatch(error, info) {
      this.setState({ error: error, info: info });
      window.parent.postMessage({ type: "IFRAME_ERROR", error: { message: error.message, stack: error.stack, phase: "render", componentStack: info ? info.componentStack : "" } }, "*");
    }
    render() {
      if (this.state.error) {
        return React.createElement("div", { id: "error-ui" },
          "React Error Boundary\\n",
          this.state.error.message,
          "\\n\\nComponent Stack:\\n",
          this.state.info ? this.state.info.componentStack : "(no stack)"
        );
      }
      return this.props.children;
    }
  }

  // ── Compile and render ──
  try {
    var result = Babel.transform(${JSON.stringify(code)}, { presets: [["env", { modules: "commonjs" }], ["react", { runtime: "classic" }]], sourceType: "module" });
    var module = { exports: {} };
    var exports = module.exports;
    // Polyfill require() for compiled imports (import → require)
    var _modules = { "react": React, "react-dom": ReactDOM };
    function require(name) { return _modules[name] || {}; }

    // eval in sandbox
    eval(result.code);

    var AppComponent = module.exports.default || module.exports.App;
    if (typeof AppComponent !== "function") {
      throw new Error("No default export found. Make sure to export default function App() {}");
    }

    var root = ReactDOM.createRoot(document.getElementById("sandbox-root"));
    root.render(React.createElement(ErrorBoundary, null, React.createElement(AppComponent)));
  } catch(e) {
    document.getElementById("sandbox-root").innerHTML = '<div id="error-ui">Babel Compile Error: ' + e.message + '\\n' + (e.stack || "") + '<' + '/div>';
    window.parent.postMessage({ type: "IFRAME_ERROR", error: { message: e.message, stack: e.stack, phase: "compile" } }, "*");
  }
</script>
</body>
</html>`;
}
//#endregion SRCDOC_TEMPLATE


//#region COMPONENT_MessageList [DOMAIN(8):Chat; CONCEPT(8):Conversation]
/** @Purpose Список сообщений чата с авто-скроллом. Поддерживает streaming-текст. */
function MessageList({ messages, streamingText, toolStatus, isLoading, onExampleClick }) {
  const listRef = useRef(null);
  const [copiedId, setCopiedId] = useState(null);

  // Auto-scroll
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, streamingText, toolStatus]);

  const copyCode = useCallback((code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId("copy-all");
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  return h("div", { className: "messages", ref: listRef },
    messages.length === 0 && !streamingText && toolStatus === ToolPhase.IDLE
      ? h("div", { className: "msg-welcome" },
          h("div", { className: "welcome-icon" }, "\uD83E\uDD16"),
          h("h2", null, "Generative UI Chat"),
          h("p", null, "Ask me to create or edit a UI component. For example:"),
          h("div", { className: "welcome-examples" },
            h("div", { className: "example-chip", onClick: () => onExampleClick && onExampleClick("Create a slider config card with min=0, max=100, step=1") }, "\uD83D\uDCCB Slider config card"),
            h("div", { className: "example-chip", onClick: () => onExampleClick && onExampleClick("Build a data table with 3 columns and 5 rows of sample data") }, "\uD83D\uDCCA Data table"),
            h("div", { className: "example-chip", onClick: () => onExampleClick && onExampleClick("Create a search widget with filters and results list") }, "\uD83D\uDD0D Search widget"),
          ),
        )
      : null,

    messages.map((msg, i) => {
      if (msg.role === "system") return null;

      // Tool result messages
      if (msg.role === "tool") {
        let resultData = null;
        try {
          resultData = typeof msg.content === "string" ? JSON.parse(msg.content) : msg.content;
        } catch { resultData = { raw: msg.content }; }
        return h("div", { key: i, className: "msg msg-tool-result" },
          h("div", { className: "msg-avatar tool-avatar" }, "\u2699\uFE0F"),
          h("div", { className: "msg-body" },
            resultData.success
              ? h("div", { className: "tool-success" },
                  "\u2705 Tool executed successfully",
                  resultData.artifact
                    ? h("div", { className: "artifact-meta" },
                        h("span", null, "\uD83D\uDCC4 ", resultData.artifact.name),
                        h("button", {
                          className: "copy-btn",
                          onClick: () => copyCode(resultData.artifact.code),
                        }, copiedId === "copy-all" ? "\u2714\uFE0F Copied" : "\uD83D\uDCCB Code"),
                      )
                    : null,
                )
              : h("div", { className: "tool-error-msg" },
                  "\u274C ", resultData.error || "Unknown error",
                ),
          ),
        );
      }

      // Messages with tool_calls
      if (msg.role === "assistant" && msg.tool_calls) {
        return h("div", { key: i, className: "msg msg-tool-call" },
          h("div", { className: "msg-avatar ai-avatar" }, "\uD83E\uDD16"),
          h("div", { className: "msg-body" },
            msg.tool_calls.map((tc, j) =>
              h("div", { key: j, className: "tool-call-item" },
                "\u2699\uFE0F Call tool: ",
                h("strong", null, tc.function.name),
              ),
            ),
          ),
        );
      }

      // User message
      if (msg.role === "user") {
        return h("div", { key: i, className: "msg msg-user" },
          h("div", { className: "msg-avatar user-avatar" }, "\uD83D\uDC64"),
          h("div", { className: "msg-body" },
            h("div", { className: "msg-text" }, msg.content),
          ),
        );
      }

      // Assistant text message (with Markdown rendering)
      if (msg.role === "assistant" && msg.content) {
        return h("div", { key: i, className: "msg msg-ai" },
          h("div", { className: "msg-avatar ai-avatar" }, "🤖"),
          h("div", { className: "msg-body" },
            h("div", { className: "msg-text", dangerouslySetInnerHTML: { __html: htmlFromMarkdown(msg.content) } }),
          ),
        );
      }

      return null;
    }),

    // Streaming text (with Markdown)
    streamingText
      ? h("div", { className: "msg msg-ai streaming" },
          h("div", { className: "msg-avatar ai-avatar" }, "🤖"),
          h("div", { className: "msg-body" },
            h("div", { className: "msg-text streaming-text", dangerouslySetInnerHTML: { __html: htmlFromMarkdown(streamingText) } }),
            h("span", { className: "cursor-blink" }, "█"),
          ),
        )
      : null,

    // Thinking indicator (shown during prefill/initial LLM latency)
    isLoading && !streamingText && toolStatus === ToolPhase.IDLE
      ? h("div", { className: "msg msg-ai msg-thinking" },
          h("div", { className: "msg-avatar ai-avatar" }, "🤖"),
          h("div", { className: "msg-body" },
            h("div", { className: "thinking-dots" },
              h("span", { className: "thinking-dot" }),
              h("span", { className: "thinking-dot" }),
              h("span", { className: "thinking-dot" }),
            ),
          ),
        )
      : null,

    // Tool status indicator
    toolStatus !== ToolPhase.IDLE && !streamingText
      ? h("div", { className: "msg msg-tool-status" },
          h("div", { className: "msg-avatar tool-avatar" }, "\u2699\uFE0F"),
          h("div", { className: "msg-body" },
            toolStatus === ToolPhase.CALLING
              ? "\u2699\uFE0F Model is calling a tool..."
              : toolStatus === ToolPhase.EXECUTING
                ? "\uD83D\uDD04 Executing tool..."
                : toolStatus === ToolPhase.ERROR
                  ? "\u274C Tool execution failed"
                  : null,
          ),
        )
      : null,
  );
}
//#endregion COMPONENT_MessageList


//#region COMPONENT_ChatInput [DOMAIN(8):Input; CONCEPT(7):MessageComposer]
/** @Purpose Поле ввода сообщения + кнопка отправки и очистки чата. */
function ChatInput({ onSend, onClear, disabled }) {
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  const handleSend = useCallback(() => {
    const msg = text.trim();
    if (!msg || disabled) return;
    onSend(msg);
    setText("");
  }, [text, disabled, onSend]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return h("div", { className: "chat-input-bar" },
    h("textarea", {
      ref: inputRef,
      className: "chat-textarea",
      placeholder: disabled ? "Waiting for response..." : "Describe the UI component you want...",
      value: text,
      onChange: e => setText(e.target.value),
      onKeyDown: handleKeyDown,
      disabled: disabled,
      rows: 2,
    }),
    h("div", { className: "input-actions" },
      h("button", {
        className: "btn btn-clear",
        onClick: onClear,
        title: "Clear chat",
        disabled: disabled,
      }, "\uD83D\uDDD1\uFE0F Clear"),
      h("button", {
        className: "btn btn-send",
        onClick: handleSend,
        disabled: disabled || !text.trim(),
      }, disabled ? "\u23F3" : "\uD83D\uDCE9 Send"),
    ),
  );
}
//#endregion COMPONENT_ChatInput


//#region COMPONENT_Sandbox [DOMAIN(9):Sandbox; CONCEPT(9):IframeRenderer; TECH(9):Isolation]
/**
 * @Purpose iframe-песочница для рендера артефакта. Получает код,
 * строит srcdoc, обрабатывает PostMessage от iframe.
 * Отображает error state при ошибках компиляции/рендера.
 */
function Sandbox({ artifactCode, artifactName, iframeErrors }) {
  const iframeRef = useRef(null);

  // Обновляем srcdoc при каждом изменении кода
  useEffect(() => {
    if (iframeRef.current && artifactCode) {
      const srcdoc = buildSrcdoc(artifactCode);
      iframeRef.current.srcdoc = srcdoc;
    }
  }, [artifactCode]);

  return h("div", { className: "sandbox-panel" },
    h("div", { className: "sandbox-header" },
      h("span", { className: "sandbox-title" }, artifactName
        ? "\uD83D\uDCC4 " + artifactName + ".jsx"
        : "\uD83D\uDD12 Sandbox"
      ),
      artifactName
        ? h("a", {
            className: "sandbox-link",
            href: "/artifacts/" + artifactName + ".jsx",
            target: "_blank",
          }, "\u2197 Open")
        : null,
    ),
    h("div", { className: "sandbox-content" },
      artifactCode
        ? h("iframe", {
            ref: iframeRef,
            id: "sandbox-iframe",
            className: "sandbox-iframe",
            sandbox: "allow-scripts",
            title: "Artifact Sandbox",
          })
        : h("div", { className: "sandbox-empty" },
            h("div", { className: "empty-icon" }, "\uD83C\uDFAD"),
            h("p", null, "Ask the AI to create a component"),
            h("p", { className: "empty-sub" }, "The artifact will appear here"),
          ),
    ),
    // Error display
    iframeErrors.length > 0
      ? h("div", { className: "sandbox-errors" },
          h("div", { className: "errors-header" }, "\u274C Errors (" + iframeErrors.length + ")"),
          iframeErrors.map((err, i) =>
            h("div", { key: i, className: "error-entry" },
              h("div", { className: "error-phase" }, "[" + (err.phase || "unknown") + "]"),
              h("div", { className: "error-message" }, err.message),
              err.stack
                ? h("details", { className: "error-stack" },
                    h("summary", null, "Stack trace"),
                    h("pre", null, err.stack),
                  )
                : null,
            ),
          ),
        )
      : null,
  );
}
//#endregion COMPONENT_Sandbox


//#region COMPONENT_RetryIndicator [DOMAIN(6):Status; CONCEPT(6):CorretionCounter]
/** @Purpose Индикатор попыток самокоррекции агента. */
function RetryIndicator({ retries, maxRetries }) {
  if (retries === 0) return null;
  return h("div", { className: "retry-indicator" },
    h("span", { className: "retry-icon" }, "\uD83D\uDD04"),
    h("span", null, "Self-correction: ", retries, "/", maxRetries),
    h("div", { className: "retry-bar" },
      h("div", {
        className: "retry-fill",
        style: { width: ((retries / maxRetries) * 100) + "%" }
      }),
    ),
  );
}
//#endregion COMPONENT_RetryIndicator


//#region COMPONENT_App [DOMAIN(9):Root; CONCEPT(9):Composition; TECH(9):React]
/**
 * @Purpose Корневой компонент. Управляет состоянием чата, SSE-стримингом,
 * PostMessage bridge, iframe-песочницей.
 *
 * @Structure ChatPanel (left) | Sandbox (right)
 *           ↑ SSE stream       ↑ PostMessage bridge
 *           └── chat_server.py ──┘
 */
function App() {
  // ── state ──
  const [messages, setMessages] = useState([]);
  const [streamingText, setStreamingText] = useState("");
  const [toolStatus, setToolStatus] = useState(ToolPhase.IDLE);
  const [isLoading, setIsLoading] = useState(false);
  const [artifactCode, setArtifactCode] = useState(null);
  const [artifactName, setArtifactName] = useState(null);
  const [iframeErrors, setIframeErrors] = useState([]);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = MAX_RETRIES;

  const abortRef = useRef(null);

  // ── PostMessage listener for iframe messages ──
  useEffect(() => {
    function handleIframeMessage(e) {
      // Security: verify message comes from our sandbox iframe
      const iframeEl = document.getElementById("sandbox-iframe");
      if (!iframeEl || e.source !== iframeEl.contentWindow) return;

      // API_REQUEST from iframe
      if (e.data && e.data.type === "API_REQUEST") {
        const { requestId, endpoint, params } = e.data;
        // Proxy to backend
        fetch("/api/proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: endpoint, method: "GET", params: params || {} }),
        })
          .then(r => r.json())
          .then(data => {
            const iframe = document.getElementById("sandbox-iframe");
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: "API_RESPONSE",
                requestId: requestId,
                data: data,
                error: data.success === false ? data.error : null,
              }, "*");
            }
          })
          .catch(err => {
            const iframe = document.getElementById("sandbox-iframe");
            if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: "API_RESPONSE",
                requestId: requestId,
                error: err.message,
              }, "*");
            }
          });
        return;
      }

      // IFRAME_ERROR
      if (e.data && e.data.type === "IFRAME_ERROR") {
        setIframeErrors(prev => {
          const newErrors = [...prev, e.data.error];
          // Keep only last 10
          if (newErrors.length > 10) newErrors.shift();
          return newErrors;
        });
        return;
      }

      // IFRAME_LOG
      if (e.data && e.data.type === "IFRAME_LOG") {
        // Log to console for debugging
        const { level, message } = e.data;
        if (level === "error") console.error("[iframe]", message);
        else if (level === "warn") console.warn("[iframe]", message);
        else console.log("[iframe]", message);
        return;
      }
    }

    window.addEventListener("message", handleIframeMessage);
    return () => window.removeEventListener("message", handleIframeMessage);
  }, []);

  // ── send message ──
  const handleSend = useCallback(async (text) => {
    setIsLoading(true);
    setStreamingText("");
    setToolStatus(ToolPhase.IDLE);
    setIframeErrors([]);
    setRetryCount(0);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(err.detail || "Request failed");
      }

      // ── reload messages from server context ──
      // We track tool results and new messages locally from SSE events
      let currentText = "";
      let toolCallInProgress = false;

      for await (const { event, data } of parseSSE(response)) {
        switch (event) {
          case "text":
            currentText += data.content;
            setStreamingText(currentText);
            break;

          case "tool_start":
            toolCallInProgress = true;
            setToolStatus(ToolPhase.CALLING);
            break;

          case "tool_result":
            setToolStatus(ToolPhase.DONE);
            toolCallInProgress = false;

            // If artifact was created/edited → update sandbox
            if (data.result && data.result.artifact) {
              setArtifactCode(data.result.artifact.code);
              setArtifactName(data.result.artifact.name);
            }

            // Reload messages from server
            {
              const ctxRes = await fetch("/api/context");
              const ctxData = await ctxRes.json();
              setMessages(ctxData.messages || []);
            }
            break;

          case "tool_error":
            setToolStatus(ToolPhase.ERROR);
            toolCallInProgress = false;
            break;

          case "max_retries":
            setRetryCount(maxRetries);
            break;

          case "done":
            // Reload messages
            {
              const ctxRes = await fetch("/api/context");
              const ctxData = await ctxRes.json();
              setMessages(ctxData.messages || []);
            }
            setStreamingText("");
            setToolStatus(ToolPhase.IDLE);
            setIsLoading(false);
            break;

          case "error":
            console.error("SSE error:", data.message);
            setStreamingText(prev => prev + "\n\n[Error: " + data.message + "]");
            setToolStatus(ToolPhase.ERROR);
            setIsLoading(false);
            break;
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
      setStreamingText(prev => prev + "\n\n[Connection Error: " + err.message + "]");
      setToolStatus(ToolPhase.ERROR);
      setIsLoading(false);
    }
  }, [maxRetries]);

  // ── clear chat ──
  const handleClear = useCallback(async () => {
    try {
      await fetch("/api/context/clear", { method: "POST" });
    } catch {}
    setMessages([]);
    setStreamingText("");
    setToolStatus(ToolPhase.IDLE);
    setArtifactCode(null);
    setArtifactName(null);
    setIframeErrors([]);
    setRetryCount(0);
    setIsLoading(false);
  }, []);

  // ── render ──
  return h("div", { className: "app-container" },
    // Left panel: Chat
    h("div", { className: "chat-panel" },
      h("div", { className: "chat-header" },
        h("h1", { className: "chat-title" },
          h("span", { className: "chat-logo" }, "\uD83E\uDD16"),
          " Generative UI"
        ),
        h("span", { className: "chat-subtitle" }, "Chat Prototype"),
      ),

      h(RetryIndicator, { retries: retryCount, maxRetries: maxRetries }),

      h(MessageList, {
        messages,
        streamingText,
        toolStatus,
        isLoading,
        onExampleClick: handleSend,
      }),

      h(ChatInput, {
        onSend: handleSend,
        onClear: handleClear,
        disabled: isLoading,
      }),
    ),

    // Right panel: Sandbox
    h(Sandbox, {
      artifactCode,
      artifactName,
      iframeErrors,
    }),
  );
}

// ── mount ──
const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(h(App));
} else {
  console.error("Root element #root not found");
}
