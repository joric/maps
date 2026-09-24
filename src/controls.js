export class WrapperControl {
  constructor(target, options = {}) {
    this.el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!this.el) throw new Error('WrapperControl: container not found');

    this.options = {
      scrollStep: 300,
      dragSpeed: 2,
      dragThreshold: 5,
      hideScrollbar: true,
      wheelHorizontal: true,
      ...options,
    };

    this._isDown = false;
    this._dragged = false;
    this._startX = 0;
    this._startY = 0;
    this._scrollLeft = 0;
    this._scrollTop = 0;

    this._init();
  }

  _init() {
    this._wrap();

    this.el.classList.add('wrapper-viewport');
    if (this.options.hideScrollbar) this.el.classList.add('wrapper-hidden-scrollbar');

    this._createButtons();
    this._bindDrag();
    if (this.options.wheelHorizontal) this._bindWheel();
    this._bindButtons();
    this._bindObservers();

    requestAnimationFrame(() => this.update());
  }

  _wrap() {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'wrapper-container';
    this.el.parentNode.insertBefore(this.wrapper, this.el);
    this.wrapper.appendChild(this.el);
  }

  _createButtons() {
    this.prevBtn = document.createElement('button');
    this.prevBtn.className = 'wrapper-btn wrapper-btn-prev';
    this.prevBtn.type = 'button';
    this.prevBtn.setAttribute('aria-label', 'Previous');

    this.nextBtn = document.createElement('button');
    this.nextBtn.className = 'wrapper-btn wrapper-btn-next';
    this.nextBtn.type = 'button';
    this.nextBtn.setAttribute('aria-label', 'Next');

    this.wrapper.appendChild(this.prevBtn);
    this.wrapper.appendChild(this.nextBtn);
  }

  _bindButtons() {
    this._onPrev = () => this._scrollBy(-this.options.scrollStep);
    this._onNext = () => this._scrollBy(this.options.scrollStep);
    this.prevBtn.addEventListener('click', this._onPrev);
    this.nextBtn.addEventListener('click', this._onNext);
  }

  _scrollBy(delta) {
    const horizontal = this._isHorizontal();
    if (horizontal) this.el.scrollBy({ left: delta, behavior: 'smooth' });
    else this.el.scrollBy({ top: delta, behavior: 'smooth' });
  }

  _isHorizontal() {
    return this.el.scrollWidth - this.el.clientWidth > this.el.scrollHeight - this.el.clientHeight;
  }

  _bindDrag() {
    const threshold = this.options.dragThreshold;
    let id = null, x0 = 0, y0 = 0, sl = 0, st = 0, dragged = false;

    const down = (e) => {
      if (e.target.closest('.wrapper-btn')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      id = e.pointerId;
      x0 = e.clientX;
      y0 = e.clientY;
      sl = this.el.scrollLeft;
      st = this.el.scrollTop;
      dragged = false;
    };

    const move = (e) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      if (!dragged && Math.hypot(dx, dy) < threshold) return;
      dragged = true;
      e.preventDefault();
      this.el.scrollLeft = sl - dx * this.options.dragSpeed;
      this.el.scrollTop = st - dy * this.options.dragSpeed;
    };

    const up = (e) => {
      if (e.pointerId !== id) return;
      id = null;
    };

    this._onPointerDown = down;
    this._onPointerMove = move;
    this._onPointerUp = up;
    this._onClickCapture = (e) => {
      if (dragged) {
        e.stopPropagation();
        e.preventDefault();
        dragged = false;
      }
    };

    this.el.addEventListener('pointerdown', down);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    this.el.addEventListener('click', this._onClickCapture, true);
  }

  _bindWheel() {
    this._onWheel = (e) => {
      if (e.shiftKey) return;
      if (this._isHorizontal() && e.deltaY !== 0) {
        e.preventDefault();
        this.el.scrollLeft += e.deltaY;
      }
    };
    this.el.addEventListener('wheel', this._onWheel, { passive: false });
  }

  _bindObservers() {
    this._onScroll = () => this.update();
    this.el.addEventListener('scroll', this._onScroll, { passive: true });

    this._ro = new ResizeObserver(() => this.update());
    this._ro.observe(this.el);

    this._mo = new MutationObserver(() => this.update());
    this._mo.observe(this.el, { childList: true, subtree: true });
  }

  update() {
    const { scrollLeft, scrollTop, scrollWidth, clientWidth, scrollHeight, clientHeight } = this.el;

    const overflowX = scrollWidth > clientWidth + 1;
    const overflowY = scrollHeight > clientHeight + 1;

    if (!overflowX && !overflowY) {
      this.prevBtn.classList.remove('wrapper-btn-visible');
      this.nextBtn.classList.remove('wrapper-btn-visible');
      return;
    }

    const horizontal = this._isHorizontal();
    const pos = horizontal ? scrollLeft : scrollTop;
    const max = horizontal ? scrollWidth - clientWidth : scrollHeight - clientHeight;

    this.prevBtn.classList.toggle('wrapper-btn-visible', pos > 1);
    this.nextBtn.classList.toggle('wrapper-btn-visible', pos < max - 1);
  }

  destroy() {

    this.el.removeEventListener('pointerdown', this._onPointerDown);
    document.removeEventListener('pointermove', this._onPointerMove);
    document.removeEventListener('pointerup', this._onPointerUp);
    document.removeEventListener('pointercancel', this._onPointerUp);
    this.el.removeEventListener('click', this._onClickCapture, true);

    this.el.removeEventListener('wheel', this._onWheel);
    this.el.removeEventListener('scroll', this._onScroll);
    this._ro.disconnect();
    this._mo.disconnect();
    this.prevBtn.removeEventListener('click', this._onPrev);
    this.nextBtn.removeEventListener('click', this._onNext);
    this.prevBtn.remove();
    this.nextBtn.remove();

    this.el.classList.remove(
      'wrapper-viewport',
      'wrapper-hidden-scrollbar',
      'wrapper-grabbing',
      'wrapper-dragging'
    );
    this.wrapper.parentNode.insertBefore(this.el, this.wrapper);
    this.wrapper.remove();
  }
}
