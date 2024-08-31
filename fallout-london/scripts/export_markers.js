// Pip-boy Map Markers Export for xelib by Joric (c) 2024
// Takes about 40 seconds on my machine
// run `npm i z-edit/xelib` to install xelib

console.time('total');

let data = {};

let files = [
  'Fallout4.esm', 'DLCRobot.esm', 'DLCWorkshop01.esm', 'DLCCoast.esm',
  'DLCWorkshop02.esm', 'DLCWorkshop03.esm', 'DLCNukaWorld.esm', 'LondonWorldSpace.esm',
];

const spinner = name => { var i=~~(Date.now()/100)%4; if (i!=spinner.i) process.stdout.write(`${name}: ${'/-\\|'[i]}\r`); spinner.i = i; }
const progress = (name, i,total) => { var i=~~(i*100/total); if (i!=progress.i) process.stdout.write(`${name}: ${i}%\r`); progress.i = i; };
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

data.markers = [];
xelib.GetRecords(plugin, 'REFR').forEach((r,i,arr) => {
  if (xelib.GetFormID(xelib.GetLinksTo(r, 'NAME')) == 0x10) {
    data.markers.push({
      ref_id: xelib.GetHexFormID(r),
      name: xelib.GetValue(r, 'Map Marker\\FULL'),
      type: xelib.GetValue(r, 'Map Marker\\TNAM\\Type'),
      position: getArray(r, 'DATA\\Position\\', ['X','Y','Z']),
      area: xelib.EditorID(xelib.GetLinksTo(xelib.GetLinksTo(r, 'Cell'), 'Worldspace')),
    });
    progress('parsing', i, arr.length);
  }
})

data.worlds = [];
xelib.GetRecords(plugin, 'WRLD').forEach((r,i) => {
  data.worlds.push({
    name: xelib.GetValue(r,'FULL'),
    editor_id: xelib.EditorID(r),
    scale: xelib.GetValue(r,'ONAM\\World Map Scale'),
    offset: getArray(r, 'ONAM\\Cell ', ['X Offset','Y Offset','Z Offset']),
  });
});


data.quests = [];
xelib.GetRecords(plugin, 'QUST').forEach((r,i) => {
  let quest = {
    form_id: xelib.GetHexFormID(r),
    name: xelib.GetValue(r,'FULL'),
    editor_id: xelib.EditorID(r),
  };

  let s = xelib.GetElement(r, 'Stages');
  if (!s) return;

  quest.stages = [];
  xelib.GetElements(s).forEach((e,i) => {
    let stage = {
      index: xelib.GetIntValue(e, 'INDX\\Stage Index'),
    };

    let t = xelib.GetElement(e, 'Log Entries');
    if (!t) return;

    stage.logs = [];
    xelib.GetElements(t).forEach((ee,i) => {
      stage.logs.push(xelib.GetValue(ee, 'NAM2'));
    });

    quest.stages.push(stage);
  });

  let o = xelib.GetElement(r, 'Objectives');
  if (!o) return;

  quest.objectives = [];
  xelib.GetElements(o).forEach((e,i) => {
    let objective = {
      index: xelib.GetIntValue(e, 'QOBJ'),
      name: xelib.GetValue(e, 'NNAM'),
    };

    let t = xelib.GetElement(e, 'Targets');
    if (!t) return;

    objective.targets = [];
    xelib.GetElements(t).forEach((ee,i) => {
      objective.targets.push(xelib.GetValue(ee, 'QSTA\\Alias'));
    });

    quest.objectives.push(objective);
  });

  data.quests.push(quest);
});


console.timeEnd('parsing');

require('fs').writeFile ("output.json", JSON.stringify(data, null, 2), ()=>{});

console.timeEnd('total');
