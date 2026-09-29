import './sidebar-control.css'

export class SidebarControl {
  open = event => {
    const sb = document.querySelector('.sidebar-control');
    if (sb) sb.focus();
  }

  toggle = event => {
    const sb = document.querySelector('.sidebar-control');
    document.activeElement === sb ? sb.blur() : sb.focus();
  }

  constructor(layer, options) {
    const innerHTML = `
    <div class="sidebar-control" tabindex="-1">
      <div class="sidebar-content"></div>
      <ul class="sidebar-items"></ul>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', innerHTML);

    let content = document.querySelector('.sidebar-content');

    if (options.title) {
      content.insertAdjacentHTML('beforeend', `<h1>${options.title}</h1>`);
    }

    let ul = document.querySelector('.sidebar-items');

    let html = '';
    let items = options.items || [];

    for (const [name, item] of Object.entries(items)) {
      let title = item.title || name;
      html += `<li tabindex=-1 data-name="${name}" class="menu-control-item" title="${item.title||name}">${title}</li>`;
    }

    ul.innerHTML = html;

    const callback = options.callback || function(i) {
      console.log(`default callback called with parameter ${i}`);
    };

    document.querySelectorAll('.sidebar-control ul > li').forEach(li => {
      li.addEventListener('click', e => {
        callback(e.target.dataset.name);
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.code=='Backquote' || e.code=='Escape') {
        this.toggle();
      }
    });


  }
}
