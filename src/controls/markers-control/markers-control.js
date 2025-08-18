class MarkersControl {
  constructor(counters, options) {

    const cmpAlphaNum = (a,b) => a[0].localeCompare(b[0], 'en', { numeric: true });
    const translate = options?.translate || (s => s[0].toUpperCase()+s.slice(1));
    let cmpGroup = (a,b)=>(options?.weights?.[b]??0-options?.weights?.[a]??0)||cmpAlphaNum(a,b);

    document.querySelector('.markers-control')?.remove();

    //options = {...options||{}, theme:'glass'};
    //options = {...options||{}, theme:'retro'};

    const control = Object.assign(document.createElement('div'), {
      className: `markers-control${(options?.theme) ? ' '+options.theme : ''}`,
      innerHTML: Object.keys(counters||{}).sort(cmpGroup).map(group =>
        `<ul class="markers-control-groups"><li tabindex="0"><div class="markers-control-group" data-name="${group}">${translate(group)}</div><ul class="markers-control-items">`+
        Object.entries(counters[group]).map(([type,count])=>[translate(type),type,count]).sort(cmpAlphaNum).map(([title, type, count]) =>
          `<li tabindex="0" class="markers-control-item" data-name="${type}" title="${title}"><i class="${options?.icons?.[type]?.class||'fa fa-question-circle'}"></i><span>${title}</span><span>${count}</span></li>`
        ).join('')
        +`</ul></li></ul>`
      ).join('')
    });

    let dock = document.querySelector('.' +(options?.position ?? 'controls-topleft'));
    (dock || document.body).append(control);

    if (!dock) {
      control.style.position = 'absolute';
      control.style.left = (options?.left ?? 0)+'px';
      control.style.top = (options?.top ?? 0)+'px';
    }

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


