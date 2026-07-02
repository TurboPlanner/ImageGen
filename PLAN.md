# План: ClearRefine — SPA + OpenAPI

## Архитектура

```
┌─────────────────────────────────────────────┐
│               Браузер (SPA)                  │
│  React 18 UMD (CDN) + vanilla JS            │
│  index.html        index.css        app.js   │
└──────────┬──────────────────────────┬────────┘
           │ Bearer Token             │
           ▼                          ▼
┌─────────────────────────────────────────────┐
│   FastAPI сервер (порт 8765)                │
│   /api/docs  — Swagger UI (OpenAPI 3.1)     │
│   /api/openapi.json                         │
│   /api/queue       POST — запуск батча      │
│   /api/status/{id}  GET — опрос прогресса   │
│   /api/cancel/{id} POST — отмена батча      │
│   /api/browse      GET — список папок/файлов│
│   /                GET — index.html SPA     │
└──────────┬──────────────────────────┬────────┘
           │ вызывает                  │
           ▼                          ▼
┌─────────────────────┐   ┌─────────────────────┐
│ clear_refine.py     │   │ ComfyUI API          │
│ process_batch()     │→→→│ 127.0.0.1:8188       │
│ process_single()    │   │ queue/prompt         │
└─────────────────────┘   │ history/{prompt_id}  │
                          └─────────────────────┘
```

## Поток обработки (асинхронный)

```
Client                    Server                  ComfyUI
  │                         │                       │
  │ POST /api/queue         │                       │
  │  {input_dir, output_dir,│                       │
  │   positive_prompt,      │                       │
  │   negative_prompt}      │                       │
  │────────────────────────→│                       │
  │  {batch_id, status:"pending"}                   │
  │←────────────────────────│                       │
  │                         │  Запуск background    │
  │                         │  task: для каждого    │
  │                         │  файла из input_dir:  │
  │                         │  1. build_workflow()  │
  │                         │  2. queue_prompt()   →│
  │                         │  3. poll_prompt()    ←│
  │                         │  4. сохраняет output  │
  │                         │                       │
  │ GET /api/status/{id}    │                       │
  │────────────────────────→│                       │
  │  {total: 10, done: 3,   │                       │
  │   current: "img04.jpg", │                       │
  │   results: [...],       │                       │
  │   status: "running"}    │                       │
  │←────────────────────────│                       │
  │                         │                       │
  │ (ещё 3 опроса...)       │                       │
  │                         │                       │
  │  {done: 10, status:     │                       │
  │   "completed"}          │                       │
```

## UI (эскиз)

```
┌──────────────────────────────────────────────────────┐
│ 🔄 ClearRefine — пакетная обработка изображений      │
├──────────────────────────────────────────────────────┤
│                                                       
│ ┌─ Input ──────────────────────────────────────────┐  
│ │ 📁 C:\Users\...\ComfyUI-Shared\input\dit_drafts  │  
│ │ [Browse...]          [Refresh]                    │  
│ │   base.jpg        ✓ в очереди                     │  
│ │   dock1.jpg       ✓ в очереди                     │  
│ │   portrait3.png   ✓ в очереди                     │  
│ └──────────────────────────────────────────────────┘  
│                                                       
│ ┌─ Output ─────────────────────────────────────────┐  
│ │ 📁 C:\Users\...\ComfyUI-Shared\output\clear_run1  │  
│ │ [Browse...]       [New Folder]                    │  
│ └──────────────────────────────────────────────────┘  
│                                                       
│ ┌─ Prompts ────────────────────────────────────────┐  
│ │ Positive: [hyper realism, photo realism...     ] │  
│ │ Negative: [bad quality, blurry, messy...       ] │  
│ └──────────────────────────────────────────────────┘  
│                                                       
│ ╔══════════════════════════════════════════════════╗  
│ ║             ▶ Start Processing                   ║  
│ ╚══════════════════════════════════════════════════╝  
│                                                       
│ ┌─ Progress ───────────────────────────────────────┐  
│ │ ████████████░░░░░░░░░░░░░░░░░  40%               │  
│ │ Processing: dock1.jpg (3/10)                      │  
│ │ ✓ base.jpg     → refined_base_0001.png  0.2s     │  
│ │ ⟳ dock1.jpg   → ... (started 5s ago)             │  
│ │ ◻ portrait3.png                                   │  
│ └──────────────────────────────────────────────────┘  
└──────────────────────────────────────────────────────┘
```

## API спецификация (OpenAPI 3.1)

### `POST /api/queue`
```json
{
  "input_dir": "C:/path/to/input",
  "output_dir": "C:/path/to/output",
  "output_prefix": "refined_",
  "positive_prompt": "hyper realism, HDR...",
  "negative_prompt": "bad quality...",
  "max_images": null
}
```
→ `{ "batch_id": "uuid", "status": "queued" }`

### `GET /api/status/{batch_id}`
→ `{ "batch_id": "uuid", "status": "running"|"completed"|"failed"|"cancelled", "total": 10, "done": 5, "current": "img.jpg", "results": [{"image":"img.jpg","status":"ok","outputs":[...],"elapsed":1.2}, ...] }`

### `POST /api/cancel/{batch_id}`
→ `{ "status": "cancelling" }`

### `GET /api/browse?path=C:/...`
→ `{ "path": "...", "parent": "...", "dirs": ["sub1","sub2"], "files": ["img1.jpg","img2.png"] }`

## Компоненты SPA

| Файл | Назначение |
|------|-----------|
| `spa/index.html` | React UMD + app.js + styles |
| `spa/app.js` | Логика SPA: роутинг, API-клиент, компоненты |
| `spa/styles.css` | CSS без фреймворков (CSS Grid/Flexbox) |

Фронт на React 18 через CDN (UMM build) — без Node.js, без сборки.

## Auth

Токен вшит в app.js и в server.py:
```
API_TOKEN = "clear-refine-demo-token-2026"
```
SPA передаёт в `Authorization: Bearer <токен>`.

## Файлы

```
C:\Projects\AIC\
├── server.py            ← FastAPI сервер (+ статика SPA)
├── clear_refine.py       ← существующий модуль
├── clear_config.json     ← существующий конфиг
├── 1Clear.json           ← существующий workflow
├── spa\
│   ├── index.html        ← SPA
│   ├── app.js            ← React компоненты
│   └── styles.css        ← стили
├── TestInput\            ← тестовые изображения
├── tests\
│   ├── __init__.py
│   ├── test_clear_refine.py
│   └── test_server.py    ← тесты API
└── PLAN.md               ← этот файл
```
