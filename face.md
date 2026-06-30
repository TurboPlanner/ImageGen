# Инструкция агенту: Построение SDXL Face Swap Workflow (ReActor -> Face Parsing -> Inpaint Crop & Stitch -> PuLID -> Dual FaceDetailer)

## 📌 Архитектура пайплайна и важные технические дисклеймеры

1. **Pixel Layer vs. Latent Layer:** Узел `ReActorFaceSwap` работает исключительно на уровне пикселей (2D-картинка). Он используется как препроцессор на самом первом шаге, чтобы создать правильную геометрическую и анатомическую «подложку» (положение глаз, носа, рта). Он НЕ подключается напрямую к UNet или диффузионным латентам.
2. **Фиксация базы для Stitch:** Чтобы избежать микро-сдвигов пикселей и швов на стыках маски, выходное изображение из `ReActorFaceSwap` должно использоваться в качестве основы (`base_image` / `stitch`) на этапе финального склеивания в узле `InpaintStitch`.
3. **Целевая платформа — SDXL:** Данный workflow спроектирован строго под SDXL. Использование моделей или нод для Flux в данном пайплайне недопустимо.

---

## 📦 Шаг 1: Установка расширений (Custom Nodes)

Установлены через `git clone` в `ComfyUI/custom_nodes/`:

| Системное имя расширения | Назначение | Примечание |
|---|---|---|
| `ComfyUI-Impact-Pack` | Работа с SEGS, масками, детекторами, FaceDetailer | Уже был |
| `ComfyUI-Impact-Subpack` | UltralyticsDetectorProvider (face_yolov8m.pt) | Уже был |
| `comfyui-reactor` (удалён) | Дубликат ReActor от Manager | Удалён, остался только `ComfyUI-ReActor` |
| `ComfyUI-ReActor` | Primary face swap (InsightFace-based) | git clone |
| `ComfyUI-Inpaint-CropAndStitch` | Локальный кроп лица 1024×1024 и обратное сшивание | git clone |
| `comfyui_face_parsing` | Высокоточное позонное маскирование лица | git clone + hotfix __init__.py |
| `PuLID_ComfyUI` | Наложение идентичности (cubiq) | git clone |
| `ComfyUI_IPAdapter_plus` | IPAdapter + FaceID | Уже был |
| `comfyui_controlnet_aux` | ControlNet препроцессоры | Уже был |
| `ComfyUI_InstantID` | Альтернативный face ID | Уже был |

---

## 📁 Шаг 2: Модели и пути их размещения (Для SDXL)

| Файл | URL | Путь | Размер |
|------|-----|------|--------|
| PuLID SDXL | https://huggingface.co/huchenlei/ipadapter_pulid/resolve/main/ip-adapter_pulid_sdxl_fp16.safetensors | `models/pulid/ip-adapter_pulid_sdxl_fp16.safetensors` | 791 MB |
| AntelopeV2 | https://huggingface.co/MonsterMMORPG/tools/resolve/main/antelopev2.zip | `models/insightface/models/antelopev2/` | zip 361 MB |
| inswapper_128.onnx | https://huggingface.co/datasets/Gourieff/ReActor/resolve/main/models/inswapper_128.onnx | `models/insightface/inswapper_128.onnx` | 554 MB |
| VAE | — | `models/vae/lustify-sdxl-vae.safetensors` | — |
| BBOX детектор | — | `models/ultralytics/bbox/face_yolov8m.pt` | — |
| GFPGANv1.3 | — | `models/facerestore_models/GFPGANv1.3.pth` | 348 MB |
| Face Parsing | HuggingFace авто | `models/face_parsing/` | — |

### ВАЖНО: InsightFace AntelopeV2
`FaceAnalysis(name="antelopev2", root=INSIGHTFACE_DIR)` ищет модели в `{root}/models/antelopev2/` (добавляет `models/` через `ensure_available('models', name, root)`).
Правильный путь: `models/insightface/models/antelopev2/`
Файлы: `1k3d68.onnx`, `2d106det.onnx`, `genderage.onnx`, `glintr100.onnx`, `scrfd_10g_bnkps.onnx`

### ⚠️ Битые / недокачанные модели
В процессе работы несколько моделей оказались битыми (недокачались из-за сети/антивируса):
- `GFPGANv1.4.pth` (41 MB вместо ~340 MB) — удалён, заменён на `GFPGANv1.3.pth`
- `vit-base-nsfw-detector` (model.safetensors) — удалён, NSFW-детекция отключена в коде
- `inswapper_128.onnx` — удалён, скачан заново с ONNX-валидацией (554 MB)

---

## 🔧 Шаг 3: Построение графа (Wiring & Node Connections)

> **Формат JSON для Comfy Desktop v0.25.1+/v0.26.2:**
> - `inputs` — только link-входы (с `"link": <id>`). **Никаких widget-входов** в массиве inputs.
> - `widgets_values` — плоский массив ВСЕХ значений виджетов, в порядке INPUT_TYPES класса ноды.
> - См. `comfyui_changelog.md` для полной таблицы.

### Блок A: Пиксельная подложка (ReActor)
1. Создать `LoadImage` (Target) — оригинальное фото.
2. Создать `LoadImage` (Reference) — фото лица, которое переносим.
3. Создать узел **`ReActorFaceSwap`**:
   * `input_image` -> `IMAGE` из Target.
   * `source_image` -> `IMAGE` из Reference.
   * Параметры: `swap_model` = "inswapper_128.onnx", `face_restore_model` = "GFPGANv1.3.pth" (v1.4 бит, не использовать), `console_log_level` = 1.
   * ВАЖНО: GFPGANv1.4.pth повреждён. Использовать GFPGANv1.3.pth.

### Блок B: Создание хирургической маски (Face Parsing)
1. Создать узел **`FaceParsingModelLoader(FaceParsing)`** (загружает модель бинарного парсинга).
2. Создать узел **`FaceParsingProcessorLoader(FaceParsing)`** (обязателен для FaceParse).
3. Создать узел **`FaceParse(FaceParsing)`**:
   * `image` -> с выхода ReActorFaceSwap.
   * `model` -> с выхода FaceParsingModelLoader.
   * `processor` -> с выхода FaceParsingProcessorLoader.
4. Создать узел **`FaceParsingResultsParser(FaceParsing)`**:
   * Выставить флаги: `skin`, `nose`, `r_eye`, `l_eye`, `r_brow`, `l_brow`, `r_ear`, `l_ear`, `mouth`, `u_lip`, `l_lip` = True.
   * Все остальные (background, eye_g, hair, hat, ear_r, neck_l, neck, cloth) = False.
5. Сглаживание:
   * **`ImpactDilateMask`**: dilation = 6.
   * **`ImpactGaussianBlurMask`**: kernel_size = 10, sigma = 10.0.

### Блок C: Хирургический Crop лица
1. Создать узел **`InpaintCropImproved`**:
   * `image` -> с выхода ReActorFaceSwap.
   * `mask` -> сглаженная маска из Блока B.
   * Параметры: `output_resize_to_target_size` = True, `output_target_width` = 1024, `output_target_height` = 1024, `output_padding` = "32", `mask_blend_pixels` = 16.

### Блок D: "Затирка" исходных черт лица (Aggressive Eraser)
1. Создать узел **`ImageBlur`**:
   * `image` -> cropped_image из Блока C.
   * `blur_radius` = 31 (макс. значение, в документации 35).
2. Создать узел **`ImageCompositeMasked`**:
   * `destination` -> cropped_image из Блока C.
   * `source` -> размытое изображение.
   * `mask` -> cropped_mask из Блока C.
   * Результат: изображение с размытым лицом для инпейнта.

### Блок E: Кондиционирование PuLID для SDXL
1. Создать **`CheckpointLoaderSimple`** (SDXL checkpoint).
2. Создать **`VAELoader`** (выбрать `lustify-sdxl-vae.safetensors`).
3. Создать лоадеры PuLID:
   * **`PulidModelLoader`** (выбрать `ip-adapter_pulid_sdxl_fp16.safetensors`).
   * **`PulidInsightFaceLoader`** (provider = "CUDA", НЕ имя модели).
   * **`PulidEvaClipLoader`** (авто).
4. Создать узел **`ApplyPulid`**:
   * `attn_mask` -> cropped_mask из Блока C **(критически важно)**.
   * `method` = "fidelity", `weight` = 0.80, `start_at` = 0.0, `end_at` = 0.85.

### Блок F: Сэмплирование и Обратная склейка (KSampler & InpaintStitch)
1. **`VAEEncodeForInpaint`**: pixels = erased_cropped_image, mask = cropped_mask, vae = VAELoader, grow_mask_by = 6.
2. **`KSampler`**: denoise = 0.70, steps = 30, cfg = 6.0, sampler_name = "dpmpp_2m_sde", scheduler = "karras".
3. **`VAEDecode`** → **`InpaintStitchImproved`** (stitcher + inpainted_image).

### Блок G: Финальный двухпроходной блендинг и детализация (Dual-Pass FaceDetailer)
1. **`UltralyticsDetectorProvider`**: `bbox/face_yolov8m.pt` (один на оба FaceDetailer).
2. **FaceDetailer Pass 1**: guide_size=512, denoise=0.40, feather=16, force_inpaint=True.
3. **FaceDetailer Pass 2**: guide_size=768, denoise=0.25, feather=8, force_inpaint=True.
4. Оба используют оригинальную (не-PuLID) модель из CheckpointLoaderSimple.

---

## 🛠 Шаг 4: Известные проблемы и hotfixes

### 1. comfyui_face_parsing не грузится
**Причина:** `import pkg_resources` — модуль удалён в setuptools 82+ (Python 3.13).
**Фикс:** замена на `try: import pkg_resources... except: import importlib.metadata`.
**Файл:** `custom_nodes/comfyui_face_parsing/__init__.py`

### 2. Дубликат ReActor
**Причина:** два установленных пакета: `comfyui-reactor-node` (Manager) и `ComfyUI-ReActor` (git clone).
**Фикс:** удалён `comfyui-reactor-node`.
**Симптом:** `console_log_level: '1' not in [0, 1, 2]` — путаница регистрации нод.

### 3. NSFW-детекция (битая модель)
**Причина:** `model.safetensors` в `nsfw_detector/vit-base-nsfw-detector/` недокачан (277 MB битый).
**Фикс:** `nsfw_image()` в `scripts/reactor_sfw.py` заменён на `return False`.

### 4. Формат widgets_values
**Причина:** Comfy Desktop v0.25.1+ требует особый формат JSON: `inputs` только link-входы, `widgets_values` — плоский массив.
**Симптом:** все виджеты FaceDetailer съезжали на соседние поля.
**Справка:** `comfyui_changelog.md` → раздел 5.

### 5. ReActor console_log_level
**Причина:** COMBO `[0, 1, 2]` с int, но загрузка как string.
**Фикс:** значение `1` (int) в widgets_values.

---

## ⚙️ Шаг 5: Инструкция по ревью для GLM-5.2 (comfy-consultant)

При отправке на ревью в `task(subagent_type="comfy-consultant", prompt="...")` включи следующее:

### Контекст для ревью
- `comfyui_setup.md` — окружение, установленные ноды, модели
- `face.md` (этот файл) — полная архитектура
- `comfyui_changelog.md` — hotfixes, формат JSON
- `agent_workflow_guide.md` — как работают агенты
- `workflows/faceswap_hybrid_pulid.json` — готовый workflow
- Лог ошибок ComfyUI при запуске (если есть)

### Что проверять
- Соответствие node type names реальным NODE_CLASS_MAPPINGS
- Корректный формат JSON (inputs = только link, widgets_values = плоский)
- Все widget_values по порядку INPUT_TYPES класса ноды
- Seed имеет extra-значение control_after_generate ("randomize"/"fixed")
- FaceDetailer: 29 значений wv (включая seed_control + 4 optional)
- Модели: правильные имена файлов, не битые, расположены верно

### Tavily web search reminder
**ВАЖНО:** Всегда используй Tavily для проверки актуальной информации:
- Совместимость версий нод с ComfyUI v0.26.2
- Баги в новых версиях custom nodes
- Альтернативные модели и пути
- Изменения в API формата workflow JSON
- Известные проблемы с onnxruntime, safetensors, insightface

---

## ⚙️ Шаг 6: Руководство по решению проблем (Troubleshooting)

| Проблема | Решение |
|----------|---------|
| Тон кожи лица отличается от шеи | Добавить `ColorMatch` после VAEDecode перед InpaintStitch |
| Лицо "пластиковое" | Снизить weight ApplyPulid до 0.70-0.75 или end_at до 0.70 |
| Черты похожи на оригинал | Увеличить denoise KSampler до 0.75-0.80 |
| safetensors Rust error (corrupted file) | Удалить битый safetensors/onnx и перекачать |
| AssertionError: detection not in models | AntelopeV2 лежит не в том пути: нужно `models/insightface/models/antelopev2/` |
| ProviderModelNotFoundError (agent) | Неверное имя провайдера: `zhipuai/glm-5.2` |
