class MarkersControl {
  constructor(counters, options) {

    const cmpAlphaNum = (a,b) => a[0].localeCompare(b[0], 'en', { numeric: true });
    const translate = options?.translate || (s => s[0].toUpperCase()+s.slice(1));
    let cmpGroup = (a,b)=>(options?.weights?.[b]??0-options?.weights?.[a]??0)||cmpAlphaNum(a,b);

    document.querySelector('.markers-control')?.remove();

    const control = Object.assign(document.createElement('div'), {
      className: 'markers-control',
      innerHTML: Object.keys(counters||{}).sort(cmpGroup).map(group =>
        `<ul class="markers-control-groups"><li tabindex="0"><div class="markers-control-group" data-name="${group}">${translate(group)}</div><ul class="markers-control-items">`+
        Object.entries(counters[group]).sort(cmpAlphaNum).map(([type, count]) =>
          `<li tabindex="0" class="markers-control-item" data-name="${type}" title="${translate(type)}"><i class="${options?.icons?.[type]?.class||'fa fa-question-circle'}"></i><span>${translate(type)}</span><span>${count}</span></li>`
        ).join('')
        +`</ul></li></ul>`
      ).join('')
    });

    let dock = document.querySelector('.' +(options?.position ?? 'topleft'));
    (dock || document.body).append(control);

    if (!dock) {
      control.style.position = 'absolute';
      control.style.left = (options?.left ?? 0)+'px';
      control.style.top = (options?.top ?? 0)+'px';
    }

    document.querySelectorAll('.markers-control .markers-control-group').forEach(el=>{
      el.addEventListener('click', e => {
        options.groupCallback ? options.groupCallback(e.target.dataset.name) : console.log('groupCallback', e);
      })
    })

    document.querySelectorAll('.markers-control .markers-control-item').forEach(el=>{
      el.addEventListener('click', e => {
        options.itemCallback ? options.itemCallback(e.target.dataset.name) :  console.log('itemCallback', e);
      })
    })


    // prevent selection on double click
    let time = 0;
    document.addEventListener('mousedown', ev => {
      let now = Date.now();
      if (now - time < 300)
        setTimeout(() => {
          let sel = getSelection();
          if (sel?.type === 'Range') sel.removeAllRanges();
        }, 0);
      time = now;
    });

  }
}


