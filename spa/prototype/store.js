
//#region CONTRACT — store.js [DOMAIN(7):StateManagement; CONCEPT(8):Context+Reducer; TECH(9):React]

/**
 * @module store.js
 * @category StateManagement
 *
 * @Purpose Единый источник истины для всех настроек pipeline.
 * Любой компонент читает useStore(), пишет dispatch().
 * Без этого модуля карточки + промпты + workflow map
 * не синхронизировали бы состояние.
 *
 * @Rationale
 * - useReducer вместо useState — 4+ секции, ~20 полей.
 * - structuredClone(DEFAULTS) при RESET — защита от мутации эталона.
 * - SET_COLLAPSED НЕ сбрасывается при RESET (UI-состояние отдельно).
 * - guard в useStore() — понятная ошибка вместо cryptic "null".
 *
 * @See ui.js (читает), components.js (читает/пишет),
 *      App.js (монтирует StoreProvider)
 *
 * @Structure StoreProvider ∋useReducer → ⊕{state,dispatch} → useStore()
 */
//#endregion CONTRACT
// GREP_SUMMARY: store context reducer state dispatch provider useStore DEFAULTS

import React from "react";
const { createContext, useContext, useReducer } = React;




//#region DEFAULTS [DOMAIN(7):Defaults; TECH(6):StaticData]
/** @Purpose Единственный эталон начальных значений для всех полей. */
export const DEFAULTS = {
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
//#endregion DEFAULTS

//#region ACTION_TYPES [DOMAIN(6):Constants; CONCEPT(6):ActionIdentifiers]
/** @Purpose Константы вместо magic strings — гарантия, что reducer и dispatch не рассинхронизируются. IDE-автокомплит + minify-safe. */
export const SET_FIELD     = "SET_FIELD";
export const SET_PROMPT    = "SET_PROMPT";
export const RESET         = "RESET";
export const SET_COLLAPSED = "SET_COLLAPSED";
//#endregion ACTION_TYPES

//#region FUNC_reducer [DOMAIN(8):CoreLogic; CONCEPT(9):StateTransitions; TECH(8):PureFunction]
/**
 * @Purpose Чистая функция (state, action) → newState. Предсказуемые переходы.
 * Без side effects. SET_PROMPT вынесен отдельно из-за вложенности
 * {positive, negative}, не укладывающейся в generic SET_FIELD.
 * @param {object} state
 * @param {{type:string,section?:string,field?:string,value?:*,side?:string,key?:string}} action
 * @returns {object}
 */
export function reducer(state, action) {
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
//#endregion FUNC_reducer

//#region CONTEXT_API [DOMAIN(9):API; CONCEPT(8):PublicSurface; TECH(9):ReactContext]
/** @Purpose Предоставить компонентам useStore() — единый хук с guard-проверкой. useReducer даёт стабильные ссылки (нет лишних перерендеров). */
const StoreCtx = createContext(null);

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be inside StoreProvider");
  return ctx;
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, { ...structuredClone(DEFAULTS), collapsed: {} });
  return React.createElement(StoreCtx.Provider, { value: { state, dispatch } }, children);
}
//#endregion CONTEXT_API


