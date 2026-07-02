# ComfyUI Configuration & Workflow Guide

> **Приватность:** Конфиденциальная информация (имена конкретных моделей, LoRA, чекпоинтов) может находиться только в файлах, исключённых из репозитория через `.kilo/.gitignore`. В данной документации указаны только технические/публичные имена файлов, необходимые для воспроизведения архитектуры (например, `controlnet-openpose-sdxl.safetensors`).

## Installation Overview

- **Type:** Comfy Desktop (Electron standalone)
- **Version:** v0.27.0
- **Python:** 3.13.12 (bundled standalone-env)
- **PyTorch:** 2.10.0+cu130 (CUDA 13.0)
- **GPU:** NVIDIA RTX 5080 (external box)
- **Package manager:** uv 0.11.11 (in `.venv`)

## Directory Structure

### Core paths

| Purpose | Path |
|---------|------|
| ComfyUI root | `C:\Users\LENOVO\AppData\Local\Comfy-Desktop\ComfyUI-Installs\С1\ComfyUI\` |
| Virtual environment | `C:\Users\LENOVO\AppData\Local\Comfy-Desktop\ComfyUI-Installs\С1\ComfyUI\.venv\` |
| Shared models | `C:\Users\LENOVO\AppData\Local\Comfy-Desktop\ComfyUI-Shared\models\` |
| Shared input | `C:\Users\LENOVO\AppData\Local\Comfy-Desktop\ComfyUI-Shared\input\` |
| Shared output | `C:\Users\LENOVO\AppData\Local\Comfy-Desktop\ComfyUI-Shared\output\` |
| Workflow JSONs | `C:\Users\LENOVO\AppData\Local\Comfy-Desktop\ComfyUI-Installs\С1\ComfyUI\workflows\` |
| Saved workflows (UI) | `C:\Users\LENOVO\AppData\Local\Comfy-Desktop\ComfyUI-Installs\С1\ComfyUI\user\default\workflows\` |
| Download cache | `C:\Users\LENOVO\AppData\Local\Comfy-Desktop\ComfyUI-Cache\download-cache\` |
| Comfy Desktop config | `C:\Users\LENOVO\AppData\Roaming\Comfy Desktop\` |
| ComfyUI settings | `C:\Users\LENOVO\AppData\Local\Comfy-Desktop\ComfyUI-Installs\С1\ComfyUI\user\default\comfy.settings.json` |
| Manager config | `C:\Users\LENOVO\AppData\Local\Comfy-Desktop\ComfyUI-Installs\С1\ComfyUI\user\__manager\config.ini` |

### Model directories

| Folder | Content | Size |
|--------|---------|------|
| `diffusion_models/` | UNET/DiT models (SDXL, Ideogram 4, Flux 2 Klein, Z-Image-Turbo, WAN, NVFP4 quantized) | ~5-12 GB each |
| `checkpoints/` | Single-file checkpoints | — |
| `text_encoders/` | CLIP variants (SDXL CLIP-L/G, Qwen3, Mistral, UMT5) | 0.25–6.5 GB |
| `vae/` | VAE decoders (SDXL, Flux 2) | 167–335 MB |
| `clip_vision/` | CLIP Vision ViT-H for IPAdapter | 3.9 GB |
| `ipadapter/` | IPAdapter models for FaceID | ~1.4 GB |
| `loras/` | LoRA adapters | — |
| `controlnet/` | ControlNet SDXL models (Canny, Depth, OpenPose) | ~2.5 GB each |
| `diffusers/` | Full diffusers-format models | configs |
| `insightface/` | Face detection models | ~288 MB |

### Diffusion models installed

| File | Description | Size |
|------|-------------|------|
| `ideogram4_nvfp4_mixed.safetensors` | Ideogram 4 conditional (NVFP4) | ~5.5 GB |
| `ideogram4_unconditional_nvfp4_mixed.safetensors` | Ideogram 4 unconditional (NVFP4) | ~5.5 GB |
| `flux-2-klein-9b-nvfp4.safetensors` | Flux 2 Klein 9B distilled (NVFP4) | ~5.4 GB |
| `flux-2-klein-base-9b-nvfp4.safetensors` | Flux 2 Klein 9B base (NVFP4) | ~5.4 GB |
| `z_image_turbo_bf16.safetensors` | Z-Image-Turbo (bf16) | ~12.3 GB |
| `z_image_turbo_nvfp4.safetensors` | Z-Image-Turbo (NVFP4) | ~4.3 GB |
| `lustify-sdxl.safetensors` | Lustify SDXL finetune | ~5 GB |
| `wan2.1_t2v_1.3B_fp16.safetensors` | WAN 2.1 text-to-video | ~2.4 GB |

### Checkpoints installed

| File | Description |
|------|-------------|
| `sd_xl_base_1.0.safetensors` | SDXL 1.0 base |
| `illustriousXL_v01.safetensors` | Illustrious XL |
| `veritasXL_v20NAIXLEPS.safetensors` | Veritas XL |
| `perfectionCinematicILXL_31.safetensors` | Perfection Cinematic ILXL |
| `fabledIllusionNSFW_v7Apoapsis.safetensors` | Fabled Illusion NSFW |

### Text encoders installed

| File | Description | Used by |
|------|-------------|---------|
| `qwen3vl_8b_nvfp4.safetensors` | Qwen3-VL 8B (NVFP4) | Ideogram 4 |
| `qwen_3_8b_fp4mixed.safetensors` | Qwen3 8B (FP4 mixed) | Flux 2 Klein (base) |
| `qwen_3_4b_fp4_mixed.safetensors` | Qwen3 4B (FP4 mixed) | — |
| `flux2-klein-9b-uncensored-q4_k_m.gguf` | Qwen3 GGUF uncensored (GGUF) | Flux 2 Klein (distilled, через CLIPLoaderGGUF) |
| `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | UMT5 XXL (FP8) | SD3, Lumina |
| `lustify-sdxl-clip-g.safetensors` | SDXL CLIP-G | Lustify SDXL |
| `lustify-sdxl-clip-l.safetensors` | SDXL CLIP-L | Lustify SDXL |

### VAE installed

| File | Description |
|------|-------------|
| `flux2-vae.safetensors` | Flux 2 VAE (общий для Ideogram 4, Flux 2, Z-Image-Turbo) |
| `ae.safetensors` | Автоэнкодер для Z-Image-Turbo |

### LoRAs installed

Список LoRA в `Shared/models/loras/` обновляется при каждом добавлении. После добавления нового файла `.safetensors` необходимо сбросить кеш LoRA Manager (см. Troubleshooting).

### ControlNet models installed

| File | Source | Size |
|------|--------|------|
| `xinsir-canny-sdxl.safetensors` | xinsir/controlnet-canny-sdxl-1.0 | 2.5 GB |
| `xinsir-depth-sdxl.safetensors` | xinsir/controlnet-depth-sdxl-1.0 | 2.5 GB |
| `controlnet-openpose-sdxl.safetensors` | xinsir/controlnet-openpose-sdxl-1.0 | 2.5 GB |

### Custom nodes installed

| Node | Repo | Purpose |
|------|------|---------|
| `ComfyUI_IPAdapter_plus` | cubiq/ComfyUI_IPAdapter_plus | IPAdapter + FaceID |
| `comfyui_controlnet_aux` | Fannovel16/comfyui_controlnet_aux | ControlNet preprocessors (Canny, Depth, OpenPose) |
| `ComfyUI_InstantID` | cubiq/ComfyUI_InstantID | Alternative face ID (InstantID) |
| `ComfyUI-Impact-Pack` | ltdrdata/ComfyUI-Impact-Pack | FaceDetailer, SEGS, advanced utilities |
| `ComfyUI-ReActor` | Gourieff/ComfyUI-ReActor | Initial geometric face swap (InsightFace-based) |
| `ComfyUI-Inpaint-CropAndStitch` | lquesada/ComfyUI-Inpaint-CropAndStitch | Surgical crop & seamless stitch for face inpainting |
| `comfyui_face_parsing` | Ryuukeisyou/comfyui_face_parsing | Ultra-precise face mask creation by skin element |
| `PuLID_ComfyUI` | cubiq/PuLID_ComfyUI | Pure ID transfer without style destruction |
| `ComfyUI-Impact-Subpack` | ltdrdata/ComfyUI-Impact-Subpack | UltralyticsDetectorProvider (bbox YOLO detector) |
| `ComfyUI-GGUF` | city96/ComfyUI-GGUF | GGUF format support for CLIP/text encoder loading |
| `comfyui-lora-manager` | ltdrdata/ComfyUI-LoRA-Manager | LoRA management with previews, metadata, autocomplete (кеширует список при старте — для новых LoRA нужно сбросить кеш `AppData\Local\ComfyUI-LoRA-Manager\cache\model\comfyui.sqlite`) |
| `RES4LYF` | ClownsharkBatwing/RES4LYF | Кастомные sampler'ы: `res_2s`, `bong_tangent` и др. |

---

## Workflow Reference

### Conventions

- **face_ref.png** — reference face photo (for FaceID variants)
- **target.png** — target image to modify (for img2img variants)
- **input.png** — generic input image
- All input images go in `Shared\input\`

---

### txt2img_faceswap_basic.json

**Architecture:**
```
CheckpointLoaderSimple → IPAdapterUnifiedLoaderFaceID → IPAdapterFaceID → KSampler → VAEDecode → SaveImage
LoadImage(face_ref) ───────────────────────────────────→↑
CLIPTextEncode ─────────────────────────────────────────────────────────────────────────→↑
EmptyLatentImage ───────────────────────────────────────────────────────────────────────→↑
```

**Settings:** weight=0.55, faceidv2=0.65, ease in, 40 steps, CFG 5.5, euler/normal

**Why these settings:**
- **weight 0.55 / faceidv2 0.65:** Low weights prevent face from being "stamped on". The face acts as a soft guide rather than a hard constraint, allowing the model to blend facial features naturally with the generated scene.
- **ease in weight_type:** The face influence ramps up gradually across sampling steps. At early steps the model builds scene structure (pose, lighting, composition) with minimal face constraint; the face becomes more influential in mid-to-late steps where fine details are resolved.
- **CFG 5.5:** Lower CFG reduces over-saturation and "plastic" artifacts. SDXL tends to oversaturate at high CFG, causing unnatural skin when combined with FaceID.
- **euler/normal:** Simple, predictable sampler that pairs well with low CFG and FaceID. Avoids the over-sharpening that SDE variants can introduce at low weights.

---

### txt2img_faceswap_premium.json

**Architecture:**
```
CheckpointLoaderSimple → IPAdapterUnifiedLoaderFaceID → IPAdapterFaceID → PatchModelAddDownscale → KSampler → VAEDecode → SaveImage
LoadImage(face_ref) ───────────────────────────────────→↑
CLIPTextEncode ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────→↑
EmptyLatentImage ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────→↑
```

**Settings:** weight=0.6, faceidv2=0.75, style transfer, 45 steps, CFG 5.5, dpmpp_3m_sde_gpu / sgm_uniform

**Differences from basic:**
- **Higher steps (45 vs 40):** More denoising iterations allow the model to better reconcile the face embedding with the text prompt, reducing conflicting artifacts.
- **style transfer weight_type** vs **ease in:** "style transfer" applies the face embedding primarily at later steps, deferring to the base model for early structure. This produces more natural composition but requires higher face weight to maintain identity.
- **dpmpp_3m_sde_gpu / sgm_uniform:** Higher-quality sampler duo. SGM_uniform scheduler distributes sigma values evenly across the sampling trajectory, which pairs well with the guidance-style IPAdapter injection. GPU variant uses CUDA-optimized kernel.
- **PatchModelAddDownscale (Kohya Deep Shrink):** Compresses UNet at early steps (block 3, factor 1.5, up to 35% of steps) then re-expands. This stabilizes image composition by forcing the model to work at a coarser representation first, then refine details. Particularly effective at preventing FaceID from dominating the structural layout.

---

### img2img_premium.json

**Architecture:**
```
LoadImage(input) → VAEEncode ──────────────────────────────────────────────────────────────→ KSampler(denoise=0.55) → VAEDecode → SaveImage
                → CannyEdgePreprocessor → ControlNetApplyAdvanced(strength=0.6) → conditioning →↑
CLIPTextEncode ──────────────────────────────────────────────────────────────────────────────→↑
CheckpointLoader → PatchModelAddDownscale → model ──────────────────────────────────────────→↑
```

**Settings:** 45 steps, CFG 5.5, dpmpp_3m_sde_gpu / sgm_uniform, denoise 0.55

**Why these settings:**
- **Denoise 0.55:** The "sweet spot" for img2img. Low enough to preserve original structure (pose, composition, background), high enough for meaningful prompt-driven transformation. Below 0.4 produces minimal change; above 0.7 frequently breaks coherence with the source.
- **Canny ControlNet strength 0.6:** Canny edges from the original image guide the model to maintain spatial layout. 0.6 allows the prompt to reinterpret colors, materials, and details while preserving the structural skeleton.
- **Deep Shrink:** Same rationale as txt2img_premium — stabilizes composition during the denoising process.

---

### faceswap_hybrid.json

**Architecture:**
```
LoadImage(target) → VAEEncode ──────────────────────────────────────────────────────────────────────→ KSampler(denoise=0.55) → VAEDecode → SaveImage
                  → CannyEdgePreprocessor → ControlNetApplyAdvanced(strength=0.6) → cond ────────────→↑
LoadImage(face_ref) → IPAdapterUnifiedLoaderFaceID → IPAdapterFaceID(weight=0.85, faceidv2=1.0) → model →↑
CheckpointLoader →┘
```

**Settings:** weight=0.85, faceidv2=1.0, linear, 45 steps, CFG 7.0, dpmpp_2m_sde_gpu / karras

**Why these settings:**
- **Higher weights (0.85/1.0) vs txt2img variants:** In img2img mode the original image acts as a strong prior, so FaceID needs higher strength to overcome it and produce visible face transfer.
- **No Deep Shrink:** Img2img already constrains generation through the initial latent. Adding Deep Shrink on top can over-constrain the face transfer.
- **karras scheduler:** Tends to allocate more steps at low noise levels (fine details), which helps blend the new face into the existing structure.

---

### faceswap_depth.json

Identical to `faceswap_hybrid.json` but replaces Canny with Depth Anything.

**Use when:** The target image has significant depth variation (portraits with depth of field, complex 3D scenes). Depth ControlNet preserves volumetric structure better than Canny in these cases.

---

### img2img_faceswap_premium.json

**Architecture:**
```
LoadImage(target) → VAEEncode ────────────────────────────────────────────────────────────────────────────────────→ KSampler(denoise=0.55) → VAEDecode → SaveImage
                  → CannyEdgePreprocessor → ControlNetApplyAdvanced(strength=0.6) → cond ──────────────────────────→↑
LoadImage(face_ref) → IPAdapterUnifiedLoaderFaceID → IPAdapterFaceID → PatchModelAddDownscale → model ──────────────→↑
CheckpointLoader ────────────────────────────────────→↑
```

**Settings:** mirror txt2img_faceswap_premium — weight=0.6, faceidv2=0.75, style transfer, Deep Shrink, 45 steps, CFG 5.5, dpmpp_3m_sde_gpu / sgm_uniform + Canny ControlNet

**Why:** Combines the premium txt2img face quality (proven by user) with img2img + ControlNet structure preservation. The Deep Shrink + low FaceID weights that worked so well for txt2img are replicated here, with Canny added to anchor the source composition.

---

### faceswap_hybrid_pulid.json

**Architecture (7-stage pipeline):**
```
Stage A (ReActor):          LoadImage(target) ──→ ReActorFaceSwap ──→ SWAPPED_IMAGE
                            LoadImage(face_ref) ──→↑
Stage B (Face Parsing):     SWAPPED_IMAGE ──→ FaceParse → FaceParsingResultsParser → ImpactDilateMask → ImpactGaussianBlurMask → MASK
Stage C (Crop):             SWAPPED_IMAGE + MASK ──→ InpaintCropImproved ──→ cropped_image + cropped_mask + stitcher
Stage D (Eraser):           cropped_image → ImageBlur → ImageCompositeMasked ──→ erased_cropped_image
                            cropped_mask ───────────────────────→↑
Stage E (PuLID):            CheckpointLoader ──→ ApplyPulid(attn_mask=cropped_mask) → conditioned MODEL
                            LoadImage(face_ref) ──→↑
                            PulidModelLoader + PulidInsightFaceLoader + PulidEvaClipLoader ──→↑
Stage F (Inpaint & Stitch): erased_cropped_image → VAEEncodeForInpaint → KSampler → VAEDecode → InpaintStitchImproved
                            conditioned MODEL ──→↑
                            VAELoader ──→↑
Stage G (Dual FaceDetailer): stitched_image → FaceDetailer(denoise=0.40, guide=512) → FaceDetailer(denoise=0.25, guide=768) → SaveImage
                             UltralyticsDetectorProvider(face_yolov8m.pt) ──→↑ (bbox)
```

**Key params:**
| Node | Key Settings |
|------|-------------|
| ReActorFaceSwap | swap_model=inswapper_128.onnx, face_restore=GFPGANv1.3 |
| FaceParsingResultsParser | skin/nose/eyes/brows/mouth/lips=True, hair/ears/neck=False |
| ImpactDilateMask | dilation=6 |
| ImpactGaussianBlurMask | kernel_size=10, sigma=10.0 |
| InpaintCropImproved | forced 1024×1024, padding=32, mask_blend=16 |
| ImageBlur | blur_radius=31 (max allowed by node, aggressive eraser) |
| ApplyPulid | weight=0.80, method=fidelity, start_at=0.0, end_at=0.85 |
| KSampler | steps=30, CFG=6.0, dpmpp_2m_sde / karras, denoise=0.70 |
| VAEEncodeForInpaint | grow_mask_by=6 |
| FaceDetailer Pass 1 | denoise=0.40, guide_size=512, feather=16, force_inpaint=True |
| FaceDetailer Pass 2 | denoise=0.25, guide_size=768, feather=8, force_inpaint=True |

**Why this architecture:**
- **ReActor first (Pixel Layer):** Creates correct anatomical "scaffold" — face position, angle, and proportions matching the target image. ReActor works on pixel level, not latent — it's a preprocessing step, not part of the diffusion pipeline.
- **ReActor output as stitch base:** The swapped image is used as the base for InpaintStitch to avoid micro-shifts and seams at mask boundaries.
- **Face Parsing mask:** Excludes hair, ears, neck — only skin, eyes, nose, brows, lips are masked. Prevents inpainting from blurring hair/background.
- **ImageBlur Eraser (Block D):** The face inside the crop is aggressively blurred (radius=35) before inpainting. This prevents the diffusion model from inheriting shadows and features from the original face on the scaffold.
- **PuLID with attn_mask:** Identity conditioning applied ONLY to cropped mask area via attention mask, preserving background pixels. Method=fidelity, weight=0.80 prevents plastic artifacts.
- **end_at=0.85:** PuLID is disabled on the final 15% of steps, allowing the sampler to blend skin tone with the surrounding image lighting.
- **Separate VAELoader:** Uses `sdxl_vae.safetensors` explicitly instead of relying on the checkpoint's VAE, matching the face.md spec.
- **grow_mask_by=6:** Small expansion of the mask area in latent space to keep seams smooth.
- **Dual FaceDetailer:** Pass 1 (denoise=0.40, feather=16) soft-blends mask seams. Pass 2 (denoise=0.25, guide=768) adds micro-detail to iris, lashes, and pores at higher resolution. Using unmodified base model (no PuLID) to avoid over-conditioning.

---

---

### ideogram4_nvfp4_test.json

**Architecture:**
```
UNETLoader(cond) ──────────────────────────────────────────────→ DualModelGuider → SamplerCustomAdvanced → VAEDecode → SaveImage
UNETLoader(uncond) ─────────────────────────────────────────────→ DualModelGuider.model_negative
CLIPLoader(type=ideogram4) → CLIPTextEncode → positive ────────→ DualModelGuider.positive
ConditioningZeroOut ────────────────────────────────────────────→ DualModelGuider.negative
VAELoader(flux2-vae) ──────────────────────────────────────────→ VAEDecode
LoraLoader(cond) ───────────────────────────────────────────────→ UNETLoader(cond)
LoraLoader(uncond) ─────────────────────────────────────────────→ UNETLoader(uncond)
Ideogram4Scheduler → ExtendIntermediateSigmas → SamplerCustomAdvanced.sigmas
```

**Features:** Dual-branch CFG for Ideogram 4, NVFP4 quantized diffusion models, `ExtendIntermediateSigmas` to bypass built-in safety filter (smooths initial sigma curve that triggers model's safety check).

---

### flux2_klein_nvfp4_test.json

**Architecture (distilled 4B — из changelog):**
```
UNETLoader(NVFP4) → CFGGuider → SamplerCustomAdvanced → VAEDecode → SaveImage
CLIPLoader(type=flux2) ─→ CLIPTextEncode(positive) ───→ CFGGuider
                        → CLIPTextEncode(negative) ───→ CFGGuider
Flux2Scheduler ──────────────────────────────────────────→ SamplerCustomAdvanced
```
Text encoder: `CLIPLoaderGGUF` + `flux2-klein-9b-uncensored-q4_k_m.gguf`.

**Settings:** steps=4 (distilled), CFG=1.0–1.5, Euler + Simple.

---

### flux2_klein_base9b_test.json

**Architecture (base 9B — создан 02.07.2026):**
```
UNETLoader(flux-2-klein-base-9b-nvfp4) → LoraLoader → CFGGuider(cfg=4.0)
CLIPLoader(qwen_3_8b_fp4mixed, type=flux2) ───────────→↑ (LoRA-patched CLIP)
                                          → CLIPTextEncode(negative) →↑
Flux2Scheduler(steps=25, shift=3.0, linear) → SamplerCustomAdvanced → VAEDecode → SaveImage
KSamplerSelect(res_multistep) ───────────────────────────→↑
RandomNoise ────────────────────────────────────────────→↑
EmptyFlux2LatentImage(1024×1024) ────────────────────────→↑
```

**Ключевые отличия от distilled 4B:**
- Для base 9B НЕ используется `CLIPLoaderGGUF` — только `CLIPLoader` с type `flux2`
- Для base 9B НЕ используется `flux2-klein-9b-uncensored-q4_k_m.gguf` — только qwen3 safetensors
- Нужно больше шагов: 20–30 (против 4 для distilled)
- CFG 3.5–5.0 (против 1.0–1.5 для distilled)
- Sampler `res_multistep` (или `capitan_flowmatch`) вместо Euler

---

### skeleton_pose_extraction.json

**Architecture:**
```
LoadImage → OpenposePreprocessor(body+hands+face) → SaveImage
```

**Features:** Extracts OpenPose skeleton map from a reference photo. Enables `scale_stick_for_xinsr_cn` for compatibility with xinsir OpenPose ControlNet (thicker skeleton lines).

---

### skeleton_scene_generation.json

**Architecture:**
```
CheckpointLoaderSimple(SDXL) ─→ MODEL ─────────────────────────→ KSampler → VAEDecode → SaveImage
ControlNetLoader(controlnet-openpose-sdxl) ─→ CONTROL_NET ─────→ ApplyControlNetAdv → conditioning →↑
LoadImage(pose skeleton) ──────────────────────────────────────→↑(image)
CLIPTextEncode(positive) ──────────────────────────────────────→↑
CLIPTextEncode(negative) ──────────────────────────────────────→↑
EmptyLatentImage ───────────────────────────────────────────────→↑(latent)
```

**Features:** SDXL generation conditioned on pose skeleton via ControlNetOpenPose. Designed as second stage after `skeleton_pose_extraction`. Denoise=1.0 (text2img), ControlNet strength=0.8.

---

---

## Rectified Flow / Flow Matching Models

Z-Image-Turbo, Flux 2, Ideogram 4, SD3, Lumina2 используют rectified flow (flow matching) — принципиально другой тип диффузии, несовместимый с Karras ODE.

### Ключевые отличия от SDXL

| Аспект | SDXL (classic) | Flow matching |
|--------|---------------|---------------|
| **Формула** | Karras ODE: `x' = x + (x - x̂)/σ * (σ_next - σ)` | RF interpolation: `x' = ratio * x + (1 - ratio) * x̂` |
| **Sampler'ы** | `euler`, `dpmpp_2m`, `dpmpp_3m` | `res_multistep`, `capitan_flowmatch`, спец. sampler'ы (кастомные) |
| **Schedulers** | `karras`, `normal`, `sgm_uniform` | `simple` (linear 1.0→0.0), специальные (Ideogram4Scheduler, Flux2Scheduler) |
| **CFG** | 5.5–7.0 | 1.0–2.0 (turbo), 3.5–5.0 (base) |
| **Модельный патч** | Не требуется | `ModelSamplingAuraFlow(shift)` или спец. scheduler |

### Почему Euler не подходит для flow matching

Стандартный `euler` в ComfyUI использует Karras ODE: `d = (x - x̂) / σ`. На шагах где σ ≈ 0 деление даёт нестабильность, вызывая burning/артефакты. Для flow matching нужна RF-интерполяция без деления на sigma.

### Built-in sampler для flow matching

`res_multistep` — единственный встроенный sampler, корректный для rectified flow. Он реализует рестарт-метод без Karras ODE-формулы.

### Кастомные sampler'ы для flow matching

- **ComfyUI-CapitanFlowMatch** (`capitan_flowmatch`, `capitan_flowmatch_turbo`) — оптимальные sampler'ы для rectified flow. Позволяют использовать >8 шагов на turbo-моделях без артефактов.
- **RES4LYF** (`res_2s`, `bong_tangent`) — экспериментальные sampler'ы.

### Сводная таблица по моделям

| Модель | CLIP | Scheduler | Sampler | Steps | CFG | Shift | Примечание |
|--------|------|-----------|---------|-------|-----|-------|------------|
| **Z-Image-Turbo (speed)** | Qwen3-8B + type `lumina2` | `simple` (через `ModelSamplingAuraFlow`) | `res_multistep` | 8 | 1.0 | 3.0 | Или `capitan_flowmatch_turbo` |
| **Z-Image-Turbo (quality)** | Qwen3-8B + type `lumina2` | `capitan_flowmatch` | `capitan_flowmatch` | 36 | 2.0 | 6.0 | Требует CapitanFlowMatch |
| **Ideogram 4** | `qwen3vl_8b_nvfp4` + type `ideogram4` | `Ideogram4Scheduler` (mu=0.5, std=1.75) | `euler` | 20–30 | 5–7 | N/A | DualModelGuider, logit-normal schedule |
| **Flux 2 Klein 9B distilled** | `flux2-klein-9b-uncensored-q4_k_m.gguf` + CLIPLoaderGGUF | `Flux2Scheduler` / `simple` | `euler` | 4 | 1.0–1.5 | — | CFG=1.0 |
| **Flux 2 Klein 9B base** | `qwen_3_8b_fp4mixed` + type `flux2` | `Flux2Scheduler` (shift=3.0) | `res_multistep` | 25 | 4.0 | 3.0 | CLIPLoader, не GGUF |
| **Lumina2** | Qwen3 + type `lumina2` | `simple` + `ModelSamplingAuraFlow`/`ModelSamplingSD3` | `res_multistep` | 36 | 2.0 | 3.0–6.0 | |

### Важные замечания по CLIPLoader

- **CLIPLoaderGGUF** (из ComfyUI-GGUF) — только для GGUF-файлов. НЕ использовать с safetensors.
- **CLIPLoader** — для safetensors. Для Flux 2 base используй type `flux2`, для Ideogram 4 — type `ideogram4`.
- Несовместимый CLIP даёт RuntimeError: `mat1 and mat2 shapes cannot be multiplied` — размерность выходных эмбеддингов не сходится с ожидаемой моделью.

---

## Summary of Key Reasoning

| Decision | Rationale |
|----------|-----------|
| **CFG 5.5** | SDXL + FaceID creates plastic artifacts at high CFG. 5.5 balances prompt adherence vs natural texture |
| **style transfer / ease in** | Face applied only late in generation. Scene structure established first by text prompt alone |
| **FaceID weight 0.55–0.6** | Low force prevents "stamped-on" face look. Identity preserved by lora_strength=0.65 |
| **Deep Shrink (block 3, 1.5x, 35%)** | Forces coarse → fine generation, stabilizes composition, reduces FaceID domination |
| **dpmpp_3m_sde_gpu** | Best quality/performance trade-off for SDXL. GPU variant uses CUDA-native kernel |
| **sgm_uniform** | Scheduler designed for SDXL's noise schedule. Works with dpmpp family |
| **Canny (low=100, high=200)** | Standard thresholds that capture meaningful edges without noise. Resolution 512 for speed |
| **ControlNet strength 0.6** | Preserves structure without over-constraining. Prompt can still reinterpret details |
| **Denoise 0.55** | Optimal for img2img: enough change for meaningful transformation, low enough for structural coherence |
| **start_at=0.1 / end_at=0.9** | FaceID only active during middle 80% of steps. First and last steps unaffected, reducing artifacts |

### Troubleshooting

| Problem | Fix |
|---------|-----|
| Face doesn't match reference | Increase `weight_faceidv2` (up to 1.5) or `lora_strength` (up to 0.8) |
| Plastic/smooth face | Decrease `weight` (to 0.4), lower CFG (to 5.0), use `ease in` |
| Scene doesn't match prompt | Increase CFG (to 6–7), decrease FaceID `weight` |
| Img2img changes too little | Increase `denoise` (to 0.65) |
| Img2img breaks structure | Increase ControlNet `strength` (to 0.75) or lower `denoise` (to 0.45) |
| Artifacts around face | Set `start_at=0.15`, `end_at=0.85`, use `style transfer` weight_type |
| Unstable composition | Enable `PatchModelAddDownscale` with block=3, factor=1.5, end=0.35 |
