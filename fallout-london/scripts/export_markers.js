// Pip-boy Map Markers Export for xelib by Joric (c) 2024
// Takes about 40 seconds on my machine
// run `npm i z-edit/xelib` to install xelib

console.time('total');

let output = {'markers':[], 'worldspaces':[]};

let files = [
  'Fallout4.esm',
  'DLCRobot.esm',
  'DLCWorkshop01.esm',
  'DLCCoast.esm',
  'DLCWorkshop02.esm',
  'DLCWorkshop03.esm',
  'DLCNukaWorld.esm',
  'LondonWorldSpace.esm',
];

const spinner = name => process.stdout.write(`${name}: ${'/-\\|'[Math.ceil(Date.now()/100)%4]}\r`);
const progress = (name, i,total) => process.stdout.write(`${name}: ${Math.ceil(i*100/total)}%\r`);
const getArray = (r, path, keys) => keys.map(c=>xelib.GetFloatValue(r, `${path}${c}`));

let xelib = require('xelib').wrapper;
xelib.Initialize('XEditLib.dll');
xelib.SetGameMode(xelib.gmFO4);

console.time('loading');
xelib.LoadPlugins(files.join('\n'));
while(xelib.GetLoaderStatus()<2) spinner('loading');
console.timeEnd('loading');

console.time('parsing');

let plugin = xelib.FileByName(files.at(-1));

xelib.GetRecords(plugin, 'REFR').forEach((r,i,arr) => {
  if (xelib.GetFormID(xelib.GetLinksTo(r, 'NAME')) == 0x10) {
    output['markers'].push({
      ref_id: xelib.GetHexFormID(r),
      name: xelib.GetValue(r, 'Map Marker\\FULL'),
      type: xelib.GetValue(r, 'Map Marker\\TNAM\\Type'),
      position: getArray(r, 'DATA\\Position\\', ['X','Y','Z']),
      area: xelib.EditorID(xelib.GetLinksTo(xelib.GetLinksTo(r, 'Cell'), 'Worldspace')),
    });
    progress('parsing', i, arr.length);
  }
})

xelib.GetRecords(plugin, 'WRLD').forEach((r,i) => {
  output['worldspaces'].push({
    name: xelib.GetValue(r,'FULL'),
    editor_id: xelib.EditorID(r),
    scale: xelib.GetValue(r,'ONAM\\World Map Scale'),
    offset: getArray(r, 'ONAM\\Cell ', ['X Offset','Y Offset','Z Offset']),
  });
});

console.timeEnd('parsing');

require('fs').writeFile ("output.json", JSON.stringify(output, null, 2), ()=>{});

console.timeEnd('total');
