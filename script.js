// Navigating the Unknown — drawings, gallery, menu, bird audio, films and scene titles
(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Drawings: hide any whose file hasn't been added yet, instead of a broken-image icon ----------
  document.querySelectorAll('img.botanical').forEach(function (img) {
    if (img.complete && !img.naturalWidth) img.hidden = true;
    img.addEventListener('error', function () { img.hidden = true; });
  });

  // ---------- Gallery: show each photo at its own proportions once it loads ----------
  document.querySelectorAll('.g-frame img').forEach(function (img) {
    var frame = img.parentElement;
    function ok() { frame.classList.add('has-img'); }
    function missing() { img.hidden = true; }
    if (img.complete) { img.naturalWidth ? ok() : missing(); }
    img.addEventListener('load', ok);
    img.addEventListener('error', missing);
  });

  // ---------- Menu ----------
  var menuBtn = document.getElementById('menu-btn');
  var menu = document.getElementById('menu');
  function setOpen(open) {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.textContent = open ? 'Close' : 'Menu';
    document.body.style.overflow = open ? 'hidden' : '';
  }
  menuBtn.addEventListener('click', function () { setOpen(menu.hidden); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { setOpen(false); menuBtn.focus(); } });

  // "Back to the beginning" scrolls to the top without needing a hash route
  document.querySelector('a[href="#top-of-page"]').addEventListener('click', function (e) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });

  // ---------- Bird audio: plays over the hero and every text scene, fades out over the documentary chapters ----------
  var entry = document.getElementById('entry');
  var soundOff = false;   // set when the visitor enters without sound
  var audio = document.getElementById('hero-audio');
  var soundBtn = document.getElementById('sound-btn');
  var hero = document.getElementById('hero');
  var MAX = 0.8;          // loudest level
  var birdSections = [hero].concat([].slice.call(document.querySelectorAll('.scene')));
  var wanted = true;      // false once the visitor mutes
  var started = false;    // true once playback has begun
  var ctx = null, gain = null;

  // Level follows how much of the screen the hero or a text scene fills: full inside them,
  // fading as a documentary chapter slides in, silent while a chapter fills the screen.
  function heroLevel() {
    var vh = window.innerHeight, covered = 0;
    birdSections.forEach(function (el) {
      var r = el.getBoundingClientRect();
      covered += Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    });
    var share = Math.min(1, covered / vh);
    return MAX * share * share;   // eased so the fade feels even to the ear
  }
  function setVolume(v) {
    if (gain) gain.gain.setTargetAtTime(v, ctx.currentTime, 0.12);
    else audio.volume = v;
  }
  function syncButton() {
    var on = started && wanted && !audio.paused;
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.querySelector('span').textContent = on ? 'Mute' : 'Play sound';
  }
  function update() {
    if (!started) return;
    var v = wanted ? heroLevel() : 0;
    setVolume(v);
    if (v < 0.005 && !audio.paused) audio.pause();
    else if (v >= 0.005 && audio.paused) audio.play().catch(function () {});
  }
  // Web Audio lets the fade work on iPhone, where the volume setting is fixed. It needs a tap first.
  function buildGraph() {
    if (gain) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      gain = ctx.createGain();
      gain.gain.value = heroLevel();
      ctx.createMediaElementSource(audio).connect(gain).connect(ctx.destination);
      audio.volume = 1;
    } catch (e) { ctx = null; gain = null; }
  }
  function start(fromGesture) {
    if (fromGesture) { buildGraph(); if (ctx && ctx.state === 'suspended') ctx.resume(); }
    setVolume(heroLevel());
    return audio.play().then(function () { started = true; update(); syncButton(); });
  }
  function onFirstGesture() {
    removeGestureListeners();
    if (wanted && !started) start(true).catch(function () {});
  }
  var gestures = ['pointerdown', 'keydown', 'touchstart'];
  function removeGestureListeners() { gestures.forEach(function (g) { window.removeEventListener(g, onFirstGesture, true); }); }

  if (audio && soundBtn) {
    // Show the sound button only once the file exists (it may already have loaded by now)
    if (audio.readyState >= 1) soundBtn.hidden = false;
    audio.addEventListener('loadedmetadata', function () { soundBtn.hidden = false; });
    audio.addEventListener('error', function () { soundBtn.hidden = true; removeGestureListeners(); });
    audio.addEventListener('play', syncButton);
    audio.addEventListener('pause', syncButton);

    // Browsers only allow sound to start on its own for sites a visitor already uses often;
    // otherwise it starts on their first click, tap or key press.
    if (!entry) start(false).catch(function () {
      gestures.forEach(function (g) { window.addEventListener(g, onFirstGesture, true); });
    });

    soundBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      removeGestureListeners();
      if (started && wanted && !audio.paused) {
        wanted = false;
        setVolume(0);
        setTimeout(function () { if (!wanted) audio.pause(); }, 400);
      } else {
        wanted = true;
        start(true).catch(function () {});
      }
      syncButton();
    });

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; update(); });
    }, { passive: true });
  }

  // ---------- Films: each plays when its section reaches the middle of the screen and pauses when it leaves ----------
  // Chapter documentaries try to play with sound; browsers only allow that after the visitor has clicked,
  // tapped or pressed a key on the page, so until then they play muted with a "Turn sound on" button.
  // Scene films are silent loops. With reduced motion on, nothing starts by itself.
  var films = [];
  document.querySelectorAll('.chapter, .scene').forEach(function (section) {
    var video = section.querySelector('video');
    if (!video) return;
    var isDoc = video.classList.contains('doc-film');
    var film = { section: section, video: video, isDoc: isDoc, inView: false, userPaused: false, scripted: false,
                 soundBtn: section.querySelector('.film-sound'), pauseBtn: section.querySelector('.scene-pause') };
    films.push(film);

    function ready() {
      video.hidden = false;
      if (isDoc) video.parentElement.classList.add('has-video');
      if (film.pauseBtn) film.pauseBtn.hidden = false;
      if (film.inView) playFilm(film);
    }
    if (video.readyState >= 2) ready(); else video.addEventListener('loadeddata', ready);
    video.addEventListener('error', function () { video.remove(); });   // file not added yet: keep the placeholder

    // A pause the visitor makes themselves sticks until they press play again
    video.addEventListener('pause', function () {
      if (film.scripted) film.scripted = false;           // paused by scrolling away: resume on return
      else if (!video.ended) film.userPaused = true;      // paused by the visitor: stay paused
      syncPause(film);
    });
    video.addEventListener('play', function () { film.userPaused = false; syncPause(film); });

    if (film.soundBtn) film.soundBtn.addEventListener('click', function () {
      video.muted = false;
      video.play().catch(function () {});
      film.soundBtn.hidden = true;
    });
    if (film.pauseBtn) film.pauseBtn.addEventListener('click', function () {
      if (video.paused) { film.userPaused = false; video.play().catch(function () {}); }
      else video.pause();
    });
  });
  function syncPause(film) { if (film.pauseBtn) film.pauseBtn.textContent = film.video.paused ? 'Play film' : 'Pause film'; }
  function playFilm(film) {
    var v = film.video;
    if (reduce || film.userPaused || v.ended || v.hidden || !v.isConnected) return;
    if (film.isDoc && v.muted === false) {
      v.play().catch(function () {
        v.muted = true;                                   // sound blocked until the visitor interacts
        if (film.soundBtn) film.soundBtn.hidden = false;
        v.play().catch(function () {});
      });
    } else {
      if (film.isDoc && v.muted && film.soundBtn) film.soundBtn.hidden = false;
      v.play().catch(function () {});
    }
  }
  function pauseFilm(film) {
    var v = film.video;
    if (v.paused) return;
    film.scripted = true; v.pause();
  }
  if ('IntersectionObserver' in window) {
    var filmObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var film = films.filter(function (f) { return f.section === e.target; })[0];
        if (!film) return;
        film.inView = e.isIntersecting;
        if (e.isIntersecting) playFilm(film); else pauseFilm(film);
      });
    }, { rootMargin: '-40% 0px -40% 0px' });   // "in view" once the section covers the middle of the screen
    films.forEach(function (f) { filmObserver.observe(f.section); });
  }

  // ---------- Scene titles: show the title of the part that has reached the middle of the screen ----------
  var titledScenes = [].slice.call(document.querySelectorAll('.scene')).map(function (scene) {
    return { titles: scene.querySelectorAll('.scene-title[data-part]'), parts: scene.querySelectorAll('.scene-part') };
  }).filter(function (x) { return x.titles.length > 1; });
  function updateTitles() {
    var mid = window.innerHeight * 0.55;
    titledScenes.forEach(function (x) {
      var current = x.parts[0].id;
      x.parts.forEach(function (part) { if (part.getBoundingClientRect().top < mid) current = part.id; });
      x.titles.forEach(function (t) { t.classList.toggle('is-active', t.dataset.part === current); });
    });
  }
  var titleTick = false;
  window.addEventListener('scroll', function () {
    if (titleTick) return;
    titleTick = true;
    requestAnimationFrame(function () { titleTick = false; updateTitles(); });
  }, { passive: true });
  updateTitles();

  // ---------- Story navigation: show it past the hero and mark where the reader is ----------
  var sideNav = document.getElementById('side-nav');
  if (sideNav) {
    var navLinks = [].slice.call(sideNav.querySelectorAll('a')).map(function (a) {
      return { a: a, target: document.querySelector(a.getAttribute('href')), li: a.closest('ol.sn-sub') ? a.closest('ol.sn-sub').parentElement : a.parentElement };
    }).filter(function (x) { return x.target; });
    var footer = document.querySelector('.colophon');
    function updateSideNav() {
      var vh = window.innerHeight, mid = vh * 0.5;
      var heroGone = hero.getBoundingClientRect().bottom < mid;
      var footerHere = footer && footer.getBoundingClientRect().top < sideNav.getBoundingClientRect().bottom + 24;   // hide before it reaches the footer
      sideNav.classList.toggle('is-visible', heroGone && !footerHere);
      var current = null;
      navLinks.forEach(function (x) { if (x.target.getBoundingClientRect().top <= mid) current = x; });
      navLinks.forEach(function (x) {
        var on = x === current;
        x.a.classList.toggle('is-current', on);
        if (on) x.a.setAttribute('aria-current', 'location'); else x.a.removeAttribute('aria-current');
      });
      sideNav.querySelectorAll(':scope > ol > li').forEach(function (li) {
        li.classList.toggle('is-open', !!current && current.li === li);
      });
    }
    var navTick = false;
    window.addEventListener('scroll', function () {
      if (navTick) return;
      navTick = true;
      requestAnimationFrame(function () { navTick = false; updateSideNav(); });
    }, { passive: true });
    window.addEventListener('resize', updateSideNav);
    updateSideNav();
  }

  // ---------- Buttons: dark text on the Mother of Pearl hero and footer, light text over films and chapters ----------
  var chromeFooter = document.querySelector('.colophon');
  var menuEl = document.getElementById('menu');
  function updateChrome() {
    var y = 40;   // the buttons' line
    var onLight = (hero.getBoundingClientRect().bottom > y) ||
                  (chromeFooter && chromeFooter.getBoundingClientRect().top < y) ||
                  (menuEl && !menuEl.hidden);
    document.documentElement.classList.toggle('chrome-on-dark', !onLight);
  }
  var chromeTick = false;
  window.addEventListener('scroll', function () {
    if (chromeTick) return;
    chromeTick = true;
    requestAnimationFrame(function () { chromeTick = false; updateChrome(); });
  }, { passive: true });
  window.addEventListener('resize', updateChrome);
  document.getElementById('menu-btn').addEventListener('click', function () { setTimeout(updateChrome, 0); });
  updateChrome();

  // ---------- Entry screen: start with or without sound, then reveal the hero ----------
  if (entry) {
    document.documentElement.classList.add('entry-open');
    var entryButtons = entry.querySelectorAll('.entry-btn');
    // focus the screen itself (not a button) so nothing is underlined until hover or keyboard Tab
    entry.setAttribute('tabindex', '-1');
    entry.focus({ preventScroll: true });
    entry.addEventListener('keydown', function (e) {   // keep keyboard focus on the two choices
      if (e.key !== 'Tab') return;
      var first = entryButtons[0], last = entryButtons[entryButtons.length - 1];
      if (document.activeElement === entry) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    entryButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.dataset.sound === 'on') {
          wanted = true;
          if (audio) start(true).catch(function () {});
          // Unlock each documentary for sound now, while this click counts (Safari needs it per video),
          // so each one can start with sound later when its chapter scrolls into view.
          films.forEach(function (f) {
            if (!f.isDoc) return;
            var v = f.video;
            v.muted = false;
            var p = v.play();
            if (p && p.then) p.then(function () {
              if (!f.inView) { f.scripted = true; v.pause(); v.currentTime = 0; }
            }).catch(function () {});
          });
        } else {
          soundOff = true;
          wanted = false;
          films.forEach(function (f) { if (f.isDoc) f.video.muted = true; });
        }
        syncButton();
        entry.classList.add('is-leaving');
        document.documentElement.classList.remove('entry-open');
        setTimeout(function () { entry.remove(); document.getElementById('menu-btn').focus({ preventScroll: true }); }, reduce ? 0 : 900);
      });
    });
  }
})();
