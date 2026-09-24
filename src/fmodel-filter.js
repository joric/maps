// FModelReader.js, (c) Joric 2025
// loads data from FModel JSON export, returns GeoJSON
// requires three-onlymath.min.js
// can save to a file if needed
// GitHub doesn't allow files larger than 100Mb, so it uses gzip where necessary

async function loadGzip(url, callback) {
  console.time('loaded gzip');
  if (!('DecompressionStream' in window)) {
    console.error('DecompressionStream not supported.');
    return;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error('Network error: ' + response.status);
  const ds = new DecompressionStream('gzip');
  const decompressedStream = response.body.pipeThrough(ds);
  const reader = decompressedStream.getReader();
  
  let chunks = [];
  let totalLength = 0;
  let isFirstChunk = true;
  
  function pump() {
    reader.read().then(({ done, value }) => {
      if (done) {
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        console.timeEnd('loaded gzip');
        callback(result);
        return;
      }
      
      let chunk = value;
      
      // Strip BOM from first chunk
      if (isFirstChunk && chunk.length >= 3) {
        if (chunk[0] === 0xEF && chunk[1] === 0xBB && chunk[2] === 0xBF) {
          chunk = chunk.slice(3);
        }
        isFirstChunk = false;
      }
      
      chunks.push(chunk);
      totalLength += chunk.length;
      
      pump();
    });
  }
  
  pump();
}

function markerLoader(data, area) {
  //let area = 'Supraland';
  let areas = {};
  let outers = {};
  let meshes = {};
  let messengers = {};
  let targets = {};
  let components = {};

  const getObjectName = t => t.ObjectName.split("'")[1];
  const getAssetName = t => t.AssetPathName ? t.AssetPathName.split(".")[1] : t;
  const getName = t => t.ObjectName ? getObjectName(t) : getAssetName(t);

  function getMatrix(o, matrix) {
    matrix = matrix || new THREE.Matrix4();
    if (p = o.Properties) {
      if (p.RelativeLocation) {
        //console.log(o, p.RelativeLocation);
        matrix.premultiply(locRotScale(getVec(p.RelativeLocation), getRot(p.RelativeRotation), getVec(p.RelativeScale3D, 1)));
      }

      for (parent of ['RootObject', 'RootComponent', 'DefaultSceneRoot', 'AttachParent']) {
        if ((node = p[parent]) && (s = node.ObjectName)) {
          let d = s.split("'")[1].split(':')[1].split('.')
          let key = d[1] + '.' + d[2];
          if (t = outers[key]) {
            return getMatrix(t, matrix);
          }
        }
      }
    }
    return matrix;
  }

  function getLocation(o) {
    let matrix = getMatrix(o);
    (m = areas[area]) && matrix.premultiply(m);
    return new THREE.Vector3().setFromMatrixPosition(matrix);
  }

  function getDirection(o) {
    let matrix = getMatrix(o);
    (m = areas[area]) && matrix.premultiply(m);
    return new THREE.Vector3().setFromMatrixColumn(matrix,2).normalize();
  }

  function locRotScale(loc, rot, scale) {
    let t = new THREE.Matrix4().makeTranslation(loc.x, loc.y, loc.z);
    let r = makeRotationFromEuler(rot);
    let s = new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z);
    return new THREE.Matrix4().multiply(t).multiply(r).multiply(s);
  }

  function toRad(x) { return THREE.Math.degToRad(x); }
  function getVec(v,t) { return v ? new THREE.Vector3(v.X, v.Y, v.Z) : new THREE.Vector3(t,t,t); }
  function getRot(v) { return v ? new THREE.Vector3(-toRad(v.Roll), -toRad(v.Pitch), toRad(v.Yaw) ) : new THREE.Vector3() }
  function getQuat(v) { return v ? new THREE.Quaternion(v.X, v.Y, v.Z, v.W) : new THREE.Quaternion(); }

  function makeRotationFromEuler(r) {
    let matrix = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-r.x, -r.y, -r.z));
    let m = matrix.elements; // negate angles, flip rows/columns to match mathutils
    matrix.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11], m[12], m[13], m[14], m[15]);
    return matrix;
  }

  for (const o of data) {
    let outer = o.Outer;

    // new fmodel outer format
    if (o.Outer && o.Outer.ObjectName) {
      let ob = getObjectName(o.Outer);
      if (ob) {
        outer =  ob.split(".")[1];
      }
    }

    let outerPath = outer + '.' + o.Name;

    outers[outerPath] = o;

    if ((p = o.Properties) && (a = p.WorldAsset) && (n = a.AssetPathName) && (t = p.LevelTransform)) {
      let key = n.split('.').pop();
      let m = new THREE.Matrix4().compose(getVec(t.Translation, 0), getQuat(t.Rotation), new THREE.Vector3(1,1,1));
      areas[key] = m
    }

    if (o.Type=='StaticMeshComponent') meshes[outer] = o;
    if (o.Type=='MessengerComponent') messengers[outer] = o;
    if (o.Type=='SupraworldLaunchComponent_C') targets[outer] = o;

    if (o.Type=='BoxComponent') meshes[outer] = o;
    if (o.Type=='CollisionCube') meshes[outer] = o;

    if (o.Type=='BPC_ProximityTextComponent_C') messengers[outer] = o;

    components[outer] = components[outer] || {};
    components[outer][o.Name] = o;
  }

  let features = [];

  for (const o of data) {
    //if (!types[o.Type]) continue;
    //if (!o.Type.endsWith('_C') && !o.Type.includes('TextRenderActor')) continue; // supraland filter

    //if (!o.Type.startsWith('BP_')) continue; // supraland filter

    //if (!o.Type.endsWith('_C') && !o.Type.includes('TextRenderActor') && !o.Type.includes('StaticMeshActor')) continue;
    //if (o.Type.includes('TargetComponent')) continue;

    //if (!o.Type.startsWith('BP_Blackbox_Clickable')) continue;

    // this is the most agressive filter here, use with care
    //if (!o.Type.startsWith('BP_')) continue;

    if (!["BP_", "UWEBoxWorldZone", "BookMark"].some(p => o.Type?.startsWith(p))) continue;

    let c = getLocation(o, area);

    if (o.Properties?.Location) {
      const t = o.Properties.Location;
      c = {x:t.X, y:t.Y, z:t.Z};
    }

    if (c.x==0 && c.y==0 && c.z==0) continue;

    let feature = {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [c.x, c.y, c.z]}, 'properties': {'name': o.Name, 'type': o.Type, 'area': area}};

    let prop = feature.properties;
    const collectStrings = t => t?.SourceString ? [t.SourceString] : (t && typeof t === 'object' ? Object.values(t).flatMap(collectStrings): []);

    if (p=o.Properties) {

      if (p.Exists==false) prop.exists = false;
      if (p.bHidden==true) prop.hidden = true;

      for (const name of ['Pickup Class', 'CustomShopItem', 'InventoryItem', 'CrateItem']) {
        if (p[name]) {
           prop.spawns = getName(p[name]);
        }
      }

      for (const name of ['AssetToUnlock']) {
        if (Array.isArray(p[name])) {
          prop.unlocks = p[name].map(getObjectName);
        }
      }

      if (p['StartupItems']) { //BP_WorldSupplyLocker_C
        prop.spawns = getName(p['StartupItems'][0]['Item'])
      }

      for (const name of ['ActorLabel']) {
        if (o[name]) {
          prop[name] = o[name];
        }
      }

      if (p.RequiredAbilities) prop.abilities = p.RequiredAbilities.map(t => getName(t));
      if (p.Area && p.Area.TagName) prop.area = p.Area.TagName;
      if (p.ProgressionGroup &&  p.ProgressionGroup.TagName) prop.progression = p.ProgressionGroup.TagName;

      if (((c = p.Color) || (c = p.Color_Initial) || (c = p.ButtonColor) || (c = p.LiquidColor)) && typeof c === 'string') prop.color = c;

      let text = collectStrings(p.CharacterTalk||p.ThoughtHint);
      if (text && text.length) prop.text = text;

      if (p.Achievement?.TagName) prop.achievement = p.Achievement.TagName.split('.').pop();


      // save properties for collision cubes
      if (p.CollisionCube && p.DefaultSceneRoot) {
        const parent = 'DefaultSceneRoot';
        if ((node = p[parent]) && (s = node.ObjectName)) {
          let d = s.split("'")[1].split(':')[1].split('.')
          let key = d[1] + '.' + d[2];
          if (t = outers[key]) {
            //return getMatrix(t, matrix);
            prop.rotation = t.Properties.RelativeRotation;
            prop.scale = t.Properties.RelativeScale3D;
          }
        }
      }

      // save properties for regions
      if (p.Region) {
        prop.region = (p.Region.AssetPathName||'').split('/').pop().split('.').pop();
      }

      if (p.ZoneGUID) {
        prop.zone_guid = p.ZoneGUID;
      }

    }

    for (const [name, comp] of Object.entries(components[o.Name]||{})) {
      if (comp.Type == 'TextRenderComponent') {
        let text = collectStrings(comp.Properties);
        if (text && text.length) prop.text = text;
      }
    }

    if ((m = meshes[o.Name]) && (m.Properties && m.Properties.OverrideMaterials)) {
      for (const mat of m.Properties.OverrideMaterials) {
        if (mat) {
          prop.material = getObjectName(mat);
        }
      }
    }

    // save box components, if any (mostly for UWEBoxWorldZone)
    if ((m = meshes[o.Name]) && (m.Properties && m.Properties.BoxExtent)) {
      prop.extent = m.Properties.BoxExtent;
    }

    //if (o.Type=='StaticMeshActor' && !prop.material) continue; // do not add actors without material

    if ((m = messengers[o.Name]) && (s = m.Properties?.MessageEvents?.[0]?.TargetActor?.SubPathString)) {
      prop.actor = s.split('.').pop();
    }

    if ((m = messengers[o.Name]) && (t = m.Properties?.VisibleText)) {
      prop.text_id = [t.TableId.split('.').pop(), t.Key].join('/');
      prop.title = t.SourceString;
    }

    for (const textProp of ['Text','SignalText']) {
      if ((t = p[textProp])) {
        if (t.TableId) {
          prop.text_id = [t.TableId.split('.').pop(), t.Key].join('/');
          prop.title = t.SourceString;
        }
      }
    }

    if ((m = targets[o.Name]) && (t = m.Properties?.TargetLocation)) {
      prop.target = [t.X, t.Y, t.Z];
      if (v = m.Properties?.Velocity) prop.velocity = v;
    }

    features.push(feature);
  }

  return features;
}

function parseLargeJSONArrayExt(buffer) {
  return new Promise((resolve, reject) => {
    const results = [];
    let position = 0;
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    let objectStart = -1;
    
    while (position < buffer.length) {
      const byte = buffer[position];
      const char = String.fromCharCode(byte);
      
      // Handle string boundaries
      if (!escapeNext && char === '"') {
        inString = !inString;
      }
      
      // Handle escape sequences
      if (!escapeNext && char === '\\') {
        escapeNext = true;
      } else {
        escapeNext = false;
      }
      
      // Only track JSON structure when not inside a string
      if (!inString) {
        if (char === '{') {
          if (depth === 0) {
            objectStart = position;
          }
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0 && objectStart !== -1) {
            // Extract and parse one complete object
            const objectBuffer = buffer.slice(objectStart, position + 1);
            const objectStr = new TextDecoder().decode(objectBuffer);
            try {
              const obj = JSON.parse(objectStr);
              results.push(obj);
            } catch (e) {
              reject(new Error(`Failed to parse object at position ${objectStart}: ${e.message}`));
              return;
            }
            objectStart = -1;
          }
        }
      }
      
      position++;
    }
    resolve(results);
  });
}

function parseLargeJSONArray(buffer) {
  console.time('parsed buffer');
  return new Promise((resolve, reject) => {
    try {
      const decoder = new TextDecoder('utf-8');
      const jsonString = decoder.decode(buffer);
      let results = JSON.parse(jsonString);
      console.timeEnd('parsed buffer');
      resolve(results);
    } catch (error) {
      console.warn('Standard parsing failed, trying extended parser:', error.message);
      // Fall back to extended parser
      parseLargeJSONArrayExt(buffer)
        .then(results => {
          console.timeEnd('parsed buffer');
          resolve(results);
        })
        .catch(extError => {
          console.timeEnd('parsed buffer');
          reject(extError);
        });
    }
  });
}

////////////////////////////////////////////////////////////////////////

if (typeof require !== 'undefined' && require.main === module) {
  const fs = require('fs');
  const zlib = require('zlib');
  const vm = require('vm');

  const code = fs.readFileSync('./three-onlymath.min.js', 'utf8');
  vm.runInThisContext(code);

  function addFile(fname, features) {
    let buf = fs.readFileSync(fname, 'utf8');
    if (buf.charCodeAt(0) === 0xFEFF) {
      buf = buf.slice(1);
    }
    let data = JSON.parse(buf);
    let area = fname.replace(new RegExp('^.*[\\\\/]'), '').replace(new RegExp('\\.[^.]*$'), '');
    let o = markerLoader(data, area);
    features.push(...o);
  }

  const directoryPath = 'C:/Temp/Exports/Subnautica2/Content/Maps/Main/L_Main/_Generated_/';

  let files = fs.readdirSync(directoryPath);

  let i = 0;
  let features = [];

  addFile('C:/Temp/Exports/Subnautica2/Content/Maps/Main/L_Main.json', features);

  for (const name of files) {
    let fname = directoryPath + name;
    addFile(fname, features);
    process.stdout.write( `Reading... ${i}/${files.length}     \r`);
    i = i+1;
  }

  let out = { "type": "FeatureCollection", "features": features};
  let s = JSON.stringify(out, null, 2);
  fs.writeFileSync('../data/markers.json', s);
}
