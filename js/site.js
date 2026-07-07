/* Shared site behavior: scroll reveals, marquee, sliders, parallax,
   scroll progress, lightbox. All decorative — the site works without JS. */

(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Scroll progress bar + nav shadow -------------------------------------
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  document.body.appendChild(bar);
  const nav = document.querySelector('.site-nav');

  function onScroll() {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
    if (nav) nav.classList.toggle('is-scrolled', h.scrollTop > 10);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Marquee: clone the inner strip once for a seamless loop ----------------
  document.querySelectorAll('.marquee-track').forEach(track => {
    const inner = track.querySelector('.marquee-inner');
    if (inner) track.appendChild(inner.cloneNode(true));
  });

  // Scroll reveals ----------------------------------------------------------
  // Fail open: content is only hidden after the rendering pipeline proves
  // alive (first animation frame), and a watchdog un-hides everything if the
  // IntersectionObserver never delivers. Worst case is no animation — never
  // an invisible site.
  if (!reduced && 'IntersectionObserver' in window) {
    requestAnimationFrame(() => {
      const REVEAL_TARGETS = [
        '.hero .eyebrow', '.hero h1', '.hero .hero-sub',
        '.hero-photo', '.marquee', '.what-item',
        '.section-head', '.gallery-sub', '.work-row',
        '.slider-item', '.slider-nav', '.journal-row', '.pull-quote',
        '.about-grid > *', '.contact-inner > *',
        '.page-header > *', '.project-cover', '.post-cover',
        '.project-body > *', '.post-body > *',
        '.photo-grid .ph', '.next-cta > *',
      ];

      const els = [];
      REVEAL_TARGETS.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (!el.classList.contains('reveal')) {
            el.classList.add('reveal');
            els.push(el);
          }
        });
      });

      // Stagger siblings that reveal together
      els.forEach(el => {
        const sibs = el.parentElement
          ? Array.from(el.parentElement.children).filter(c => c.classList.contains('reveal'))
          : [el];
        const i = Math.max(0, sibs.indexOf(el));
        el.style.setProperty('--reveal-delay', Math.min(i * 70, 420) + 'ms');
      });

      function finish(el) {
        // Once the entrance finishes, drop the reveal classes so hover
        // transitions and other transforms behave normally again.
        const delay = (parseFloat(el.style.getPropertyValue('--reveal-delay')) || 0);
        setTimeout(() => {
          el.classList.remove('reveal', 'in');
          el.style.removeProperty('--reveal-delay');
        }, 1000 + delay);
      }

      let ioDelivered = false;
      const io = new IntersectionObserver(entries => {
        ioDelivered = true;
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          el.classList.add('in');
          io.unobserve(el);
          finish(el);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

      els.forEach(el => io.observe(el));

      // Watchdog: if the observer hasn't delivered anything shortly after
      // init, assume it's broken and reveal everything.
      setTimeout(() => {
        if (!ioDelivered) {
          io.disconnect();
          els.forEach(el => {
            el.classList.add('in');
            finish(el);
          });
        }
      }, 2500);
    });
  }

  // Sliders: arrow buttons + drag to scroll ---------------------------------
  document.querySelectorAll('[data-slider]').forEach(slider => {
    const track = slider.querySelector('.slider-track');
    if (!track) return;

    slider.querySelectorAll('.slider-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = track.querySelector('.slider-item');
        const step = item ? item.getBoundingClientRect().width + 18 : 320;
        track.scrollBy({ left: step * Number(btn.dataset.dir || 1), behavior: reduced ? 'auto' : 'smooth' });
      });
    });

    let down = false, startX = 0, startScroll = 0, moved = false;
    track.addEventListener('pointerdown', e => {
      down = true;
      moved = false;
      startX = e.clientX;
      startScroll = track.scrollLeft;
      track.classList.add('dragging');
    });
    window.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 5) moved = true;
      track.scrollLeft = startScroll - dx;
    });
    window.addEventListener('pointerup', () => {
      down = false;
      track.classList.remove('dragging');
    });
    // A drag shouldn't count as a click on a linked photo
    track.addEventListener('click', e => { if (moved) e.preventDefault(); }, true);
  });

  // Parallax on cover photos (only once real images are in) -----------------
  if (!reduced) {
    const covers = Array.from(document.querySelectorAll('.hero-photo img, .project-cover img, .post-cover img'));
    if (covers.length) {
      covers.forEach(img => img.classList.add('parallax'));
      let parTick = false;
      function parallax() {
        if (parTick) return;
        parTick = true;
        requestAnimationFrame(() => {
          const vh = window.innerHeight;
          covers.forEach(img => {
            const r = img.parentElement.getBoundingClientRect();
            if (r.bottom < 0 || r.top > vh) { parTick = false; return; }
            const progress = (r.top + r.height / 2 - vh / 2) / (vh / 2);
            img.style.transform = `translateY(${progress * -4}%) scale(1.12)`;
          });
          parTick = false;
        });
      }
      window.addEventListener('scroll', parallax, { passive: true });
      parallax();
    }
  }

  // Lightbox for real photos in grids/sliders --------------------------------
  let lightbox = null;
  function openLightbox(src, alt) {
    if (!lightbox) {
      lightbox = document.createElement('div');
      lightbox.className = 'lightbox';
      lightbox.innerHTML = '<img alt="">';
      lightbox.addEventListener('click', closeLightbox);
      document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
      document.body.appendChild(lightbox);
    }
    const img = lightbox.querySelector('img');
    img.src = src;
    img.alt = alt || '';
    lightbox.style.display = 'flex';
    requestAnimationFrame(() => lightbox.classList.add('open'));
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => { lightbox.style.display = 'none'; }, 300);
  }
  document.querySelectorAll('.photo-grid .ph img, .slider-item img').forEach(img => {
    const holder = img.closest('.ph');
    if (holder && holder.tagName !== 'A') {
      holder.classList.add('zoomable');
      holder.addEventListener('click', () => openLightbox(img.getAttribute('src'), img.getAttribute('alt')));
    }
  });
})();
