# ClearRefine — Tech Experimentation Playground

## Overview

Экспериментальный проект для тестирования и отработки различных технологий:
- React SPA через UMD CDN (без бандлера)
- ES modules + importmap для модульной структуры JS
- FastAPI + structlog (JSON-логи)
- Mermaid-диаграммы (HTML + .mmd)
- Dual logging (frontend in-memory + backend structlog)
- Semantic markup (JSDoc + #region + GREP_SUMMARY)
- Playwright extraction через page.evaluate()
- Multi-model AI via subagents (Explore на GLM-5.2 и др.)
- Компонентный UI (Context + useReducer, без библиотек стейта)

**Не является production-решением.** Код предназначен для прототипирования
и поиска оптимальных паттернов.

## Core Architecture

```
Browser (React 18 UMD CDN)
  │
  ├── GET  /              → index.html (SPA)
  ├── GET  /spa/*         → static files (app.js, styles.css)
  │
  ├── POST /api/queue     → Запуск батча
  ├── GET  /api/status/   → Опрос прогресса
  ├── POST /api/cancel/   → Отмена батча
  ├── GET  /api/browse    → Браузер файловой системы
  ├── GET  /api/logs      → Лог сервера (JSON, structlog)
  ├── POST /api/logs/frontend → Логи с фронтенда (debug-режим)
  └── GET  /api/docs      → Swagger UI (OpenAPI 3.1)
       │
       ▼
  FastAPI (port 8765)
       │
       ▼
  clear_refine.py  ───→  ComfyUI API (port 8188)
```

## Architecture

```
Browser (React 18 UMD CDN)
  │
  ├── GET  /              → index.html (SPA)
  ├── GET  /spa/*         → static files (app.js, styles.css)
  │
  ├── POST /api/queue     → Запуск батча
  ├── GET  /api/status/   → Опрос прогресса
  ├── POST /api/cancel/   → Отмена батча
  ├── GET  /api/browse    → Браузер файловой системы
  ├── GET  /api/logs      → Лог сервера (real-time)
  └── GET  /api/docs      → Swagger UI (OpenAPI 3.1)
       │
       ▼
  FastAPI (port 8765)
       │
       ▼
  clear_refine.py  ───→  ComfyUI API (port 8188)
```

## Files

| File / Dir | Purpose |
|------------|---------|
| `server.py` | FastAPI сервер + structlog + endpoints |
| `clear_refine.py` | Ядро пайплайна ComfyUI (workflow, очередь, поллинг) |
| `clear_config.json` | Tunnable параметры: промпты, LoRA, KSampler, FaceDetailer |
| `AGENTS.md` | Архитектурный обзор для AI-агентов |
| `DECISIONS.md` | Лог архитектурных решений |
| `spa/index.html` | SPA entry point (React 18 UMD CDN) |
| `spa/app.js` | React-компоненты (createElement, без JSX) |
| `spa/styles.css` | Тёмная тема, CSS Grid/Flexbox |
| `spa/prototype/index.html` | Модульная версия (ES modules + importmap) |
| `spa/prototype/store.js` | Context + useReducer state management |
| `spa/prototype/ui.js` | UI primitives (Btn, Badge, SliderField, Toggle, InlineEdit) |
| `spa/prototype/components.js` | Feature components (PipelineBar, ConfigCard, WorkflowMap...) |
| `spa/prototype/App.js` | App shell + section configs |
| `spa/prototype/main.js` | Entry point (ES module) |
| `spa/prototype/logger.js` | Dual logging (in-memory + backend via structlog) |
| `spa/prototype/log-test.html` | Logger test page |
| `spa/prototype/log-arch.html` | Logger architecture (Mermaid diagram, HTML) |
| `spa/prototype/log-arch.mmd` | Logger architecture (Mermaid, .mmd) |
| `architecture.html` | Architecture overview (Mermaid sequence diagram) |
| `TestInput/` | Тестовые изображения |
| `tests/` | pytest: unit (16), SPA (14), integration (18) |

## Quick Start

```bash
# 1. Запустить Comfy Desktop (открыть из Пуск — сам поднимет порт 8188)
# 2. Запустить сервер:
python server.py
# 3. Открыть в браузере:
#    - http://127.0.0.1:8765              — основная SPA
#    - http://127.0.0.1:8765/spa/prototype/index.html  — модульный прототип
#    - http://127.0.0.1:8765/spa/prototype/log-test.html  — тест логгера
# 4. Для debug-режима логгера: добавить ?debug=true
```

## Tests

```bash
# Unit + SPA (без ComfyUI):
python -m pytest tests -v -m "not integration"

# SPA (нужен сервер на 8765):
python -m pytest tests/test_spa.py -v

# Интеграционные (нужен ComfyUI на 8188 + сервер на 8765):
python -m pytest tests -v -m "integration"

# Полные тесты (38 pass, 10 skip без ComfyUI):
python -m pytest tests -v
```

## API Endpoints

Full Swagger: `http://127.0.0.1:8765/api/docs`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/queue` | Bearer | Запуск батча |
| GET | `/api/status/{id}` | Bearer | Прогресс батча |
| POST | `/api/cancel/{id}` | Bearer | Отмена батча |
| GET | `/api/browse` | Bearer | Файловый браузер |
| GET | `/api/logs` | None | Серверные логи (последние N) |
| POST | `/api/logs/frontend` | None | Логи с фронтенда (debug-режим) |
| GET | `/api/logs/frontend` | None | Прочитаь логи фронтенда |
| GET | `/api/docs` | None | Swagger UI |

## Semantic Markup Convention

Все JS-файлы в `spa/prototype/` следуют единому шаблону:

```
//#region CONTRACT — filename [DOMAIN(x):...; CONCEPT(x):...; TECH(x):...]
/** JSDoc: @Purpose, @Rationale, @See, @Structure */
//#endregion CONTRACT
// GREP_SUMMARY: keywords...

imports...

//#region ComponentName [DOMAIN(x):...; ...]
/** @Purpose Что делает компонент (не как). */
export function ComponentName(...) { ... }
//#endregion ComponentName
```

Python-файлы используют # region / # endregion и structlog вместо стандартного logging.
| GET | `/api/logs` | None | Последние N строк лога |
| GET | `/api/docs` | None | Swagger UI |
| GET | `/api/openapi.json` | None | OpenAPI спецификация |

## SPA Features

- **Две колонки**: слева — панель управления, справа — лог сервера
- **Input Directory**: редактируемое поле + файловый браузер от C:\
- **Output Directory**: назначение папки для результатов (опционально)
- **Prompts**: Positive / Negative текст
- **Limits**: Max files — ограничение кол-ва изображений для теста
- **Progress**: progress bar + список обработанных файлов
- **Cancel**: отмена текущего батча
- **Log Panel**: real-time логи с фильтром по уровню (ALL/INFO/WARNING/ERROR), auto-scroll

## SPA Development Rules

- **NO Node.js** — React через UMD CDN, без сборки
- **NO JSX** — использовать `const { createElement: h } = React`
- **Pure CSS** — никаких CSS-фреймворков
- **Cache bust** — при изменении `app.js`/`styles.css` менять `?v=N` в `index.html`
- **Auth** — Bearer token захардкожен в `app.js` и `server.py`

## Workflow Pipeline (1Clear.json)

```
Load Checkpoint (fabledIllusionNSFW_v7Apoapsis)
  → Load LoRA (add-detail-xl, strength 0.6)
  → CLIP Encode (positive + negative)
  → ControlNet Tile (strength 1.0)
  → Load Image → Resize → VAE Encode → KSampler (steps=20, denoise=0.2)
  → VAE Decode → FaceDetailer (30 steps, denoise=0.35, force inpaint)
  → Save Image
```

## Key Config Parameters (clear_config.json)

| Section | Parameters |
|---------|-----------|
| KSampler | steps, cfg, denoise, sampler, scheduler |
| FaceDetailer | guide_size, max_size, steps, cfg, denoise, feather, bbox_dilation, bbox_crop_factor |
| ControlNet | strength, start_percent, end_percent |
| LoRA | lora_name, strength_model, strength_clip |
| Prompts | positive text, negative text |

## Error Handling

- ComfyUI offline → batch status "completed_with_errors", ошибка в логе
- Несуществующая папка → 400
- Без изображений → 400
- Неверный batch_id → 404
- Без токена/неверный токен → 401
- Cancel → прерывание между изображениями, отменённые помечаются "cancelled"
