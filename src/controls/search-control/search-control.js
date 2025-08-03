class SearchControl {

  _historyEntryName = `search-control:${location.pathname}`;
  _maxHistorySize = 50;
  _masStringLength = 100;

  _handleSubmit = () => {
  }

  _clear = event => {
    if (event) event.preventDefault();
    this._input.value = '';
    this._handleSubmit();
  }

  _updateDropdown = () => {
    let html = this._items.map(text => `<li tabindex=0><span class="search-item-text">${text}</span><button class="search-button search-delete">&times;</button></li>`).join('');
    document.querySelector('.search-list').innerHTML = html;
    localStorage.setItem(this._historyEntryName, JSON.stringify(this._items));
  }

  _submit = event => {
      if (event) event.preventDefault();
      this._handleSubmit();
    
      let value = this._input.value.trim().slice(0, this._maxStringLength);
      if (!value) return false;

      let index = this._items.indexOf(value);
      if (index !== -1) {
        this._items.splice(index, 1);
      }

      this._items.unshift(value);
      this._items = this._items.slice(0, this._maxHistorySize);
      this._updateDropdown();

      return false;
  };

  constructor(layer, options) {
    let autofocus = false;

    document.querySelector('.search-form')?.remove();

    const control = Object.assign(document.createElement('div'), {
      className: 'search-control',
      innerHTML: `<form class="search-form">
        <div class="search-input-container">
          <input type="text" class="search-input" name="q" tabindex=1 placeholder="Search..."${autofocus ? 'autofocus':''}>
          <button type="submit" class="search-button search-submit" tabindex=-1 title="Search">&#128269;&#xFE0E;</button>
          <button type="button" class="search-button search-clear" tabindex=0 title="Cancel">&times;</button>
        </div>
        <div class="search-list-container"><ul class="search-list"></ul></div>
      </form>`
    });

    let dock = document.querySelector('.' +(options?.position ?? 'topleft'));
    (dock || document.body).append(control);

    if (!dock) {
      control.style.position = 'absolute';
      control.style.left = (options?.left ?? 0)+'px';
      control.style.top = (options?.top ?? 0)+'px';
    }

    this._historyEntryName = options?.historyEntryName || this._historyEntryName;
    this._input = document.querySelector('.search-input');
    this._items = JSON.parse(localStorage.getItem(this._historyEntryName) || "[]");

    document.querySelector('.search-clear').onclick = this._clear;
    document.querySelector('.search-form').onsubmit = this._submit;

    document.querySelector('.search-list').onclick = event => {

      if (event.target.classList.contains('search-delete')) {
        let item = event.target.parentElement;
        let text = item.firstChild.textContent;
        this._items = this._items.filter(s => s !== text);
        this._updateDropdown();
        this._input.focus();
      } else {
        let item = event.target;
        let text = item.firstChild.textContent;
        this._input.value = text;
        this._submit();
      }

    };

    this._input.addEventListener("change", event => {
      if (this._input.value=='') this._handleSubmit();
    });


    this._input.addEventListener("focus", event => {
      this._input.select();
    });

    this._input.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        this._clear();
      }
    });

    this._updateDropdown();

    // clicking on clear/search changes focus and starts animation - can we mitigate that in css?
    let handleFocus = event => {
      if (document.activeElement !== this._input) {
        event.preventDefault();
      }
      this._clear();
    };

    document.querySelector('.search-clear').onmousedown = handleFocus;
    document.querySelector('.search-clear').ontouchstart = handleFocus;

  }
}
