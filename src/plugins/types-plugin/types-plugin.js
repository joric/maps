/*
  parses types.json, pre-compiles regex entries.
  non-ascii keys are pre-sorted with "weight" parameter and compiled with new RegExp
  all fields are inherited while parsing, weight and icon can be re-used for groups
  example format:
{
  "icon": "misc",
  "group": "misc",
  "match": {
    "description": {
      "Note": { "category": "Note", "group": "custom", "weight": -10000, "icon": "note" }
    },
    "signature": {
      "ACTI": {
        "group": "misc",
        "weight": 1000,
        "match": {
          "editor_id": {
            "DN011OverdueBookVendMachine": { "category": "Book Terminal", "icon": "book_terminal" },
            "FOLON_ACTI_LQLondon100": { "category": "Tardis", "icon": "call_box" },
            "Folon_ACTI_BarryBoatBeacon": { "category": "Water Signal Beacon", "icon": "water_signal_beacon" },
            "Folon_ACTI_CutethulhuDollActivator": { "category": "Cutethulhu Activator", "icon": "cutethulhu_activator" },
            "Folon_ACTI_TaxiActivatorFT": { "category": "Taxi", "icon": "taxi" },
            ".*loot_capsStash_ti": { "category": "Tickets", "icon": "tickets", "weight": -1 }
          }
        }
      }
    }
  }
}
*/

let regexCache = null;

let getType2 = function(o) {
  // preprocess regex cache on first call
  if (!regexCache) {
    regexCache = new WeakMap();

    function preprocess(node) {
      if (!node.match) return;

      const nodeCache = {};
      for (const [field, map] of Object.entries(node.match)) {
        const arr = [];
        for (const [k, entry] of Object.entries(map)) {
          if (/[^A-Za-z0-9_]/.test(k)) {
            arr.push({ re: new RegExp(k, "i"), entry });
          }
        }
        if (arr.length) nodeCache[field] = arr;
      }

      regexCache.set(node, nodeCache);

      // recurse into child nodes
      for (const map of Object.values(node.match)) {
        for (const entry of Object.values(map)) {
          if (entry && typeof entry === "object") preprocess(entry);
        }
      }
    }

    preprocess(typeData);
  }

  function rec(node, t = {}) {
    // collect non-object props except "replace"
    const prop = Object.fromEntries(
      Object.entries(node).filter(([k, v]) => typeof v !== "object" || k === "replace")
    );

    if (prop.icon && !prop.category) t.category_icon = t.icon;

    for (const [field, exactMap] of Object.entries(node.match || {})) {
      const value = o[field];
      if (!value) continue;

      // 1) exact match
      const ex = exactMap[value];
      if (ex) return rec(ex, { ...t, category: value, ...prop });

      // 2) regex match from cache
      const cached = regexCache.get(node)?.[field] || [];
      for (const r of cached) {
        if (r.re.test(value)) return rec(r.entry, { ...t, category: value, ...prop });
      }
    }

    return { ...t, ...prop };
  }

  return rec(typeData);
}

