import './layers-control.css'

export class LayersControl {
  constructor(layer, options) {
    const innerHTML = `
    <div class="layers-control" tabindex="-1">
      <div class="layers-preview" role="button" aria-label="Open layers">
        <div class="layers-preview-content"></div>
      </div>
      <ul class="layers-list" role="listbox"></ul>
    </div>
    `;

    //let container = document.querySelector('.controls-bottom-left') ?? document.body;
    let container = document.body;

    container.insertAdjacentHTML('beforeend', innerHTML);

    const control = document.querySelector('.layers-control');
    const ul = control.querySelector('.layers-list');
    const preview = control.querySelector('.layers-preview');

    let html = '';
    let items = options.items || [];

    for (const [name, item] of Object.entries(items)) {

      let title = item.title || name;
      let d = item.base;
      let w = d;
      let h = w;

      let extra = ''
      if (item.size) {
        [w,h] = item.size;
        let ratio = d/w;
        let offset = 0.5;
        extra = `background-position: ${offset*100}%; background-size: ${ratio*100}%; background-repeat: no-repeat;`
      }

      let res  = `${w}x${h}`;

      let content = `<div class="layer-size">${res}</div><div class="layer-title">${title}</div>`;

      let alt = `${title} (${res})`;

      if (!item.overlay) {
        content += `<div class="layer-radio"><input type="radio" name="baseLayer" id="${item.name}" ${item.visible?'checked':''}></div>`;
      } else {
        content += `<div class="layer-checkbox"><input type="checkbox" name="${item.name}" ${item.visible?'checked':''}></div>`;
      }

      let bgStyle = `--bg: url("${item.image}"); background-image: var(--bg); ` // prevent imagehover/imagus
      let style = bgStyle;

      html += `<li tabindex=-1 data-name="${name}" style='${style} ${extra}' title="${alt}"><div class="layer-content">${content}</div></li>`;
    }

    ul.innerHTML = html;

    control.style.setProperty('--count', Object.keys(items).length);

    const callback = options.callback || function(i) { console.log(`default layers-control callback called with parameter ${i}`); };

    // --- collapsed preview ---
    function getCheckedBaseLi() {
      return ul.querySelector('li:has(input[type="radio"]:checked)');
    }

    function updatePreview() {
      const li = getCheckedBaseLi();
      if (!li) {
        preview.style.removeProperty('--bg');
        preview.style.backgroundPosition = '';
        preview.style.backgroundSize = '';
        preview.style.backgroundRepeat = '';
        preview.dataset.name = '';
        return;
      }

      // Reuse the same --bg variable the <li> uses; the size/position come from CSS.
      const bg = li.style.getPropertyValue('--bg');
      preview.style.setProperty('--bg', bg);
      preview.dataset.name = li.dataset.name;

      // Carry over the per-item positioning/size override (the `extra` inline style)
      // as relative values, NOT the computed pixel size.
      const liExtra = li.getAttribute('style') || '';
      const posMatch = liExtra.match(/background-position:\s*([^;]+)/);
      const sizeMatch = liExtra.match(/background-size:\s*([^;]+)/);
      const repeatMatch = liExtra.match(/background-repeat:\s*([^;]+)/);

      preview.style.backgroundPosition = posMatch ? posMatch[1].trim() : '';
      preview.style.backgroundSize     = sizeMatch ? sizeMatch[1].trim() : '';
      preview.style.backgroundRepeat   = repeatMatch ? repeatMatch[1].trim() : '';


      preview.title = li.title;

    }

    updatePreview();

    ul.querySelectorAll('input[type="radio"]').forEach(r => {
      r.addEventListener('change', updatePreview);
    });

    preview.addEventListener('click', () => {
      control.focus();
    });

    // shared drag state
    let dragMoved = false;

    document.querySelectorAll('.layers-control ul > li').forEach(li => {
      const parent = li.closest('.layers-control');
      let wasFocusedOnMouseDown = false;

      li.addEventListener('mousedown', () => {
        wasFocusedOnMouseDown = parent.matches(':focus-within');
      });

      li.addEventListener('click', e => {
        if (dragMoved) {
          wasFocusedOnMouseDown = false;
          dragMoved = false;
          return;
        }

        if (!wasFocusedOnMouseDown) {
          wasFocusedOnMouseDown = false;
          return;
        }
        wasFocusedOnMouseDown = false;

        const name = li.dataset.name;
        const input = li.querySelector('input[type="radio"], input[type="checkbox"]');
        if (!input) return;

        if (e.target !== input) {
          if (input.type === 'radio') {
            input.checked = true;
          } else {
            input.checked = !input.checked;
          }
        }

        updatePreview();
        callback(name, input.checked ? true : false);
      });
    });

    // --- wheel scrolling ---
    control.addEventListener('wheel', (e) => {
      if (!control.matches(':focus-within')) return;
      if (ul.scrollWidth <= ul.clientWidth) return;
      e.preventDefault();
      ul.scrollLeft += e.deltaY;
    }, { passive: false });

    // --- drag scrolling ---
    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;

    control.addEventListener('mousedown', (e) => {
      if (!control.matches(':focus-within')) return;
      if (ul.scrollWidth <= ul.clientWidth) return;
      isDown = true;
      dragMoved = false;
      startX = e.pageX;
      startScrollLeft = ul.scrollLeft;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      const dx = e.pageX - startX;
      if (!dragMoved && Math.abs(dx) > 5) {
        dragMoved = true;
        ul.classList.add('dragging');
      }
      if (dragMoved) {
        ul.scrollLeft = startScrollLeft - dx;
      }
    });

    window.addEventListener('mouseup', () => {
      if (!isDown) return;
      isDown = false;
      ul.classList.remove('dragging');
    });

    // --- touch dragging (mobile) ---
    let touchStartX = 0;
    let touchStartScrollLeft = 0;

    ul.addEventListener('touchstart', (e) => {
      if (!control.matches(':focus-within')) return;
      if (ul.scrollWidth <= ul.clientWidth) return;
      touchStartX = e.touches[0].pageX;
      touchStartScrollLeft = ul.scrollLeft;
    }, { passive: true });

    ul.addEventListener('touchmove', (e) => {
      if (!control.matches(':focus-within')) return;
      if (ul.scrollWidth <= ul.clientWidth) return;
      e.preventDefault();
      const dx = e.touches[0].pageX - touchStartX;
      ul.scrollLeft = touchStartScrollLeft - dx;
    }, { passive: false });

  };
}
