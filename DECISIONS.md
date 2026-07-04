# Architectural Decisions

Лог ключевых решений, принятых в процессе экспериментов.

---

## 2026-07-04: Семантическая разметка для AI-агентов

### Решение
Принят единый шаблон семантической разметки для JS-файлов:

```
//#region CONTRACT — filename [DOMAIN(x):...; CONCEPT(x):...; TECH(x):...]
/** @Purpose, @Rationale, @See, @Structure */
//#endregion CONTRACT
// GREP_SUMMARY: keywords...

//#region ComponentName [DOMAIN(x):...; ...]
/** @Purpose Одна строка — цель компонента. */
export function ComponentName(...) { ... }
//#endregion ComponentName
```

### Rationale
- `DOMAIN/CONCEPT/TECH` в region-тегах — cheap tokens для sparse attention.
  Без них вероятность попадания в Top-K при semantic search резко падает.
- `@Purpose` фиксирует **цель** (alignment), а не пересказ кода.
  Агент читает код так же легко как текст — дублировать не нужно.
- `@Rationale` — скрытый контекст, защита от разрушительного рефакторинга.
  Почему выбран `structuredClone`, почему `SET_COLLAPSED` вне `RESET` и т.д.
- `// GREP_SUMMARY:` вынесен за пределы `#region`, чтобы grep находил
  строку сразу (не заходя в блок). Возвращает: filename + line + keywords.
- `#region` / `#endregion` совместимы с VS Code folding (JS: `//#region`).

### Альтернативы, которые не прошли
- **Doxygen-теги** (`## @purpose`, `## @param`) — избыточны для LLM,
  не дают преимущества перед плоским текстом.
- **JSDoc только** — не даёт folding-навигации в IDE.
- **Одна монолитная шапка** — перегрузка контекста, слабая связь
  с конкретными функциями.

---

## 2026-07-04: Dual logging (Frontend + Backend)

### Решение
Двухуровневая система логирования:

1. **Фронтенд**: `window.appLogs[]` — циклический буфер на 300 записей.
   Доступ через `window.logger.getAll()`.
2. **Бекенд**: `structlog` — JSON-логи в stdout.
3. **Debug-режим** (`?debug=true`): фронт дублирует логи на бекенд
   через `POST /api/logs/frontend`.
4. **Playwright extraction**: `page.evaluate("() => window.logger.getAll()")`
   — без парсинга DOM, полный массив объектов.

### Rationale
- In-memory массив вместо IndexedDB/SQLite — минимальная сложность,
  максимальная совместимость с Playwright.
- Циклический буфер на 300 записей — защита от утечки памяти
  при длительных сессиях.
- Debug-режим через `?debug=true` — единая хронология фронта и бэка
  в JSON-логах сервера, помеченные `source=frontend`.
- structlog выдаёт JSON, а не текст — агенту не нужен regex для парсинга.

### Уровни логов
- `window.appLogs` — всегда (все уровни)
- `console.log` — всегда
- `POST /api/logs/frontend` — только при `?debug=true`

---

## 2026-07-04: Модульная структура React без бандлера

### Решение
ES modules + importmap:

```html
<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@18",
    "react-dom": "https://esm.sh/react-dom@18"
  }
}
</script>
<script type="module" src="main.js"></script>
```

### Структура
```
spa/prototype/
├── index.html       ← importmap + entry point
├── main.js          ← mount
├── store.js         ← Context + useReducer (state)
├── ui.js            ← primitives (Btn, Badge, Slider, Toggle, InlineEdit)
├── components.js    ← feature components (PipelineBar, ConfigCard, ...)
└── App.js           ← shell + section configs
```

### Rationale
- ES modules работают только через HTTP (не file://) из-за CORS.
- Для file:// остаётся UMD-версия (`spa/prototype-settings.html`).
- Context + useReducer покрывает 95% сценариев управления состоянием
  без внешних библиотек (Zustand/Redux).
- Разделение на store / ui / components / App — каждый модуль
  имеет одну ответственность.

---

## 2026-07-04: HTML-документация рядом с модулем

### Решение
Помимо inline-разметки, расширенная документация хранится
в HTML-файле рядом с модулем:

```
clear_refine.py       ← код + регион-контракт
clear_refine.html     ← расширенное описание (Mermaid, схемы, контракты)
```

### Rationale
- `read_file` для HTML — детерминированно, без HTTP, без CORS.
- HTML токенизируется плотнее Markdown (`<div>` = 1 токен).
- Один файл для людей и для AI-агентов.
- Ссылка из контракта в коде: `## Доки: clear_refine.html`.

---

## 2026-07-04: WYSIWYG-цикл через встроенный браузер

### Решение
VS Code Embedded Browser (Playwright) используется для интерактивного
прототипирования:

1. Агент создаёт/изменяет UI
2. Пользователь открывает в браузере
3. Клик по элементу → attachment с HTML-путью, стилями, контентом
4. Агент правит исходный код

### Поддерживаемые стеки
- React 18 UMD CDN (file:// + сервер)
- React 18 ES modules (только сервер)
- Alpine.js, Preact, Vue 3, Lit, Vanilla JS — все через CDN

### Ограничения
- ES modules не работают на file:// (CORS).
- fetch к localhost блокирован с file://.
- Скриншоты видит пользователь, агент — только accessibility snapshot.
