/* global React, ReactDOM */
const { createContext, useContext, useReducer, useState, useCallback, useMemo, useEffect, useRef, createElement: h, Fragment } = React;

// ═══════════════════════════════════════════════════════════════
// 1.  State layer — Context + Reducer (no extra libs)
// ═══════════════════════════════════════════════════════════════

const DEFAULTS = {
  ksampler: {
    steps: 20, cfg: 7.0, denoise: 0.2,
    sampler_name: "dpmpp_2m_sde_gpu", scheduler: "sgm_uniform",
  },
  facedetailer: {
    guide_size: 512, max_size: 1024, steps: 30, cfg: 8.0, denoise: 0.35,
    feather: 8, bbox_dilation: 10, bbox_crop_factor: 3, force_inpaint: true,
  },
  controlnet: { strength: 1.0, start_percent: 0.0, end_percent: 1.0 },
  lora: { lora_name: "add-detail-xl.safetensors", strength_model: 0.6, strength_clip: 0.6 },
  prompts: {
    positive: "hyper realism, photo realism. HDR, natural skin colour, great contrast, great colour saturation, five fingers on both hands",
    negative: "bad quality, blurry, messy, low resolution, artifacts, deformed fingers, female, girl, makeup",
  },
};

// ── reducer ───────────────────────────────────────────────────

const SET_FIELD  = "SET_FIELD";
const SET_PROMPT = "SET_PROMPT";
const RESET      = "RESET";
const SET_COLLAPSED = "SET_COLLAPSED";

function reducer(state, action) {
  switch (action.type) {
    case SET_FIELD:
      return { ...state, [action.section]: { ...state[action.section], [action.field]: action.value } };
    case SET_PROMPT:
      return { ...state, prompts: { ...state.prompts, [action.side]: action.value } };
    case RESET:
      return { ...structuredClone(DEFAULTS), collapsed: state.collapsed };
    case SET_COLLAPSED:
      return { ...state, collapsed: { ...state.collapsed, [action.key]: action.value } };
    default:
      return state;
  }
}

// ── context ───────────────────────────────────────────────────

const StoreCtx = createContext(null);

function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be inside StoreProvider");
  return ctx;
}

function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, { ...structuredClone(DEFAULTS), collapsed: {} });
  return h(StoreCtx.Provider, { value: { state, dispatch } }, children);
}

// ── action helpers ────────────────────────────────────────────

const setField    = (dispatch, section, field, value) => dispatch({ type: SET_FIELD,  section, field, value });
const setPrompt   = (dispatch, side,  value)          => dispatch({ type: SET_PROMPT, side,    value });
const resetAll    = (dispatch)                        => dispatch({ type: RESET });
const setCollapsed= (dispatch, key, value)            => dispatch({ type: SET_COLLAPSED, key, value });

// ═══════════════════════════════════════════════════════════════
// 2.  UI primitives
// ═══════════════════════════════════════════════════════════════

function Btn({ label, onClick, primary, danger, small, disabled, className = "" }) {
  const cls = ["btn", primary && "btn-primary", danger && "btn-danger", small && "btn-sm", className].filter(Boolean).join(" ");
  return h("button", { className: cls, onClick, disabled }, label);
}

function Badge({ label, color }) {
  return h("span", { className: `badge badge-${color}` }, label);
}

function Icon({ name, className = "" }) {
  const map = { settings: "\u2699\uFE0F", reset: "\uD83D\uDD04", edit: "\u270F\uFE0F", check: "\u2714\uFE0F", close: "\u2716", expand: "\u25BC", collapse: "\u25B6", info: "\u2139\uFE0F" };
  return h("span", { className: `icon ${className}` }, map[name] || "\u2753");
}

// ── interactive slider ────────────────────────────────────────

function SliderField({ label, value, min, max, step, onChange, unit = "" }) {
  const id = `slider-${label.replace(/\s/g, "-")}`;
  return h("div", { className: "slider-field" },
    h("label", { htmlFor: id }, label),
    h("div", { className: "slider-row" },
      h("input", { type: "range", id, min, max, step, value, onChange: e => onChange(parseFloat(e.target.value)) }),
      h("span", { className: "slider-val" }, value, unit && h("span", { className: "slider-unit" }, unit)),
    ),
  );
}

// ── toggle switch ─────────────────────────────────────────────

function Toggle({ label, value, onChange }) {
  return h("label", { className: "toggle-label" },
    h("span", { className: "toggle-track" },
      h("input", { type: "checkbox", checked: value, onChange: e => onChange(e.target.checked) }),
      h("span", { className: "toggle-thumb" }),
    ),
    h("span", { className: "toggle-text" }, label),
  );
}

// ── inline edit ───────────────────────────────────────────────

function InlineEdit({ value, onSave, type = "string", min, max, step }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = useCallback(() => {
    let parsed = draft;
    if (type === "number") { parsed = parseFloat(draft); if (isNaN(parsed)) parsed = value; }
    if (type === "boolean") parsed = draft === "true";
    onSave(parsed);
    setEditing(false);
  }, [draft, type, onSave, value]);

  if (!editing) {
    const cls = ["inline-val", `inline-${type}`];
    const display = type === "boolean" ? (value ? "true" : "false") : String(value);
    return h("span", { className: cls.join(" "), onClick: () => setEditing(true), title: "Click to edit" }, display);
  }

  return h("span", { className: "inline-edit" },
    type === "boolean"
      ? h("select", { ref: inputRef, value: String(value), onChange: e => { setDraft(e.target.value); }, onBlur: commit },
          h("option", { value: "true" }, "true"),
          h("option", { value: "false" }, "false"),
        )
      : h("input", { ref: inputRef, type: type === "number" ? "number" : "text", value: draft, min, max, step,
          onChange: e => setDraft(e.target.value), onKeyDown: e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }, onBlur: commit }),
  );
}

// ═══════════════════════════════════════════════════════════════
// 3.  Feature components
// ═══════════════════════════════════════════════════════════════

function PipelineBar() {
  const { state, dispatch } = useStore();
  const [active, setActive] = useState(null);

  const steps = [
    { id: "checkpoint", label: "Checkpoint", icon: "\uD83D\uDCC1" },
    { id: "lora",       label: "LoRA",       icon: "\uD83E\uDDE9", section: "lora" },
    { id: "clip-pos",   label: "CLIP Pos",   icon: "\u2705", section: "prompts" },
    { id: "clip-neg",   label: "CLIP Neg",   icon: "\u274C", section: "prompts" },
    { id: "controlnet", label: "ControlNet", icon: "\uD83D\uDD32", section: "controlnet" },
    { id: "ksampler",   label: "KSampler",   icon: "\uD83C\uDF2C\uFE0F", section: "ksampler" },
    { id: "facedetail", label: "FaceDetail", icon: "\uD83D\uDC40", section: "facedetailer" },
    { id: "save",       label: "Save",       icon: "\uD83D\uDCBE" },
  ];

  return h("div", { className: "pipeline-bar" },
    steps.map((s, i) =>
      h(Fragment, { key: s.id },
        i > 0 && h("span", { className: "p-arrow" }, "\u2192"),
        h("div", {
          className: `p-node ${active === s.id ? "p-active" : ""} ${s.section ? "p-clickable" : ""}`,
          onClick: s.section ? () => {
            setActive(prev => prev === s.id ? null : s.id);
            if (s.section) {
              const el = document.getElementById(`section-${s.section}`);
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          } : undefined,
          title: s.section ? `Scroll to ${s.label} settings` : "",
        },
          h("span", { className: "p-icon" }, s.icon),
          h("span", { className: "p-label" }, s.label),
          active === s.id && h("span", { className: "p-indicator" }, "\u25B2"),
        ),
      )
    ),
  );
}

// ── card with collapsible body ────────────────────────────────

function ConfigCard({ title, nodeId, tag, tagColor, section, fields, children }) {
  const { state, dispatch } = useStore();
  const collapsed = state.collapsed[section] ?? false;

  return h("div", { className: "card", id: `section-${section}` },
    h("div", { className: "card-header", onClick: () => setCollapsed(dispatch, section, !collapsed) },
      h("div", { className: "card-title-row" },
        h("span", { className: `card-toggle ${collapsed ? "" : "expanded"}` }, collapsed ? "\u25B6" : "\u25BC"),
        h("h3", null, title, nodeId && h("span", { className: "node-ref" }, `#${nodeId}`)),
      ),
      h(Badge, { label: tag, color: tagColor }),
    ),
    !collapsed && h("div", { className: "card-body" },
      fields && Object.entries(fields).map(([name, f]) =>
        h(FieldRow, { key: name, section, name, field: f })
      ),
      children,
    ),
  );
}

function FieldRow({ section, name, field }) {
  const { state, dispatch } = useStore();
  const value = state[section]?.[name];
  const def = DEFAULTS[section]?.[name];
  const isChanged = value !== def;

  const onChange = useCallback((newVal) => setField(dispatch, section, name, newVal), [dispatch, section, name]);

  if (field.type === "boolean") {
    return h("div", { className: "field-row" },
      h(Toggle, { label: field.label, value, onChange }),
      isChanged && h("span", { className: "changed-dot", title: `Default: ${def}` }),
    );
  }

  if (field.ui === "slider" && field.type === "number") {
    return h("div", { className: "field-row" },
      h(SliderField, { label: field.label, value, min: field.min, max: field.max, step: field.step || 1, onChange, unit: field.unit || "" }),
      isChanged && h("span", { className: "changed-dot", title: `Default: ${def}` }),
    );
  }

  return h("div", { className: "field-row" },
    h("span", { className: "field-label", title: field.desc }, field.label),
    h(InlineEdit, { value, onSave: onChange, type: field.type, min: field.min, max: field.max, step: field.step }),
    isChanged && h("span", { className: "changed-dot", title: `Default: ${def}` }),
  );
}

// ── prompts editor ────────────────────────────────────────────

function PromptsPanel() {
  const { state, dispatch } = useStore();
  const [activeSide, setActiveSide] = useState(null);

  const sides = [
    { side: "positive", icon: "\u2705", color: "green", label: "Positive Prompt", nodeId: 3 },
    { side: "negative", icon: "\u274C", color: "red",   label: "Negative Prompt", nodeId: 4 },
  ];

  return h("div", { className: "section", id: "section-prompts" },
    h("div", { className: "section-title" },
      h("span", null, "Prompts"),
      h(Badge, { label: "CLIP Text Encode \u00D7 2", color: "blue" }),
    ),
    h("div", { className: "prompts-grid" },
      sides.map(({ side, icon, color, label, nodeId }) => {
        const val = state.prompts[side];
        const def = DEFAULTS.prompts[side];
        const isChanged = val !== def;
        const expanded = activeSide === side;

        return h("div", { key: side, className: `prompt-card prompt-${color}` },
          h("div", { className: "prompt-header", onClick: () => setActiveSide(prev => prev === side ? null : side) },
            h("div", { className: "prompt-title" },
              h("span", null, icon, " ", label),
              h("span", { className: "node-ref" }, `#${nodeId}`),
              isChanged && h("span", { className: "changed-dot", title: "Modified" }),
            ),
            h("span", { className: "prompt-char-count" }, `${val.length} chars`),
          ),
          h("textarea", {
            className: `prompt-area ${expanded ? "expanded" : ""}`,
            value: val,
            onChange: e => setPrompt(dispatch, side, e.target.value),
            rows: expanded ? 6 : 3,
            placeholder: `Enter ${side} prompt...`,
          }),
          h("div", { className: "prompt-footer" },
            h("span", { className: "prompt-words" }, `${val.split(/\s+/).filter(Boolean).length} words`),
            h(Btn, { label: "Reset", small: true, onClick: () => setPrompt(dispatch, side, def) }),
          ),
        );
      }),
    ),
  );
}

// ── actions bar ───────────────────────────────────────────────

function ActionsBar() {
  const { state, dispatch } = useStore();
  const [showToast, setShowToast] = useState(false);
  const changedCount = useMemo(() => {
    let count = 0;
    for (const section of ["ksampler", "facedetailer", "controlnet", "lora"]) {
      for (const [key, val] of Object.entries(state[section] || {})) {
        if (val !== DEFAULTS[section]?.[key]) count++;
      }
    }
    if (state.prompts.positive !== DEFAULTS.prompts.positive) count++;
    if (state.prompts.negative !== DEFAULTS.prompts.negative) count++;
    return count;
  }, [state]);

  const handleReset = useCallback(() => {
    resetAll(dispatch);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  }, [dispatch]);

  return h("div", { className: "actions-bar" },
    h("div", { className: "actions-info" },
      h(Icon, { name: "info" }),
      changedCount > 0
        ? h("span", null, changedCount, " changed value", changedCount !== 1 ? "s" : "")
        : h("span", { style: { color: "#4ade80" } }, "All defaults"),
    ),
    h("div", { className: "actions-btns" },
      h(Btn, { label: "\uD83D\uDD04 Reset to defaults", small: true, onClick: handleReset, disabled: changedCount === 0 }),
    ),
    showToast && h("div", { className: "toast" }, "\u2714\uFE0F Reset complete"),
  );
}

// ── workflow node map (live) ──────────────────────────────────

function WorkflowMap() {
  const { state } = useStore();
  const [open, setOpen] = useState(true);

  const nodes = useMemo(() => {
    const ks = state.ksampler;
    const fd = state.facedetailer;
    const cn = state.controlnet;
    const lr = state.lora;
    const pp = state.prompts.positive;
    const np = state.prompts.negative;
    return [
      { node: 1,  cls: "CheckpointLoaderSimple",   params: [{ k: "ckpt_name", v: "fabledIllusionNSFW_v7Apoapsis.safetensors" }] },
      { node: 2,  cls: "LoraLoader",               params: [{ k: "lora_name", v: lr.lora_name }, { k: "strength_model", v: lr.strength_model }, { k: "strength_clip", v: lr.strength_clip }] },
      { node: 3,  cls: "CLIPTextEncode (pos)",     params: [{ k: "text", v: pp.substring(0, 50) + (pp.length > 50 ? "..." : "") }] },
      { node: 4,  cls: "CLIPTextEncode (neg)",     params: [{ k: "text", v: np.substring(0, 50) + (np.length > 50 ? "..." : "") }] },
      { node: 5,  cls: "ControlNetLoader",         params: [{ k: "control_net_name", v: "controlnet-tile-sdxl-1.0.safetensors" }] },
      { node: 7,  cls: "ControlNetApply",          params: [{ k: "strength", v: cn.strength }, { k: "start%", v: cn.start_percent }, { k: "end%", v: cn.end_percent }] },
      { node: 8,  cls: "KSampler",                params: [{ k: "steps", v: ks.steps }, { k: "cfg", v: ks.cfg }, { k: "denoise", v: ks.denoise }, { k: "sampler", v: ks.sampler_name }] },
      { node: 10, cls: "FaceDetailer",            params: [{ k: "guide_size", v: fd.guide_size }, { k: "steps", v: fd.steps }, { k: "denoise", v: fd.denoise }, { k: "bbox_dilation", v: fd.bbox_dilation }] },
      { node: 12, cls: "SaveImage",                params: [{ k: "filename_prefix", v: "refined_" }] },
    ];
  }, [state]);

  const changedNodeIds = useMemo(() => [2, 3, 4, 7, 8, 10], []);

  return h("div", { className: "section" },
    h("div", { className: "section-title" },
      h("span", { className: "section-toggle", onClick: () => setOpen(!open) }, open ? "\u25BC" : "\u25B6"),
      h("span", null, "Workflow Node Map"),
      h(Badge, { label: `${nodes.length} nodes`, color: "purple" }),
    ),
    open && h("div", { className: "workflow-map" },
      nodes.map((n, i) =>
        h("div", { key: n.node, className: `map-row ${changedNodeIds.includes(n.node) ? "map-live" : ""}` },
          h("span", { className: "map-id" }, `#${n.node}`),
          h("span", { className: "map-cls" }, n.cls),
          n.params.map((p, j) =>
            h("span", { key: j, className: "map-param" },
              h("span", { className: "map-key" }, p.k),
              "=",
              h("span", { className: "map-val" }, String(p.v)),
            )
          ),
          changedNodeIds.includes(n.node) && h("span", { className: "map-live-badge", title: "Values update in real-time" }, "live"),
        )
      ),
    ),
  );
}

// ═══════════════════════════════════════════════════════════════
// 4.  Section configs
// ═══════════════════════════════════════════════════════════════

const SECTIONS = [
  {
    section: "ksampler", title: "KSampler", tag: "Sampler", tagColor: "blue", nodeId: 8,
    fields: {
      steps:     { label: "Steps",     type: "number", ui: "slider", min: 1, max: 100, step: 1, desc: "Sampling steps" },
      cfg:       { label: "CFG Scale", type: "number", ui: "slider", min: 1, max: 30, step: 0.5, desc: "Classifier Free Guidance" },
      denoise:   { label: "Denoise",   type: "number", ui: "slider", min: 0, max: 1, step: 0.05, desc: "Denoising strength" },
      sampler_name: { label: "Sampler",   type: "string", desc: "Sampler algorithm" },
      scheduler:    { label: "Scheduler", type: "string", desc: "Noise scheduler" },
    },
  },
  {
    section: "facedetailer", title: "FaceDetailer", tag: "Face", tagColor: "orange", nodeId: 10,
    fields: {
      guide_size:    { label: "Guide Size",   type: "number", ui: "slider", min: 128, max: 1024, step: 64, desc: "Guide size (px)" },
      max_size:      { label: "Max Size",     type: "number", ui: "slider", min: 256, max: 2048, step: 64, desc: "Max size (px)" },
      steps:         { label: "Steps",        type: "number", ui: "slider", min: 1, max: 100, step: 1, desc: "Sampling steps" },
      cfg:           { label: "CFG Scale",    type: "number", ui: "slider", min: 1, max: 30, step: 0.5, desc: "CFG for face" },
      denoise:       { label: "Denoise",      type: "number", ui: "slider", min: 0, max: 1, step: 0.05, desc: "Denoise for face" },
      feather:       { label: "Feather",      type: "number", ui: "slider", min: 0, max: 64, step: 1, desc: "Feather blur (px)" },
      bbox_dilation: { label: "Bbox Dilation",type: "number", ui: "slider", min: 0, max: 100, step: 5, desc: "Bbox dilation (px)" },
      bbox_crop_factor: { label: "Bbox Crop", type: "number", ui: "slider", min: 1, max: 5, step: 0.5, desc: "Bbox crop factor" },
      force_inpaint: { label: "Force Inpaint", type: "boolean", desc: "Force inpaint mode" },
    },
  },
  {
    section: "controlnet", title: "ControlNet Tile", tag: "Control", tagColor: "purple", nodeId: 7,
    fields: {
      strength:      { label: "Strength",     type: "number", ui: "slider", min: 0, max: 2, step: 0.05, desc: "Control strength" },
      start_percent: { label: "Start %",      type: "number", ui: "slider", min: 0, max: 1, step: 0.05, desc: "Start percent" },
      end_percent:   { label: "End %",        type: "number", ui: "slider", min: 0, max: 1, step: 0.05, desc: "End percent" },
    },
  },
  {
    section: "lora", title: "LoRA", tag: "LoRA", tagColor: "green", nodeId: 2,
    fields: {
      lora_name:     { label: "LoRA Name",     type: "string", desc: "LoRA filename" },
      strength_model:{ label: "Model Strength", type: "number", ui: "slider", min: 0, max: 2, step: 0.05, desc: "LoRA model strength" },
      strength_clip: { label: "CLIP Strength",  type: "number", ui: "slider", min: 0, max: 2, step: 0.05, desc: "LoRA CLIP strength" },
    },
  },
];

// ═══════════════════════════════════════════════════════════════
// 5.  App shell
// ═══════════════════════════════════════════════════════════════

function App() {
  return h(StoreProvider, null,
    h("div", { className: "app" },
      // Header
      h("header", null,
        h("div", { className: "header-row" },
          h("h1", null, h(Icon, { name: "settings" }), " ClearRefine Settings"),
          h(Badge, { label: "Interactive Prototype", color: "red" }),
        ),
        h("p", { className: "header-sub" },
          "Adjust pipeline parameters in real-time \u2014 ",
          h("span", { style: { color: "#64748b" } }, "changes propagate to the workflow map below"),
        ),
      ),

      // Pipeline visualization
      h(PipelineBar, null),

      // Actions bar
      h(ActionsBar, null),

      // Settings cards
      h("div", { className: "section", style: { marginTop: "1.5rem" } },
        h("div", { className: "section-title" },
          h("span", null, "Pipeline Parameters"),
          h(Badge, { label: "4 modules", color: "blue" }),
        ),
        h("div", { className: "card-grid" },
          SECTIONS.map(cfg => h(ConfigCard, { key: cfg.section, ...cfg })),
        ),
      ),

      // Prompts
      h(PromptsPanel, null),

      // Workflow map
      h(WorkflowMap, null),

      // Footer
      h("footer", null,
        h("span", null, "ClearRefine \u2014 Interactive Settings Prototype"),
        h("div", { className: "footer-links" },
          h("a", { href: "architecture.html", target: "_blank" }, "Architecture"),
          h("a", { href: "index.html", target: "_blank" }, "SPA"),
        ),
      ),
    ),
  );
}

// ═══════════════════════════════════════════════════════════════
// 6.  Mount
// ═══════════════════════════════════════════════════════════════

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
