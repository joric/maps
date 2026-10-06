// local imports
import './main.css';
import './controls.css';

// dependencies
import * as maptalks from 'maptalks-gl';
import 'maptalks/dist/maptalks.css';
import { FuseWorker } from 'fuse.js/worker';

import { SearchControl } from './search-control.js';
import { MenuControl } from './menu-control.js';
import { PopupControl } from './popup-control.js';
import { LayersControl } from './layers-control.js';
import { MarkersControl } from './markers-control.js';
import { SidebarControl } from './sidebar-control.js';

import * as utils from './utils.js';
import { getType } from './marker-types.js';
import { getIcon } from './marker-icons.js';


import * as unity from './unity-reader.js';

const RUNNING_MODE = window.location.protocol === 'file:'  ? 'file' : ( import.meta.env.DEV  ? 'dev' : 'prod' );

console.log('RUNNING_MODE', RUNNING_MODE);

let submodulesBase = RUNNING_MODE === 'file' ? '../submodules/' : ( RUNNING_MODE === 'dev'  ? 'submodules/' : 'https://joric.github.io/' );

console.log('submodulesBase', submodulesBase);

let customImagesDefault = true;
let allowLines = false;
let extentOnSearch = false;

let slugs = [
  'stalker',
  'folon',
  'subnautica',
  'supraland',
  'supraworld',
  'fuszerka',
  'ootss',
  'breathedge2',
  'windlands',
  'zelda'
];

//let repoName = location.href.split('/').pop().split('#')[0];
//const getMapURL = name => window.location.href.split('/').slice(0, -1).join('/') + '/' + name;

const url = new URL(window.location.href);
let repoName = url.searchParams.get('map');
if (!slugs.includes(repoName)) repoName = slugs[0];

const getMapURL = name => {
  const url = new URL(window.location.href);
  url.searchParams.set('map', name);
  return url.href;
};

const switchMap = name => {
  window.location.href = getMapURL(name);
};

let spriteIndex = 0;

let allFeatures = [];
let allRegions = [];

const defaultPitch = 50;
let fuse;
let map;

let maxZoom = 19;
let startZoom = 0.5;
let focusZoom = 5;

let filterData = {};
let layers = [];
let config = {};

let searchString = '';
let baseDir = '';

let markerTypes = {};
let iconData = {};
let markerData = {};

// cell-specific (creation engine, folon)
let cell_doors = {};
let exits = {};

let lang = {};
let popup;

let markersControl = null;
let searchControl = null;

let localDataName = `localData-maps-${repoName}`;
let localData = JSON.parse(localStorage.getItem(localDataName)) ?? {};
let settings = {};

let icons = {};
let counters = {};
let cachedTitles = {};

let currentWorld = null;

window.setLanguage = function (cc) {
  settings.language = cc;
  saveSettings();
  location.reload();
}

window.setcustomImages = function (allow) {
  settings.customImages = allow ? true : false;
  saveSettings();
  location.reload();
}

function saveSettings() {
  localStorage.setItem(localDataName, JSON.stringify(localData));
}

function getTilesetURL(config, section) {
  let url = section.urlTemplate ||'';
  if (!url.startsWith('http')) url = submodulesBase + repoName +'/' + url;
  url = url.replace('https://joric.github.io/', submodulesBase);
  return url;
}

const capitalize = s => (s && s.length>0) ? s[0].toUpperCase()+s.slice(1) : '';

function translate(s, section) {
  s  = String(s);

  if (!section) section = 'items';

  const k = markerTypes?.[section]?.[s]?.title;
  if (k) {
    const [p, e] = k.split('.');
    let res = e ? lang[p]?.[e] : lang[k];
    if (res) return res;
  }

  if (section == 'categories') {
    let ct = cachedTitles[s];
    if (ct) {
      return ct;
    }
  }

  let templates_fn = [
    name => name,
    name => `sid_locations_region_${name}_name`,
    name => `sid_items_${name}_name`,
    name => `sid_items_DLC01_${name}_name`,
    name => `sid_notes_${name}_name`,
    name => `sid_questItemprototypes_${name}_name`,
  ];

  for (const make of templates_fn) {
    const key = make(s);
    if (lang[key]) return lang[key];
  }

  return lang[s] || capitalize(s??'');
}

function getPolygon(feature) {
  const [x,y,z] = applyMapping(feature.geometry.coordinates);
  for (const polygon of allRegions) {
    if (utils.ptInPoly({x: x, y: y}, polygon.getCoordinates()[0])) return polygon;
  }
}

function addRegionMarkers() {
  if (allRegions.length==0) return;

  let colors = Object.values(config.worlds)[0].regions?.[0]?.colors;

  if (!colors) return;

  if (allFeatures.filter(f => f._type.regionMarker).length!=0) return;

  let count = allFeatures.length;

  let idx = 0;

  for (const polygon of allRegions) {

    let region = colors[polygon.properties.color] || `region-${idx}`;

    idx += 1;

    let center = utils.getWeightedCentroid(polygon.getCoordinates()[0]);

    let feature = {
      geometry: { coordinates: reverseMapping(center) },
      properties: { name: region, transient: true, type: 'regionMarker' }
    }

    feature._type = getType(feature.properties, markerTypes);
    let t = feature._type
    t.type = 'regionMarker';
    t.regionMarker = true;
    t.region = region;

    polygon.properties.region = region;

    //console.log('adding region marker', region, polygon._coordinates);

    allFeatures.push(feature);
  }

  console.log(`[added ${allFeatures.length-count} region markers]`);
}

function nameRegions() {
  allFeatures.filter(f => f._type?.regionMarker).forEach(feature => {
    const polygon = getPolygon(feature);
    if (polygon && !polygon.properties.region) {
      polygon.properties.region = feature.properties.sid || feature.properties.name;
      let point = utils.getWeightedCentroid(polygon.getCoordinates()[0]);
      feature.geometry.coordinates[0] = point.x;
      feature.geometry.coordinates[1] = point.y;
    }
  });
}

function calculateCells() {
  console.time('calculateCells');

  const ref_lookup = {};

  // fill lookup tables
  for (const feature of allFeatures) {
    const o = feature.properties;
    ref_lookup[o.ref_id] = feature;
    if (o.cell && o.other_door) {
      cell_doors[o.cell] = (cell_doors[o.cell]||[]);
      cell_doors[o.cell].push(feature);
    }
  }

  function find_path(cell_id) {
    const visited = new Set();
    const queue = [[cell_id, []]];

    while (queue.length > 0) {
      const [current_cell_id, path] = queue.shift();
      if (visited.has(current_cell_id)) continue;
      visited.add(current_cell_id);
      for (const door of cell_doors[current_cell_id]||[]) {
        const next_door = ref_lookup[door.properties.other_door];
        if (next_door.properties.area) return [...path, door, next_door];
        queue.push([next_door.properties.cell, [...path, door]]);
      }
    }

  }

  const visited = new Set();
  function find_path_rec(cell_id, clear = true) {
    if (clear) visited.clear();
    if (visited.has(cell_id)) return null;
    visited.add(cell_id);
    let doors = cell_doors[cell_id];

    for (const door of doors||[]) {
      const next_door = ref_lookup[door.properties.other_door];
      if (!next_door || !next_door.properties) return null;
      if (next_door.properties.area) return [door, next_door]; // Return the path
      const result = find_path_rec(next_door.properties.cell, false);
      if (result) return [door, ...result]; // Append current door to the path
    }
  }

  for (const cell_id of Object.keys(cell_doors)) {
    exits[cell_id] = find_path_rec(cell_id);
  }

  console.timeEnd('calculateCells');
}



function assignRegions() {
  console.time('assignRegions');

  for (const polygon of allRegions) {
    if (!polygon.properties.region) return;
  }
  allFeatures.forEach(feature => {
    const polygon = getPolygon(feature);
    if (polygon && feature._type) {
      feature._type.region = polygon.properties.region;
    }
  });

  console.timeEnd('assignRegions');
}

function assignTypes() {
  allFeatures.forEach(feature => {
    feature._type = getType(feature.properties, markerTypes);
  });
}

function getFuse() {
  console.time('indexing');

  let data = [];
  for (const i in allFeatures) {
    const feature = allFeatures[i];
    const { _geom, ...rest } = feature; // exclude geom, it's non-clonable
    const info = renderItem(feature);
    const text = Object.values(info).join(' ');
    data.push({ featureIndex: i, ...rest, text: text });
  }

  console.timeEnd('indexing');

  let options = {
    keys: [
      {name: 'text', weight: 0.5},
      {name: 'properties.title', weight: 0.4},
      {name: 'properties.name', weight: 0.3},
      {name: 'properties.type', weight: 0.2},
      {name: 'properties.item', weight: 0.1},
      {name: '_type.group', weight: 0.05},
    ],
    threshold: 0.1,
    ignoreLocation: true,
    includeScore: true,
    useExtendedSearch: true,
    findAllMatches: false,
    numWorkers: navigator.hardwareConcurrency || 4
  };

  const WORKER_CDN = __FUSE_WORKER_CDN__;
  const remoteWorker = !import.meta.env.DEV;

  const opts = {};
  if (remoteWorker) {
    console.log('adding fuse worker from', WORKER_CDN);
    opts.workerUrl = URL.createObjectURL(
      new Blob([`import ${JSON.stringify(WORKER_CDN)};`], { type: 'text/javascript' })
    );
  }

  return new FuseWorker(data, options, opts);
}

function renderItem(feature) {
  let o = feature?.properties ?? {};
  let t = feature?._type ?? {};
  let title = translate(o.title || o.name);
  let subtitle = translate(t.group, 'groups');
  if (t.category) subtitle += ' / ' + translate(t.category, 'categories');
  if (t.item) subtitle += ' / ' + translate(t.item);
  let location = translate(t.region || o.area || o.cell || o.type);

  if (o.cell) {
    location = markerData.cells?.[o.cell]; // folon
  }

  return {title: `${title} (${subtitle})`, location: location};
}

const openTooltip = (marker, tooltip) => {
  let info = renderItem(marker.feature);
  tooltip._content = `${info.title}`;
}

const openPopup = (marker, forced) => {
  //const coordinate = new maptalks.Coordinate(feature.geometry.coordinates);
  //const containerPoint = map.coordinateToContainerPoint(coordinate);
  //let text = JSON.stringify(feature.properties, null, 2);
  //let html = text.replaceAll('\n','<br>');
  //popup.setText(html);
  //popup.setContent(`<pre>${text}</pre>`);
  //popup.show(containerPoint.x, containerPoint.y, forced);

  let o = marker.feature.properties;
  let t = marker.feature._type;

  let text = ''

  //text += `<pre>${JSON.stringify(t, null, 2)}</pre>`;

  //text += `<pre>${JSON.stringify({geometry: marker.feature.geometry, properties: marker.feature.properties}, null, 2)}</pre>`;

  text += `<pre>${JSON.stringify({_type: t, properties: o, geometry: marker.feature.geometry }, null, 2)}</pre>`;

  let content = `<div class="popup-text">${text}</div>`;


  //popup.setContent();
  //let contentElement = document.querySelector('.popup-content');
  //console.log(popup);

  let infoWindow = marker.getInfoWindow();

  infoWindow.setTitle(o.name);
  infoWindow.setContent(content);

  let symbol = marker.getSymbol();
  if (Array.isArray(symbol)) symbol = symbol[0];

  if (symbol.markerVerticalAlignment==='middle') {
    infoWindow.config({dy: symbol.markerHeight/2+5, dx: 0});
  }

  if (symbol.textName) {
    infoWindow.config({dy: 12, dx: 0});
  }

  marker.openInfoWindow(marker.getCoordinates());

  //document.querySelector('.popup-text')?.addEventListener('contextmenu', function(e) { e.stopPropagation()}, true);
}

function setOverlay(show, name, overlays) {
  const layer = overlays[name];
  if (layer) {
    if (show) {
      settings.overlays[name] = true;
      layer.show();
    } else {
      layer.hide();
      delete settings.overlays[name];
    }
  }
  saveSettings();
}

function setBaseLayer(name, baseLayers) {
  let sections = Object.values(config.worlds)[0].baseLayers;

  settings.baseLayerName = name;
  saveSettings();

  let mapSize = config.size;
  let tileSize = 512;
  let center = { left: mapSize/2, top: mapSize/2 };
  let bounds = { left: 0, top: 0, right: mapSize, bottom: mapSize };

  for (const section of sections) {
    let visible = name == section.name;

    if (visible) {

      if (section.bounds) {
        bounds = section.bounds;
        mapSize = bounds.right - bounds.left;
      }

      let spatialReference = {
        projection: 'identity',
        fullExtent: bounds,
        resolutions: Array.from({ length: maxZoom + 1 }, (_, i) => mapSize / tileSize / (1 << i)),
      };

      map.config('spatialReference', spatialReference );

    }
  }

  let layer = baseLayers[name];

  layer.show();

  for (const [layerName, layer] of Object.entries(baseLayers)) {
    if (name != layerName) {
      layer.hide();
    }
  }
}

function addMap() {
  const initialSearch = 'Dnipro';

  let mapSize = config.size;
  let tileSize = 512;

  let searchText = initialSearch.toLowerCase();
  //let center = { left: mapSize/2, top: mapSize/2 };

  let sections = Object.values(config.worlds)[0].baseLayers;

  let baseLayers = {};  
  let overlays = {};

  const validNames = new Set(sections.map(s => s.name));
  const baseLayerName = validNames.has(settings.baseLayerName)
    ? settings.baseLayerName
    : sections.find(s => !s.overlay)?.name ?? sections[0].name;

  settings.baseLayerName = baseLayerName;

  let baseLayerBounds = [{}, {}];
  
  // pre-create all base layers
  for (const section of sections) {

    let center = { left: mapSize/2, top: mapSize/2 };
    let bounds = { left: 0, top: 0, right: mapSize, bottom: mapSize };

    let name = section.name || 'default';

    if (!baseLayerName) baseLayerName = name;

    let visible = section.overlay ? settings.overlays[name]===true : baseLayerName == name;

    if (section.bounds) {
      bounds = section.bounds;
      //mapSize =  section.size ? section.size : mapSize; //bounds.right - bounds.left;
    }

    center = {
      left: bounds.left + (bounds.right-bounds.left)/2,
      top: bounds.top + (bounds.bottom-bounds.top)/2,
    };

    if (visible && !section.overlay) {
      let mapSize = bounds.right - bounds.left;
      baseLayerBounds = [{...bounds}, {...center}];
    }

    let k = (bounds.bottom - bounds.top) / (bounds.right-bounds.left);
    if (k<0) k = -k;

    let layer = new maptalks.TileLayer(name, {
      urlTemplate: getTilesetURL(config, section),
      maxAvailableZoom: section.maxAvailableZoom || 4,
      tileSize: section.tileSize || tileSize,
      repeatWorld: false,
      tileSystem: [1, -1 * k, bounds.left, bounds.top],
      visible: visible,
    });

    if (section.overlay) {
      overlays[name] = layer;
    } else {
      baseLayers[name] = layer;
    }
  }

  let [bounds, center] = baseLayerBounds;

  map = new maptalks.Map('map', {
    center: [center.left, center.top],
    zoom: startZoom,
    baseLayer: Object.values(baseLayers)[0],
    spatialReference: {
      projection: 'identity',
      fullExtent: bounds,
      resolutions: Array.from({ length: maxZoom + 1 }, (_, i) => mapSize / tileSize / (1 << i)),
    },
    zoomControl: { position  : {bottom: 70, right: 20}, zoomLevel : false, },
    attribution: { position: {top: -50}, },
  });

  /*
  const orig = map.pixelToDistance.bind(map);
  const k = mapSize / tileSize / 100 / 1000; // correction factor
  map.pixelToDistance = (dx, dy) => orig(dx, dy) * k;

  const scale = new maptalks.control.Scale({
      position: { bottom: 25, left: 120 },
      maxWidth: 250,
      metric: true,
      imperial: false
  }).addTo(map);
  */

  map.on('mousemove', function(e){
    const p = e.coordinate;
    let text = `${map.getZoom().toFixed(2)}x ${p.x.toFixed(0)}, ${p.y.toFixed(0)}`;
    let div = document.querySelector(`.info`);
    if (div) div.innerHTML = text;
    //window.location.hash = `pointer=[${p.x.toFixed(0)},${p.y.toFixed(0)}]`;
  });

  if (settings.center && settings.zoom) {
    map.setView({
      center: settings.center,
      zoom: settings.zoom || 0,
      bearing: settings.bearing || 0,
      pitch: settings.pitch || 0,
    })
  }

  map.on('viewchange', e=> {
    settings.center = [e.new.center[0],e.new.center[1]];
    settings.bearing = e.new.bearing;
    settings.pitch = e.new.pitch;
    settings.zoom = e.new.zoom;
    saveSettings();
  });

  let html = '';

  if (config.localization) {
    const files = config.localization.files || {};
    const current = settings?.language;
    const options = Object.keys(files)
      .map(key => `<option value="${key}"${key === current ? ' selected' : ''}>${key}</option>`)
      .join('');
    html = `<br>language: <select onchange="setLanguage(this.value)">${options}</select>`;
  }

  html += `
    <br><br><label><input type=checkbox name=customImages onchange="setcustomImages(this.checked)" ${settings.customImages ? 'checked':''}/> customImages</label>
  `;

  const sidebarControl = new SidebarControl(null, {
    title: config.name,
    items: Object.fromEntries(slugs.map(slug => [slug, { name: slug }])),
    html: html,
    callback: switchMap,
  });

  searchControl = new SearchControl(null, {
    //placeholder: config.name,
    placeholder: translate('search...'),
    settings: settings,
    menuCallback: sidebarControl.open,
    searchCallback: query => fuzzySearch(query),
    searchOnSubmit: query =>  fuzzySearch(query),
    searchRenderItem: searchRenderItem,
    searchOnSelect: fuseResult => {
      let marker = allFeatures[fuseResult.item.featureIndex]?._geom;
      if (marker) {
        //map.animateTo({center: marker.getCoordinates(), zoom: focusZoom});
        openPopup(marker);
      }
    },
  });


  for (const [layerName, layer] of Object.entries(baseLayers)) {
    layer.addTo(map);
  }

  for (const [layerName, layer] of Object.entries(overlays)) {
    layer.addTo(map);
  }

  let items = {};

  for (const section of sections) {
    let url = getTilesetURL(config, section);
    let image =  url.replace(/\{[xyz]\}/g, '0');
    items[section.name] = {image: image, title: section.name, 

      visible: section.overlay ? settings.overlays[section.name]===true : section.name === settings.baseLayerName,

      overlay: section.overlay, size: section.size, base: Math.pow(2, section.maxAvailableZoom + Math.log2(tileSize)) };
  }

  items = {...items};

  const layersControl = new LayersControl(null, {
    items: items,
    callback: (name, show) => {
      if (baseLayers[name]) {
        setBaseLayer(name, baseLayers);
      } else if (overlays[name]){
        setOverlay(show, name, overlays);
      }
    }
  });

  //const toggleView = e => map.getBearing() != 0 ? map.animateTo({ bearing: 0 }) : map.setView({ pitch: 0 });

  function customAnimateTo(map, targetView, duration = 200) {
      const startView = { pitch: map.getPitch() };
      const startTime = performance.now();
      function animate(currentTime) {
          const elapsed = currentTime - startTime;
          const progress = Math.min(1, elapsed / duration);
          const pitch = startView.pitch + (targetView.pitch - startView.pitch) * progress;
          map.setView({pitch: pitch});
          if (progress < 1) {
              requestAnimationFrame(animate);
          }
      }
      requestAnimationFrame(animate);
  }

  function toggleView(e) {
    if (map.getBearing()!=0) {
      map.animateTo({ bearing: 0 });
    } else {
        let newPitch = map.getPitch()!=0 ? 0 : defaultPitch;
        //map.animateTo({pitch: newPitch });
        //animateto fails here for some reason if clicked from compass (maptalks-gl@0.124.4 issue)
        customAnimateTo(map, { pitch: newPitch });
    }
  }

  new maptalks.control.Compass({ position: 'bottom-right' }).addTo(map)._compass.onclick = toggleView;

  // sceneconfig options https://doc.maptalks.com/docs/api/vt/point-layer/

  let layerOptions = { sceneConfig: { depthFunc: '<=' } };

  let polygonOptions = { maxZoom: 3 }

  let groupLayer = new maptalks.GroupGLLayer('features', [], {}).addTo(map);

  layers.regions = new maptalks.PolygonLayer('regions', [], { ...polygonOptions, maxZoom: 4 } ),
  layers.circles = new maptalks.PolygonLayer('circles', [], { ...polygonOptions, minZoom: 3, maxZoom: 6 } ),
  layers.lines   = new maptalks.LineStringLayer('lines', [], { ...layerOptions, minZoom: 2, maxZoom: 3 } ),
  layers.markers = new maptalks.PointLayer('markers', [], layerOptions ), // must be the last to be clickable

  Object.values(layers).forEach(layer => layer.addTo(groupLayer));

  popup = new PopupControl();

  let mapEl = document.querySelector('#map');
  mapEl.setAttribute('tabindex', '0');
  mapEl.addEventListener('pointerdown', function () {
    mapEl.focus();
  });

  window.addEventListener('keydown', function (e) {
    if (document.activeElement === document.querySelector('#search')) return;
    if (document.activeElement === document.querySelector('.search-input')) return;
    if (e.code == 'KeyR' && !e.ctrlKey) toggleView();
    if (/^Digit[1-9]$/.test(e.code) && +e.code.slice(5) <= slugs.length) switchMap(slugs[+e.code.slice(5)-1]);
  });
}

function indexMarkers() {
  assignTypes();
  addRegionMarkers();
  nameRegions();
  assignRegions();
  calculateCells();

  const icons = {};

  for (const feature of allFeatures) {
    let t = feature._type;
    if (t.hidden) continue;
    counters[t.group] = counters[t.group] || {};
    counters[t.group][t.category] = (counters[t.group][t.category] || 0) + 1;
    icons[t.category] = iconData[t.icon];
    if (t.title) cachedTitles[t.category] = t.title;
  }

  //menuControl = new MenuControl(null,{});

  markersControl = new MarkersControl(counters, {icons: icons, groups:markerTypes?.groups??{}, groupCallback: toggleGroup, itemCallback: toggleItem, translate: translate, theme: 'retro' });

  if (!settings.activeItems) {
    settings.activeItems = {};

    Object.entries(markerTypes.groups ?? {})
      .filter(([group, value]) => value.default)
      .flatMap(([group]) => Object.keys(counters[group] ?? {}))
      .forEach(name => settings.activeItems[name] = true);

    Object.entries(markerTypes.categories ?? {})
      .filter(([name, value]) => value.default)
      .forEach(([name, value]) => settings.activeItems[name] = true);
  }

  saveSettings();

  updateControls(); // update pill headers (required, later move to control)

  if (!fuse) fuse = getFuse();
}

function resetSearch() {
  searchString = '';
  filterData = {};
  searchControl._input.value = '';
}

async function fuzzySearch(s, limit=1024) {
  let searchTimer;
  clearTimeout(searchTimer);

  searchString = s || '';

  if (searchString === '') {
    filterData = {};
    searchTimer = setTimeout(scheduleUpdate, 100);
    return;
  }

  if (!fuse) return;

  let result = await fuse.search(s, { limit: limit });
  const cmpAlphaNum2 = (a,b) => a.localeCompare(b, 'en', { numeric: true });
  result.sort( (a,b)=> a.score - b.score || cmpAlphaNum2(a.item.properties.name||'', b.item.properties.name||'') ) ;

  let extent = null;

  for (const r of result) {
    let key = getKey(r.item);
    filterData = extent ? filterData : {}
    filterData[key] = true;
    const [x, y, z] = applyMapping(r.item.geometry.coordinates);
    const c = new maptalks.Coordinate(x, y);
    extent = extent ? extent.combine(c) : new maptalks.Extent(c, c);
  }

  if (extent && extentOnSearch) {
    map.setMaxZoom(5);
    map.fitExtent(extent, -0.2);
    map.setMaxZoom(maxZoom);
  }

  searchTimer = setTimeout(scheduleUpdate, 100);

  return result;
}

function searchRenderItem(ref) {
  let info = renderItem(allFeatures[ref.item.featureIndex]);
  return `<span class="search-item-row" title="${info.title} [${ref.score}]"><span class="search-item-left">${info.title}</span><span class="search-item-right">${info.location}</span></span>`;
}

// --- filter -----------------------------------------------------------

function getKey(feature) {
  return feature.properties.sid || feature.properties.ref_id || feature.properties.name;
}

function currentFilter(feature) {
  let key = getKey(feature);
  let t = feature._type;

  if (t.hidden) return false;

  if (searchString === '') {
    let visible = settings.activeItems[t.category] === true;
    return visible;
  }

  return searchString=='' || filterData[key] !== undefined;

}

function applyMatrix(coords, m) {
  // swap+rotaton, e.g. { "matrix": [[1,0,0],[0,0,1],[0,-1,0]] }
  return m.map(row => row[0]*x + row[1]*y + row[2]*z);
}


const DEFAULT_MAPPING = [["x", 1], ["y", 1], ["z", 1]];

function applyMapping(coords) {
  let world = Object.values(config.worlds)[0];
  const mapping = world.markers?.mapping ?? DEFAULT_MAPPING;
  const [x, y, z] = coords;
  const source = { x, y, z };
  let p = mapping.map(([axis, sign]) => sign * source[axis]);
  return p;
}

function reverseMapping(p) {
  let world = Object.values(config.worlds)[0];
  const mapping = world.markers?.mapping ?? DEFAULT_MAPPING;
  let q = [p.x, p.y, p.z ?? 0];
  const source = { x: 0, y: 0, z: 0 };
  mapping.forEach(([axis, sign], i) => {
    source[axis] = q[i] / sign;
  });
  return [source.x, source.y, source.z];
}

function getSymbol(o, t) {
  let icon = getIcon(t, iconData, {baseDir: baseDir, spriteIndex: spriteIndex, customImages: settings.customImages});

  var symbol = {
    markerFile   : icon.image,
    markerWidth  : icon.width,
    markerHeight : icon.height,
    markerDx     : 0,
    markerDy     : 0,
    markerVerticalAlignment: icon.baseline,
  };

  if (t.regionMarker) {
    const textSymbol = {
        textName : translate(o.title||o.name),
        textFaceName : 'sans-serif',
        textFill : '#fff',
        textSize : 16,
        textHaloFill      : '#000',
        textHaloRadius    : 2,
        textHaloOpacity   : 128,
        //textHorizontalAlignment : 'right',
        //textDx: icon.width/4,
        textHorizontalAlignment : 'middle',
        textDx: 0,
        textDy: 0,
    };
    //symbol = [symbol, textSymbol];

    symbol = [textSymbol];
  }

  return symbol;
}

function rotate2d( x,y, angle, cx, cy ) {
  x = x - cx;
  y = y - cy;
  let tx = x * Math.cos(angle) - y * Math.sin(angle);
  let ty = x * Math.sin(angle) + y * Math.cos(angle);
  x = tx + cx;
  y = ty + cy;
  return [x,y];
}

function itemArea(o) {
  if (o.area) return o.area;
  let path = exits[o.cell];
  if (path && path.length>0) {
    return path[path.length-1].properties.area;
  }
}

function createGeometry(feature) {
  const o = feature.properties;

  let [x, y, z] = applyMapping(feature.geometry.coordinates);

  let area = itemArea(o);

  if (o.cell) {
    let path = exits[o.cell];
    if (path && path.length>0) {
      o._doors = path.reduce((a,f) => ({ ...a, [f.properties.ref_id]:f.properties.area||f.properties.cell_name||f.properties.cell}), {});

      // just take two last doors and smoosh them together

      let door = path[0];

      let [dx,dy,dz] = door.geometry.coordinates;
      x = x - dx;
      y = y - dy;
      z = z - dz;

      door = path[path.length-1];
      [dx,dy,dz] = door.geometry.coordinates;

      [x,y] = rotate2d(x,y, door.properties.rotation[2]*Math.PI/180, 0,0);

      x = x + dx;
      y = y + dy;
      z = z + dz;
    }
  }

  // apply worldspaces from marker data (folon)
  const w = markerData.worldspaces?.[area];
  if (w) {
    let t = {scale: w.scale, offset:{x: w.offset[0],  y: w.offset[1], z: w.offset[2]}};
    x = x * t.scale + t.offset.x;
    y = y * t.scale + t.offset.y;
  }

  // apply areas, if config has areas (folon)
  const world = Object.values(config.worlds)[0]; // assume default world (0)
  const a = world.areas?.[area];
  if (a) {
    let t = a;
    x = x * t.scale + t.offset.x;
    y = y * t.scale + t.offset.y;
    if (t.rotation) {
      [x,y] = rotate2d(x,y, t.rotation, t.offset.x, t.offset.y);
    }
  }


  let t = feature._type;

  let markerSymbol = getSymbol(feature.properties, t);

  const marker = new maptalks.Marker([x, y, 0], {
    symbol: markerSymbol,
    cursor: 'pointer',
    //interactive: false,
    //draggable: true,
    //cursor: 'move',
  });

  marker.feature = feature;

  new maptalks.ui.ToolTip('', {showTimeout: 100}).addTo(marker).on('showstart', e=>openTooltip(e.target.getOwner(), e.target));

  marker.setInfoWindow({
      autoCloseOn : 'click',
      autoPan: true,
      animation: null, // needs disabling on autoclose
      //custom: true, // disable default container
  });

  marker.on('click', e => {
    let excludeLabels = false;

    let marker = e.target;
    if (excludeLabels && marker.polygon) {
      zoomToPolygon(marker.polygon);
    } else {
      openPopup(e.target);
    }
  });

  //marker.on('mouseover', e => { e.target.polygon && selectPolygon(e.target.polygon, true); })
  //marker.on('mouseout', e => { e.target.polygon && selectPolygon(e.target.polygon, false); })

  if (allowLines) {
    marker.line = new maptalks.LineString([[x, y, z], [x, y, 0]], {
      symbol: { lineColor: '#fff', lineWidth: 1.5 },
    });
  }

  if (o.radius>1) {
    marker.circle = new maptalks.Circle([x, y, -1.5], o.radius, {});
    setPolygonOptions(marker.circle, true, t.color ?? 'white');
  }

  if (feature._type.region) {
    for (const polygon of allRegions) {
      //console.log(feature._type.region, polygon.properties.color);
      if (feature._type.regionMarker===true && polygon.properties.region === feature._type.region) {
        marker.polygon = polygon;
        //if (marker.isVisible())
        polygon.show();
        break;
      }
    }
  }

  feature._geom = marker;
  return marker;
}

let updateJobId = 0;


function scheduleUpdate() {
  const myJobId = ++updateJobId;
  let i = 0;

  function step() {
    if (myJobId !== updateJobId) return;
    const start = performance.now();

    //console.time('update');

    const newMarkers = [];
    const newLines = [];
    const newCircles = [];

    while (i < allFeatures.length && performance.now() - start < 500) {
      const feature = allFeatures[i++];
      const vis = currentFilter(feature);

      const marker = feature._geom;

      if (!marker) {
        if (vis) {
          const m = createGeometry(feature);
          if (m) {
            newMarkers.push(m);
            if (m.lines) newLines.push(m.line);
            if (m.circle) newCircles.push(m.circle);
            //console.log('created new marker');
          }
        }

        // !vis && !marker: nothing to do, stays uncreated
      } else {
        for (const g of [marker, marker.line, marker.circle, marker.polygon]) {
          if (g && vis !== g.isVisible()) vis ? g.show() : g.hide();
        }
      }
    }

    //if (newMarkers.length) console.log('created', newMarkers.length, 'new markers', );

    if (newMarkers.length) layers.markers.addGeometry(newMarkers);
    if (newLines.length) layers.lines.addGeometry(newLines);
    if (newCircles.length) layers.circles.addGeometry(newCircles);

    //console.timeEnd('update');

    if (i < allFeatures.length && myJobId === updateJobId) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

const getBaseName = s=>s;

function updateControls() {
  document.querySelectorAll('.markers-control-group').forEach(group => {
    const items = group.parentElement.querySelectorAll('.markers-control-item');
    let anySelected = false;
    items.forEach(item => {
      let type = getBaseName(item.dataset.name);
      const selected = settings.activeItems[type]==true;
      item.classList.toggle('selected', selected);
      anySelected ||= selected;
    });
    group.classList.toggle('selected', anySelected);
  });
}

function toggleGroup(group) {
  let counter = 0;
  let total = 0;

  for (const name of Object.keys(counters[group])) {
    if (settings.activeItems[name]!=true) counter += 1;
    total += 1;
  }

  let selected = false;

  if (counter==total) {
    selected = true;
  }

  for (const name of Object.keys(counters[group])) {
    if (selected) {
      settings.activeItems[name] = true;
    } else {
      delete settings.activeItems[name];
    }
  }
  filterData = {};
  updateItems();
}

function toggleItem(name) {
  settings.activeItems[name] = !settings.activeItems[name];
  filterData = {};
  updateItems();
}

function updateItems() {
  saveSettings();
  updateControls();
  setTimeout(scheduleUpdate, 0);
}

function selectPolygon(polygon, bSelect, lineColor) {
  const hoverSymbol = {
    polygonOpacity: 0.25,
    lineWidth: 2.5,
    lineColor: lineColor ?? '#fff',
    polygonFill: lineColor ?? '#fff',
  };

  const defaultSymbol = {
    lineOpacity: 0.5,
    lineColor: lineColor ?? '#fff',
    polygonFill: lineColor ?? '#fff',
    polygonOpacity: 0.0,
    lineWidth: 2.5,
  };

  //bSelect = bSelect && map.getZoom() <= zoom;
  polygon.setSymbol(bSelect ? hoverSymbol : defaultSymbol);
  polygon.config({cursor: bSelect ? 'pointer': 'default'});
}

function zoomToPolygon(polygon, zoom = 3) {
  const extent = polygon.getExtent();
  if (extent) map.fitExtent(extent);
}

function zoomToPolygon1(polygon, zoom = 3) {
  const extent = polygon.getExtent();
  let mapZoom = map.getZoom();
  if (!extent || zoom < mapZoom) return;
  const center = extent.getCenter();
  map.animateTo({center: center, zoom: zoom+1});
  selectPolygon(polygon, false);
}

function setPolygonOptions(polygon, bSelectable, color) {
  selectPolygon(polygon, false, color);

  if (bSelectable) {
    polygon.on('mouseover', e => { selectPolygon(e.target, true, color); })
    polygon.on('mouseout', e => { selectPolygon(e.target, false, color); })
    polygon.on('click', e => { zoomToPolygon(e.target); })
  }
}

function addRegions() {
  console.time('regions');

  let regions = Object.values(config.worlds)[0].regions;

  let url = regions?.[0]?.url;

  if (!url) {
    loadMarkers();
    return;
  }

  url = baseDir + url;

  console.log(`loading "${url}"...`);

  fetch(url)
  .then(response => response.json())
  .then(geojson => {
    console.timeEnd('regions');
    let polygons = maptalks.GeoJSON.toGeometry(geojson);

    polygons = polygons.filter(polygon => polygon); // filter out null geometry

    polygons = polygons.filter(polygon => polygon._coordinates.length>3); // filter out points <= 3 (zelda)

    polygons.forEach(polygon => {
      polygon.hide();
      setPolygonOptions(polygon, true);
      allRegions.push(polygon);
    });

    layers.regions.addGeometry(polygons);

    loadMarkers();
  })
}

function loadMarkersData(data, format = 'geojson') {

  if (format == 'simple') {
    let features = [];

    for(const p of data) {

      let feature = {
        type: 'feature',
        geometry: {
          type: 'Point',
          coordinates: [p.lng, p.lat, p.alt]
        },
        properties: p,
      };

      features.push(feature);
    }

    data = { type: 'FeatureCollection', features: features };

  } else if (format == 'unity') {

    let features = unity.markerLoader(data);
    data = { features: features };

  } else if (format != 'geojson') {

    data = { features:[] };

  }

  markerData = data;
  allFeatures = data.features;

  console.timeEnd('loadMarkers');
  console.log('loaded', allFeatures.length,'markers');
  indexMarkers();
  scheduleUpdate();
}

function loadMarkers() {

  console.time('loadMarkers');

  let markersFile = baseDir+'data/markers.json';

  let world = Object.values(config.worlds)[0];

  let format = 'geojson';

  if (world.markers && world.markers.url) {
    markersFile = baseDir + world.markers.url;
    format = world.markers.format ?? format;
  }

  console.log(`loading "${markersFile}"...`);

  fetch(markersFile)
    .then(response => response.json())
    .then(data => {
      loadMarkersData(data, format);
    })
    .catch(e => {
      console.log('error reading', markersFile, e);
      loadMarkersData({}, format);
    })
}

function addTypes() {
  addMap();

  let world = Object.values(config.worlds)[0];
  let url = baseDir + (world.markers?.[0]?.types ?? 'data/markerTypes.json');
  console.log(`loading "${url}"...`);
  fetch(url).then(r=>r.json()).catch(err=>{console.error(`Failed to fetch/parse "${url}":`, err);return {}})
  .then(data=>{
    markerTypes = data;
    if (markerTypes.icons) iconData = markerTypes.icons;
    for (const[key,value] of Object.entries(markerTypes.localization?.[settings.language] ?? [])){
      lang[key] = value;
    }
    addRegions();
  });
}

function parseConfig(data) {
  let games = Object.keys(data);
  let game = games[0]; // later add switchable games 

  config = data[game];

  document.title = "Joric's Maps";
  if (config && config.name) {
    document.title += ` - ${config.name}`;
  }

  settings = localData;

  settings.customImages = settings.customImages ?? customImagesDefault;
  settings.language = settings.language ?? 'en';
  settings.overlays = settings.overlays ?? {};

  if (config.localization) {
    let c = config.localization;
    let cc = settings.language ?? 'en';
    let url = baseDir + c.path + c.files[cc];

    console.log(`loading "${url}"...`);

    console.time('loadLocalization');
    fetch(url).then(r=>r.json()).catch(err=>{console.error(`Failed to fetch/parse "${url}":`, err);return {}})
    .then(data=>{
      lang = data[c.key] ? data[c.key] : data;
      console.timeEnd('loadLocalization');

      let strings = {
        "misc": {
          "en": "Misc",
          "de": "Verschiedenes",
          "es": "Varios",
          "fr": "Divers",
          "it": "Varie",
          "ja": "その他",
          "ko": "기타",
          "pt": "Diversos",
          "ru": "Разное",
          "uk": "Різне",
          "zh": "其他"
        },
        "search...": {
          "en": "Search...",
          "de": "Suchen...",
          "es": "Buscar...",
          "fr": "Chercher...",
          "it": "Cerca...",
          "ja": "検索...",
          "ko": "검색...",
          "pt": "Buscar...",
          "ru": "Искать...",
          "uk": "Шукати...",
          "zh": "搜索..."
        }
      };

      for (const key of Object.keys(strings)) {
        const entry = strings[key][settings.language];
        if (entry) {
          lang [ key ] = entry;
        }
      }
      addTypes();
    })

  } else {
    addTypes();
  }
}

function loadConfig() {
  baseDir = submodulesBase + repoName + '/';

  console.log('baseDir', baseDir);

  let url = baseDir + 'data/config.json';
  console.log(`loading "${url}"...`);

  fetch(url).then(r => r.json()).catch(err=>{console.error(`Failed to fetch/parse "${url}":`, err);return {}})
  .then(data => parseConfig(data))
}

window.onload = function (event) {
  document.body.insertAdjacentHTML('beforeend', '<div tabindex=0 id="map"></div>');

  document.body.insertAdjacentHTML('beforeend', '<div class="controls-placeholder controls-top-left"></div>');
  document.body.insertAdjacentHTML('beforeend', '<div class="controls-placeholder controls-bottom-left"></div>');
  document.body.insertAdjacentHTML('beforeend', `<a href="https://github.com/joric/${repoName}/wiki" target="_blank" class="github-corner" aria-label="View source on GitHub"><svg width="80" height="80" viewBox="0 0 250 250" style="fill:#151513; color:#fff; position: absolute; top: 0; border: 0; right: 0;" aria-hidden="true"><path d="M0,0 L115,115 L130,115 L142,142 L250,250 L250,0 Z"/><path d="M128.3,109.0 C113.8,99.7 119.0,89.6 119.0,89.6 C122.0,82.7 120.5,78.6 120.5,78.6 C119.2,72.0 123.4,76.3 123.4,76.3 C127.3,80.9 125.5,87.3 125.5,87.3 C122.9,97.6 130.6,101.9 134.4,103.2" fill="currentColor" style="transform-origin: 130px 106px;" class="octo-arm"/><path d="M115.0,115.0 C114.9,115.1 118.7,116.5 119.8,115.4 L133.7,101.6 C136.9,99.2 139.9,98.4 142.2,98.6 C133.8,88.0 127.5,74.4 143.8,58.0 C148.5,53.4 154.0,51.2 159.7,51.0 C160.3,49.4 163.2,43.6 171.4,40.1 C171.4,40.1 176.1,42.5 178.8,56.2 C183.1,58.6 187.2,61.8 190.9,65.4 C194.5,69.0 197.7,73.2 200.1,77.6 C213.8,80.2 216.3,84.9 216.3,84.9 C212.7,93.1 206.9,96.0 205.4,96.6 C205.1,102.4 203.0,107.8 198.3,112.5 C181.9,128.9 168.3,122.5 157.7,114.1 C157.9,116.9 156.7,120.9 152.7,124.9 L141.0,136.5 C139.8,137.7 141.6,141.9 141.8,141.8 Z" fill="currentColor" class="octo-body"/></svg></a><style>.github-corner:hover .octo-arm{animation:octocat-wave 560ms ease-in-out}@keyframes octocat-wave{0%,100%{transform:rotate(0)}20%,60%{transform:rotate(-25deg)}40%,80%{transform:rotate(10deg)}}@media (max-width:500px){.github-corner:hover .octo-arm{animation:none}.github-corner .octo-arm{animation:octocat-wave 560ms ease-in-out}}</style>`);

  let favicon = document.querySelector('link[rel="icon"]');

  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }

  favicon.type = 'image/svg+xml';
  favicon.href = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cpath d='M464 256A208 208 0 1 0 48 256a208 208 0 1 0 416 0zM0 256a256 256 0 1 1 512 0A256 256 0 1 1 0 256zm306.7 69.1L162.4 380.6c-19.4 7.5-38.5-11.6-31-31l55.5-144.3c3.3-8.5 9.9-15.1 18.4-18.4l144.3-55.5c19.4-7.5 38.5 11.6 31 31L325.1 306.7c-3.2 8.5-9.9 15.1-18.4 18.4zM288 256a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z'/%3E%3C/svg%3E";

  requestAnimationFrame(()=>{ loadConfig(); });

};
