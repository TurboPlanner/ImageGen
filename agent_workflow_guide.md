# Agent Workflow Guide — ClearRefine Experiments

> **Назначение:** Передача контекста между сессиями AI-агентов.
> Документирует проверенные техники, настройки окружения и результаты
> экспериментов, чтобы следующий агент не тратил время на повторные пробы.

---

## 1. Среда разработки VS Code — особенности

### 1.1. Встроенный браузер (Playwright)
VS Code имеет встроенный Chromium-браузер, управляемый через Playwright.
Агент может:
- Открывать страницы (`open_browser_page`)
- Кликать по элементам (`click_element`) — возвращает HTML-путь, стили, размеры
- Читать accessibility snapshot (`read_page`) — DOM-дерево без рендера
- Делать скриншоты (`screenshot_page`) — видит пользователь, агент — только описание
- Выполнять произвольный JS (`run_playwright_code`) — `page.evaluate()`

**Важно:** Доступность инструментов браузера зависит от того, поделился ли
пользователь страницей (*"Sharing with Agent"*). Без шаринга агент может
только открыть новую страницу, но не видит уже открытые вкладки.

### 1.2. file:// vs http:// — ограничения
- **file://**: ES modules (`<script type="module">`) **не работают** (CORS).
  UMD-скрипты (`<script src="...">`) работают.
- **http:// (localhost)**: Работает всё. Нужен Python-сервер (FastAPI/Uvicorn).
- **fetch() к localhost** блокирован с file:// (CORS).
- Если SPA использует fetch к API — открывать только через сервер.

### 1.3. Python-инструменты агента
Доступны MCP-инструменты Pylance:
- `pylanceRunCodeSnippet` — выполнить Python-код в окружении проекта.
  Предпочтительнее `python -c "..."` — нет проблем с экранированием.
- `pylanceDocString` — читает docstring функции/класса (не модуля!).
- `pylanceFileSyntaxErrors` — проверить синтаксис файла.
- `pylanceImports` — анализ неразрешённых импортов.
- `pylanceInvokeRefactoring` — авторефакторинг (unused imports, type annotations).
- `configure_python_environment` — **обязателен перед** любыми Python-операциями.

### 1.4. Запуск Python-сервера
```bash
python server.py  # async mode — сервер остаётся в фоне
```
Остановка: `kill_terminal(id=...)`. После остановки и правки кода — перезапуск.

---

## 2. Семантическая разметка кода (проверено, работает)

### 2.1. Единый шаблон для JS-файлов
```
//#region CONTRACT — filename [DOMAIN(x):...; CONCEPT(x):...; TECH(x):...]
/** JSDoc: @Purpose, @Rationale, @See, @Structure */
//#endregion CONTRACT
// GREP_SUMMARY: keywords...

//#region ComponentName [DOMAIN(x):...; ...]
/** @Purpose Что делает компонент (не как). */
export function ComponentName(...) { ... }
//#endregion ComponentName
```

### 2.2. Принципы
- **`@Purpose` важнее описания.** Агент читает код как текст.
  alignment (зачем), а не пересказ (что).
- **`@Rationale` — скрытый контекст.** Почему выбран `structuredClone`,
  почему `SET_COLLAPSED` вне `RESET`. Защита от разрушительного рефакторинга.
- **`@See`** — какие модули связаны. Заменяет XML Knowledge Graph на
  уровне одного файла.
- **`GREP_SUMMARY` вне `#region`.** grep находит строку сразу, не заходя
  в свёрнутый блок. Возвращает: filename + line + keywords.
- **`DOMAIN/CONCEPT/TECH`** — cheap tokens для sparse attention.
  Работает как bag-of-words: повышает вероятность попадания региона в Top-K.

### 2.3. Регионы в разных языках
| Язык | Формат | VS Code folding |
|------|--------|----------------|
| JavaScript/TypeScript | `//#region` / `//#endregion` | ✅ |
| Python | `# region` / `# endregion` | ✅ |

### 2.4. Эксперимент: Doxygen vs Plain text
**Результат:** Doxygen-теги (`## @purpose`, `## @param`) не дают преимущества
перед плоским текстом. Агент не парсит теги семантически — для него
`## @purpose Validate input` и `# Validates input` — одно и то же.

---

## 3. Dual Logging (проверено, работает)

### 3.1. Фронтенд: `window.appLogs`
```javascript
// logger.js — подключается как <script src="logger.js">
// Три уровня логирования:

function log(level, message, context) {
  // 1. ВСЕГДА → в window.appLogs (циклический буфер, 300 записей)
  window.appLogs.push(entry);

  // 2. ВСЕГДА → console.log (для человека)
  console.log(...)

  // 3. ТОЛЬКО debug → на бекенд
  if (isDebug) {  // ?debug=true или window.__PLAYWRIGHT__ === true
    fetch('/api/logs/frontend', { method: 'POST', body: JSON.stringify(entry) })
  }
}
```

**Playwright extraction (без DOM):**
```python
logs = page.evaluate("() => window.logger.getAll()")
errors = page.evaluate("() => window.logger.getByLevel('ERROR')")
```

**Public API:**
- `window.logger.debug(msg, ctx)` / `.info()` / `.warning()` / `.error()`
- `window.logger.getAll()` — весь массив
- `window.logger.getByLevel('ERROR')` — фильтр по уровню
- `window.logger.showPanel()` — скрытая #ai-debug-panel в DOM
- `window.logger.clear()`

### 3.2. Бекенд: structlog (JSON)
```python
import structlog
logger = structlog.get_logger("clear_refine_server")

# stdout → JSON-строка
logger.info("Batch finished", batch_id="abc", status="completed")
# → {"event": "Batch finished", "batch_id": "abc", "status": "completed",
#    "level": "info", "timestamp": "2026-07-04T19:37:01Z"}

# Фронтенд-логи интегрируются с source=frontend:
logger.info("Frontend log", source="frontend", level="error",
            message="ComfyUI connection refused", context={"url": "..."})
```

### 3.3. Эндпоинты логгера
| Метод | Путь | Описание |
|-------|------|----------|
| `GET` | `/api/logs?n=100` | Серверные логи (из LogCapture) |
| `POST` | `/api/logs/frontend` | Принять лог с фронта (debug-mode) |
| `GET` | `/api/logs/frontend` | Прочитать логи фронта |

### 3.4. Результаты эксперимента
- ✅ In-memory массив + POST bridge — работает, 0 ошибок
- ✅ Циклический буфер 300 записей — защита от утечки
- ✅ JSON-логи парсятся без regex (в отличие от текстовых)
- ✅ `?debug=true` — единая хронология фронта+бэка
- ❌ `sessionStorage`/`IndexedDB` — избыточны для прототипа

---

## 4. React без бандлера (проверено, работает)

### 4.1. Два подхода

| Подход | CDN | Открытие | Файлы |
|--------|-----|----------|-------|
| **UMD** (monolithic) | `unpkg.com/react@18/umd/...` | file:// + http:// | 1 HTML + 1 JS |
| **ES modules** | `esm.sh/react@18` + importmap | **только** http:// | 6 отдельных файлов |

### 4.2. State management без внешних библиотек
```javascript
const { createContext, useContext, useReducer } = React;

const StoreCtx = createContext(null);

function reducer(state, action) {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.section]: { ...state[action.section], [action.field]: action.value } };
    case "RESET":
      return { ...structuredClone(DEFAULTS), collapsed: state.collapsed };
  }
}

function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return React.createElement(StoreCtx.Provider, { value: { state, dispatch } }, children);
}
```

### 4.3. Структура модульного прототипа
```
spa/prototype/
├── index.html       ← importmap + entry point
├── main.js          ← mount (ищет #root, guard)
├── store.js         ← Context + useReducer
├── ui.js            ← primitives (Btn, Badge, SliderField, Toggle, InlineEdit)
├── components.js    ← feature components
└── App.js           ← shell + section configs
```

### 4.4. Ключевые UI-примитивы (из ui.js)
- **`Btn`** — кнопка с модификаторами primary/danger/small
- **`Badge`** — цветной ярлык
- **`SliderField`** — ползунок с меткой и значением
- **`Toggle`** — кастомный переключатель
- **`InlineEdit`** — клик по значению → режим редактирования → Enter/Blur/save
- **`Icon`** — emoji-иконки без внешних зависимостей

---

## 5. HTML-документация рядом с модулем

### 5.1. Конвенция
Рядом с каждым модулем может лежать HTML-файл с расширенной документацией:
```
clear_refine.py       ← код + короткий регион-контракт
clear_refine.html     ← Mermaid-диаграммы, схемы, полные контракты
```

**Как агент находит:** в регионе-контракте указание `## Доки: clear_refine.html`.
Агент читает через `read_file` — детерминированно, без HTTP, без CORS.

### 5.2. Mermaid-диаграммы
- `.mmd` — чистый Mermaid-файл, открывается в VS Code (если есть расширение)
- `.html` — HTML с CDN-загрузкой mermaid@11, открывается в браузере
- CDN: `https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js`
- Тёмная тема: `mermaid.initialize({ theme: 'dark', themeVariables: {...} })`

---

## 6. structlog + FastAPI (проверено, работает)

### 6.1. Установка
```bash
pip install structlog
```

### 6.2. Конфигурация
```python
import structlog

structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(indent=None, ensure_ascii=False),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger("my_module")
# Использование: logger.info("Event", key="value", count=5)
```

### 6.3. Миграция с standard logging
Для любого модуля достаточно заменить:
```python
# Было:
import logging
logger = logging.getLogger("name")

# Стало:
import structlog
logger = structlog.get_logger("name")
```

---

## 7. Multi-model AI — субагенты

### 7.1. Доступные модели
Формат имени: `"Model Name (provider)"`, провайдер строчными буквами.
Пример: `GLM-5.2 (zai)`, `DeepSeek V4 Flash`.

### 7.2. Запуск
```javascript
runSubagent({
  agentName: "Explore",       // Explore — read-only, для исследования кода
  model: "GLM-5.2 (zai)",    // дешёвая модель
  description: "3-5 слов",
  prompt: "Детальная инструкция..."
})
```

### 7.3. Наблюдения
- **Explore** на GLM-5.2 успешно справляется с grep-поиском.
- Контекст субагента изолирован — возвращает один ответ.
- Не async — агент ждёт результат синхронно.

---

## 8. Сводка экспериментов

| Технология | Статус | Файлы для примера |
|-----------|--------|-------------------|
| **Semantic markup** (`#region`, `@Purpose`, `GREP_SUMMARY`) | ✅ Работает | `spa/prototype/store.js` |
| **UMD React** (CDN, file://) | ✅ Работает | `spa/prototype-settings.html` |
| **ES modules + importmap** (http://) | ✅ Работает | `spa/prototype/index.html` |
| **Context + useReducer** | ✅ Работает | `spa/prototype/store.js` |
| **Dual logging** (in-memory + structlog) | ✅ Работает | `spa/prototype/logger.js`, `server.py` |
| **structlog JSON** (Python) | ✅ Работает | `server.py`, `clear_refine.py` |
| **Mermaid в HTML** (CDN) | ✅ Работает | `spa/prototype/log-arch.html` |
| **Mermaid .mmd** (VS Code) | ✅ Поддерживается | `spa/prototype/log-arch.mmd` |
| **Playwright page.evaluate()** | ✅ Работает | `spa/prototype/log-test.html` |
| **Субагент на GLM-5.2** | ✅ Работает | Через `runSubagent` |
| **Doxygen-теги** (`## @purpose`) | ❌ Избыточно | Не использовать |
| **IndexedDB для логов** | ❌ Избыточно | Использовать `window.appLogs` |
| **HTML-доки рядом с модулем** | ⏳ Концепт | Пример: `clear_refine.html`
| **Параметры** | ~230B | ~753B |
| **Ключевое преимущество** | Sparse attention новейшего поколения — глубокий контекст, гиперконнекции — чувствительность к внезапным сигналам | SOTA PPO-обучение, огромный объём знаний, Terminal Bench +20%, SWE Bench Pro +10% |
| **Слабость** | Меньше весов — хуже точность в терминальных задачах | Медленнее, дороже (~10x) |
| **Стоимость токенов** | ~10x дешевле | Дорогой, контекст нужно беречь |

### Когда что использовать

| Задача | Кто делает |
|--------|-----------|
| Широкий анализ контекста, навигация по коду, grep/glob | DeepSeek |
| Формирование workflow JSON, архитектура | DeepSeek |
| Сложные bash-команды, отладка терминала | **GLM-5.2** |
| Анализ ошибок ComfyUI, поиск причин падений | DeepSeek собирает данные, GLM анализирует |
| Вопросы "почему так работает" по незнакомым нодам | DeepSeek собирает контекст, GLM отвечает |
| Ревью workflow перед запуском | DeepSeek строит, GLM проверяет |

---

## 2. Как вызывать GLM-5.2 (comfy-consultant)

**Модель в agent config:** `zhipuai/glm-5.2`

Синтаксис:

```
task(subagent_type="comfy-consultant", prompt="подробное описание задачи")
```

### Перед вызовом (делает DeepSeek)

1. Собрать контекст: grep/glob/read нужных файлов
2. Извлечь суть — не отправлять полные файлы
3. Сформулировать чёткий вопрос с собранными данными

### Пример

```
Запрос: Проверь корректность FaceDetailer в workflow.
Контекст из comfyui_setup.md: face parsing pipeline, crop params
Вопрос: Правильны ли guide_size и denoise для pass 1 и pass 2?
```

---

## 3. Стратегия

1. **DeepSeek — дирижёр, GLM — эксперт.** Основная логика у DeepSeek, GLM на узких вопросах.
2. **Экономия контекста GLM.** Не отправлять полные файлы — только выжимку. Токены DeepSeek в 10x дешевле.
3. **Сбор данных — за DeepSeek.** Перед вызовом GLM сделать grep/glob/read. GLM только анализирует.
4. **Ревью.** Готовый workflow отдать GLM на проверку перед финалом.
5. **Terminal-задачи.** Если нужна точная bash-команда или анализ ошибки — делегировать GLM.

### Поток

1. Получить задачу
2. Определить, где нужен GLM
3. Простое — сделать самому
4. Сложное — собрать контекст, вызвать GLM, интегрировать ответ
5. Перед финалом — ревью GLM

---

## 4. Агент: comfy-consultant

- **Файл:** `.kilo/agent/comfy-consultant.md`
- **Модель:** `zhipuai/glm-5.2`
- **Режим:** subagent
- **Права:** read, glob, grep, webfetch, websearch (без edit/write/bash)

### Что умеет
- Читать `comfyui_setup.md`, `face.md`, workflow JSON
- Анализировать ошибки ComfyUI
- Отвечать на вопросы по нодам (INPUT_TYPES, RETURN_TYPES)
- Проверять корректность формата workflow JSON
- Greppить исходники кастомных нод

### Что НЕ умеет
- Писать/редактировать файлы
- Исполнять bash
- Продолжать сессию (каждый вызов — чистый лист)

---

## 5. Резюме

```
Ты (DeepSeek V4 Flash) + GLM-5.2 (comfy-consultant) работаете в паре.

DeepSeek: широкий контекст, sparse attention, гиперконнекции, дёшево.
GLM-5.2: экспертиза, терминальные задачи, SOTA PPO.

Тактика:
- Основную работу делаешь сам.
- Контекст для GLM собираешь заранее (он дорогой).
- Сложные вопросы, отладку и ревью делегируешь.
- Ответ GLM интегрируешь в свою работу сам.
```
