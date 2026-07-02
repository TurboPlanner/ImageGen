# Session Context — July 2026

> Сохранённый контекст для продолжения работы в свежей сессии.
> Читай перед началом работы, чтобы восстановить состояние.

---

## 1. ComfyUI

- **Версия:** v0.27.0
- **Ядро:** `C:\Users\LENOVO\AppData\Local\Comfy-Desktop\ComfyUI-Installs\С1\ComfyUI\`
- **Venv:** `...\.venv\` (Python 3.13.12, PyTorch 2.10.0+cu130)
- **Shared models:** `C:\Users\LENOVO\AppData\Local\Comfy-Desktop\ComfyUI-Shared\models\`

### Модели в diffusion_models/
- `ideogram4_nvfp4_mixed.safetensors` — Ideogram 4 conditional
- `ideogram4_unconditional_nvfp4_mixed.safetensors` — Ideogram 4 unconditional
- `flux-2-klein-9b-nvfp4.safetensors` — Flux 2 Klein 9B distilled
- `flux-2-klein-base-9b-nvfp4.safetensors` — Flux 2 Klein 9B base
- `z_image_turbo_bf16.safetensors` — Z-Image-Turbo (bf16)
- `z_image_turbo_nvfp4.safetensors` — Z-Image-Turbo (NVFP4)
- `lustify-sdxl.safetensors` — Lustify SDXL
- `wan2.1_t2v_1.3B_fp16.safetensors` — WAN video

### Ключевые нюансы

**LoRA Manager кеширует список при старте.** После добавления нового `.safetensors` в `Shared/models/loras/`:
```
Remove-Item "$env:LOCALAPPDATA\ComfyUI-LoRA-Manager\cache\model\comfyui.sqlite" -Force
```
И перезапустить ComfyUI. Иначе LoRA не появится в списке.

**CLIPLoaderGGUF только для GGUF.** Не использовать `CLIPLoaderGGUF` для safetensors. Ошибка: `mat1 and mat2 shapes cannot be multiplied (366x4096 and 2048x4096)`.

## 2. Рабочие модели и их настройки

### Z-Image-Turbo (flow matching)

| Режим | CLIP | Scheduler | Sampler | Steps | CFG | Shift |
|-------|------|-----------|---------|-------|-----|-------|
| Speed | Qwen3-8B, type `lumina2` | `simple` + `ModelSamplingAuraFlow` | `res_multistep` | 8 | 1.0 | 3.0 |
| Quality | Qwen3-8B, type `lumina2` | `Capitan Shift` | `capitan_flowmatch` | 36 | 2.0 | 6.0 |

Chain: `UNETLoader → ModelSamplingAuraFlow(shift=3.0) → KSampler(res_multistep, simple, steps=8, CFG=1.0) → VAEDecode`

### Ideogram 4

Chain: `UNETLoader(cond) + UNETLoader(uncond) → LoraLoader(cond) + LoraLoader(uncond) → DualModelGuider(cfg=5-7) → SamplerCustomAdvanced → VAEDecode`
CLIP: `qwen3vl_8b_nvfp4`, type `ideogram4`
Scheduler: `Ideogram4Scheduler(steps=20, mu=0.5, std=1.75)` + `ExtendIntermediateSigmas` (для обхода safety filter)
Sampler: `euler` (подходит, модель не rectified flow, а logit-normal diffusion)

### Flux 2 Klein 9B Base

Chain: `UNETLoader → LoraLoader → CFGGuider(cfg=4.0) → SamplerCustomAdvanced → VAEDecode`
CLIP: `qwen_3_8b_fp4mixed`, type `flux2` (через CLIPLoader, НЕ GGUF)
Scheduler: `Flux2Scheduler(steps=25, shift=3.0, timestep_type=linear)`
Sampler: `res_multistep`

### Flux 2 Klein 9B Distilled

Chain та же, но CLIP через `CLIPLoaderGGUF` + `flux2-klein-9b-uncensored-q4_k_m.gguf`
Steps=4, CFG=1.0–1.5, Euler + Simple

## 3. Workflow файлы

| Файл | Описание |
|------|----------|
| `workflows/ideogram4_nvfp4_test.json` | Ideogram 4 + LoRA double-patch |
| `workflows/flux2_klein_base9b_test.json` | Flux 2 Klein 9B base + LoRA |
| `workflows/flux2_klein_nvfp4_test.json` | Flux 2 Klein 9B distilled (если существует) |
| `workflows/skeleton_pose_extraction.json` | OpenPose извлечение |
| `workflows/skeleton_scene_generation.json` | SDXL + OpenPose ControlNet |
| `workflows/faceswap_hybrid_pulid.json` | FaceSwap pipeline |

## 4. Установленные Custom Nodes

| Папка | Назначение |
|-------|-----------|
| `ComfyUI_IPAdapter_plus` | IPAdapter + FaceID |
| `comfyui_controlnet_aux` | ControlNet preprocessors |
| `ComfyUI_InstantID` | InstantID |
| `ComfyUI-Impact-Pack` | FaceDetailer, SEGS |
| `ComfyUI-Impact-Subpack` | YOLO detector |
| `ComfyUI-ReActor` | Face swap |
| `ComfyUI-Inpaint-CropAndStitch` | Inpaint crop |
| `comfyui_face_parsing` | Face parsing mask |
| `PuLID_ComfyUI` | PuLID |
| `ComfyUI-GGUF` | GGUF загрузка |
| `comfyui-lora-manager` | LoRA менеджер (кеширует список!) |
| `RES4LYF` | Sampler'ы: `res_2s`, `bong_tangent` |

## 5. Что было сделано в этой сессии

- Перемещены модели: `z_image_turbo_bf16`, `z_image_turbo_nvfp4`, `flux-2-klein-base-9b-nvfp4`, `ae.safetensors`
- Перемещены LoRAs: zCole, ZDog, zPen, zPen2, ZMaleForetea, zBrush, zRope, zLazyDog, zMachv1, zTwin_v3, zHood, zGag_ZIB, KLEIN-Unchained-V2, zMystic, zPenHelp, zTaw
- Исправлен Ideogram 4 workflow — заменён `CLIPLoaderGGUF` обратно на `CLIPLoader`
- Установлен `RES4LYF` (git clone + pip install pywavelets)
- Создан `flux2_klein_base9b_test.json`
- Найдены оптимальные sampler/scheduler для flow matching моделей
- Обновлены `comfyui_setup.md`, `comfyui_changelog.md`

## 6. TODO / Известные проблемы

- LoRA Manager кеш нужно сбрасывать вручную при каждом добавлении LoRA
- DWPose OpenCV ONNX не работает — использовать OpenposePreprocessor
- При ошибке `mat1 and mat2 shapes cannot be multiplied` — проверить CLIP (нужен правильный type и файл)
