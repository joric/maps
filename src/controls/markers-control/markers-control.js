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


    document.querySelectorAll('.markers-control > ul > li').forEach(el => {
      el.addEventListener('focus', () => {
        //console.log('li focused', el);
        el.dataset.justFocused = '1'
        });
    })

    document.querySelectorAll('.markers-control .markers-control-group').forEach(el => {


      el.addEventListener('click', e => {
        //console.log('checking parent', el.parentElement);
        if (el.parentElement.dataset.justFocused) {
          delete el.parentElement.dataset.justFocused; // skip first click
          return;
        }

        //console.log('firing callback');

        // Only fire callback when already focused
        options.groupCallback
          ? options.groupCallback(e.currentTarget.dataset.name)
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


