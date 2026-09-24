import './search-control.css'

export class SearchControl {
  _historyEntryName = 'searchHistory';
  _maxHistorySize = 50;
  _maxStringLength = 100;
  _searchRequestId = 0;
  _searchDebounceMs = 50;
  _searchTimer = null;
  _selectedIndex = -1;
  _mode = 'history';
  _currentItems = [];
  _clear = event => {
    if (event) event.preventDefault();
    clearTimeout(this._searchTimer);
    this._input.value = '';
    this._handleSubmit();
    this._updateDropdown();
    this._input.focus();
  }
  _historyRenderItem = text => `<span class="search-item-text">${text}</span>`;
  _renderList = (items, { deletable, renderItem }) => {
    let html = items.map((item, i) => `<li tabindex=-1 id="search-item-${i}" data-index="${i}">${renderItem(item)}${deletable ? '<button class="search-button search-delete">&times;</button>' : ''}</li>`).join('');
    document.querySelector('.search-list').innerHTML = html;
    this._selectedIndex = -1;
    this._currentItems = items;
    this._input.removeAttribute('aria-activedescendant');
  }
  _updateDropdown = () => {
    this._mode = 'history';
    this._renderList(this._items, { deletable: true, renderItem: this._historyRenderItem });
    localStorage.setItem(this._historyEntryName, JSON.stringify(this._items));
  }
  _runSearch = async value => {
    let requestId = ++this._searchRequestId;
    let results = await this._searchCallback(value);
    if (requestId !== this._searchRequestId) return;
    this._mode = 'search';
    this._renderList(results, { deletable: false, renderItem: this._searchRenderItem });
  }
  _handleInput = () => {
    clearTimeout(this._searchTimer);
    let value = this._input.value.trim();
    if (!value || !this._searchCallback) {
      this._updateDropdown();
      return;
    }
    this._searchTimer = setTimeout(() => this._runSearch(value), this._searchDebounceMs);
  }
  _activateItem = li => {
    if (!li) return;
    let index = Number(li.dataset.index);
    if (this._mode === 'search') {
      let item = this._currentItems[index];
      if (this._searchOnSelect) this._searchOnSelect(item);
      return;
    }
    let text = this._currentItems[index];

    if (this._input.value === text) {
      // expanding search if top history item is the same as text
      this._runSearch(text);
      return;
    }

    this._input.value = text;
    this._submit();
  }
  _focusInput = () => {
    requestAnimationFrame(() => {
      this._input.focus();
      this._input.select();
    });
  }
  _setSelected = index => {
    let items = document.querySelectorAll('.search-list li');
    items.forEach((li, i) => li.classList.toggle('search-item-selected', i === index));
    this._selectedIndex = index;
    if (index === -1) {
      this._input.removeAttribute('aria-activedescendant');
      this._focusInput();
    } else {
      items[index].scrollIntoView({ block: 'nearest' });
      this._input.setAttribute('aria-activedescendant', items[index].id);
      if (this._mode === 'search' && this._searchOnSelect) {
        this._searchOnSelect(this._currentItems[index]);
      }
    }
  }
  _moveSelection = delta => {
    let items = document.querySelectorAll('.search-list li');
    if (!items.length) return;
    let index = this._selectedIndex + delta;
    if (index < 0) {
      this._setSelected(-1);
      return;
    }
    index = Math.min(items.length - 1, index);
    this._setSelected(index);
  }
  _submit = event => {
      if (event) event.preventDefault();
      let value = this._input.value.trim().slice(0, this._maxStringLength);
      if (!value) return false;
      let index = this._items.indexOf(value);
      if (index !== -1) {
        this._items.splice(index, 1);
      }
      this._items.unshift(value);
      this._items = this._items.slice(0, this._maxHistorySize);
      this._updateDropdown();

      this._handleSubmit(value);

      this._handleInput(value); // update lookahead too

      return false;
  };
  constructor(layer, options) {
    let autofocus = false;
    this._searchCallback = options && options.searchCallback;
    this._historyGetText = (options && options.historyGetText) || (text => text);
    this._searchGetText = (options && options.searchGetText) || (o => o.item.custom_title);
    this._searchOnSelect = options && options.searchOnSelect;
    this._searchRenderItem = (options && options.searchRenderItem) || (o => `<span class="search-item-text">${this._searchGetText(o)}</span>`);
    this._handleSubmit = (options && options.onSubmit) || (() => {});
    const innerHTML = `
      <div class="search-container">
        <form class="search-form">
          <div class="search-input-container">
            <input type="text" class="search-input" tabindex=1 autocomplete="off" role="combobox" aria-expanded="true" aria-autocomplete="list" placeholder="Search..."${autofocus ? 'autofocus':''}>
            <button type="submit" class="search-button search-submit" tabindex=-1 title="Search">&#128269;&#xFE0E;</button>
            <button type="button" class="search-button search-clear" tabindex=0 title="Cancel">&times;</button>
          </div>
          <div class="search-list-container"><ul class="search-list" role="listbox"></ul></div>
        </form>
      </div>
    `;

    let container = document.querySelector('.controls-top-left') ?? document.body;
    container.insertAdjacentHTML('beforeend', innerHTML);


    this._input = document.querySelector('.search-input');
    this._container = document.querySelector('.search-container');
    this._items = JSON.parse(localStorage.getItem(this._historyEntryName) || "[]");
    document.querySelector('.search-clear').onclick = this._clear;
    document.querySelector('.search-form').onsubmit = this._submit;
    document.querySelector('.search-list').addEventListener('mousedown', event => {
      event.preventDefault();
    });
    document.querySelector('.search-list').onclick = event => {
      if (event.target.classList.contains('search-delete')) {
        let li = event.target.parentElement;
        let index = Number(li.dataset.index);
        let text = this._currentItems[index];
        this._items = this._items.filter(s => s !== text);
        this._updateDropdown();
        this._input.focus();
      } else {
        this._activateItem(event.target.closest('li'));
      }
    };
    this._input.addEventListener("change", event => {
      if (this._input.value=='') this._handleSubmit();
    });
    this._input.addEventListener("input", this._handleInput);
    this._input.addEventListener("focus", event => {
      this._input.select();
    });
    this._input.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        this._clear();
        let map = document.querySelector('#map');
        if (map) map.focus();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        this._moveSelection(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (this._selectedIndex === -1) {
          this._focusInput();
        } else {
          this._moveSelection(-1);
        }
      } else if (event.key === "Enter" && this._selectedIndex !== -1) {
        event.preventDefault();
        let items = document.querySelectorAll('.search-list li');
        this._activateItem(items[this._selectedIndex]);
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

    document.addEventListener("keydown",function (e) {
      let input = document.querySelector('.search-input');
      if (document.activeElement === input) return;
      if ((e.code=='KeyF' && e.ctrlKey) || e.code=='Slash') {
        input.focus();
        e.preventDefault();
        return;
      }
    });

  }
}
