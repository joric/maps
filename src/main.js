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

import * as utils from './utils.js';
import { getType } from './marker-types.js';
import { getIcon } from './marker-icons.js';

let USE_LOCAL = import.meta.env.DEV;

let submodulesBase = USE_LOCAL ? 'submodules/': '../submodules/';

let slugs = [
  'stalker',
  'folon',
  'subnautica',
  'supraworld',
  'windlands',
  'fuszerka',
  'ootss',
  'breathedge2',
];

let repoName = location.href.split('/').pop().split('#')[0];
if (!repoName || repoName.endsWith('.html')) repoName = slugs[0];

let localDataName = 'joricsMaps-repoName';
let localData = JSON.parse(localStorage.getItem(localDataName)) || {};
let settings = localData;

function saveSettings() {
  localStorage.setItem(localDataName, JSON.stringify(localData));
}

function getTilesetBase(config) {
  let tilesetBase = config.tilesetBase || '';
  if (USE_LOCAL) tilesetBase = tilesetBase.replace('https://joric.github.io/', submodulesBase);
  if (tilesetBase=='') tilesetBase = submodulesBase + repoName +'/';
  return tilesetBase;
}

let bNoImages = false;
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

let typeData = {};
let iconData = {};

let lang = {};

const capitalize = s => s[0].toUpperCase()+s.slice(1);

function translate(s) {
  s  = String(s);

  let templates_fn = [
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

  return lang[s] || capitalize(s);
}

function call(cb, options) {
  if (options?.benchmark) console.time(cb.name);
  let result = cb(...(options?.params ?? []));
  if (options?.benchmark) console.timeEnd(cb.name);
  return result;
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

  for (const polygon of allRegions) {
    let point = utils.getWeightedCentroid(polygon.getCoordinates()[0]);
    let region = colors[polygon.properties.color];
    let feature = {
      geometry: { coordinates: [point.x, point.y, 0] },
      properties: { name: region, type: 'regionMarker' }
    }
    feature._type = getType(feature.properties, typeData);
    feature._type.regionMarker = true;
    //console.log('adding region marker', feature);
    allFeatures.push(feature);
  }

  console.log(`[added ${allFeatures.length-count} region markers]`);
}

function nameRegions() {
  allFeatures.filter(f => f._type?.regionMarker).forEach(feature => {
    const polygon = getPolygon(feature);
    if (polygon) polygon.properties.region = feature.properties.sid || feature.properties.name;

    //optionally use weighted centroid
    if (!polygon) return;
    let point = utils.getWeightedCentroid(polygon.getCoordinates()[0]);
    feature.geometry.coordinates[0] = point.x;
    feature.geometry.coordinates[1] = point.y;

  });
}

function assignRegions() {
  for (const polygon of allRegions) {
    if (!polygon.properties.region) return;
  }
  allFeatures.forEach(feature => {
    const polygon = getPolygon(feature);
    if (polygon && feature._type) feature._type.region = polygon.properties.region;
  });
}

function assignTypes() {
  allFeatures.forEach(feature => {
    feature._type = getType(feature.properties, typeData);
  });
}

function getFuse() {
  call(assignTypes, { benchmark: true });
  call(addRegionMarkers, { benchmark: true });
  call(nameRegions, { benchmark: true });
  call(assignRegions, { benchmark: true });

  let data = [];
  for (const i in allFeatures) {
    data.push({ featureIndex: i, ...allFeatures[i] });
  }

  let options = {
    keys: [
      {name: 'properties.title', weight: 0.8},
      {name: 'properties.name', weight: 0.8},
      {name: 'properties.type', weight: 0.4},
      {name: 'properties.item', weight: 0.2},
      {name: '_type.group', weight: 0.2},
    ],
    threshold: 0.1,
    ignoreLocation: true,
    includeScore: true,
    useExtendedSearch: true,
    findAllMatches: false,
    numWorkers: (navigator.hardwareConcurrency || 4) * 2 // 2x oversubscribing
  };


  /*

  Browsers refuse new Worker('https://cdn.../worker.js') because a worker script has to be same-origin with your page.
  That's why the docs tell you to copy the file, but there's a clean workaround.

  FuseWorker accepts a workerUrl option that takes a string or URL, and a blob: URL counts as same-origin.
  So you can hand it a tiny blob whose only job is to import the real worker from the CDN

  const WORKER_CDN =
    'https://cdn.jsdelivr.net/npm/fuse.js@7.6.0-beta.0/dist/fuse.worker.mjs'

  const workerUrl = URL.createObjectURL(
    new Blob([`import ${JSON.stringify(WORKER_CDN)};`], { type: 'text/javascript' })
  )

  const fuse = new FuseWorker(docs, options, { workerUrl })
  */


  return new FuseWorker(data, options);
}

let popup;

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

  text += `<pre>${JSON.stringify({_type: t, properties: marker.feature.properties}, null, 2)}</pre>`;

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

function addMap() {
  const initialSearch = 'Dnipro';

  let searchText = initialSearch.toLowerCase();

  let mapSize = config.size;
  let tileSize = 512;

  //let center = { left: mapSize/2, top: mapSize/2 };

  let center = { left: mapSize/2, top: mapSize/2 };
  let bounds = { left: 0, top: 0, right: mapSize, bottom: mapSize };

  let sections = Object.values(config.worlds)[0].baseLayers;

  let baseLayers = {};

  let baseLayerName = '';

  // pre-create all base layers
  for (const section of sections) {

    if (!baseLayerName) baseLayerName = section.name;

    let visible = baseLayerName == section.name;

    if (section.center) {
      center = section.center;
    }

    if (section.bounds) {
      bounds = section.bounds;
      //mapSize =  section.size ? section.size : mapSize; //bounds.right - bounds.left;
    }


    let baseLayer = new maptalks.TileLayer(section.name||'default', {
      urlTemplate: getTilesetBase(config) + section.urlTemplate,
      maxAvailableZoom: section.maxAvailableZoom || 4,
      tileSize: section.tileSize || tileSize,
      repeatWorld: false,
      tileSystem: [1, -1, bounds.left, bounds.top],
      visible: visible,
    });

    baseLayers[section.name] = baseLayer;

    if (visible) {
      //mapSize =  section.size ? section.size : bounds.right - bounds.left;
    }

  }

  //console.log(center, bounds, mapSize);

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

  for (const [layerName, layer] of Object.entries(baseLayers)) {
    layer.addTo(map);
  }

  let items = {};

  for (const item of sections) {
    let image =  getTilesetBase(config) + (item.urlTemplate ? item.urlTemplate.replace(/\{[xyz]\}/g, '0') : item.url||'');
    items[item.name] = {image: image};
  }

  items = {...items};

  const layersControl = new LayersControl(null, {
    items: items,
    callback: name=> {
      //console.log(name, 'clicked');

      if (baseLayers[name]) {

        //map.setBaseLayer(baseLayers[name]);

        let layer = baseLayers[name];
        layer.show();

        for (const [layerName, layer] of Object.entries(baseLayers)) {
          if (name!=layerName) {
            layer.hide();
          }
        }

      } else {
        //window.location.href = 'http://localhost:3000/#'+name;
        //location.reload();
        window.location.href = 'http://localhost:3000/'+name;
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

  layers.regions = new maptalks.PolygonLayer('regions', [], { ...polygonOptions } ),
  layers.circles = new maptalks.PolygonLayer('circles', [], { ...polygonOptions, maxZoom: 4 } ),
  layers.lines   = new maptalks.LineStringLayer('lines', [], { ...layerOptions, minZoom: 2, maxZoom: 3 } ),
  layers.markers = new maptalks.PointLayer('markers', [], layerOptions ), // must be the last to be clickable

  Object.values(layers).forEach(layer => layer.addTo(groupLayer));

  popup = new PopupControl();

  const searchControl = new SearchControl(null, {
    searchCallback: query => fuzzySearch(query),
    onSubmit: query =>  fuzzySearch(query),
    searchRenderItem: searchRenderItem,
    searchOnSelect: fuseResult => {
      let marker = allFeatures[fuseResult.item.featureIndex]?._geom;
      if (marker) {
        //map.animateTo({center: marker.getCoordinates(), zoom: focusZoom});
        openPopup(marker, true);
      }
    },
  });

  let menuItems = {};
  for (const slug of slugs) {
    menuItems[slug] = { name: slug };
  }

  const menuControl = new MenuControl(null,{ items: menuItems,
    callback: name => {
      window.location.href = 'http://localhost:3000/'+name;
    },
  });

  let mapEl = document.querySelector('#map');
  mapEl.setAttribute('tabindex', '0');
  mapEl.addEventListener('pointerdown', function () {
    mapEl.focus();
  });

  window.addEventListener('keydown', function (e) {
    if (document.activeElement === document.querySelector('#search')) return;
    if (document.activeElement === document.querySelector('.search-input')) return;
    if (e.code == 'KeyR' && !e.ctrlKey) toggleView();
  });
}

async function fuzzySearch(s, limit=1024) {
  let searchTimer;
  clearTimeout(searchTimer);

  searchString = s || '';

  //console.log('searchString', searchString);
  
  if (!s) {
    filterData = {};
    searchTimer = setTimeout(scheduleUpdate, 100);
    return;
  }

  if (!fuse) return;

  let result = await fuse.search(s, { limit: limit });
  const cmpAlphaNum2 = (a,b) => a.localeCompare(b, 'en', { numeric: true });
  result.sort( (a,b)=> a.score - b.score || cmpAlphaNum2(a.item.properties.name||'', b.item.properties.name||'') ) ;

  const extent = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  
    addPoint(x, y) {
      if (x < this.minX) this.minX = x;
      if (y < this.minY) this.minY = y;
      if (x > this.maxX) this.maxX = x;
      if (y > this.maxY) this.maxY = y;
    },
  
    getWidth() {
      return this.maxX - this.minX;
    },
  
    getHeight() {
      return this.maxY - this.minY;
    },
  
    toExtent() {
      return {
        xmin: this.minX,
        ymin: this.minY,
        xmax: this.maxX,
        ymax: this.maxY,
      };
    }
  };


  let hasData = false;
  let lookup = {};
  for (const r of result) {
    let feature = r.item;
    let key = getKey(feature);
    lookup[key] = true;
    const [x,y,z] = applyMapping(r.item.geometry.coordinates);
    extent.addPoint(x, y);
    hasData = true;
  }

  if (hasData) {
    map.setMaxZoom(5);
    map.fitExtent(extent.toExtent(), -0.2);
    map.setMaxZoom(maxZoom);
  }

  filterData = lookup;
  searchTimer = setTimeout(scheduleUpdate, 100);

  return result;
}

function searchRenderItem(ref) {
  let o = ref.item.properties;
  let t = ref.item._type;

  let title = translate(o.title || o.name);
  let subtitle = translate(t.group);
  let location = translate(t.region || o.area || o.cell || o.type);

  return `<span class="search-item-row" title="${title} (${subtitle}) [${ref.score}]"><span class="search-item-left">${title} (${subtitle})</span><span class="search-item-right">${location}</span></span>`;
}

// --- filter -----------------------------------------------------------

function getKey(feature) {
  return feature.properties.sid || feature.properties.ref_id || feature.properties.name;
}

function currentFilter(feature) {
  //if (!searchText) return true;
  //const name = (feature.properties.name || '').toLowerCase();
  //return name.includes(searchText);
  //console.log();

  let key = getKey(feature);

  let t = feature._type;


  let groupFilter = config.filter ? (config.filter.includes(t.group) && t.icon!='misc'): true;

  return (searchString=='' && groupFilter) || filterData[key] !== undefined;

}

function applyMatrix(coords, m) {
  // swap+rotaton, e.g. { "matrix": [[1,0,0],[0,0,1],[0,-1,0]] }
  return m.map(row => row[0]*x + row[1]*y + row[2]*z);
}

function applyMapping(coords) {
  const DEFAULT_MAPPING = [["x", 1], ["y", 1], ["z", 1]];
  let world = Object.values(config.worlds)[0];
  const mapping = world.markers?.mapping ?? DEFAULT_MAPPING;

  const [x, y, z] = coords;

  const source = { x, y, z };

  let p = mapping.map(([axis, sign]) => sign * source[axis]);

  if (world.markers?.flip_y) {
    let cy = 0;
    let section = Object.values(config.worlds)[0].baseLayers[0];
    if (config.size && section.bounds) {
      //yc = (section.bounds.bottom - section.bounds.top) / 2 - section.center.top/2;
      cy = (config.size/2 - section.center.top/2)*1.0316;
    }

    if (world.markers.cy !== undefined) {
      cy = world.markers.cy;
    }

    p[1] =  cy - p[1];
  }

  return p;
}

function getSymbol(o, t) {
  let icon = getIcon(t, iconData, {baseDir: baseDir, spriteIndex: spriteIndex, bNoImages: bNoImages});

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

function createGeometry(feature) {
  const o = feature.properties;

  const [x, y, z] = applyMapping(feature.geometry.coordinates);

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

  //marker.on('click', e => console.log(e.target));

  marker.on('mouseover', e=>{
    //openPopup(e.target.feature);
  });

  marker.on('mouseout', e=> {
    //popup.hide();
  })

  const tooltip = new maptalks.ui.ToolTip(`${translate(o.item||o.spawns||o.title||o.name||t.category)} (${translate(t.group||o.type)})`, {
      showTimeout: 100,
  });

  tooltip.addTo(marker);

  marker.setInfoWindow({
      autoCloseOn : 'click',
      autoPan: true,
      animation: null, // needs disabling on autoclose
      //custom: true, // disable default container
  });

  marker.on('click', e => {
    openPopup(e.target);
  });

  marker.line = new maptalks.LineString([[x, y, z], [x, y, 0]], {
    symbol: { lineColor: '#fff', lineWidth: 1.5 },
  });

  if (o.radius>1) {
    marker.circle = new maptalks.Circle([x, y, -1.5], o.radius, {});
    setPolygonOptions(marker.circle, true);
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
          newMarkers.push(m);
          newLines.push(m.line);
          if (m.circle) newCircles.push(m.circle);
          //console.log('created new marker');
        }

        // !vis && !marker: nothing to do, stays uncreated
      } else {
        for (const g of [marker, marker.line, marker.circle]) {
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

function setPolygonOptions(polygon, bSelectable) {

  const hoverSymbol = {
    polygonOpacity: 0.25,
    lineWidth: 2.5,
  };

  const defaultSymbol = {
    lineColor: '#fff',
    lineOpacity: 0.5,
    polygonFill: '#fff',
    polygonOpacity: 0.0,
    lineWidth: 2.5,
  };

  let zoom = 3;

  function selectPolygon(polygon, bSelect) {
    //bSelect = bSelect && map.getZoom() <= zoom;
    polygon.setSymbol(bSelect ? hoverSymbol : defaultSymbol);
    polygon.config({cursor: bSelect ? 'pointer': 'default'});
  }

  function zoomToPolygon(polygon) {
    const extent = polygon.getExtent();
    if (extent) map.fitExtent(extent);
  }

  function zoomToPolygon0(polygon) {
    const extent = polygon.getExtent();
    let mapZoom = map.getZoom();
    if (!extent || zoom < mapZoom) return;
    const center = extent.getCenter();
    map.animateTo({center: center, zoom: zoom+1});
    selectPolygon(polygon, false);
  }

  selectPolygon(polygon, false);

  if (bSelectable) {
    polygon.on('mouseover', e => { selectPolygon(e.target, true); })
    polygon.on('mouseout', e => { selectPolygon(e.target, false); })
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

    polygons.forEach(polygon => {
      setPolygonOptions(polygon, true);
      allRegions.push(polygon);
    });

    layers.regions.addGeometry(polygons);

    loadMarkers();
  })
}

function loadMarkers() {

  console.time('loadMarkers');

  let markersFile = baseDir+'data/markers.json';

  let world = Object.values(config.worlds)[0];

  if (world.markers && world.markers.url) {
    markersFile = baseDir + world.markers.url;
  }

  console.log(`loading "${markersFile}"...`);

  function loadGeojson(geojson) {
    allFeatures = geojson.features;
    console.timeEnd('loadMarkers');
    console.log('loaded', allFeatures.length,'markers');
    fuse = getFuse();
    scheduleUpdate();
  }

  fetch(markersFile)
    .then(response => response.json())
    .then(geojson => {
      loadGeojson(geojson);
    })
    .catch(e => {
      console.log('error reading', markersFile, e);
      loadGeojson({features: []});
    })
}

function addTypes() {
  let world = Object.values(config.worlds)[0];

  let typesFile = baseDir + (world.markers?.[0]?.types ?? 'data/types.json');
  let iconsFile = baseDir + (world.markers?.[0]?.icons ?? 'data/icons.json');

  console.log(`loading "${typesFile}"...`);
  console.log(`loading "${iconsFile}"...`);

  let promises = [
    typesFile,
    iconsFile,
  ].map(url =>
    fetch(url)
      .then(r => r.json())
      .catch(err => {
        console.error(`Failed to fetch/parse ${url}:`, err);
        return {};
      })
  );

  Promise.all(promises).then(data => {
    [typeData, iconData] = data;
    addRegions();
  });
}

function parseConfig(data) {
  let games = Object.keys(data);
  let game = games[0];

  config = data[game];

  document.title = `Joric's Maps - ${config.name}`;

  addMap();

  if (config.localization) {
    let c = config.localization;
    let cc = 'en';
    let url = baseDir + c.path + c.files[cc];

    console.log(`loading "${url}"...`);

    console.time('loadLocalization');
    fetch(url).then(r=>r.json()).catch(err=>{console.error(`Failed to fetch/parse "${url}":`, err);return {}})
    .then(data=>{
      lang = data[c.key] ? data[c.key] : data;
      console.timeEnd('loadLocalization');
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
  document.body.insertAdjacentHTML('beforeend', '<a href="https://github.com/joric/maps/wiki" target="_blank" class="github-corner" aria-label="View source on GitHub"><svg width="80" height="80" viewBox="0 0 250 250" style="fill:#151513; color:#fff; position: absolute; top: 0; border: 0; right: 0;" aria-hidden="true"><path d="M0,0 L115,115 L130,115 L142,142 L250,250 L250,0 Z"/><path d="M128.3,109.0 C113.8,99.7 119.0,89.6 119.0,89.6 C122.0,82.7 120.5,78.6 120.5,78.6 C119.2,72.0 123.4,76.3 123.4,76.3 C127.3,80.9 125.5,87.3 125.5,87.3 C122.9,97.6 130.6,101.9 134.4,103.2" fill="currentColor" style="transform-origin: 130px 106px;" class="octo-arm"/><path d="M115.0,115.0 C114.9,115.1 118.7,116.5 119.8,115.4 L133.7,101.6 C136.9,99.2 139.9,98.4 142.2,98.6 C133.8,88.0 127.5,74.4 143.8,58.0 C148.5,53.4 154.0,51.2 159.7,51.0 C160.3,49.4 163.2,43.6 171.4,40.1 C171.4,40.1 176.1,42.5 178.8,56.2 C183.1,58.6 187.2,61.8 190.9,65.4 C194.5,69.0 197.7,73.2 200.1,77.6 C213.8,80.2 216.3,84.9 216.3,84.9 C212.7,93.1 206.9,96.0 205.4,96.6 C205.1,102.4 203.0,107.8 198.3,112.5 C181.9,128.9 168.3,122.5 157.7,114.1 C157.9,116.9 156.7,120.9 152.7,124.9 L141.0,136.5 C139.8,137.7 141.6,141.9 141.8,141.8 Z" fill="currentColor" class="octo-body"/></svg></a><style>.github-corner:hover .octo-arm{animation:octocat-wave 560ms ease-in-out}@keyframes octocat-wave{0%,100%{transform:rotate(0)}20%,60%{transform:rotate(-25deg)}40%,80%{transform:rotate(10deg)}}@media (max-width:500px){.github-corner:hover .octo-arm{animation:none}.github-corner .octo-arm{animation:octocat-wave 560ms ease-in-out}}</style>');

  requestAnimationFrame(()=>{ loadConfig(); });

};
