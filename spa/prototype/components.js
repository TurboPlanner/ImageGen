//#region CONTRACT — components.js [DOMAIN(8):UI; CONCEPT(9):Composition; TECH(8):React]
/**
 * @module components.js
 * @category UI
 *
 * @Purpose Составные компоненты панели настроек. Каждый компонент
 * читает store через useStore() и диспатчит action-ы.
 * Разделение: один компонент = одна визуальная зона.
 *
 * @Rationale
 * - PipelineBar и ActionsBar — пассивные, только читают store.
 * - ConfigCard + FieldRow — активные, пишут через dispatch.
 * - WorkflowMap — pure projection state → node list.
 * - FieldRow приватный (не экспортируется) — деталь реализации ConfigCard.
 *
 * @See store.js (state), ui.js (примитивы), App.js (сборка)
 *
 * @Structure PipelineBar (навигация) | ActionsBar (reset)
 *           | ConfigCard+FieldRow (параметры) | PromptsPanel (текст)
 *           | WorkflowMap (визуализация)
 */
//#endregion CONTRACT
// GREP_SUMMARY: pipelinebar actionsbar configcard fieldrow promptspanel workflowmap components

import React from "react";
import { useStore, DEFAULTS, SET_FIELD, SET_PROMPT, SET_COLLAPSED } from "./store.js";
import { Btn, Badge, Icon, SliderField, Toggle, InlineEdit } from "./ui.js";
const { Fragment, useState, useMemo, useCallback, createElement: h } = React;

//#region PipelineBar [DOMAIN(7):Navigation; CONCEPT(7):VisualIndex; TECH(6):InteractiveBar]
/** @Purpose Визуальная цепочка шагов пайплайна. Клик → scroll к секции. */
export function PipelineBar() {
  const [active, setActive] = useState(null);

  const steps = [
    { id: "checkpoint", label: "Checkpoint", icon: "\uD83D\uDCC1" },
    { id: "lora",       label: "LoRA",       icon: "\uD83E\uDDE9", section: "lora" },
    { id: "clip-pos",   label: "CLIP Pos",   icon: "\u2705",       section: "prompts" },
    { id: "clip-neg",   label: "CLIP Neg",   icon: "\u274C",       section: "prompts" },
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
            document.getElementById(`section-${s.section}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
//#endregion PipelineBar

//#region ActionsBar [DOMAIN(7):Controls; CONCEPT(8):StatusBar; TECH(7):ResetFlow]
/** @Purpose Строка состояния: счётчик изменений + кнопка сброса. */
export function ActionsBar() {
  const { state, dispatch } = useStore();
  const [showToast, setShowToast] = useState(false);

  const changedCount = useMemo(() => {
    let c = 0;
    for (const sec of ["ksampler", "facedetailer", "controlnet", "lora"]) {
      for (const [k, v] of Object.entries(state[sec] || {})) {
        if (v !== DEFAULTS[sec]?.[k]) c++;
      }
    }
    if (state.prompts.positive !== DEFAULTS.prompts.positive) c++;
    if (state.prompts.negative !== DEFAULTS.prompts.negative) c++;
    return c;
  }, [state]);

  const handleReset = useCallback(() => {
    dispatch({ type: "RESET" });
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  }, [dispatch]);

  const changedNote = changedCount > 0
    ? `${changedCount} changed value${changedCount !== 1 ? "s" : ""}`
    : null;

  return h("div", { className: "actions-bar" },
    h("div", { className: "actions-info" },
      h(Icon, { name: "info" }),
      changedNote
        ? h("span", null, changedNote)
        : h("span", { style: { color: "#4ade80" } }, "All defaults"),
    ),
    h("div", { className: "actions-btns" },
      h(Btn, { label: "\uD83D\uDD04 Reset to defaults", small: true, onClick: handleReset, disabled: changedCount === 0 }),
    ),
    showToast && h("div", { className: "toast" }, "\u2714\uFE0F Reset complete"),
  );
}
//#endregion ActionsBar

//#region ConfigCard [DOMAIN(8):Layout; CONCEPT(8):CollapsibleSection; TECH(8):CompoundComponent]
/** @Purpose Секция параметров с заголовком, сворачиванием и списком полей.
 *  Принимает tag/nodeId для отображения, section для привязки к store. */
export function ConfigCard({ title, nodeId, tag, tagColor, section, fields, children }) {
  const { state, dispatch } = useStore();
  const collapsed = state.collapsed[section] ?? false;

  return h("div", { className: "card", id: `section-${section}` },
    h("div", { className: "card-header", onClick: () => dispatch({ type: SET_COLLAPSED, key: section, value: !collapsed }) },
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
//#endregion ConfigCard

//#region FieldRow [DOMAIN(7):Input; CONCEPT(7):FieldMapping; TECH(7):ConditionalRender]
/** @Purpose Приватный компонент — рендерит поле в зависимости от type/ui.
 *  Slider → SliderField, boolean → Toggle, иначе → InlineEdit.
 *  Не экспортируется, только внутри ConfigCard. */
function FieldRow({ section, name, field }) {
  const { state, dispatch } = useStore();
  const value = state[section]?.[name];
  const def = DEFAULTS[section]?.[name];
  const isChanged = value !== def;

  const onChange = useCallback(
    (newVal) => dispatch({ type: SET_FIELD, section, field: name, value: newVal }),
    [dispatch, section, name],
  );

  if (field.type === "boolean") {
    return h("div", { className: "field-row" },
      h(Toggle, { label: field.label, value, onChange }),
      isChanged && h("span", { className: "changed-dot", title: `Default: ${def}` }),
    );
  }

  if (field.ui === "slider") {
    return h("div", { className: "field-row" },
      h(SliderField, {
        label: field.label, value, onChange,
        min: field.min, max: field.max, step: field.step || 1, unit: field.unit || "",
      }),
      isChanged && h("span", { className: "changed-dot", title: `Default: ${def}` }),
    );
  }

  return h("div", { className: "field-row" },
    h("span", { className: "field-label", title: field.desc }, field.label),
    h(InlineEdit, { value, onSave: onChange, type: field.type }),
    isChanged && h("span", { className: "changed-dot", title: `Default: ${def}` }),
  );
}
//#endregion FieldRow

//#region PromptsPanel [DOMAIN(8):Input; CONCEPT(9):TextEditor; TECH(8):Textarea]
/** @Purpose Два текстовых редактора (positive/negative) с char-счётчиком и reset. */
export function PromptsPanel() {
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
            onChange: e => dispatch({ type: SET_PROMPT, side, value: e.target.value }),
            rows: expanded ? 6 : 3,
            placeholder: `Enter ${side} prompt...`,
          }),
          h("div", { className: "prompt-footer" },
            h("span", { className: "prompt-words" }, `${val.split(/\s+/).filter(Boolean).length} words`),
            h(Btn, { label: "Reset", small: true, onClick: () => dispatch({ type: SET_PROMPT, side, value: def }) }),
          ),
        );
      }),
    ),
  );
}
//#endregion PromptsPanel

//#region WorkflowMap [DOMAIN(9):Visualization; CONCEPT(9):LiveProjection; TECH(8):useMemo]
/** @Purpose Карта узлов 1Clear.json с live-значениями из store.
 *  useMemo пересчитывает nodes при изменении любого параметра. */
export function WorkflowMap() {
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
      { node: 12, cls: "SaveImage",               params: [{ k: "filename_prefix", v: "refined_" }] },
    ];
  }, [state]);

  const liveIds = [2, 3, 4, 7, 8, 10];

  return h("div", { className: "section" },
    h("div", { className: "section-title" },
      h("span", { className: "section-toggle", onClick: () => setOpen(!open) }, open ? "\u25BC" : "\u25B6"),
      h("span", null, "Workflow Node Map"),
      h(Badge, { label: `${nodes.length} nodes`, color: "purple" }),
    ),
    open && h("div", { className: "workflow-map" },
      nodes.map(n =>
        h("div", { key: n.node, className: `map-row ${liveIds.includes(n.node) ? "map-live" : ""}` },
          h("span", { className: "map-id" }, `#${n.node}`),
          h("span", { className: "map-cls" }, n.cls),
          n.params.map((p, j) =>
            h("span", { key: j, className: "map-param" },
              h("span", { className: "map-key" }, p.k), "=",
              h("span", { className: "map-val" }, String(p.v)),
            )
          ),
          liveIds.includes(n.node) && h("span", { className: "map-live-badge" }, "live"),
        )
      ),
    ),
  );
}
//#endregion WorkflowMap
