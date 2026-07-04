//#region CONTRACT — main.js [DOMAIN(9):EntryPoint; CONCEPT(7):Bootstrap; TECH(9):ReactDOM]
/**
 * @module main.js
 * @category Entry
 *
 * @Purpose Точка входа. Ищет #root, монтирует React-приложение.
 * Без бандлера — через importmap + type="module".
 *
 * @Rationale guard if (root) — если #root нет на странице, падает
 * с понятным console.error, а не с cryptic ReactDOM error.
 *
 * @See App.js (что монтируем), index.html (где #root)
 */
//#endregion CONTRACT
// GREP_SUMMARY: entry point mount reactdom root bootstrap

import React from "react";
import ReactDOM from "react-dom";
import App from "./App.js";

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(React.createElement(App));
} else {
  console.error("Root element not found");
}
