let regexCache = null;

export function getType (o, typeData) {
  // preprocess regex cache on first call
  if (!regexCache) {
    regexCache = new WeakMap();

    function preprocess(node) {
      if (!node.match) return;

      const nodeCache = {};
      for (const [field, map] of Object.entries(node.match)) {
        const arr = [];
        for (const [k, entry] of Object.entries(map)) {
          if (/[\^\*\+\$\|\(\)\[\]\{\}]/.test(k)) {
            arr.push({ re: new RegExp(k, "i"), entry });
          }
        }

        if (arr.length) {
          arr.sort((a,b)=>(b.entry?.weight??0)-(a.entry?.weight??0));
          nodeCache[field] = arr;
        }
      }

      regexCache.set(node, nodeCache);

      // recurse into child nodes
      for (const map of Object.values(node.match)) {
        for (const entry of Object.values(map)) {
          if (entry && typeof entry === "object") preprocess(entry);
        }
      }
    }

    preprocess(typeData.types ?? typeData);
  }

  // resolve a possibly-dotted field path against an object
  function resolvePath (obj, path) {
    if (!path.includes(".")) return obj?.[path];
    const parts = path.split(".");
    let cur = obj;
    for (const p of parts) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[p];
    }
    return cur;
  }

  function rec(node, t = {}) {
    // collect non-object props except "replace"
    const prop = Object.fromEntries(
      Object.entries(node).filter(([k, v]) => typeof v !== "object" || k === "replace")
    );

    for (const [field, exactMap] of Object.entries(node.match || {})) {
      const value = resolvePath(o, field);

      // skip when the path doesn't resolve
      if (value === undefined) continue;

      // 1) exact match
      const ex = exactMap[value];
      if (ex) return rec(ex, { ...t, category: value, ...prop });

      // 2) regex match from cache
      const cached = regexCache.get(node)?.[field] || [];
      for (const r of cached) {
        if (typeof value === "string" && r.re.test(value)) {
          return rec(r.entry, { ...t, category: value, ...prop });
        }
      }
    }

    return { ...t, ...prop };
  }

  return rec(typeData.types ?? typeData);
}
