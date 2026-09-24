import './popup-control.css'

export class PopupControl {
  _tooltipHideDelay = 300;
  _tooltipShowDelay = 300;
  _tooltipHideTimer = null;
  _tooltipShowTimer = null;

  setContent = (text) => {
    document.querySelector('.popup-text').innerHTML = text;
  };

  show = (x, y, forced) => {
    clearTimeout(this._tooltipShowTimer);
    clearTimeout(this._tooltipHideTimer);

    let w = 360;
    this._tooltip.style.left = (x - w/2) +'px';
    this._tooltip.style.top = (y + 20) +'px';

    this._tooltip.onmouseover = (e) => {
      clearTimeout(this._tooltipHideTimer);
    };

    this._tooltip.onmouseout = (e) => {
      this._tooltipHideTimer = setTimeout(()=>{ this.hide(true); }, this._tooltipHideDelay, this);
    };

    if (forced) {
      this._tooltip.style.display = 'block';
    } else {
      this._tooltipShowTimer = setTimeout(()=>{
        this._tooltip.style.display = 'block';
      }, this._tooltipShowDelay, this);
    }

  };

  hide = (forced) => {
    clearTimeout(this._tooltipShowTimer);
    clearTimeout(this._tooltipHideTimer);

    if (forced) {
      this._tooltip.style.display = 'none';
    } else {
      this._tooltipHideTimer = setTimeout(()=>{this._tooltip.style.display = 'none';}, this._tooltipHideDelay, this);
    }
  };

  constructor(layer, options) {
    const innerHTML = `
      <div class="popup-container">
        <div class="popup-content">
          <div class="popup-text">
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', innerHTML);

    this._tooltip = document.querySelector('.popup-container');
  };
}

