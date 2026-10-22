



export function lazyTileState(layer, ownerID) {
  const tiles = layer.lazyHighTiles || (layer.lazyHighTiles = new Map());
  let state = layer.lazyGpuDetail;
  if (!state || state.tiles !== tiles || state.width !== layer.width || state.height !== layer.height)
    layer.lazyGpuDetail = state = { width: layer.width, height: layer.height, tileSize: 256, tiles, version: layer.lazyTileVersion || 0 };
  if (ownerID != null) state.ownerID = ownerID;
  return state;
}

export function lazyTileLevel(layer, ownerID, scale = 1) {
  const root = lazyTileState(layer, ownerID);
  if (scale === 1) return root;
  const levels = root.levels || (root.levels = new Map());
  let level = levels.get(scale);
  if (!level) levels.set(scale, level = { width: root.width, height: root.height, tileSize: 256 * scale, scale, tiles: new Map(), version: 0 });
  if (ownerID != null) level.ownerID = ownerID;
  return level;
}
export function lazyDetailLevels(root) { return root ? [root, ...[...(root.levels?.values() || [])].sort((a, b) => a.scale - b.scale)] : []; }

export function planVisibleTiles(layers, budget, maxPerLayer = 96) {
  const selected = [], used = new Map(); let bytes = 0;
  
  
  
  for (let rank = 0; rank < maxPerLayer; rank++) for (const layer of layers) {
    const cell = layer.cells[rank]; if (!cell) continue;
    const size = cell.bytes;
    if (!(size > 0) || bytes + size > budget) continue;
    selected.push({ ...cell, state: layer.state, index: layer.index });
    bytes += size; used.set(layer.state, (used.get(layer.state) || 0) + 1);
  }
  return { cells: selected, bytes, layers: used.size };
}

export function interleaveTileStreams(cells) {
  const byState = new Map();
  for (const cell of cells) { let list = byState.get(cell.state); if (!list) byState.set(cell.state, list = []); list.push(cell); }
  const streams = [...byState.values()];
  for (const stream of streams) stream.sort((a, b) => a.y - b.y || a.x - b.x);
  const result = [], longest = Math.max(0, ...streams.map(s => s.length));
  for (let rank = 0; rank < longest; rank++) for (const stream of streams) if (stream[rank]) result.push(stream[rank]);
  return result;
}

export function createTileCache({ budget = 64 * 1048576, maxPerState = 96, onEvict = () => {} } = {}) {
  const entries = new Map(), owners = new WeakMap(); let wanted = new Map(), bytes = 0, pinnedBytes = 0, pinnedCount = 0, pinnedByState = new Map(), evictions = 0, rejected = 0;
  const owner = state => { let m = owners.get(state); if (!m) owners.set(state, m = new Map()); return m; };
  const isWanted = (state, key) => wanted.get(state)?.has(key) || false;
  const pin = (e, delta) => {
    if (!isWanted(e.state, e.key)) return;
    pinnedBytes += e.bytes * delta; pinnedCount += delta;
    const count = (pinnedByState.get(e.state) || 0) + delta;
    if (count) pinnedByState.set(e.state, count); else pinnedByState.delete(e.state);
  };
  const rebuildPinned = () => {
    pinnedBytes = 0; pinnedCount = 0; pinnedByState = new Map();
    for (const e of entries.keys()) pin(e, 1);
  };
  function remove(e, changed) {
    pin(e, -1); entries.delete(e); owner(e.state).delete(e.key); bytes -= e.bytes;
    if (e.state.tiles.get(e.key) === e.tile) { e.state.tiles.delete(e.key); e.state.version++; changed.add(e.state); }
    evictions++;
  }
  function trim(state = null) {
    const changed = new Set();
    if (state) for (const e of [...owner(state).values()]) {
      if (owner(state).size <= maxPerState) break;
      if (!isWanted(state, e.key)) remove(e, changed);
    }
    for (const e of entries.keys()) {
      if (bytes <= budget) break;
      if (!isWanted(e.state, e.key)) remove(e, changed);
    }
    for (const s of changed) onEvict(s);
  }
  return {
    get budget() { return budget; },
    get stats() { return { budget, bytes, tiles: entries.size, wanted: [...wanted.values()].reduce((n, s) => n + s.size, 0),
      residentWanted: pinnedCount, evictions, rejected }; },
    isWanted,
    setWanted(cells) {
      wanted = new Map();
      for (const c of cells) { let keys = wanted.get(c.state); if (!keys) wanted.set(c.state, keys = new Set()); keys.add(c.key); }
      rebuildPinned();
      trim();
    },
    get(state, key) {
      const e = owner(state).get(key);
      if (e) { entries.delete(e); entries.set(e, e); const m = owner(state); m.delete(key); m.set(key, e); }
      return state.tiles.get(key);
    },
    put(state, key, tile, { wantedOnly = false } = {}) {
      const size = tile?.data?.byteLength;
      if (!(size > 0) || size > budget || wantedOnly && !isWanted(state, key)) { rejected++; return false; }
      const previous = owner(state).get(key);
      const previousPinned = previous && isWanted(state, key);
      if (pinnedBytes - (previousPinned ? previous.bytes : 0) + size > budget ||
          (pinnedByState.get(state) || 0) - (previousPinned ? 1 : 0) >= maxPerState) { rejected++; return false; }
      if (previous) { pin(previous, -1); entries.delete(previous); owner(state).delete(key); bytes -= previous.bytes; }
      const e = { state, key, tile, bytes: size };
      owner(state).set(key, e); entries.set(e, e); bytes += size; pin(e, 1);
      state.tiles.set(key, tile); state.version++;
      trim(state);
      return state.tiles.get(key) === tile;
    },
    clear() {
      wanted = new Map(); const changed = new Set();
      rebuildPinned();
      for (const e of entries.keys()) remove(e, changed);
      for (const s of changed) onEvict(s);
    },
    releaseOwner(ownerID) {
      for (const state of wanted.keys()) if (state.ownerID === ownerID) wanted.delete(state);
      rebuildPinned();
      const changed = new Set();
      for (const e of entries.keys()) if (e.state.ownerID === ownerID) remove(e, changed);
      for (const s of changed) onEvict(s);
    },
  };
}
