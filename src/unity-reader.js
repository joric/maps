// EntitiesReader.js, (c) Joric 2025
// See EntitiesTool.cs
// loads data from Unity JSON export, returns GeoJSON
// you can use it to save to a file if needed

function loadMarkersRecursive(features, items, prefix='', level = 0) {
  if (!items) return;
  for (const o of items) {
    let path = prefix + (prefix ? '/' : '') + o.name;
    let p = o.position;
    if (p && p.length==3 && p.every(x=>x!=0)) {
      let [x,y,z] = [p[0],-p[2], p[1]];
      let c = [x,y,z];
      let feature = {type: 'Feature', geometry: {type: 'Point', coordinates: c}, properties: {name: o.name, type: o.type, path: path}};
      features.push(feature);
    }
    loadMarkersRecursive(features, o['children'], path, level + 1);
  }
}

export function markerLoader(data) {
  let features = []
  loadMarkersRecursive(features, data.items);
  return features;
}

if (typeof process !== 'undefined' && import.meta.url === `file:///${process.argv[1]}`.replaceAll('\\','/')) {
  const fs = require('fs');

  for (const area of ["jungle", "desert", "mountain"]) {
    const fname = `../data/${area}.json`;

    fs.readFile(fname, (err, buffer) => {
      if (err) {
        console.error(err);
        return;
      }

      const data = JSON.parse(buffer);
      const features = markerLoader(data);
      const json = JSON.stringify(features, null, 2);

      const outname = `out_${area}.json`;
      fs.writeFileSync(outname, json, 'utf8');
      console.log(`saved to ${outname} (${features.length} features)`);
    });
  }
}

