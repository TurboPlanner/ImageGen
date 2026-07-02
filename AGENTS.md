# ClearRefine — SPA + OpenAPI Image Processing Pipeline

## Overview

Пакетная обработка изображений через ComfyUI с веб-интерфейсом (SPA) и REST API с OpenAPI-спецификацией.

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

| File | Purpose |
|------|---------|
| `server.py` | FastAPI сервер, авторизация, API эндпоинты, статика SPA |
| `clear_refine.py` | Ядро: сборка workflow, копирование файлов, очередь в ComfyUI, опрос, отмена |
| `clear_config.json` | Tunnable параметры: промпты, LoRA, ControlNet, KSampler, FaceDetailer |
| `1Clear.json` | Workflow в формате ComfyUI API |
| `spa/index.html` | SPA entry point, загрузка React 18 UMD + app.js |
| `spa/app.js` | React-компоненты (createElement, без JSX): PathBrowser, LogPanel, App |
| `spa/styles.css` | Тёмная тема, CSS Grid/Flexbox, resize консоли |
| `TestInput/` | Тестовые изображения (base.jpg, dock1.jpg) |
| `tests/` | pytest: unit (16), SPA/Playwright (14), integration (18, error-handling) |

## Quick Start

```bash
# 1. Запустить Comfy Desktop (открыть из Пуск — сам поднимет порт 8188)
# 2. Запустить сервер:
python server.py
# 3. Открыть в браузере: http://127.0.0.1:8765
# 4. Выбрать Input Directory через Browse
# 5. Настроить промпты (опционально)
# 6. Нажать Start Processing
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
| POST | `/api/queue` | Bearer | Запуск батча {input_dir, output_dir, output_prefix, positive_prompt, negative_prompt, max_images} |
| GET | `/api/status/{id}` | Bearer | Прогресс батча {status, total, done, current, results} |
| POST | `/api/cancel/{id}` | Bearer | Отмена батча |
| GET | `/api/browse` | Bearer | Файловый браузер {path, dirs, images} |
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
