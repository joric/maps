import './markers-control.css'

import { WrapperControl } from './controls.js';

export class MarkersControl {
  constructor(counters, options) {
    const translate = options?.translate || (s => s[0].toUpperCase()+s.slice(1));
    document.querySelector('.markers-control')?.remove();

    const groupOrder = Object.keys(options.groups||[]);
    const cmpAlphaNum = (a,b) => a[0].localeCompare(b[0], 'en', { numeric: true, sensitivity: 'base' });

    let cmpGroup = (a,b) => (groupOrder.indexOf(a[1]) - groupOrder.indexOf(b[1])) || cmpAlphaNum(a,b);

    let themeClass = options?.theme ?? '';
    let icons = options.icons ?? {};

    const innerHTML = `
      <div class="markers-control markers-viewport ${themeClass}">
          ${Object.entries(counters || {})
            .map(([group, categories]) => [translate(group, 'groups'), group, categories])
            .sort(cmpGroup)
            .map(([groupTitle, group, categories]) => `
            <ul class="markers-control-groups ${themeClass}">
              <li tabindex="0">
                <div class="markers-control-group" data-name="${group}" title="${groupTitle} (${group}) [${Object.values(categories).reduce((a,b) =>a+b,0)}]">${groupTitle}</div>
                <ul class="markers-control-items">
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
              </li>
            </ul>
          `).join('')}
        </div>
    `;

    const container = options.container
      ?? document.querySelector('.controls-top-left')
      ?? document.body;

    container.insertAdjacentHTML('beforeend', innerHTML);

    /*
    const wrapper = new WrapperControl('.markers-viewport', {
      scrollStep: 150,
      dragSpeed: 1.5,
    });
    */

    let justFocusedLi = null;

    document.querySelectorAll('.markers-control > ul > li').forEach(li => {
      li.addEventListener('focus', e => {
        if (!li.contains(e.relatedTarget)) {
          justFocusedLi = li;
        }
      });
    });

    document.addEventListener('mouseup', e => {
      if (e.target.parentElement == justFocusedLi) return;
      justFocusedLi = null;
    });

    document.querySelectorAll('.markers-control .markers-control-group').forEach(group => {
      group.addEventListener('click', e => {
        const li = group.closest('li');
        // Skip first click if li just got focus
        if (justFocusedLi === li) {
          justFocusedLi = null; // reset flag
          return;
        }
        //console.log('firing callback');
        options.groupCallback
          ? options.groupCallback(group.dataset.name)
          : console.log('groupCallback', e);
      });
    });

    document.querySelectorAll('.markers-control .markers-control-item').forEach(el=>{
      el.addEventListener('click', e => {
        options.itemCallback ? options.itemCallback(e.target.dataset.name) :  console.log('itemCallback', e);
      })
    })
  }
}


