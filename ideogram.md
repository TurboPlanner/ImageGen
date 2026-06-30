--

## Part 1: Prerequisites & PyTorch Upgrade (CUDA 13.0)

To utilize native 4-bit hardware acceleration (FP4 Tensor Cores) on the RTX 5080 under Windows, **PyTorch with CUDA 13.0** is strictly required. If running older CUDA versions, ComfyUI will fall back to upcasting weights to FP8/FP16, losing the speed advantages.

### Target Environment Verification & Update

Identify the type of ComfyUI installation and run the appropriate commands:

#### Option A: If using ComfyUI Portable (Embedded Python)
Run these commands in the root folder of ComfyUI (where `python_embeded` directory is located):

```bash
# 1. Update general dependencies
call .\update\update_comfyui_and_python_dependencies.bat

# 2. Force reinstall PyTorch with CUDA 13.0 support
.\python_embeded\python.exe -m pip install torch torchvision torchaudio --force-reinstall --index-url https://download.pytorch.org/whl/cu130
```

#### Option B: If using a standard Python Virtual Environment (venv)
Run these commands inside your terminal after navigating to the ComfyUI root:

```bash
# 1. Activate venv
.\venv\Scripts\activate

# 2. Upgrade PyTorch to CUDA 13.0
pip install torch torchvision torchaudio --force-reinstall --index-url https://download.pytorch.org/whl/cu130
```

---

## Part 2: Required Downloads (NVFP4 Pipeline)

The following files must be downloaded from the official `Comfy-Org/Ideogram-4` Hugging Face repository and placed in the respective target directories. 

*Note: Since the RTX 5080 benefits from NVFP4, we are using the NVFP4 versions of both the diffusion models and the text encoder to maximize performance and save VRAM.*

### File List and Target Paths

| No. | File Name | Hugging Face Direct Download URL | Target Directory inside `ComfyUI/` | Approx. Size |
| :--- | :--- | :--- | :--- | :--- |
| **1** | `ideogram4_nvfp4_mixed.safetensors` | [Download](https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/diffusion_models/ideogram4_nvfp4_mixed.safetensors) | `models/diffusion_models/` | ~5.5 GB |
| **2** | `ideogram4_unconditional_nvfp4_mixed.safetensors` | [Download](https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/diffusion_models/ideogram4_unconditional_nvfp4_mixed.safetensors) | `models/diffusion_models/` | ~5.5 GB |
| **3** | `qwen3vl_8b_nvfp4.safetensors` | [Download](https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/text_encoders/qwen3vl_8b_nvfp4.safetensors) | `models/text_encoders/` | ~5.3 GB |
| **4** | `flux2-vae.safetensors` | [Download](https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/vae/flux2-vae.safetensors) | `models/vae/` | ~0.3 GB |

### PowerShell Automated Download Script (Optional helper)

You can run the following PowerShell snippet in the root directory of `ComfyUI` to download all files programmatically via `curl`:

```powershell
# Create target directories if they do not exist
New-Item -ItemType Directory -Force -Path "models\diffusion_models"
New-Item -ItemType Directory -Force -Path "models\text_encoders"
New-Item -ItemType Directory -Force -Path "models\vae"

# Download files
curl -L -o "models\diffusion_models\ideogram4_nvfp4_mixed.safetensors" "https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/diffusion_models/ideogram4_nvfp4_mixed.safetensors"
curl -L -o "models\diffusion_models\ideogram4_unconditional_nvfp4_mixed.safetensors" "https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/diffusion_models/ideogram4_unconditional_nvfp4_mixed.safetensors"
curl -L -o "models\text_encoders\qwen3vl_8b_nvfp4.safetensors" "https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/text_encoders/qwen3vl_8b_nvfp4.safetensors"
curl -L -o "models\vae\flux2-vae.safetensors" "https://huggingface.co/Comfy-Org/Ideogram-4/resolve/main/vae/flux2-vae.safetensors"
```

---

## Part 3: Configuration & Workflow Routing Rules

To ensure correct execution within the ComfyUI workspace, the agent or the workflow builder must adhere to the following routing guidelines:

1. **Dual Model Guider Node**: 
   Ideogram 4 operates via a Dual-Branch Guidance architecture. The workflow must feed `ideogram4_nvfp4_mixed.safetensors` into the conditional (positive) slot and `ideogram4_unconditional_nvfp4_mixed.safetensors` into the unconditional (negative) slot of the `DualModelGuider` node.

2. **LoRA Double-Patching Constraint**:
   If a LoRA is active in the pipeline, it **must** be applied simultaneously to *both* diffusion models (conditional and unconditional) using two separate `LoraLoader` nodes (or chained loaders pointing to the same LoRA weights). Failure to patch both models will result in generation artifacts or noise.

---

## Part 4: Verification Check

1. Launch ComfyUI and monitor the terminal logs.
2. Load an Ideogram 4 workflow.
3. Queue a generation.
4. Verify the console logs do **NOT** show any casting warnings like `Casting weights to float16 / fp8 due to hardware restrictions`. Instead, they should confirm loading of native FP4 layouts.