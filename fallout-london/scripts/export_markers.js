// Pip-boy Map Markers Export for xelib by Joric (c) 2024
// Takes about 40 seconds on my machine
// run `npm i z-edit/xelib` to install xelib

console.time('total');

let xelib = require('xelib').wrapper;
xelib.Initialize('XEditLib.dll');
xelib.SetGameMode(xelib.gmFO4);
let files = ['Fallout4.esm', 'LondonWorldSpace.esm'];

console.time('loaded');
xelib.LoadPlugins(files.join('\n')); while(xelib.GetLoaderStatus()<2);
console.timeEnd('loaded');

const progress = (i,total)=>process.stdout.write(`\rprocessed: ${Math.round(i*100/total)}%`);
const GetXYZ = (r, path)=> ['X','Y','Z'].map(c=>xelib.GetFloatValue(r, `${path}\\${c}`));
let output = {'markers':[]};
let plugin = xelib.FileByName(files[1]);
let refs = xelib.GetRecords(plugin, 'REFR');

refs.forEach((r,i) => {
  if (xelib.GetFormID(xelib.GetLinksTo(r, 'NAME')) == 0x10) {
    let marker = {
      name: xelib.GetValue(r, 'Map Marker\\FULL'),
      type: xelib.GetValue(r, 'Map Marker\\TNAM\\Type'),
      position: GetXYZ(r, 'DATA\\Position'),
      area: xelib.EditorID(xelib.GetLinksTo(xelib.GetLinksTo(r, 'Cell'), 'Worldspace')),
    };
    output['markers'].push(marker);
    progress(i, refs.length);
  }
})

console.log('\nwriting...');
require('fs').writeFile ("output.json", JSON.stringify(output, null, 2), ()=>{});

console.timeEnd('total');
