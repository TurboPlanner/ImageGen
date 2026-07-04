//#region CONTRACT — App.js [DOMAIN(9):Application; CONCEPT(9):Shell; TECH(9):Composition]
/**
 * @module App.js
 * @category Application
 *
 * @Purpose Сборка приложения: оборачивает всё в StoreProvider,
 * компонует секции, передаёт конфигурацию в ConfigCard.
 * SECTIONS — единственное место, где описаны все поля пайплайна.
 *
 * @Rationale
 * - SECTIONS вынесен в App.js (не в store), потому что это UI-конфиг:
 *   label, type, min/max/step — только для рендера, не для стейта.
 * - Именно App.js решает, какие секции рендерить и в каком порядке.
 *
 * @See store.js (стейт), components.js (компоненты), ui.js (примитивы)
 *
 * @Structure StoreProvider → header → PipelineBar → ActionsBar
 *           → ConfigCard ×4 → PromptsPanel → WorkflowMap → footer
 */
//#endregion CONTRACT
// GREP_SUMMARY: app shell sections layout configcard composition storeprovider

import React from "react";
import { StoreProvider } from "./store.js";
import { Badge, Icon } from "./ui.js";
import { PipelineBar, ActionsBar, ConfigCard, PromptsPanel, WorkflowMap } from "./components.js";
const { createElement: h } = React;

//#region SECTIONS [DOMAIN(8):Config; CONCEPT(8):FieldDefinitions; TECH(7):StaticData]
/** @Purpose Конфигурация всех секций пайплайна: label, тип, диапазоны.
 *  Единственное место для изменений набора полей. */
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
//#endregion SECTIONS

//#region FUNC_App [DOMAIN(9):Entry; CONCEPT(9):Composition; TECH(9):ReactComponent]
/** @Purpose Главный компонент: композиция всех секций в layout. */
export default function App() {
  return h(StoreProvider, null,
    h("div", { className: "app" },

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

      h(PipelineBar, null),
      h(ActionsBar, null),

      h("div", { className: "section", style: { marginTop: "1.5rem" } },
        h("div", { className: "section-title" },
          h("span", null, "Pipeline Parameters"),
          h(Badge, { label: "4 modules", color: "blue" }),
        ),
        h("div", { className: "card-grid" },
          SECTIONS.map(cfg => h(ConfigCard, { key: cfg.section, ...cfg })),
        ),
      ),

      h(PromptsPanel, null),
      h(WorkflowMap, null),

      h("footer", null,
        h("span", null, "ClearRefine \u2014 Interactive Settings Prototype"),
        h("div", { className: "footer-links" },
          h("a", { href: "../architecture.html", target: "_blank" }, "Architecture"),
          h("a", { href: "../index.html", target: "_blank" }, "SPA"),
        ),
      ),
    ),
  );
}
//#endregion FUNC_App
