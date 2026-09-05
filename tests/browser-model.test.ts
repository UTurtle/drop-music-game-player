import test from 'node:test';
import assert from 'node:assert/strict';
import { expandHalfBytes, expandModel } from '../src/modelPrecision';
import { contextTokens, groupsToNotes, tokenGroups } from '../src/browserModelCore';

test('FP16 storage expands normal, subnormal, signed zero and special values correctly', () => {
  const bits = new Uint16Array([0, 0x8000, 0x3c00, 0xc000, 1, 0x7bff, 0x7c00, 0xfc00, 0x7e00]);
  const values = new Float32Array(expandHalfBytes(new Uint8Array(bits.buffer)).buffer);
  assert.equal(values[0], 0); assert.ok(Object.is(values[1], -0));
  assert.equal(values[2], 1); assert.equal(values[3], -2); assert.equal(values[4], 2 ** -24);
  assert.equal(values[5], 65504); assert.equal(values[6], Infinity); assert.equal(values[7], -Infinity); assert.ok(Number.isNaN(values[8]));
  assert.throws(() => expandHalfBytes(new Uint8Array(1)));
  assert.throws(() => expandModel(new Uint8Array([58, 100, 1]).buffer), /Truncated/);
});

test('taiko colors use encoded hitsounds; unsupported objects are not taps', () => {
  const groups = tokenGroups([59, 1648, 3897, 4071, 109, 3901, 4071, 159, 4091, 209, 4092], 1000);
  assert.deepEqual(groupsToNotes(groups, 5000), [{ timeMs: 1505, lane: 'A' }, { timeMs: 2005, lane: 'D' }]);
  assert.deepEqual(groupsToNotes(groups, 1600), [{ timeMs: 1505, lane: 'A' }]);
});

test('overlap context retains absolute timing after quantization round trip', () => {
  const original = tokenGroups([109, 3897, 4071, 159, 3901, 4071], 0);
  const carried = tokenGroups(contextTokens(original, 500), 500);
  assert.deepEqual(groupsToNotes(carried, 5000), groupsToNotes(original, 5000));
  assert.deepEqual(contextTokens(original, 2000), []);
});
