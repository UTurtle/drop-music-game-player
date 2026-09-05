// ONNX wire-format conversion: store compact FP16 files, expand to FP32 only in memory.
// This avoids requiring shader-f16 (not exposed by some otherwise capable GPUs).
interface Field { id: number; wire: number; value: Uint8Array; raw: Uint8Array }
function varint(data: Uint8Array, at: number): [number, number] {
  let value = 0, scale = 1;
  for (let i = 0; i < 10; i++) { const byte = data[at++]; if (byte === undefined) throw new Error('Truncated protobuf'); value += (byte & 127) * scale; if (byte < 128) return [value, at]; scale *= 128; }
  throw new Error('Invalid protobuf');
}
function fields(data: Uint8Array): Field[] {
  const result: Field[] = []; let at = 0;
  while (at < data.length) {
    const begin = at; let tag: number; [tag, at] = varint(data, at);
    const wire = tag & 7; let start = at;
    if (wire === 0) [, at] = varint(data, at);
    else if (wire === 1) at += 8;
    else if (wire === 5) at += 4;
    else if (wire === 2) { let size: number; [size, at] = varint(data, at); start = at; at += size; }
    else throw new Error('Unsupported protobuf wire type');
    if (at > data.length) throw new Error('Truncated protobuf');
    result.push({ id: tag >>> 3, wire, value: data.subarray(start, at), raw: data.subarray(begin, at) });
  }
  return result;
}
function number(value: number): Uint8Array {
  const bytes = []; do { const byte = value % 128; value = Math.floor(value / 128); bytes.push(byte | (value ? 128 : 0)); } while (value);
  return Uint8Array.from(bytes);
}
function join(chunks: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0)); let at = 0;
  for (const chunk of chunks) { output.set(chunk, at); at += chunk.length; } return output;
}
function message(id: number, data: Uint8Array): Uint8Array { return join([number(id * 8 + 2), number(data.length), data]); }
function scalar(id: number, value: number): Uint8Array { return join([number(id * 8), number(value)]); }
function value(field: Field): number { return varint(field.value, 0)[0]; }

export function expandHalfBytes(data: Uint8Array): Uint8Array {
  if (data.length % 2) throw new Error('Invalid FP16 tensor');
  const input = new DataView(data.buffer, data.byteOffset, data.length), output = new Uint8Array(data.length * 2), view = new DataView(output.buffer);
  for (let i = 0; i < data.length / 2; i++) {
    const bits = input.getUint16(i * 2, true), sign = bits & 0x8000 ? -1 : 1, exponent = (bits >>> 10) & 31, fraction = bits & 1023;
    const f = exponent === 0 ? sign * 2 ** -14 * (fraction / 1024) : exponent === 31 ? (fraction ? NaN : sign * Infinity) : sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
    view.setFloat32(i * 4, f, true);
  }
  return output;
}
function tensor(data: Uint8Array): Uint8Array {
  const all = fields(data);
  if (!all.some(f => f.id === 2 && value(f) === 10)) return data;
  if (!all.some(f => f.id === 9)) throw new Error('Expected inline FP16 tensor');
  return join(all.map(f => f.id === 2 ? scalar(2, 1) : f.id === 9 ? message(9, expandHalfBytes(f.value)) : f.raw));
}
function tensorType(data: Uint8Array): Uint8Array { return join(fields(data).map(f => f.id === 1 && f.wire === 0 && value(f) === 10 ? scalar(1, 1) : f.raw)); }
function type(data: Uint8Array): Uint8Array { return join(fields(data).map(f => f.id === 1 && f.wire === 2 ? message(1, tensorType(f.value)) : f.raw)); }
function info(data: Uint8Array): Uint8Array { return join(fields(data).map(f => f.id === 2 ? message(2, type(f.value)) : f.raw)); }
function attribute(data: Uint8Array, cast: boolean): Uint8Array {
  const all = fields(data), to = cast && all.some(f => f.id === 1 && new TextDecoder().decode(f.value) === 'to');
  return join(all.map(f => to && f.id === 3 && value(f) === 10 ? scalar(3, 1) : f.id === 5 ? message(5, tensor(f.value)) : f.id === 6 ? message(6, graph(f.value)) : f.raw));
}
function node(data: Uint8Array): Uint8Array {
  const all = fields(data), cast = all.some(f => f.id === 4 && new TextDecoder().decode(f.value) === 'Cast');
  return join(all.map(f => f.id === 5 ? message(5, attribute(f.value, cast)) : f.raw));
}
function graph(data: Uint8Array): Uint8Array {
  return join(fields(data).map(f => f.id === 1 ? message(1, node(f.value)) : f.id === 5 ? message(5, tensor(f.value)) : [11, 12, 13].includes(f.id) ? message(f.id, info(f.value)) : f.raw));
}
export function expandModel(data: ArrayBuffer): Uint8Array { return join(fields(new Uint8Array(data)).map(f => f.id === 7 ? message(7, graph(f.value)) : f.raw)); }
