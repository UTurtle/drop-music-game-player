# Browser model implementation

The player never uploads audio. The web server serves static app/model assets only; `/api/model` no longer accepts jobs. The old Python adapter and device-key helpers are inactive maintainer leftovers, not part of `npm start` or the UI.

## Pinned model and storage

- `OliBomby/Mapperatorinator-v32-mini`, revision `7807f0dc70cab671be012e1f5ddf945b0b8b7278`, `gamemode=1`.
- Original inference source: `0e2b0e387aab4b35c64b0b11b12d47578dea7587`, MIT. See [notices](../THIRD_PARTY_NOTICES.md).
- About 133 MB including runtime. The UI reads exact byte counts from the manifest.
- Weights are stored as FP16; the worker expands the ONNX tensors to FP32 **in memory** before inference. This saves download/cache space without requiring `shader-f16`, which was not exposed by the tested RTX 3090/535 driver/browser combination. Working memory is larger than the cached files.
- The four-bit candidate was rejected after changing the first predicted timing token to end-of-sequence. It is not included in the served model manifest.
- Named CacheStorage entries are DROP-owned; cancellation/failure removes partial downloads. No audio or keys enter the model CacheStorage. Selected audio and generated charts are stored separately in the browser’s `drop-local-library` IndexedDB database; deleting models does not delete this library. Language remains a separate localStorage preference.
- Model and runtime requests use `no-store` HTTP caching; the explicit model cache owns these downloads. App JavaScript may remain in the normal HTTP cache after model deletion.

## Inference boundaries

A worker decodes 16 kHz mono input, peak-normalizes it and computes the pretrained torchaudio-compatible power mel frontend. It uses overlapping 16.376 s windows, generated timing context, difficulty prompts, greedy decoding, and retained self/cross attention states. It keeps circle timing and don/kat colors, converts large circles to single hits, and omits drumroll/spinner objects.

Easy and Normal are requested separately; Hard is opt-in. If Easy contains only unsupported objects, a sparser Easy is derived from generated Normal circles (minimum 600 ms spacing). If a requested difficulty has no playable circles, generation falls back to DSP and the preview does not claim an AI result. This is an experimental local conversion, not upstream-equivalent decoding or a chorus classifier. Real-song fun/quality is not established by synthetic regression tests.

Related: [README](../README.md) · [Architecture](architecture.md).

## Maintainer export

Prepare `.runtime/mapperatorinator` at the source revision above and `.runtime/venv` with the upstream dependencies plus `onnx` and `onnxruntime`. Download the pinned mini `gamemode=1` checkpoint and model card to `.runtime/models` using `huggingface_hub.snapshot_download`. Then run:

```sh
.runtime/venv/bin/python scripts/export-browser-model.py
npm run build
npm start
```

The exporter checks uncompressed ONNX output against the original model before writing compact assets. It leaves raw comparison artifacts under `output`, not `public`. Serve the upstream model card and MIT/runtime notices alongside converted assets. Model binaries and `.runtime` are excluded from Git. This setup is for maintainers; ordinary users only choose Download model in the browser. Without assets, DSP remains usable.
