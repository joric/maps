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
      <div class="sidebar-content">

        <div class="sidebar-block"><h1 class="sidebar-title"></h1></div>

        <div class="sidebar-menu"><ul class="sidebar-items"></ul></div>

      </div>
      <div class="info"></div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', innerHTML);

    let content = document.querySelector('.sidebar-content');

    if (options.title) {
      document.querySelector('.sidebar-title').innerText = options.title;
    }

    if (options.html) {
      content.insertAdjacentHTML('beforeend', `<div class="sidebar-block">${options.html}</div>`);
    }

    let ul = document.querySelector('.sidebar-items');

    let html = '';
    let items = options.items || [];

    for (const [name, item] of Object.entries(items)) {
      let title = item.title || name;
      html += `<li tabindex=-1 data-name="${name}" class="sidebar-control-item" title="${item.title||name}">${title}</li>`;
    }

    ul.innerHTML = html;

    const callback = options.callback || function(i) {
      console.log(`default callback called with parameter ${i}`);
    };

    ul.addEventListener('click', e => {
      const li = e.target.closest('.sidebar-control-item');
      if (!li) return;
      callback(li.dataset.name);
    });

    document.addEventListener("keydown", (e) => {
      if (e.code=='Backquote') {
        this.toggle();
      }
    });


  }
}
