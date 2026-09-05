"""Export the pinned MIT Mapperatorinator mini taiko checkpoint for DROP.

Run with the optional .runtime/venv; Python is NOT required by the browser app.
Architecture adapted from OliBomby/Mapperatorinator (see docs/licenses).
"""
import hashlib
import json
from pathlib import Path
import sys
import shutil
import numpy as np
import torch
from torch import nn
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.runtime/mapperatorinator/osuT5'))
from osuT5.model import Mapperatorinator

REV = '7807f0dc70cab671be012e1f5ddf945b0b8b7278'
SOURCE = ROOT / f'.runtime/models/models--OliBomby--Mapperatorinator-v32-mini/snapshots/{REV}/gamemode=1'
OUT = ROOT / 'public/models/mapper-mini-v1'
OUT.mkdir(parents=True, exist_ok=True)
RAW = ROOT / 'output/browser-model-export'
RAW.mkdir(parents=True, exist_ok=True)
torch.set_num_threads(4)
model = Mapperatorinator.from_pretrained(SOURCE, attn_implementation='sdpa').eval()
original_mel_bank = model.spectrogram.transform.mel_scale.fb.clone()


def norm(x, layer):
    return (x.float() * torch.rsqrt(x.float().square().mean(-1, keepdim=True) + 1.1920928955078125e-7)).to(x.dtype) * layer.weight


def heads(x):
    return x.reshape(1, -1, 8, 64).transpose(1, 2)


def rotary(x, positions):
    freq = positions.float().reshape(1, -1, 1) * (10000 ** (-torch.arange(0, 64, 2).float() / 64))
    freq = torch.cat([freq, freq], -1).unsqueeze(1)
    rotated = torch.cat([-x[..., 32:], x[..., :32]], -1)
    return x * freq.cos().to(x.dtype) + rotated * freq.sin().to(x.dtype)


def attend(q, k, v, projection, mask=None):
    score = (q.float() @ k.float().transpose(-1, -2)) / 8
    if mask is not None:
        score = score + mask
    x = (score.softmax(-1).to(v.dtype) @ v).transpose(1, 2).reshape(1, -1, 512)
    return projection(x)


class Encoder(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = model.transformer.model.encoder
        self.cross = nn.ModuleList([l.cross_attn.Wkv for l in model.transformer.model.decoder.layers])

    def forward(self, mel):
        e = self.encoder
        x = F.gelu(e.conv2(F.gelu(e.conv1(mel.to(e.conv1.weight.dtype))))).transpose(1, 2)
        positions = torch.arange(x.shape[1])
        for l in e.layers:
            q, k, v = l.self_attn.Wqkv(norm(x, l.self_attn_layer_norm)).chunk(3, -1)
            x = x + attend(rotary(heads(q), positions), rotary(heads(k), positions), heads(v), l.self_attn.Wo)
            x = x + l.fc2(F.gelu(l.fc1(norm(x, l.final_layer_norm))))
        x = norm(x, e.layer_norm)
        result = []
        for cross in self.cross:
            k, v = cross(x).chunk(2, -1)
            result.extend([heads(k), heads(v)])
        return (x.float(), *(value.float() for value in result))


class Decoder(nn.Module):
    def __init__(self):
        super().__init__()
        self.decoder = model.transformer.model.decoder
        self.embedding = model.decoder_embedder
        self.output = model.transformer.proj_out

    def forward(self, tokens, positions, mask, *cache):
        x = self.embedding(tokens)
        cache = tuple(value.to(x.dtype) for value in cache)
        result = []
        for i, l in enumerate(self.decoder.layers):
            q, k, v = l.self_attn.Wqkv(norm(x, l.self_attn_layer_norm)).chunk(3, -1)
            k = torch.cat([cache[i * 2], rotary(heads(k), positions)], 2)
            v = torch.cat([cache[i * 2 + 1], heads(v)], 2)
            result.extend([k, v])
            x = x + attend(rotary(heads(q), positions), k, v, l.self_attn.Wo, mask)
            q = heads(l.cross_attn.Wq(norm(x, l.cross_attn_layer_norm)))
            x = x + attend(q, cache[12 + i * 2], cache[13 + i * 2], l.cross_attn.Wo)
            x = x + l.fc2(F.gelu(l.fc1(norm(x, l.final_layer_norm))))
        return (self.output(norm(x, self.decoder.layer_norm))[:, -1].float(), *(value.float() for value in result))


encoder, decoder = Encoder().eval(), Decoder().eval()
torch.manual_seed(42)
with torch.no_grad():
    frames = torch.randn(1, 2047 * 128) * .1
    mel = model.spectrogram(frames).transpose(1, 2)
    encoded = encoder(mel)
    reference = model.transformer.model.encoder(mel).last_hidden_state
    torch.testing.assert_close(encoded[0], reference, atol=3e-5, rtol=3e-4)
    tokens = torch.tensor([[4098, 4105, 11731, 11770, 11826, 11829, 12228, 12079, 3035, 11891, 1, 3]])
    positions = torch.arange(tokens.shape[1])
    mask = torch.triu(torch.full((1, 1, tokens.shape[1], tokens.shape[1]), -1e4), 1)
    empty = tuple(torch.zeros(1, 8, 0, 64) for _ in range(12))
    args = (tokens, positions, mask, *empty, *encoded[1:])
    decoded = decoder(*args)
    reference_logits = model(frames=frames, decoder_input_ids=tokens, decoder_attention_mask=mask).logits[:, -1]
    torch.testing.assert_close(decoded[0], reference_logits, atol=5e-5, rtol=5e-4)
    print('Original encoder and decoder parity PASS', flush=True)

    names = [f'cross_{i}' for i in range(12)]
    torch.onnx.export(encoder, (mel,), str(RAW / 'encoder.onnx'), input_names=['mel'], output_names=['hidden', *names], opset_version=17, dynamo=False)
    ins = ['tokens', 'positions', 'mask'] + [f'past_{i}' for i in range(12)] + names
    outs = ['logits'] + [f'present_{i}' for i in range(12)]
    dynamic = {'tokens': {1: 'sequence'}, 'positions': {0: 'sequence'}, 'mask': {2: 'sequence', 3: 'total'}}
    dynamic.update({f'past_{i}': {2: 'past'} for i in range(12)})
    dynamic.update({f'present_{i}': {2: 'total'} for i in range(12)})
    torch.onnx.export(decoder, args, str(RAW / 'decoder.onnx'), input_names=ins, output_names=outs, dynamic_axes=dynamic, opset_version=17, dynamo=False)

    import onnxruntime as ort
    for name, inputs, expected in [('encoder', {'mel': mel.numpy()}, encoded), ('decoder', dict(zip(ins, [x.numpy() for x in args])), decoded)]:
        session = ort.InferenceSession(str(RAW / f'{name}.onnx'), providers=['CPUExecutionProvider'])
        result = session.run(None, inputs)
        np.testing.assert_allclose(result[0], expected[0].numpy(), atol=1e-4, rtol=1e-3)
        print(f'{name} ONNX parity PASS', flush=True)

    # Mixed FP16: retain fp32 RoPE angles, RMS accumulation and attention scores.
    # Four-bit weights failed real-audio parity and are deliberately not shipped.
    model.half()
    encoder.half(); decoder.half()
    torch.onnx.export(encoder, (mel,), str(OUT / 'encoder-fp16.onnx'), input_names=['mel'], output_names=['hidden', *names], opset_version=17, dynamo=False)
    torch.onnx.export(decoder, args, str(OUT / 'decoder-fp16.onnx'), input_names=ins, output_names=outs, dynamic_axes=dynamic, opset_version=17, dynamo=False)
    for suffix in ['wasm', 'mjs']:
        name = f'ort-wasm-simd-threaded.asyncify.{suffix}'
        shutil.copyfile(ROOT / 'node_modules/onnxruntime-web/dist' / name, OUT / name)

    for name in ['Mapperatorinator-MIT.txt', 'ONNX-Runtime-MIT.txt', 'ONNX-Runtime-ThirdPartyNotices.txt']:
        shutil.copyfile(ROOT / 'docs/licenses' / name, OUT / name)
    shutil.copyfile(SOURCE.parent / 'README.md', OUT / 'MODEL-CARD.md')

    # Exact pretrained mel filter bank, sparse by frequency bin for browser FFT.
    fb = original_mel_bank
    if fb is None:
        from torchaudio.functional import melscale_fbanks
        fb = melscale_fbanks(513, 20, 8000, 128, 16000)
    bank = [[[int(i), float(row[i])] for i in torch.nonzero(row).flatten()] for row in fb.T]
    tokenizer = json.loads((SOURCE / 'tokenizer.json').read_text())
    compact = {key: tokenizer[key] for key in ['event_start', 'event_end', 'event_range']}
    (OUT / 'frontend.json').write_text(json.dumps({'mel': bank, 'tokenizer': compact}, separators=(',', ':')))
    # Numerical fixture for browser mel and model regression checks (original synthesized noise).
    np.savez(ROOT / 'output/browser-model-reference.npz', frames=frames.numpy(), mel=mel.numpy(), tokens=tokens.numpy(), logits=decoded[0].numpy())
    files = []
    for name in ['encoder-fp16.onnx', 'decoder-fp16.onnx', 'frontend.json', 'ort-wasm-simd-threaded.asyncify.wasm']:
        path = OUT / name
        files.append({'name': name, 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    (OUT / 'manifest.json').write_text(json.dumps({'id': 'mapper-mini-v1', 'model': 'OliBomby/Mapperatorinator-v32-mini', 'revision': REV, 'license': 'MIT', 'files': files}, indent=2))
    print(json.dumps(files), flush=True)
