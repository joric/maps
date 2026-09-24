// uses type record format from marker-types,js
// exports getIcon

import '@fortawesome/fontawesome-free/js/all.js';

const FontAwesome = window.FontAwesome;

let iconSize = 48;
let iconImages = {};

export function getIcon(t, iconData, options) {
  const defaultData = {class: 'fa fa-circle-question'};
  const defaultOptions = { bGetCategoryIcon: false, spriteIndex: 0, baseDir: '', bNoImages: false, imageDir: 'images/sprites/'};

  options = {...defaultOptions, ...(options||{})};

  const icon = (options.bGetCategoryIcon ? t.category_icon : t.icon) || t.icon || 'misc';
  const d = iconData[icon] || {};
  const color = t.color || d.color || d.fg || 'grey';
  const bgColor = d.background || d.bg || 'white';
  const className = d.class || (d.fa ? ('fa fa-'+ (v.fa||'circle-question')) : defaultData.class );
  const bUseImage = !options.bNoImages && (d.sprites || d.image);

  let key = bUseImage ? icon : `${icon}-${color}-${bgColor}`;

  if (!iconImages[key]) {
    if (bUseImage) {
      iconImages[key] = options.baseDir + options.imageDir + (d.sprites ? `${d.sprites[options.spriteIndex]}.png` : d.image);
    } else {
      iconImages[key] = renderFAIconToImageURL(className, color, bgColor, iconSize);
    }
  }

  let size = [iconSize, iconSize];

  if (!options.bNoImages && (d.image || d.sprites) && d.size) {
    size = Array.isArray(d.size) ? d.size: [d.size, d.size];
  }

  return {
    name: icon,
    color: color,
    background: bgColor,
    width: size[0],
    height: size[1],
    image: iconImages[key],
    baseline: bUseImage ? 'middle' : 'top',
  }
}

function parseFAClass(faClass) {
  const parts = faClass.trim().split(/\s+/);
  const prefix = parts.find(p => p.startsWith('fa-') || p === 'fa')?.replace('fa-', '') || 'solid';
  const iconName = parts.find(p => p.startsWith('fa-') && p !== 'fa' && p !== `fa-${prefix}`)?.replace('fa-', '');
  const prefixMap = { solid: 'fas', regular: 'far', light: 'fal', thin: 'fat', duotone: 'fad', brands: 'fab' };
  return { prefix: prefixMap[prefix] || 'fas', iconName };
}

export function renderFAIconToImageURL(fa_class, bg, fg='white', size=48) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  fa_class = fa_class || 'fa fa-circle-question';

  function drawFAIcon(prefix, iconName, color, pixelSize, dy = 0) {
    let icon = FontAwesome.icon({ prefix, iconName });
    if (!icon) icon = FontAwesome.icon({ prefix:'fa', iconName: 'question-circle' });
    const [w, h, , , path] = icon.icon;
    const scale = pixelSize / h;
    const iconWidthPx = w * scale;
    const dx = (iconSize - iconWidthPx) / 2;
    const dyPx = (iconSize - pixelSize) / 2 + dy;
    ctx.setTransform(scale, 0, 0, scale, dx, dyPx);
    ctx.fillStyle = color;
    ctx.fill(new Path2D(path));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  fg = fg || 'white';
  bg = bg || 'grey';
  let t = parseFAClass(fa_class);
  drawFAIcon('fas', 'location-pin', 'black', size * 1.0);
  drawFAIcon('fas', 'location-pin', bg, size * 0.976);
  drawFAIcon(t.prefix, t.iconName, fg, size * 0.45, -size/8);
  return canvas.toDataURL('image/png');
}

function prerenderAllIcons() {
  console.time('rendering icons');
  iconImages = Object.fromEntries(Object.entries(iconData).map(([k,v]) => [k, renderFAIconToImageURL(v.class, v.color, v.background, iconSize)]));
  console.timeEnd('rendering icons');
}
