# ComfyUI (SDXL + ControlNet) on ROCm for the RX 9070 XT (gfx1201, RDNA4).
# Feature local-ai-gpu-spike. Build: docker compose --profile ai build comfyui
# The base image ships the ROCm build of torch; ComfyUI requirements are installed
# under a constraints file so pip can never replace it with CUDA/CPU wheels.
FROM rocm/pytorch:rocm10.1.0_ubuntu24.04_py3.12_pytorch_release_2.14.0

ARG COMFYUI_REF=v0.45.3
ARG CONTROLNET_AUX_SHA=a587a4c1594524c1d2de5cd1a86cd868ff448e1c
# Style references (feature simulations-ux-overhaul): IPAdapter, CLIP vision and combine nodes.
ARG IPADAPTER_PLUS_SHA=a0f451a5113cf9becb0847b92884cb10cbdec0ef

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    PYTHONUNBUFFERED=1 \
    AUX_ANNOTATOR_CKPTS_PATH=/opt/annotators \
    AUX_USE_SYMLINKS=False

RUN apt-get update \
 && apt-get install -y --no-install-recommends git curl libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch "${COMFYUI_REF}" https://github.com/comfyanonymous/ComfyUI.git /opt/ComfyUI \
 && git -C /opt/ComfyUI/custom_nodes clone https://github.com/Fannovel16/comfyui_controlnet_aux.git \
 && git -C /opt/ComfyUI/custom_nodes/comfyui_controlnet_aux checkout "${CONTROLNET_AUX_SHA}" \
 && git -C /opt/ComfyUI/custom_nodes clone https://github.com/cubiq/ComfyUI_IPAdapter_plus.git \
 && git -C /opt/ComfyUI/custom_nodes/ComfyUI_IPAdapter_plus checkout "${IPADAPTER_PLUS_SHA}"

WORKDIR /opt/ComfyUI

# Freeze the base image's ROCm torch stack as pip constraints, drop torch* and
# CUDA-only packages from the requirement lists, then install into the system
# python3 (the base image has no venv; PEP 668 is overridden on purpose).
RUN python3 -m pip list --format=freeze \
      | grep -iE '^(torch|torchvision|torchaudio|triton|pytorch-triton-rocm)==' > /tmp/torch-constraints.txt \
 && cat /tmp/torch-constraints.txt \
 && grep -viE '^(torch|torchvision|torchaudio)([<>=~ ;]|$)' requirements.txt > /tmp/req-comfy.txt \
 && grep -viE '^(torch|torchvision|torchaudio|onnxruntime-gpu|mediapipe)([<>=~ ;]|$)' custom_nodes/comfyui_controlnet_aux/requirements.txt > /tmp/req-aux.txt \
 && python3 -m pip install -c /tmp/torch-constraints.txt -r /tmp/req-comfy.txt -r /tmp/req-aux.txt \
 && python3 -c "import torch; assert torch.version.hip, 'torch is not a ROCm build'; print('torch', torch.__version__, 'hip', torch.version.hip)"

RUN mkdir -p /opt/annotators

EXPOSE 8188
CMD ["python3", "main.py", "--listen", "0.0.0.0", "--port", "8188"]
