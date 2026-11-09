(() => {
  const root = document.getElementById('farmyard-switch-study');
  const green = root.querySelector('#study-green');
  const red = root.querySelector('#study-red');
  const status = root.querySelector('#study-light-status');
  const family = [...root.querySelectorAll('[data-study-toggle]')];
  const state = {greenLit: true, redLit: true, family: family.map(() => false)};

  function apply(value) {
    if (typeof value?.greenLit === 'boolean') state.greenLit = value.greenLit;
    if (typeof value?.redLit === 'boolean') state.redLit = value.redLit;
    if (Array.isArray(value?.family)) {
      state.family = family.map((_, index) => value.family[index] === true);
    }
    green.setAttribute('aria-pressed', String(state.greenLit));
    red.setAttribute('aria-pressed', String(state.redLit));
    red.querySelector('.eye-count').textContent = state.redLit ? '2' : '0';
    family.forEach((button, index) => button.setAttribute('aria-pressed', String(state.family[index])));
    status.textContent = `Green light ${state.greenLit ? 'on' : 'off'} · red light ${state.redLit ? 'on' : 'off'}`;
  }

  function remember() {
    const host = window.openai;
    if (typeof host?.setWidgetState === 'function') {
      host.setWidgetState({modelContent: {switchMaterialsV2: {...state}}, privateContent: null}).catch(() => {});
    }
  }

  apply(window.openai?.widgetState?.modelContent?.switchMaterialsV2);
  green.addEventListener('click', () => { apply({greenLit: !state.greenLit}); remember(); });
  red.addEventListener('click', () => { apply({redLit: !state.redLit}); remember(); });
  family.forEach((button, index) => button.addEventListener('click', () => {
    state.family[index] = !state.family[index];
    apply();
    remember();
  }));
  window.addEventListener('openai:set_globals', event => {
    apply(event.detail?.globals?.widgetState?.modelContent?.switchMaterialsV2);
  });
})();
