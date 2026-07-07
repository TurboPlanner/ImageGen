# Test Plan — Generative UI Chat Prototype

> **Статус:** Черновик для ревью ИИ.
> **Назначение:** Набор автоматических тестов (pytest) для `chat_server.py` и SPA.

---

## 1. Unit-тесты (без API key, без DeepSeek)

### 1.1. SQLite операции

| # | Тест | Описание |
|---|------|----------|
| U1 | `test_db_init` | Проверить, что при запуске создаётся таблица `artifacts` с нужными колонками. |
| U2 | `test_create_artifact_record` | INSERT в SQLite через прямой вызов, проверить что запись создалась. |
| U3 | `test_edit_artifact_record` | UPDATE записи, проверить что `updated_at` изменился. |
| U4 | `test_artifact_uniqueness` | Попытка создать дубликат `name` → SQLite constraint violation. |

### 1.2. Tool функции (без API)

| # | Тест | Описание |
|---|------|----------|
| U5 | `test_tool_create_valid` | `tool_create_artefact("test_widget", code)` — проверить что файл создан в `spa/artifacts/test_widget.jsx` и SQLite запись есть. |
| U6 | `test_tool_create_invalid_name` | Имя с пробелами/спецсимволами → `success: false`. |
| U7 | `test_tool_create_duplicate` | Дважды создать с одним именем → второй раз ошибка. |
| U8 | `test_tool_edit_nonexistent` | Редактировать несуществующий → `success: false`. |
| U9 | `test_tool_edit_valid` | Создать → отредактировать → проверить код в файле и БД. |

### 1.3. Контекст (JSON файл)

| # | Тест | Описание |
|---|------|----------|
| U10 | `test_context_empty_init` | Новый `context.json` — пустой массив. |
| U11 | `test_context_append` | Добавить сообщение → проверить что файл содержит. |
| U12 | `test_context_clear` | `clear_context()` → файл содержит `[]`. |
| U13 | `test_context_persistence` | Добавить 2 сообщения → прочитать → проверить порядок. |

---

## 2. API-тесты (с Flask/httpx test client, мок DeepSeek)

### 2.1. Health

| # | Тест | Описание |
|---|------|----------|
| A1 | `test_health_endpoint` | `GET /api/health` → `200 {"status": "ok"}`. |

### 2.2. Контекст

| # | Тест | Описание |
|---|------|----------|
| A2 | `test_get_context` | `GET /api/context` → `200 {"messages": []}`. |
| A3 | `test_clear_context` | `POST /api/context/clear` → `200`, затем `GET` → пусто. |

### 2.3. Артефакты

| # | Тест | Описание |
|---|------|----------|
| A4 | `test_get_artifact_404` | `GET /api/artifacts/nonexistent` → `404`. |
| A5 | `test_get_artifact_ok` | Создать через tool, затем `GET /api/artifacts/{name}` → `200` с кодом. |
| A6 | `test_list_artifacts` | `GET /api/artifacts` → список, пустой или с записями. |

### 2.4. Proxy

| # | Тест | Описание |
|---|------|----------|
| A7 | `test_proxy_unknown_endpoint` | `POST /api/proxy` с `endpoint: "unknown"` → `400`. |
| A8 | `test_proxy_get_artifact` | `POST /api/proxy` с `endpoint: "get_artifact"` → проксирует корректно. |

### 2.5. Chat Stream (с моком DeepSeek)

| # | Тест | Описание |
|---|------|----------|
| A9 | `test_chat_stream_text_only` | Мок DeepSeek возвращает только текст. Проверить SSE: event `text`, затем `done`. |
| A10 | `test_chat_stream_tool_call` | Мок DeepSeek возвращает tool_call Create_Artefact. Проверить: `tool_start` → `tool_result` → `done`. |
| A11 | `test_chat_stream_tool_then_text` | Мок возвращает текст, потом tool_call, потом текст. Проверить последовательность SSE-событий. |
| A12 | `test_chat_stream_api_error` | Мок DeepSeek падает с ошибкой. Проверить SSE event `error`. |
| A13 | `test_chat_stream_max_retries` | Мок возвращает 4 tool_call подряд → `max_retries` event. |

---

## 3. Тесты SPA (через Playwright VS Code Browser)

> **Зависимость:** Сервер на `http://127.0.0.1:8766`.

### 3.1. Загрузка и рендер

| # | Тест | Описание |
|---|------|----------|
| S1 | `test_spa_loads` | Открыть `/`. Проверить заголовок "Generative UI". |
| S2 | `test_spa_split_layout` | Проверить наличие двух панелей: `.chat-panel` и `.sandbox-panel`. |
| S3 | `test_spa_welcome_screen` | При пустом чате показывается welcome-сообщение с примерами. |
| S4 | `test_spa_input_enabled` | Поле ввода не disabled, кнопка Send disabled (пустой ввод). |

### 3.2. Чат-взаимодействие

| # | Тест | Описание |
|---|------|----------|
| S5 | `test_spa_send_message` | Ввести текст, нажать Send. Проверить что сообщение появилось в `.msg-user`. |
| S6 | `test_spa_clear_chat` | Отправить сообщение, нажать Clear. Проверить что чат пуст + контекст на сервере очищен. |
| S7 | `test_spa_example_chip_click` | Клик по example chip → сообщение отправляется. |

### 3.3. Sandbox и iframe

| # | Тест | Описание |
|---|------|----------|
| S8 | `test_sandbox_empty_state` | При загрузке показывается `.sandbox-empty` с текстом. |
| S9 | `test_sandbox_renders_artifact` | Создать артефакт через API, проверить что iframe загрузился и содержит React-компонент. |
| S10 | `test_sandbox_error_boundary` | Артефакт с синтаксической ошибкой → error UI внутри iframe + `IFRAME_ERROR` событие. |
| S11 | `test_sandbox_compile_error` | Артефакт с невалидным JSX → Babel compile error → error-панель. |

### 3.4. PostMessage Bridge

| # | Тест | Описание |
|---|------|----------|
| S12 | `test_postmessage_api_request` | Внутри iframe вызвать `window.safeApiCall("list_artifacts")` → получить ответ. |
| S13 | `test_postmessage_logging` | Внутри iframe `console.log("test")` → проверить что родитель получил `IFRAME_LOG`. |

---

## 4. Интеграционные тесты (с реальным DeepSeek API, по желанию)

| # | Тест | Описание |
|---|------|----------|
| I1 | `test_real_chat_text` | Отправить "Say hello" → получить текстовый ответ. |
| I2 | `test_real_create_artifact` | Отправить "Create a simple counter button" → проверить что создан артефакт + iframe обновился. |
| I3 | `test_real_edit_artifact` | "Change the counter to increment by 5" → проверить что код обновлён. |
| I4 | `test_real_self_correction` | Дать заведомо неправильную инструкцию → проверить что агент делает retry. |

---

## Пометки к реализации

- Unit-тесты (U1-U13): `pytest`, прямое тестирование функций из `chat_server.py`.
- API-тесты (A1-A13): `httpx.AsyncClient` с FastAPI `TestClient` или `AsyncClient`. Мок DeepSeek через `unittest.mock.patch` или monkeypatch `client.chat.completions.create`.
- SPA-тесты (S1-S13): Через встроенный браузер VS Code (Playwright). `test_spa.py` по аналогии с существующим.
- Фикстуры: `tmp_path` для SQLite и `context.json`, временный `artifacts/` директории.
- Маркер `integration` для I1-I4 (как в существующем `conftest.py`).
