# ComfyUI Agent Changelog

Изменения, внесённые в окружение ComfyUI агентами. Конфиденциальная информация (имена моделей, LoRA) может находиться только в файлах, исключённых из репозитория через `.gitignore`.

---

## Июль 2026 (продолжение): Quality Improvement Workflow (SUPIR + USDU)

### Установленные Custom Nodes (02.07.2026)

| Папка | Репозиторий | Назначение |
|-------|-------------|-----------|
| `ComfyUI_UltimateSDUpscale` | https://github.com/ssitu/ComfyUI_UltimateSDUpscale | Тайловый апскейл + img2img (ветка B) |
| `ComfyUI-Advanced-ControlNet` | https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet | ControlNet с продвинутым управлением (ветка B) |
| `ComfyUI_essentials` | https://github.com/cubiq/ComfyUI_essentials | Утилиты (ImageResize, ImageBatch, и др.) |
| `rgthree-comfy` | https://github.com/rgthree/rgthree-comfy | Свитчи и структурирование |

### Скачанные модели (02.07.2026)

| Описание | Путь | Размер |
|----------|------|--------|
| ControlNet Tile SDXL (xinsir) | `models/controlnet/controlnet-tile-sdxl-1.0.safetensors` | ~2.5 GB |
| Detail Tweaker XL LoRA | `models/loras/add-detail-xl.safetensors` | ~228 MB |
| 4x-UltraSharp (апскейлер) | `models/upscale_models/4x-UltraSharp.pth` | ~67 MB |

### Созданные/обновлённые workflow

| Файл | Назначение |
|------|-----------|
| `workflows/img2img_quality_supir.json` | Ветка A: SUPIR Legacy (обновлён, исправлен формат для Comfy Desktop) |
| `workflows/img2img_quality_tile_usdu.json` | Ветка B: SDXL CN Tile + UltimateSD Upscale (10 нод) |

### Созданные директории

| Путь | Назначение |
|------|-----------|
| `Shared/input/dit_drafts/` | Входная папка для пакетной обработки DiT-изображений |

### Проверка моделей в upscale_models/

| Файл | Статус |
|------|--------|
| `4x_Remacri.pth` | Уже был |
| `4x-UltraSharp.pth` | Скачан |
| `4x_NMKD-Siax_200k.pth` | Уже был |

### Диагностика ComfyUI-SUPIR

Ноды SUPIR установлены корректно (`__init__.py` экспортирует 10 классов, включая `SUPIR_Upscale`, `SUPIR_sample`, `SUPIR_model_loader_v2` и др.). Требуется перезапуск Comfy Desktop для загрузки. Ошибка "Missing Node Packs" должна исчезнуть после перезапуска, т.к. код пакета корректен.

---

## Июль 2026: Z-Image-Turbo, Flux 2 Klein Base 9B, Rectified Flow Sampling, LoRA Manager

### Установленные Custom Nodes

| Папка | Репозиторий | Назначение |
|-------|-------------|-----------|
| `RES4LYF` | https://github.com/ClownsharkBatwing/RES4LYF.git | Кастомные sampler'ы (`res_2s`, `bong_tangent`) |

### Python-зависимости

| Пакет | Установка |
|-------|-----------|
| `pywavelets` | `pip install pywavelets` (требуется RES4LYF) |

### Установленные модели

| Описание | Путь | Размер |
|----------|------|--------|
| Z-Image-Turbo (bf16) | `models/diffusion_models/z_image_turbo_bf16.safetensors` | ~12.3 GB |
| Z-Image-Turbo (NVFP4) | `models/diffusion_models/z_image_turbo_nvfp4.safetensors` | ~4.3 GB |
| Flux 2 Klein Base 9B (NVFP4) | `models/diffusion_models/flux-2-klein-base-9b-nvfp4.safetensors` | ~5.4 GB |
| Qwen3 4B (FP4 mixed) | `models/text_encoders/qwen_3_4b_fp4_mixed.safetensors` | ~3.5 GB |
| Z-Image VAE | `models/vae/ae.safetensors` | ~335 MB |

### Созданные workflow

| Файл | Назначение |
|------|-----------|
| `workflows/flux2_klein_base9b_test.json` | Flux 2 Klein Base 9B text-to-image, LoraLoader, CFGGuider, res_multistep sampler |

### Известные проблемы

**LoRA Manager кеш:** `comfyui-lora-manager` кеширует список LoRA при старте в SQLite. При добавлении нового `.safetensors` файла кеш НЕ обновляется автоматически. Нужно сбросить кеш:
```
Remove-Item "$env:LOCALAPPDATA\ComfyUI-LoRA-Manager\cache\model\comfyui.sqlite" -Force
```
После сброса и перезапуска ComfyUI сделает полное сканирование.

**CLIPLoaderGGUF для non-GGUF:** Использование `CLIPLoaderGGUF` для safetensors-файлов (например, `qwen3vl_8b_nvfp4.safetensors`) ломает shape attention projection матриц. Ошибка: `mat1 and mat2 shapes cannot be multiplied (366x4096 and 2048x4096)`. Всегда использовать `CLIPLoader` для safetensors, `CLIPLoaderGGUF` — только для `.gguf` файлов.

---

## Июнь 2026: Ideogram 4 (NVFP4), Flux 2 Klein 9B, OpenPose + ControlNet

### Установленные Custom Nodes

| Папка | Репозиторий | Назначение |
|-------|-------------|-----------|
| `ComfyUI-GGUF` | https://github.com/city96/ComfyUI-GGUF.git | Загрузка GGUF text encoder моделей |

### Python-зависимости

| Пакет | Установка |
|-------|-----------|
| `gguf` | `pip install gguf` (требуется ComfyUI-GGUF) |

### Скачанные модели

| Описание | Путь | Размер |
|----------|------|--------|
| Диффузионная модель (conditional) — NVFP4 | `models/diffusion_models/` | ~5.5 GB |
| Диффузионная модель (unconditional) — NVFP4 | `models/diffusion_models/` | ~5.5 GB |
| Текстовый энкодер Qwen3-VL — NVFP4 | `models/text_encoders/` | ~6.3 GB |
| Диффузионная модель Flux 2 — NVFP4 | `models/diffusion_models/` | ~5.4 GB |
| Текстовый энкодер Qwen3-8B (FP4 mixed) | `models/text_encoders/` | ~6.3 GB |
| Текстовый энкодер (GGUF uncensored, abliterated) | `models/text_encoders/` | ~4.7 GB |
| VAE (flux2-vae) | `models/vae/` | ~320 MB |
| ControlNet OpenPose SDXL | `models/controlnet/controlnet-openpose-sdxl.safetensors` | ~2.5 GB |

### Изменения в файлах

| Файл | Изменение |
|------|-----------|
| `folder_paths.py` | Добавлен `.gguf` в `supported_pt_extensions` для отображения GGUF в списках моделей |

### Созданные workflow

| Файл | Назначение |
|------|-----------|
| `workflows/ideogram4_nvfp4_test.json` | Ideogram 4 text-to-image (NVFP4), DualModelGuider, LoraLoader для double-patch |
| `workflows/flux2_klein_nvfp4_test.json` | Flux 2 Klein 9B text-to-image (NVFP4), CLIPLoaderGGUF для uncensored text encoder |
| `workflows/skeleton_pose_extraction.json` | OpenPose skeleton extraction (OpenposePreprocessor) |
| `workflows/skeleton_scene_generation.json` | Scene generation with ControlNet OpenPose SDXL |

### Известные проблемы

**DWPose OpenCV ONNX error:** `cv2.dnn.readNetFromONNX` не может прочитать ONNX-модели DWPose в OpenCV 4.13.0. Временное решение — использовать `OpenposePreprocessor` вместо `DWPreprocessor`.

**GGUF CLIPLoader:** Стандартный `CLIPLoader` не поддерживает GGUF. Необходимо использовать `CLIPLoaderGGUF` из ComfyUI-GGUF или `DualCLIPLoaderGGUF`. Файлы GGUF помещать в `models/text_encoders/` (для видимости в CLIPLoader нужно `.gguf` в `supported_pt_extensions`).

---

## Май 2026: Face Swap Pipeline (faceswap_hybrid_pulid)

---

## 1. Установленные Custom Nodes (git clone)

Все репозитории склонированы в `ComfyUI/custom_nodes/`:

| Папка | Репозиторий | Команда установки |
|-------|-------------|-------------------|
| `ComfyUI-ReActor` | https://github.com/Gourieff/ComfyUI-ReActor.git | `git clone` |
| `ComfyUI-Inpaint-CropAndStitch` | https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch.git | `git clone` |
| `comfyui_face_parsing` | https://github.com/Ryuukeisyou/comfyui_face_parsing.git | `git clone` |
| `PuLID_ComfyUI` | https://github.com/cubiq/PuLID_ComfyUI.git | `git clone` |

Уже были установлены: `ComfyUI-Impact-Pack`, `ComfyUI-Impact-Subpack`, `comfyui_controlnet_aux`, `ComfyUI_IPAdapter_plus`, `ComfyUI_InstantID`.

---

## 2. Python-зависимости (pip install)

Установлены через `.venv\Scripts\python.exe -m pip install`:

**ReActor:** `albumentations`, `albucore`, `simsimd`, `stringzilla`  
**PuLID:** `facexlib`, `ftfy`, `timm`, `numba`, `filterpy`, `llvmlite`  
**face_parsing:** `opencv-contrib-python-headless` (с конфликтом прав на `cv2.pyd`)  
**Общее:** `importlib-metadata` (для fallback `pkg_resources`)

---

## 3. Скачанные модели

| Модель | URL | Путь назначения | Размер |
|--------|-----|-----------------|--------|
| PuLID SDXL | https://huggingface.co/huchenlei/ipadapter_pulid/resolve/main/ip-adapter_pulid_sdxl_fp16.safetensors | `models/pulid/ip-adapter_pulid_sdxl_fp16.safetensors` | 791 MB |
| AntelopeV2 (InsightFace) | https://huggingface.co/MonsterMMORPG/tools/resolve/main/antelopev2.zip | `models/insightface/antelopev2/` (распакован) | 361 MB zip |
| inswapper_128.onnx | https://huggingface.co/datasets/Gourieff/ReActor/resolve/main/models/inswapper_128.onnx | `models/insightface/inswapper_128.onnx` | — |

Face Parsing model (`model.safetensors`, `config.json`, `preprocessor_config.json`) скачивается автоматически при импорте `comfyui_face_parsing`.

---

## 4. Hotfix: `comfyui_face_parsing/__init__.py`

**Файл:** `ComfyUI/custom_nodes/comfyui_face_parsing/__init__.py`  
**Проблема:** `import pkg_resources` — модуль удалён в setuptools 82+ (Python 3.13). Без фикса весь `comfyui_face_parsing` не грузится, ноды `FaceParse`, `FaceParsingModelLoader`, `FaceParsingResultsParser` и др. отсутствуют.

**Фикс (строки 28-34):**
```python
import subprocess
try:
    import pkg_resources
    installed_packages = [pkg.key for pkg in pkg_resources.working_set]
except:
    import importlib.metadata
    installed_packages = [dist.metadata["Name"] for dist in importlib.metadata.distributions()]
```

---

## 5. Workflow JSON: формат для Comfy Desktop v0.25.1

**ВАЖНО:** В Comfy Desktop v0.25.1 формат сериализации workflow отличается от стандартного ComfyUI:

### Правила:
1. **`inputs`** — содержит **только** link-входы (с полем `"link": <id>`).
2. **`widgets_values`** — плоский массив ВСЕХ значений виджетов, в порядке, заданном `INPUT_TYPES` класса ноды.
3. Никакие widget-входы (`"widget": {...}`) **не добавляются** в `inputs`.

### Пример: FaceDetailer
```json
{
  "type": "FaceDetailer",
  "inputs": [
    {"name": "image", "type": "IMAGE", "link": 48},
    {"name": "model", "type": "MODEL", "link": 42},
    {"name": "clip", "type": "CLIP", "link": 43},
    {"name": "vae", "type": "VAE", "link": 44},
    {"name": "positive", "type": "CONDITIONING", "link": 38},
    {"name": "negative", "type": "CONDITIONING", "link": 39},
    {"name": "bbox_detector", "type": "BBOX_DETECTOR", "link": 34}
  ],
  "widgets_values": [
    512.0, true, 1024.0, 0, "randomize", 20, 8.0,
    "dpmpp_2m_sde", "karras",
    0.40, 16, true, true,
    0.5, 10, 3.0,
    "center-1", 0, 0.93, 0, 0.7, "False",
    10, "", 1,
    false, 20, false, false
  ]
}
```

### Количество widget_values для ключевых нод:

| Нода | Link-входов | Widget-значений | Примечание |
|------|------------|-----------------|-----------|
| FaceDetailer | 7 | 29 | 24 required + seed_control + 4 optional |
| KSampler | 4 | 7 | seed + seed_control + steps + cfg + sampler_name + scheduler + denoise |
| ReActorFaceSwap | 2 | 10 (или 11) | console_log_level исключён из-за проблем с типом (int vs string) |
| InpaintCropImproved | 2 (image, mask) | 24 | — |
| ApplyPulid | 6 | 4 | method, weight, start_at, end_at |
| ImageBlur | 1 | 2 | blur_radius (max=31), sigma |
| ImageCompositeMasked | 3 | 3 | x, y, resize_source |
| CLIPTextEncode | 1 | 1 | text |
| CheckpointLoaderSimple | 0 | 1 | ckpt_name |
| VAELoader | 0 | 1 | vae_name |
| LoadImage | 0 | 2 | image, upload |
| SaveImage | 1 | 1 | filename_prefix |

### Порядок widget_values для FaceDetailer (29 значений):
```
[0]  guide_size              (float)
[1]  guide_size_for          (bool)
[2]  max_size                (float)
[3]  seed                    (int)
[4]  seed_control            (str: "fixed"|"randomize"|"increment"|"decrement")
[5]  steps                   (int)
[6]  cfg                     (float)
[7]  sampler_name            (str)
[8]  scheduler               (str)
[9]  denoise                 (float)
[10] feather                 (int)
[11] noise_mask              (bool)
[12] force_inpaint           (bool)
[13] bbox_threshold          (float)
[14] bbox_dilation           (int)
[15] bbox_crop_factor        (float)
[16] sam_detection_hint      (str)
[17] sam_dilation            (int)
[18] sam_threshold           (float)
[19] sam_bbox_expansion      (int)
[20] sam_mask_hint_threshold (float)
[21] sam_mask_hint_use_negative (str: "False"|"Small"|"Outter")
[22] drop_size               (int)
[23] wildcard                (str)
[24] cycle                   (int)
[25] inpaint_model           (bool, optional)
[26] noise_mask_feather      (int, optional)
[27] tiled_encode            (bool, optional)
[28] tiled_decode            (bool, optional)
```

---

## 6. Известные проблемы

### ReActorFaceSwap: `console_log_level`

Ошибка: `Value not in list: console_log_level: '1' not in [0, 1, 2]`

Причина: COMBO `[0, 1, 2]` содержит integers, но ComfyUI v0.25.1 загружает значение как строку. Сравнение `'1' in [0, 1, 2]` возвращает `False`.

Временное решение: удалить последний элемент из `widgets_values` ReActor (10 значений вместо 11). Значение по умолчанию `1` подставляется автоматически.

Если нода начнёт ругаться на нехватку значений — добавить `1` обратно как int.

### ImageBlur: blur_radius ≤ 31

`blur_radius` ограничен максимальным значением 31. В документации face.md указано 35 — при генерации workflow значение приведено к 31.

---

## 7. Пути к файлам

| Файл | Путь |
|------|------|
| Workflow JSON (основной) | `ComfyUI\workflows\faceswap_hybrid_pulid.json` |
| Workflow JSON (UI saved) | `ComfyUI\user\default\workflows\faceswap_hybrid_pulid.json` |
| Документация по setup | `C:\Projects\AIC\comfyui_setup.md` |
| Задание на workflow | `C:\Projects\AIC\face.md` |
| Workflow: Ideogram 4 | `ComfyUI\workflows\ideogram4_nvfp4_test.json` |
| Workflow: Flux 2 Klein | `ComfyUI\workflows\flux2_klein_nvfp4_test.json` |
| Workflow: Pose Extraction | `ComfyUI\workflows\skeleton_pose_extraction.json` |
| Workflow: Scene Generation | `ComfyUI\workflows\skeleton_scene_generation.json` |
| Workflow: Flux 2 Klein Base 9B | `ComfyUI\workflows\flux2_klein_base9b_test.json` |
| Документация по setup (обновлённая) | `C:\Projects\AIC\comfyui_setup.md` |
