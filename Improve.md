
# Итоговое задание для агента (инженера) по настройке ComfyUI

> **Примечание по конфигурации:** Данное задание адаптировано под нашу систему:
> - Comfy Desktop v0.27.0
> - GPU: NVIDIA RTX 5080 (архитектура Blackwell, аппаратная поддержка NVFP4)
> - PyTorch 2.10.0+cu130 (CUDA 13.0) — поддержка NVFP4 нативная
> - Все модели в `ComfyUI-Shared/models/`
> 
> Оригинальное задание от Gemini составлялось без учёта нашей развёртки и содержало ложные инструкции по установке (обновление PyTorch, выдуманные custom nodes для NVFP4). Данная версия исправлена с учётом реальной конфигурации. Актуальная структура путей — в `comfyui_setup.md`.

## Цель workflow
Пакетная обработка отобранных DiT-изображений (драфтов) из локальной папки. Задача — восстановить высокочастотные микротекстуры (поры кожи, волокна ткани, текстуру материалов), зафиксировав структуру и композицию объектов на 100%.

Пайплайн должен иметь **два альтернативных пути** (выбираются переключателем в зависимости от сложности задачи):
* **Ветка А (SUPIR)** — медленная, но максимально качественная реконструкция для реалистичных портретов и сложных текстур.
* **Ветка B (SDXL CN Tile + USDU)** — быстрая, стабильная и управляемая генерация текстур.

---

### 1. Что должно быть установлено в систему (Custom Nodes)

> **Статус нашей системы:** Comfy Desktop v0.27.0, PyTorch 2.10.0+cu130 (CUDA 13.0), RTX 5080 с поддержкой NVFP4. Обновлять PyTorch НЕ требуется — версия уже актуальная.

Инженеру следует проверить наличие следующих custom nodes через ComfyUI Manager (ComfyUI-Manager → Install Custom Nodes). Если нода отсутствует — установить:

**Требуемые ноды (проверить и при необходимости установить):**
* **`ComfyUI-SUPIR`** (от *kijai*) — для Ветки А
* **`ComfyUI_UltimateSDUpscale`** (от *Coyote-A*) — для Ветки B (тайловый апскейл)
* **`ComfyUI-Advanced-ControlNet`** (от *Kosinkadink*) — для `Apply ControlNet (Advanced)`
* **`comfyui-essentials`** (от *cubiq*) — для `Load Image Batch` и утилит
* **`rgthree-comfy`** — для свитчей и структурирования

**Уже установленные ноды (проверить что присутствуют):**
* `comfyui_controlnet_aux` — препроцессоры ControlNet
* `ComfyUI-Impact-Pack` — FaceDetailer и утилиты
* `ComfyUI-Impact-Subpack` — UltralyticsDetectorProvider

> **Важно об NVFP4:** Специальные конвертеры (вроде `ComfyUI_Kitchen_nvfp4_Converter`) НЕ требуются. Наша система уже поддерживает NVFP4 нативно через PyTorch 2.10.0+cu130. Квантирование происходит автоматически при загрузке моделей в формате NVFP4.

---

### 2. Модели и пути (проверить наличие)

> **Важно:** В нашей системе ComfyUI развернут через Comfy Desktop, все модели хранятся в `Shared/models/`. Пути приведены относительно `C:\Users\LENOVO\AppData\Local\Comfy-Desktop\ComfyUI-Shared\models\`.

Инженеру следует проверить наличие файлов. При отсутствии — скачать и разместить по указанным путям:

1. **Апскейлеры** (в `Shared/models/upscale_models/` — создать папку если отсутствует):
   * `4x_foolhardy_Remacri.safetensors` (лучший для органики, кожи, одежды).
   * `4x-UltraSharp.pth` (лучший для архитектуры, техники, общего контраста).
2. **ControlNet** (в `Shared/models/controlnet/`):
   * `controlnet-tile-sdxl-1.0.safetensors` (версия от *xinsir*).
3. **Чекпоинты (SDXL)** (в `Shared/models/checkpoints/`):
   * `RealVisXL_V5.0_Lightning.safetensors` или `Juggernaut_XL_v9_RunDiffusionPhoto_Lightning.safetensors` (версии Lightning рекомендуются для ускорения процесса рефайна).
4. **LoRA** (в `Shared/models/loras/`):
   * `Detail Tweaker XL` (или `Add More Details XL`).
5. **SUPIR Модели** (согласно гайду `ComfyUI-SUPIR`):
   * `SUPIR-v0Q.ckpt` (лучшая для реализма) в `Shared/models/checkpoints/` (или настроить отдельный путь `Shared/models/supir/` согласно документации ноды).

> **Примечание по NVFP4:** Модели уже могут быть в формате NVFP4 (см. `comfyui_setup.md`). Если используется обычный FP16/BF16 чекпоинт, квантирование в NVFP4 происходит автоматически при загрузке в ComfyUI благодаря PyTorch 2.10.0+cu130. Специальные конвертеры НЕ требуются.

---

### 3. Архитектура и настройка Workflow

Инженер должен собрать схему, состоящую из следующих функциональных блоков.

#### Блок 1. Пакетная загрузка (Batch Loader)
* Использовать ноду **`Load Image Batch`** (из *comfyui-essentials*).
* Настроить путь к папке ввода: `C:\Users\LENOVO\AppData\Local\Comfy-Desktop\ComfyUI-Shared\input\dit_drafts\` (создать папку `dit_drafts` в `Shared\input\`).
* На выходе настроить автоматическое сохранение обработанных файлов через ноду `Save Image` с префиксом `refined_` в папку `ComfyUI-Shared\output\`.

#### Блок 2. Ветка А: Метод SUPIR (Качественный)
Эта ветка используется для сложных текстур (кожа, волосы).
* **Схема:** Исходное изображение $\rightarrow$ Предварительный апскейл в 2 раза моделью `4x_foolhardy_Remacri` $\rightarrow$ Вход `image` в ноду **`SUPIR Sampler`**.
* **Настройки SUPIR Sampler:**
  * Чекпоинт: `RealVisXL` или `Juggernaut XL`.
  * Модель SUPIR: `SUPIR-v0Q.ckpt`.
  * `control_scale_start` и `control_scale_end`: **1.0** (это жестко фиксирует оригинальную структуру).
  * `cfg_scale_start` / `cfg_scale_end`: **4.0** (низкий CFG предотвращает галлюцинации).
  * `denoise`: **1.0** (в SUPIR этот параметр работает в связке с контролем геометрии, оставляем стандартным).
  * `use_tiled_vae`: **True** (для предотвращения Out of Memory на GPU).
  * Положительный промпт: `"high quality, ultra detailed textures, cinematic skin pores, sharp focus"`.

#### Блок 3. Ветка B: Метод SDXL CN Tile + USDU (Быстрый и стабильный)
Идеален для большинства изображений, где важна скорость и предсказуемость.
* **Схема:** Исходный кадр подается в ноду **`Ultimate SD Upscale`**.
* **Параметры Ultimate SD Upscale:**
  * `upscale_model`: `4x_foolhardy_Remacri` или `4x-UltraSharp`.
  * `tile_width` / `tile_height`: **1024** (для корректной работы SDXL).
  * `mask_blur`: **16**.
* **Параметры сэмплера (внутри USDU):**
  * `denoise`: строго **0.22 - 0.26** (тот самый «тихий» режим для инъекции текстур).
  * `steps`: 25–30.
  * Чекпоинт: `RealVisXL` (с подключенной LoRA `Detail Tweaker` на силу **0.6**).
  * Положительный промпт: только описание текстур и качества (`"highly detailed materials, intricate texture, cinematic sharpness, micro-contrast"`), без упоминания объектов.
* **Настройка ControlNet Tile:**
  * Нода **`Apply ControlNet (Advanced)`** подключается к кондиционированию (Positive/Negative).
  * Модель: `controlnet-tile-sdxl-1.0`.
  * `strength` (сила): **0.90** (максимальное удержание геометрии).
  * `start_percent`: 0.0, `end_percent`: 1.0.

#### Блок 4. Переключатель (Switch)
* Инженер должен использовать ноду свитча (например, из пакета `rgthree` или `Easy Use`), чтобы вы могли одним кликом направлять поток изображений либо на **Ветку А (SUPIR)**, либо на **Ветку В (ControlNet Tile)** перед финальным сохранением.

---

## Текущий статус задачи (на 02.07.2026) — ОБНОВЛЕНО

### Custom Nodes (все УСТАНОВЛЕНЫ)

| Пакет | Репозиторий | Статус |
|-------|-------------|--------|
| `ComfyUI-SUPIR` (kijai) | https://github.com/kijai/ComfyUI-SUPIR.git | Установлен. `__init__.py` экспортирует 10 классов. Требуется перезапуск Comfy Desktop. |
| `ComfyUI_UltimateSDUpscale` | https://github.com/ssitu/ComfyUI_UltimateSDUpscale | Установлен (ssitu, форк Coyote-A) |
| `ComfyUI-Advanced-ControlNet` | https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet | Установлен |
| `ComfyUI_essentials` | https://github.com/cubiq/ComfyUI_essentials | Установлен |
| `rgthree-comfy` | https://github.com/rgthree/rgthree-comfy | Установлен |

### Модели (все скачаны)

| Модель | Путь | Размер |
|--------|------|--------|
| SUPIR-v0Q.ckpt | `checkpoints/SUPIR-v0Q.ckpt` | ~5 GB |
| fabledIllusionNSFW_v7Apoapsis | `checkpoints/fabledIllusionNSFW_v7Apoapsis.safetensors` | ~5 GB |
| 4x_Remacri.pth | `upscale_models/4x_Remacri.pth` | ~67 MB |
| 4x-UltraSharp.pth | `upscale_models/4x-UltraSharp.pth` | ~67 MB |
| controlnet-tile-sdxl-1.0 | `controlnet/controlnet-tile-sdxl-1.0.safetensors` | ~2.5 GB |
| add-detail-xl.safetensors (Detail Tweaker XL) | `loras/add-detail-xl.safetensors` | ~228 MB |

### Workflows (созданы 02.07.2026)

| Файл | Описание | Ноды |
|------|----------|------|
| `workflows/img2img_quality_supir.json` | Ветка A: SUPIR Upscale (Legacy). Простая схема: LoadImage → SUPIR_Upscale → SaveImage. Все параметры настроены по спецификации. | 3 |
| `workflows/img2img_quality_tile_usdu.json` | Ветка B: SDXL CN Tile + USDU. Полный пайплайн: CheckpointLoader → LoraLoader (Detail Tweaker) → ControlNet Tile → UltimateSDUpscale → SaveImage. | 10 |

### Директории

| Путь | Статус |
|------|--------|
| `Shared/input/dit_drafts/` | Создана. Сюда помещать DiT-изображения для обработки. |

### Настройки workflow: Ветка B (img2img_quality_tile_usdu.json)

| Параметр | Значение |
|----------|----------|
| Чекпоинт | `fabledIllusionNSFW_v7Apoapsis.safetensors` |
| LoRA | `add-detail-xl.safetensors`, strength=0.6 |
| ControlNet Tile | `controlnet-tile-sdxl-1.0.safetensors`, strength=0.9 |
| Апскейлер | `4x_Remacri.pth` |
| Upscale by | 2.0 |
| Denoise | 0.24 |
| Steps | 25 |
| CFG | 7.0 |
| Sampler | dpmpp_2m_sde / karras |
| Tile W/H | 1024 |
| Промпт (pos) | "highly detailed materials, intricate texture, cinematic sharpness, micro-contrast" |
| Промпт (neg) | "bad quality, blurry, messy, low resolution, artifacts" |
| Префикс выхода | `refined_tile_` |

### Настройки workflow: Ветка A (img2img_quality_supir.json)

| Параметр | Значение |
|----------|----------|
| SUPIR модель | `SUPIR-v0Q.ckpt` |
| SDXL модель | `fabledIllusionNSFW_v7Apoapsis.safetensors` |
| Scale by | 2.0 (предварительный апскейл перед SUPIR) |
| CFG | 4.0 (низкий, предотвращает галлюцинации) |
| Control scale | 1.0 (жёсткая фиксация структуры) |
| Denoise (steps) | 45 |
| Tiled VAE | true |
| Color fix | Wavelet |
| Промпт (pos) | "high quality, ultra detailed textures, cinematic skin pores, sharp focus" |
| Промпт (neg) | "bad quality, blurry, messy" |
| Префикс выхода | `refined_supir_` |

### Что требуется сделать

1. **Перезапустить Comfy Desktop** — после установки новых custom nodes требуется перезагрузка.
2. **Проверить загрузку SUPIR нод** — после перезапуска ошибка "Missing Node Packs: comfyui-supir" должна исчезнуть.
3. **Протестировать Ветку B** — загрузить тестовое изображение в `dit_drafts/`, открыть `img2img_quality_tile_usdu.json`, запустить.
   - Если объекты деформируются — поднять ControlNet strength до 0.95.
   - Если текстур недостаточно — поднять denoise до 0.28.
4. **Протестировать Ветку A** — открыть `img2img_quality_supir.json`, запустить.
   - SUPIR потребует больше времени и ~10-12 GB VRAM.
   - Если нехватка VRAM — включить `use_tiled_sampling` (false→true) или `fp8_unet`.
5. **Создать комбинированный workflow** — соединить обе ветки через rgthree Any Switch при необходимости.

---

### Инструкция для тестирования пайплайна:
1. Загрузите 3 тестовых изображения с DiT в папку ввода.
2. Протестируйте **Ветку B** (ControlNet Tile + USDU). Если при денойзе `0.24` объекты начинают слегка деформироваться (например, меняется форма зрачков или мелких надписей), попросите инженера поднять силу ControlNet до `0.95`. Если текстур недостаточно — поднимите денойз до `0.28`.
3. Сравните результат с **Веткой А** (SUPIR). SUPIR потребует больше времени, но на портретных кадрах он должен показать более естественные поры кожи и волоски без замыливания.

### Приложение. Анализ дополнительных предложений Grok и Claude: с чем согласен, а с чем нет

#### С чем я (автор инструкции Gemini) полностью согласен:
1. **Использование ControlNet Tile (SDXL)**: Это действительно лучший способ заблокировать структурные изменения. Модель `xinsir/controlnet-tile-sdxl-1.0` или `TTPlanet_SDXL_Controlnet_Tile_Realistic` — золотой стандарт для удержания контуров.
2. **Диапазон Denoise 0.20–0.28**: Это критически важное ограничение. Все, что выше 0.30, начнет изменять анатомию и мелкие объекты. Все, что ниже 0.18, почти не добавит новых текстур.
3. **Замена NMKD-Siax на Remacri и UltraSharp**: Модель `4x_foolhardy_Remacri` на голову выше Siax при работе с органикой (кожа, волосы, ткани), а `4x-UltraSharp` идеален для жестких поверхностей (металл, пластик, архитектура).
4. **LoRA «Add More Details»**: Идея Grok добавить детайлер-лора на низком значении (0.5–0.7) отличная. При сверхнизком денойзе (0.23) UNet ленится генерировать текстуры, а эта LoRA форсирует прорисовку микроконтрастов.

#### С чем я НЕ согласен (критические ошибки):
1. **Ошибка Grok: Последовательный пайплайн (SUPIR $\rightarrow$ Ultimate SD Upscale)**. 
   * *Почему это плохо:* Grok предлагает прогнать картинку через тяжелейший SUPIR, а затем сразу запустить поверх него Ultimate SD Upscale. Это избыточно, крайне медленно и приведет к эффекту «перешарпа» (изображение станет неестественно контрастным, с «жареными» пикселями). SUPIR и Ultimate SD Upscale — это самодостаточные тяжелые методы. Их нужно использовать **как две альтернативные ветки** (переключаемые кнопкой/свитчем), но ни в коем случае не последовательно.
2. **Ошибка Claude: Использование SD 1.5 модели для рефайна SDXL/DiT картинок**. 
   * *Почему это плохо:* ZImage Turbo генерирует картинки в высоком разрешении с современной эстетикой (на уровне SDXL/Flux). Если подать этот результат в UNet модели SD 1.5 (даже при денойзе 0.25), диффузия начнет привносить устаревшую пластику, характерную для SD 1.5 (например, типичные лица или особенности освещения). Весь процесс рефайна должен происходить строго на **SDXL** чекпоинтах (`RealVisXL` или `Juggernaut XL`), чтобы сохранить исходную эстетику DiT.

