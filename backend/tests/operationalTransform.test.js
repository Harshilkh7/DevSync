import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTextOperation, diffTextToOperation, transformTextOperation } from '../services/operationalTransform.service.js';

test('diff operations recreate their target text', () => {
    const cases = [
        ['', 'hello'], ['hello', ''], ['const a = 1;', 'const a = 2;'],
        ['abcdef', 'aXcdeYf'], ['one\ntwo\nthree', 'one\nTWO\nthree'], ['same', 'same'],
    ];
    for (const [before, after] of cases) {
        assert.equal(applyTextOperation(before, diffTextToOperation(before, after)), after);
    }
});

test('OT orders simultaneous inserts consistently', () => {
    const base = 'abc';
    const stale = diffTextToOperation(base, 'aXbc');
    const committed = diffTextToOperation(base, 'aYbc');
    assert.equal(applyTextOperation('aYbc', transformTextOperation(stale, committed, false)), 'aYXbc');
});

test('OT preserves non-overlapping edits', () => {
    const base = 'abcdef';
    const stale = diffTextToOperation(base, 'aXcdef');
    const committed = diffTextToOperation(base, 'abcdYf');
    assert.equal(applyTextOperation('abcdYf', transformTextOperation(stale, committed, false)), 'aXcdYf');
});

test('OT does not resurrect text removed by a concurrent delete', () => {
    const base = 'abcdef';
    const stale = diffTextToOperation(base, 'abef');
    const committed = diffTextToOperation(base, 'abcd');
    assert.equal(applyTextOperation('abcd', transformTextOperation(stale, committed, false)), 'ab');
});
