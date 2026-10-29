// UI layer: smooth scroll, reveals, counters, 3D card tilt, nav state.
// Classic script (not a module) so the page works from file:// as well as over http.
// The Three.js hero (scene.bundle.js) is injected once the page is idle.

(() => {
  'use strict';
  window.__cvBooted = true;
  const scriptBase = document.currentScript && document.currentScript.src;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ---------- smooth scrolling ---------- */
  let lenis = null;
  if (!reduceMotion && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1 });
    const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const id = link.getAttribute('href');
    const target = id === '#top' ? document.body : $(id);
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(id === '#top' ? 0 : target, { offset: -84, duration: 1.4 });
    else (id === '#top' ? window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }) : target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }));
    history.replaceState(null, '', id);
  });

  /* ---------- scroll progress + nav state ---------- */
  const nav = $('#nav');
  const bar = $('.progress');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const y = scrollY;
      bar.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
      nav.classList.toggle('is-scrolled', y > 24);
      ticking = false;
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const navLinks = $$('.nav__links a');
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === `#${entry.target.id}`)));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  ['profile', 'work', 'projects', 'toolkit', 'contact'].forEach((id) => { const el = document.getElementById(id); if (el) sectionObserver.observe(el); });

  /* ---------- reveal on scroll ---------- */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal').forEach((el) => revealObserver.observe(el));

  /* ---------- counters ---------- */
  const formatNumber = (value, decimals) => value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      counterObserver.unobserve(entry.target);
      const el = entry.target;
      const end = parseFloat(el.dataset.count);
      const decimals = parseInt(el.dataset.decimals || '0', 10);
      if (reduceMotion) { el.textContent = formatNumber(end, decimals); return; }
      const start = performance.now();
      const duration = 1600;
      const step = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 4);
        el.textContent = formatNumber(end * eased, decimals);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, { threshold: 0.6 });
  $$('[data-count]').forEach((el) => counterObserver.observe(el));

  /* ---------- 3D tilt cards ---------- */
  if (finePointer && !reduceMotion) {
    $$('[data-tilt]').forEach((card) => {
      let frame = 0;
      let rect = null;
      let MAX = 7;
      const move = (e) => {
        rect = rect || card.getBoundingClientRect();
        MAX = rect.width > 760 ? 3 : 7; // wide cards swing too far at the same angle
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          card.style.setProperty('--ry', `${((x - 0.5) * 2 * MAX).toFixed(2)}deg`);
          card.style.setProperty('--rx', `${((0.5 - y) * 2 * MAX).toFixed(2)}deg`);
          card.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
          card.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
        });
      };
      card.addEventListener('pointerenter', () => {
        rect = card.getBoundingClientRect();
        card.classList.add('is-hover');
        card.style.setProperty('--glare', '1');
      });
      card.addEventListener('pointermove', move);
      card.addEventListener('pointerleave', () => {
        cancelAnimationFrame(frame);
        rect = null;
        card.classList.remove('is-hover');
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
        card.style.setProperty('--glare', '0');
      });
    });
    addEventListener('scroll', () => $$('.card.is-hover').forEach((c) => c.dispatchEvent(new PointerEvent('pointerenter'))), { passive: true });
  }

  /* ---------- copy email ---------- */
  $$('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const label = $('span', btn);
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        label.textContent = 'Copied';
      } catch {
        label.textContent = 'Select & copy';
      }
      btn.classList.add('is-done');
      setTimeout(() => { label.textContent = 'Copy'; btn.classList.remove('is-done'); }, 1800);
    });
  });

  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  /* ---------- 3D hero (lazy) ---------- */
  const hero = $('.hero');
  const canvas = $('.hero__canvas');
  const hasWebGL = (() => {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch { return false; }
  })();

  if (hero && canvas && hasWebGL) {
    // A plain <script> (not an ES module import) so the 3D also works when the page is opened from disk.
    const boot = () => {
      const script = document.createElement('script');
      script.src = scriptBase ? new URL('scene.bundle.js', scriptBase).href : 'assets/js/scene.bundle.js';
      script.async = true;
      script.onload = () => {
        try { window.CVScene.initScene({ canvas, hero, reduceMotion }); }
        catch (err) { console.warn('[cv] 3D scene unavailable:', err); }
      };
      script.onerror = () => console.warn('[cv] could not load the 3D scene');
      document.head.appendChild(script);
    };
    const schedule = () => ('requestIdleCallback' in window ? requestIdleCallback(boot, { timeout: 600 }) : setTimeout(boot, 120));
    if (document.readyState === 'complete') schedule();
    else addEventListener('load', schedule, { once: true });
  }
})();
