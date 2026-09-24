import './menu-control.css'

export class MenuControl {
  constructor(layer, options) {
    const innerHTML = `
    <div class="menu-control">
      <button type="button" class="menu-control-button"></button>
      <ul class="menu-control-items" role="listbox"></ul>
    </div>
    `;

    let container = document.querySelector('.controls-top-left') ?? document.body;

    container.insertAdjacentHTML('beforeend', innerHTML);

    const ul = document.querySelector('.menu-control-items');

    let html = '';

    let items = options.items || [];

    for (const [name, item] of Object.entries(items)) {
      let title = item.title || name;
      html += `<li tabindex=-1 data-name="${name}" class="menu-control-item" title="${item.title||name}">${title}</li>`;
    }

    ul.innerHTML = html;

    const callback = options.callback || function(i) { console.log(`default callback called with parameter ${i}`); };

    document.querySelectorAll('.menu-control ul > li').forEach(li => {
      li.addEventListener('click', e => {
        callback(e.target.dataset.name);
      });
    });

  }
}

