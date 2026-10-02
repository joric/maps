import './markers-control.css'

const RIGHT_GAP = 0;
const TOGGLE_W = 32;

export class MarkersControl {
  constructor(counters, options) {
    const translate = options?.translate || (s => s[0].toUpperCase()+s.slice(1));
    document.querySelector('.markers-anchor')?.remove();

    // Toggle whether hovering a group opens its popout (when none is open),
    // and whether mouse-leave auto-closes an open popout.
    // When false: popouts only open via click/focus, and only close via
    // click-away (or collapsing the panel).
    let openOnHover = true;

    // Toggle whether hovering another group switches an already-open popout
    // to that group. Independent of openOnHover: works even when hover-open
    // is disabled, as long as a popout is already open.
    let switchOnHover = true;

    const groupOrder = Object.keys(options.groups||[]);
    const cmpAlphaNum = (a,b) => a[0].localeCompare(b[0], 'en', { numeric: true, sensitivity: 'base' });
    const cmpGroup = (a,b) => (groupOrder.indexOf(a[1]) - groupOrder.indexOf(b[1])) || cmpAlphaNum(a,b);

    let icons = options.icons ?? {};

    const innerHTML = `
      <div class="markers-anchor">
        <div class="markers-collapsible">
          <div class="markers-collapsible-inner">
            <div class="markers-control markers-viewport">
                ${Object.entries(counters || {})
                  .map(([group, categories]) => [translate(group, 'groups'), group, categories])
                  .sort(cmpGroup)
                  .map(([groupTitle, group, categories]) => `
                  <ul class="markers-control-groups">
                    <li tabindex="0">
                      <div class="markers-control-group" data-name="${group}" title="${groupTitle} (${group}) [${Object.values(categories).reduce((a,b) =>a+b,0)}]">${groupTitle}</div>
                      <div class="markers-control-items">
                      <ul class="markers-control-items-list">
                        ${Object.entries(categories)
                          .map(([category, count]) => [translate(category, 'categories'), category, count])
                          .sort(cmpAlphaNum)
                          .map(([title, category, count]) => `
                            <li tabindex="0" class="markers-control-item" data-name="${category}" title="${title} (${category})">
                              <i class="${icons[category]?.class || 'fa fa-question-circle'}"></i>
                              <span>${title}</span>
                              <span>${count}</span>
                            </li>
                          `).join('')}
                      </ul>
                      </div>
                    </li>
                  </ul>
                `).join('')}
            </div>
          </div>
          <button type="button" class="markers-toggle" aria-label="Toggle markers"></button>
        </div>
      </div>
    `;

    const container = options.container
      ?? document.querySelector('.controls-top-left')
      ?? document.body;

    container.insertAdjacentHTML('beforeend', innerHTML);

    const anchor = container.querySelector('.markers-anchor');
    const collapsible = anchor.querySelector('.markers-collapsible');
    const toggleBtn = collapsible.querySelector('.markers-toggle');
    const inner = collapsible.querySelector('.markers-collapsible-inner');
    const panel = inner.querySelector('.markers-control');
    const root = document.documentElement;

    let naturalWidth = 0;

    function measureAll() {
      const aLeft = anchor.getBoundingClientRect().left;
      const vw = document.documentElement.clientWidth;
      const rowMax = Math.max(0, vw - aLeft - RIGHT_GAP);
      const panelMax = Math.max(0, rowMax - TOGGLE_W);

      const contentW = Math.ceil(panel.scrollWidth);
      naturalWidth = contentW;
      const panelW = Math.min(contentW, panelMax);

      root.style.setProperty('--anchor-left', Math.round(aLeft) + 'px');
      root.style.setProperty('--viewport-width', vw + 'px');
      root.style.setProperty('--row-max', Math.round(rowMax) + 'px');
      collapsible.style.setProperty('--panel-width', naturalWidth + 'px');
      collapsible.style.setProperty('--panel-clamped', Math.round(panelW) + 'px');
    }

    measureAll();

    // ---------------------------------------------------------------
    // Initial state
    // ---------------------------------------------------------------
    const storageKey = 'markers-control-expanded';
    const stored = localStorage.getItem(storageKey);

    if (stored === 'true') {
      collapsible.classList.add('expanded');
    } else {
      collapsible.classList.add('collapsed');
    }

    inner.style.transition = 'none';
    void inner.offsetWidth;
    inner.style.transition = '';

    // ---------------------------------------------------------------
    // Popout
    // ---------------------------------------------------------------
    let openItems = null;
    let openLi = null;
    let justFocusedLi = null;

    // Deferred-close timer so the cursor can travel from an li to its
    // popout (which renders outside the collapsible's box).
    let closeTimer = 0;

    function cancelScheduledClose() {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = 0;
      }
    }

    function scheduleClosePopout() {
      // When hover-open is disabled, the popout must not close from the
      // mouse leaving; it only closes via click-away / collapse.
      if (!openOnHover) return;
      cancelScheduledClose();
      closeTimer = setTimeout(() => {
        closeTimer = 0;
        closePopout();
      }, 150);
    }

    function positionOpenPopout() {
      if (!openItems || !openLi) return;
      const rect = openLi.getBoundingClientRect();
      const pw = openItems.offsetWidth;
      const ph = openItems.offsetHeight;

      let left = rect.left;
      let top = rect.bottom + 4;

      if (left + pw > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - pw - 8);
      }
      if (top + ph > window.innerHeight - 8 && rect.top - ph - 4 > 8) {
        top = rect.top - ph - 4;
      }

      openItems.style.left = left + 'px';
      openItems.style.top  = top + 'px';
    }

    function closePopout() {
      cancelScheduledClose();
      if (!openItems) return;
      openItems.classList.remove('open');
      openItems.style.left = '';
      openItems.style.top = '';
      openItems = null;
      openLi = null;
    }

    function openPopoutFor(li) {
      if (openLi === li) return;
      cancelScheduledClose();
      closePopout();
      const items = li.querySelector('.markers-control-items');
      if (!items) return;

      // popout is now owned by this li; any pending "just focused" click-swallow
      // belongs to the previous li and must not leak onto this one.
      if (justFocusedLi && justFocusedLi !== li) justFocusedLi = null;

      openLi = li;
      openItems = items;
      items.classList.add('open');
      positionOpenPopout();
    }

    // ---------------------------------------------------------------
    // Focus / click logic
    // ---------------------------------------------------------------
    collapsible.querySelectorAll('.markers-control > ul > li').forEach(li => {
      li.addEventListener('focus', e => {
        if (!li.contains(e.relatedTarget)) {
          // Was the popout already open for this li before the focus?
          // If yes (hover-open case), a click that follows should toggle
          // the group immediately — don't arm the swallow.
          // If no (focus caused the open), swallow the click that follows
          // the focus so it doesn't also toggle the group.
          const wasOpen = openLi === li;
          openPopoutFor(li);
          justFocusedLi = wasOpen ? null : li;
        }
      });
    });

    document.addEventListener('mouseup', e => {
      if (e.target.parentElement == justFocusedLi) return;
      justFocusedLi = null;
    });

    collapsible.querySelectorAll('.markers-control .markers-control-group').forEach(group => {
      group.addEventListener('click', e => {
        const li = group.closest('li');
        if (justFocusedLi === li) {
          justFocusedLi = null;
          return;
        }
        options.groupCallback
          ? options.groupCallback(group.dataset.name)
          : console.log('groupCallback', group.dataset.name);
      });
    });

    collapsible.querySelectorAll('.markers-control .markers-control-item').forEach(el => {
      el.addEventListener('click', e => {
        options.itemCallback
          ? options.itemCallback(e.target.dataset.name)
          : console.log('itemCallback', e.target.dataset.name);
      });
    });

    document.addEventListener('pointerdown', (e) => {
      if (!openLi) return;
      if (openItems?.contains(e.target)) return;
      if (openLi.contains(e.target)) return;
      closePopout();
    }, true);

    // ---------------------------------------------------------------
    // Hover: open and switch popouts for mouse users
    // ---------------------------------------------------------------
    // Two independent behaviors on hover:
    //   openOnHover   — open a popout when none is open
    //   switchOnHover — switch an already-open popout to the hovered group
    let hoverSwitchRaf = 0;

    function scheduleHoverSwitch(li) {
      cancelAnimationFrame(hoverSwitchRaf);
      hoverSwitchRaf = requestAnimationFrame(() => {
        if (!li.querySelector('.markers-control-items')) return;
        if (openLi === li) return;
        if (openLi) {
          // A popout is already open — only switch when allowed.
          if (!switchOnHover) return;
        } else {
          // No popout open — only open when allowed.
          if (!openOnHover) return;
        }
        openPopoutFor(li);
      });
    }

    collapsible.querySelectorAll('.markers-control > ul > li').forEach(li => {
      li.addEventListener('pointerenter', (e) => {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        scheduleHoverSwitch(li);
      });
    });

    // ---------------------------------------------------------------
    // Deferred close on leave (mouse only)
    // ---------------------------------------------------------------
    collapsible.addEventListener('pointerleave', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      // If the pointer moved into the popout, don't schedule a close.
      if (openItems && e.relatedTarget && openItems.contains(e.relatedTarget)) return;
      // If moving to another li in the same collapsible, let hover switch handle it.
      if (openLi && e.relatedTarget && openLi.contains(e.relatedTarget)) return;
      scheduleClosePopout();
    });

    // Re-entering the collapsible cancels a pending close.
    collapsible.addEventListener('pointerenter', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      cancelScheduledClose();
    });

    // Hovering the popout itself keeps it open.
    // Attached at document level (capture) since the popout lives outside
    // the collapsible subtree and moves between li's.
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      if (openItems && openItems.contains(e.target)) cancelScheduledClose();
    }, true);

    // ---------------------------------------------------------------
    // Wheel + drag scrolling
    // ---------------------------------------------------------------
    panel.addEventListener('wheel', (e) => {
      if (e.target.closest('.markers-control-items.open')) return;

      if (panel.scrollWidth <= panel.clientWidth) return;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      const before = panel.scrollLeft;
      panel.scrollLeft = before + delta;
      if (panel.scrollLeft !== before) e.preventDefault();
      positionOpenPopout();
    }, { passive: false });

    let dragState = null;

    panel.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragState = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startScrollLeft: panel.scrollLeft,
        moved: false,
        captured: false,
      };
    });

    panel.addEventListener('pointermove', (e) => {
      if (!dragState || e.pointerId !== dragState.pointerId) return;
      const dx = e.clientX - dragState.startX;
      if (!dragState.moved && Math.abs(dx) > 4) {
        dragState.moved = true;
        try { panel.setPointerCapture(e.pointerId); dragState.captured = true; } catch {}
        panel.classList.add('dragging');
      }
      if (dragState.moved) {
        panel.scrollLeft = dragState.startScrollLeft - dx;
        e.preventDefault();
        positionOpenPopout();
      }
    });

    const endDrag = (e) => {
      if (!dragState || e.pointerId !== dragState.pointerId) return;
      if (dragState.captured) {
        try { panel.releasePointerCapture(e.pointerId); } catch {}
      }
      panel.classList.remove('dragging');
      const wasMoved = dragState.moved;
      dragState = null;
      if (wasMoved) {
        const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
        panel.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => panel.removeEventListener('click', swallow, { capture: true }), 0);
      }
    };

    panel.addEventListener('pointerup', endDrag);
    panel.addEventListener('pointercancel', endDrag);

    // ---------------------------------------------------------------
    // Toggle
    // ---------------------------------------------------------------
    toggleBtn.addEventListener('click', () => {
      const willExpand = !collapsible.classList.contains('expanded');
      collapsible.classList.toggle('expanded', willExpand);
      collapsible.classList.toggle('collapsed', !willExpand);
      localStorage.setItem(storageKey, String(willExpand));

      if (!willExpand) closePopout();
    });

    // ---------------------------------------------------------------
    // Re-measurement — every viewport/container change signal
    // ---------------------------------------------------------------
    let resizeRafId = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(measureAll);
    };

    window.addEventListener('resize', onResize);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onResize);
      window.visualViewport.addEventListener('scroll', onResize);
    }

    const htmlRO = new ResizeObserver(onResize);
    htmlRO.observe(document.documentElement);
    htmlRO.observe(anchor);

    window.addEventListener('scroll', onResize, true);

    const panelMO = new MutationObserver(onResize);
    panelMO.observe(panel, { childList: true, subtree: true, characterData: true });

    if (document.fonts?.ready) document.fonts.ready.then(measureAll);

    // ---------------------------------------------------------------
    // Anchor position watcher
    // ---------------------------------------------------------------
    // measureAll() writes only CSS custom properties that cannot affect
    // the anchor's position (anchor is position: relative, collapsible
    // is position: absolute relative to it). So this rAF loop cannot
    // feed back into layout.
    let lastAnchorLeft = null;
    let lastAnchorTop = null;
    let anchorRafId = null;

    function watchAnchorPosition() {
      const r = anchor.getBoundingClientRect();
      if (r.left !== lastAnchorLeft || r.top !== lastAnchorTop) {
        lastAnchorLeft = r.left;
        lastAnchorTop = r.top;
        measureAll();
      }
      anchorRafId = requestAnimationFrame(watchAnchorPosition);
    }

    {
      const r = anchor.getBoundingClientRect();
      lastAnchorLeft = r.left;
      lastAnchorTop = r.top;
    }
    anchorRafId = requestAnimationFrame(watchAnchorPosition);

    // ---------------------------------------------------------------
    // Cleanup
    // ---------------------------------------------------------------
    const cleanupObserver = new MutationObserver(() => {
      if (!document.body.contains(anchor)) {
        cancelAnimationFrame(anchorRafId);
        cancelAnimationFrame(resizeRafId);
        cancelAnimationFrame(hoverSwitchRaf);
        cancelScheduledClose();
        closePopout();
        panelMO.disconnect();
        htmlRO.disconnect();
        cleanupObserver.disconnect();
      }
    });
    cleanupObserver.observe(document.body, { childList: true, subtree: true });
  }
}
