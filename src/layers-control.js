import './layers-control.css'

export class LayersControl {
  constructor(layer, options) {
    const innerHTML = `
    <div class="layers-control">
      <ul class="layers-list" role="listbox"></ul>
    </div>
    `;

    //let container = document.querySelector('.controls-bottom-left') ?? document.body;
    let container = document.body;

    container.insertAdjacentHTML('beforeend', innerHTML);

    const control = document.querySelector('.layers-control');
    const ul = control.querySelector('.layers-list');

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

      let content = `<div class="layer-size">${w}x${h}</div><div class="layer-title">${title}</div>`;


      if (!item.overlay) {
        content += `<div class="layer-radio"><input type="radio" name="baseLayer" id="${item.name}" ${item.visible?'checked':''}></div>`;
      } else {
        content += `<div class="layer-checkbox"><input type="checkbox" name="${item.name}" ${item.visible?'checked':''}></div>`;
      }


      let bgStyle = `--bg: url("${item.image}"); background-image: var(--bg); ` // prevent imagehover/imagus
      let style = bgStyle;

      html += `<li tabindex=-1 data-name="${name}" style='${style} ${extra}' title="${name}"><div class="layer-content">${content}</content></li>`;
    }

    ul.innerHTML = html;

    document.querySelector('.layers-control').style.setProperty('--count', Object.keys(items).length);

    const callback = options.callback || function(i) { console.log(`default layers-control callback called with parameter ${i}`); };

    // shared drag state
    let dragMoved = false;

    document.querySelectorAll('.layers-control ul > li').forEach(li => {
      const parent = li.closest('.layers-control');
      let wasFocusedOnMouseDown = false;

      li.addEventListener('mousedown', () => {
        wasFocusedOnMouseDown = parent.matches(':focus-within');
      });

      li.addEventListener('click', e => {
        // Ignore clicks that were actually drags
        if (dragMoved) {
          wasFocusedOnMouseDown = false;
          dragMoved = false;
          return;
        }

        // Only respond when the control was focused at mousedown
        if (!wasFocusedOnMouseDown) {
          wasFocusedOnMouseDown = false;
          return;
        }
        wasFocusedOnMouseDown = false;

        const name = li.dataset.name;
        const input = li.querySelector('input[type="radio"], input[type="checkbox"]');
        if (!input) return;

        // If the click landed directly on the input, let the browser handle it
        // naturally and just fire the callback.
        if (e.target !== input) {
          if (input.type === 'radio') {
            // Radios can't be unchecked by clicking; just select this one.
            input.checked = true;
          } else {
            input.checked = !input.checked;
          }
        }

        callback(name);
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
      // NOTE: do NOT add .dragging yet — only after threshold
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
