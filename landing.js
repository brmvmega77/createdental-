(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const revealParts = document.querySelectorAll('.landing-nav, .hero-copy, .hero-stage, .landing-footer');

  const reveal = () => {
    if (reduce || !window.gsap) return;
    revealParts.forEach(node => node.classList.add('js-reveal'));
    const timeline = window.gsap.timeline({defaults: {ease: 'power3.out'}});
    timeline
      .to('.landing-nav', {autoAlpha: 1, y: 0, duration: .55})
      .to('.hero-copy', {autoAlpha: 1, y: 0, duration: .78}, '-=.2')
      .to('.hero-stage', {autoAlpha: 1, y: 0, duration: .9}, '-=.52')
      .to('.landing-footer', {autoAlpha: 1, y: 0, duration: .42}, '-=.42');
  };

  if (window.gsap) reveal();

  const stage = document.querySelector('.hero-stage');
  const specimen = document.querySelector('.team-figure');
  const processVignette = document.querySelector('.process-readout');
  const processTitle = document.querySelector('.process-vignette-title');
  const processIndex = document.querySelector('.process-vignette-index');
  const processProgress = [...document.querySelectorAll('.process-vignette-progress i')];
  const processGlyphs = [...document.querySelectorAll('.process-glyph')];

  const animateProcess = () => {
    if (!stage || !processVignette) return;
    const stages = [
      'Создание заказа',
      'CAD моделирование',
      'Согласование',
      'Фрезеровка',
      'Эстетика',
      'Контроль качества',
      'Доставка'
    ];
    const showStage = index => {
      const scene = ['create', 'cad', 'approval', 'milling', 'aesthetic', 'quality', 'delivery'][index];
      processVignette.classList.remove('is-changing');
      void processVignette.offsetWidth;
      processVignette.classList.add('is-changing');
      window.setTimeout(() => processVignette.classList.remove('is-changing'), 260);
      processVignette.dataset.scene = scene;
      if (processTitle) processTitle.textContent = stages[index];
      if (processIndex) processIndex.textContent = `${String(index + 1).padStart(2, '0')} / 07`;
      processGlyphs.forEach(glyph => glyph.classList.toggle('is-active', glyph.dataset.scene === scene));
      processProgress.forEach((dot, dotIndex) => {
        dot.classList.toggle('is-done', dotIndex < index);
        dot.classList.toggle('is-current', dotIndex === index);
      });
    };
    if (reduce) {
      showStage(1);
      return;
    }
    const beat = 3200;
    let activeIndex = -1;
    const tick = now => {
      const index = Math.floor(now / beat) % stages.length;
      if (index !== activeIndex) {
        activeIndex = index;
        showStage(index);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  animateProcess();

  if (!reduce && stage && specimen && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const moveSpecimen = window.gsap ? window.gsap.quickTo(specimen, 'x', {duration: .65, ease: 'power3.out'}) : value => { specimen.style.setProperty('--x', `${value}px`); };
    stage.addEventListener('pointermove', event => {
      const rect = stage.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - .5) * 2;
      moveSpecimen(x * 7);
    }, {passive: true});
    stage.addEventListener('pointerleave', () => { moveSpecimen(0); }, {passive: true});
  }
})();
