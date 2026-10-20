const normalizeTextOperation = (operation = []) => {
    const normalized = [];
    for (const component of operation) {
        if (component == null) continue;
        const type = typeof component.insert === 'string' ? 'insert' : Number.isFinite(component.retain) ? 'retain' : Number.isFinite(component.delete) ? 'delete' : null;
        if (!type) throw new Error('Invalid text operation component');
        const value = type === 'insert' ? component.insert : component[type];
        if ((type === 'insert' && value.length === 0) || (type !== 'insert' && value <= 0)) continue;
        const previous = normalized[normalized.length - 1];
        if (previous && type === 'insert' && typeof previous.insert === 'string') previous.insert += value;
        else if (previous && type !== 'insert' && Number.isFinite(previous[type])) previous[type] += value;
        else normalized.push({ [type]: value });
    }
    return normalized;
};

const fallbackReplacement = (before, after) => {
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
    let suffix = 0;
    while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
    const operation = [];
    if (prefix) operation.push({ retain: prefix });
    if (before.length - prefix - suffix) operation.push({ delete: before.length - prefix - suffix });
    const inserted = after.slice(prefix, after.length - suffix);
    if (inserted) operation.push({ insert: inserted });
    if (suffix) operation.push({ retain: suffix });
    return normalizeTextOperation(operation);
};

// Myers diff keeps independent edits as separate components for reliable rebasing.
export const diffTextToOperation = (beforeValue, afterValue) => {
    const before = String(beforeValue ?? '');
    const after = String(afterValue ?? '');
    if (before === after) return [];
    const n = before.length, m = after.length;
    const maxDistance = Math.min(n + m, 512);
    const vector = new Map([[1, 0]]);
    const trace = [];
    let finished = false;
    for (let distance = 0; distance <= maxDistance; distance++) {
        trace.push(new Map(vector));
        for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
            let x;
            if (diagonal === -distance || (diagonal !== distance &&
                (vector.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY) < (vector.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY))) {
                x = vector.get(diagonal + 1) ?? 0;
            } else x = (vector.get(diagonal - 1) ?? 0) + 1;
            let y = x - diagonal;
            while (x < n && y < m && before[x] === after[y]) { x++; y++; }
            vector.set(diagonal, x);
            if (x >= n && y >= m) { finished = true; break; }
        }
        if (finished) break;
    }
    if (!finished) return fallbackReplacement(before, after);
    let x = n, y = m;
    const reversed = [];
    for (let distance = trace.length - 1; distance >= 0; distance--) {
        const previousVector = trace[distance];
        const diagonal = x - y;
        const previousDiagonal = (diagonal === -distance || (diagonal !== distance &&
            (previousVector.get(diagonal - 1) ?? Number.NEGATIVE_INFINITY) < (previousVector.get(diagonal + 1) ?? Number.NEGATIVE_INFINITY)))
            ? diagonal + 1 : diagonal - 1;
        const previousX = previousVector.get(previousDiagonal) ?? 0;
        const previousY = previousX - previousDiagonal;
        while (x > previousX && y > previousY) { reversed.push({ retain: 1 }); x--; y--; }
        if (distance === 0) break;
        if (x === previousX) { reversed.push({ insert: after[y - 1] }); y--; }
        else { reversed.push({ delete: 1 }); x--; }
    }
    return normalizeTextOperation(reversed.reverse());
};

const createIterator = (operation) => {
    let index = 0, offset = 0;
    const componentType = (component) => typeof component.insert === 'string' ? 'insert' : Number.isFinite(component.retain) ? 'retain' : 'delete';
    const componentLength = (component) => componentType(component) === 'insert' ? component.insert.length : component[componentType(component)];
    return {
        get hasNext() { return index < operation.length; },
        peekType() { return index < operation.length ? componentType(operation[index]) : 'retain'; },
        peekLength() { return index < operation.length ? componentLength(operation[index]) - offset : Number.POSITIVE_INFINITY; },
        takeInsert() { const value = operation[index].insert.slice(offset); index++; offset = 0; return value; },
        consume(length) {
            if (index >= operation.length) return;
            offset += length;
            if (offset >= componentLength(operation[index])) { index++; offset = 0; }
        }
    };
};

export const transformTextOperation = (operation, against, operationHasPriority = false) => {
    const a = createIterator(normalizeTextOperation(operation));
    const b = createIterator(normalizeTextOperation(against));
    const result = [];
    while (a.hasNext || b.hasNext) {
        const aType = a.peekType(), bType = b.peekType();
        if (aType === 'insert' && (operationHasPriority || bType !== 'insert')) { result.push({ insert: a.takeInsert() }); continue; }
        if (bType === 'insert') { result.push({ retain: b.takeInsert().length }); continue; }
        const length = Math.min(a.peekLength(), b.peekLength());
        if (!Number.isFinite(length) || length <= 0) throw new Error('Unable to transform text operation');
        if (aType === 'retain' && bType === 'retain') result.push({ retain: length });
        else if (aType === 'delete' && bType === 'retain') result.push({ delete: length });
        if (aType !== 'insert') a.consume(length);
        if (bType !== 'insert') b.consume(length);
    }
    return normalizeTextOperation(result);
};

export const applyTextOperation = (sourceValue, operation) => {
    const source = String(sourceValue ?? '');
    let sourceIndex = 0, result = '';
    for (const component of normalizeTextOperation(operation)) {
        if (Number.isFinite(component.retain)) {
            result += source.slice(sourceIndex, sourceIndex + component.retain);
            sourceIndex += component.retain;
        } else if (Number.isFinite(component.delete)) sourceIndex += component.delete;
        else if (typeof component.insert === 'string') result += component.insert;
    }
    return result + source.slice(sourceIndex);
};

export const applyTextOperationToYText = (sharedText, operation) => {
    let index = 0;
    for (const component of normalizeTextOperation(operation)) {
        if (Number.isFinite(component.retain)) index += component.retain;
        else if (Number.isFinite(component.delete)) {
            const count = Math.min(component.delete, Math.max(0, sharedText.length - index));
            if (count > 0) sharedText.delete(index, count);
        } else if (typeof component.insert === 'string') {
            sharedText.insert(index, component.insert);
            index += component.insert.length;
        }
    }
};
