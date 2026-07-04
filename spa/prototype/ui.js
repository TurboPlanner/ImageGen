//#region CONTRACT — ui.js [DOMAIN(7):UI; CONCEPT(8):Primitives; TECH(9):React]
/**
 * @module ui.js
 * @category UI
 *
 * @Purpose Набор переиспользуемых примитивов для построения UI пайплайна.
 * Все компоненты stateless — получают props, рендерят JSX через createElement.
 * Ни один компонент не зависит от store.js (чистая презентация).
 *
 * @Rationale
 * - Вынесены в отдельный модуль, чтобы ConfigCard, PromptsPanel и др.
 *   импортировали их, а не дублировали HTML.
 * - InlineEdit с собственной стейт-машиной (editing/draft/commit) —
 *   единственный компонент с useState, т.к. ему нужно различать
 *   режим просмотра и редактирования.
 *
 * @See components.js (импортирует всё), App.js (только Badge, Icon)
 *
 * @Structure Btn + Badge + Icon (stateless) | SliderField (range)
 *           | Toggle (checkbox) | InlineEdit (click-to-edit)
 */
//#endregion CONTRACT
// GREP_SUMMARY: btn badge icon slider toggle inlineedit ui primitives

import React from "react";
const { useState, useEffect, useCallback, useRef, createElement: h } = React;

//#region Btn [DOMAIN(6):Widget; TECH(7):Button]
/** @Purpose Универсальная кнопка с модификаторами primary/danger/small/disabled. */
export function Btn({ label, onClick, primary, danger, small, disabled, className = "" }) {
  const cls = ["btn", primary && "btn-primary", danger && "btn-danger", small && "btn-sm", className].filter(Boolean).join(" ");
  return h("button", { className: cls, onClick, disabled }, label);
}
//#endregion Btn

//#region Badge [DOMAIN(6):Widget; TECH(6):Label]
/** @Purpose Цветной ярлык для группировки/категоризации (Sampler, Face, LoRA...). */
export function Badge({ label, color }) {
  return h("span", { className: `badge badge-${color}` }, label);
}
//#endregion Badge

//#region Icon [DOMAIN(5):Widget; TECH(5):Emoji]
/** @Purpose Иконка через emoji-маппинг. Без внешних зависимостей. */
const ICON_MAP = {
  settings: "\u2699\uFE0F", reset: "\uD83D\uDD04", edit: "\u270F\uFE0F",
  check: "\u2714\uFE0F", close: "\u2716", info: "\u2139\uFE0F",
};
export function Icon({ name, className = "" }) {
  return h("span", { className: `icon ${className}` }, ICON_MAP[name] || "\u2753");
}
//#endregion Icon

//#region SliderField [DOMAIN(8):Input; CONCEPT(7):RangeControl; TECH(8):HTMLInput]
/** @Purpose Ползунок с меткой и отображением текущего значения. Без зависимостей. */
export function SliderField({ label, value, min, max, step, onChange, unit = "" }) {
  const id = `slider-${label.replace(/\s/g, "-")}`;
  return h("div", { className: "slider-field" },
    h("label", { htmlFor: id }, label),
    h("div", { className: "slider-row" },
      h("input", { type: "range", id, min, max, step, value,
        onChange: e => onChange(parseFloat(e.target.value)) }),
      h("span", { className: "slider-val" },
        value,
        unit && h("span", { className: "slider-unit" }, unit),
      ),
    ),
  );
}
//#endregion SliderField

//#region Toggle [DOMAIN(7):Input; CONCEPT(7):BinaryControl; TECH(7):Checkbox]
/** @Purpose Кастомный стилизованный переключатель для boolean-полей. */
export function Toggle({ label, value, onChange }) {
  return h("label", { className: "toggle-label" },
    h("span", { className: "toggle-track" },
      h("input", { type: "checkbox", checked: value, onChange: e => onChange(e.target.checked) }),
      h("span", { className: "toggle-thumb" }),
    ),
    h("span", { className: "toggle-text" }, label),
  );
}
//#endregion Toggle

//#region InlineEdit [DOMAIN(9):Input; CONCEPT(9):ClickToEdit; TECH(8):StateMachine]
/** @Purpose Клик по значению → режим редактирования → Enter/Blur → сохранение.
 *  Поддерживает text, number, boolean. Escape отменяет. */
export function InlineEdit({ value, onSave, type = "string" }) {
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
      ? h("select", { ref: inputRef, value: String(value),
          onChange: e => { setDraft(e.target.value); }, onBlur: commit },
          h("option", { value: "true" }, "true"),
          h("option", { value: "false" }, "false"),
        )
      : h("input", { ref: inputRef, type: type === "number" ? "number" : "text", value: draft,
          onChange: e => setDraft(e.target.value),
          onKeyDown: e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); },
          onBlur: commit,
        }),
  );
}
//#endregion InlineEdit
