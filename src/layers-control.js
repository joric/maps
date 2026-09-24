import './layers-control.css'

import { WrapperControl } from './controls.js';

export class LayersControl {
  constructor(layer, options) {
    const innerHTML = `
    <div class="layers-control">
      <div class="layers-viewport">
        <ul class="layers-list" role="listbox"></ul>
      </div>
    </div>
    `;

    let container = document.querySelector('.controls-bottom-left') ?? document.body;

    container.insertAdjacentHTML('beforeend', innerHTML);

    const wrapper = new WrapperControl('.layers-viewport', {
      scrollStep: 150,
      dragSpeed: 1.5,
    });

    const control = document.querySelector('.layers-control');
    const viewport = control.querySelector('.layers-viewport');
    const ul = control.querySelector('.layers-list');
    const prevBtn = control.querySelector('.layers-prev');
    const nextBtn = control.querySelector('.layers-next');

    let html = '';

    let items = options.items || [];

    for (const [name, item] of Object.entries(items)) {
      let bgStyle = `--bg: url("${item.image}"); background-image: var(--bg);` // prevent imagehover/imagus
      //let bgStyle = `background-image: url("${image}");`;
      let style = bgStyle;
      
      let title = item.title || '';
      //let title='';

      html += `<li tabindex=-1 data-name="${name}" style='${style}' title="${item.title||name}">${title}</li>`;
    }

    ul.innerHTML = html;

    document.querySelector('.layers-control').style.setProperty('--count', Object.keys(items).length);

    const callback = options.callback || function(i) { console.log(`default layers-control callback called with parameter ${i}`); };

    document.querySelectorAll('.layers-control ul > li').forEach(li => {
      const parent = li.closest('.layers-control');
      let wasFocusedOnMouseDown = false;

      li.addEventListener('mousedown', () => {
        wasFocusedOnMouseDown = parent.matches(':focus-within');
      });

      li.addEventListener('click', e => {
        if (wasFocusedOnMouseDown) {
          // Blur whatever currently holds focus anywhere inside the control
          //document.activeElement?.blur();
          callback(e.target.dataset.name);
        }
        wasFocusedOnMouseDown = false;
      });
    });

  };

}

