/*
 * Protetor de tela: wallpapers locais em transição lenta, relógio discreto que
 * muda de posição periodicamente (evita elementos estáticos por muito tempo).
 * Não controla energia/tela da TV — é apenas uma camada visual do app.
 */
(function (root) {
  'use strict';

  var G = root.GlassTV;
  var D = G.dom;

  var CLOCK_MOVE_MS = 3 * 60000;

  G.ui.createScreensaver = function (el, catalog) {
    var layers = el.querySelectorAll('.ss__layer');
    var clockEl = el.querySelector('.ss__clock');
    var timeEl = el.querySelector('.ss__time');
    var dateEl = el.querySelector('.ss__date');
    var config = { intervalSeconds: 60, showClock: true, clock24h: true };
    var active = false;
    var order = [];
    var pos = 0;
    var front = -1;
    var slideTimer = null;
    var clockTimer = null;
    var moveTimer = null;
    var clockPos = 0;

    function shuffle(list) {
      var a = list.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }

    function showSlide(entry) {
      return D.preload(entry.src).then(function () {
        if (!active) return;
        var next = front === 0 ? 1 : 0;
        layers[next].style.backgroundImage = D.cssUrl(entry.src);
        layers[next].classList.remove('is-visible');
        void layers[next].offsetWidth;
        layers[next].classList.add('is-visible');
        if (front >= 0) layers[front].classList.remove('is-visible');
        front = next;
      });
    }

    function scheduleSlide() {
      root.clearTimeout(slideTimer);
      if (order.length < 2) return;
      slideTimer = root.setTimeout(function () {
        pos = (pos + 1) % order.length;
        showSlide(order[pos]).then(scheduleSlide);
      }, config.intervalSeconds * 1000);
    }

    function renderClock() {
      var now = new Date();
      var t = G.time.formatTime(now, config.clock24h);
      timeEl.textContent = t.main + (t.suffix ? ' ' + t.suffix : '');
      dateEl.textContent = G.time.formatDate(now);
      root.clearTimeout(clockTimer);
      clockTimer = root.setTimeout(renderClock, G.time.msToNextMinute(now) + 30);
    }

    function placeClock(index) {
      clockEl.className = 'ss__clock pos-' + index + (config.showClock ? '' : ' is-hidden');
    }

    function scheduleClockMove() {
      root.clearTimeout(moveTimer);
      moveTimer = root.setTimeout(function () {
        clockEl.classList.add('is-fading');
        root.setTimeout(function () {
          if (!active) return;
          clockPos = (clockPos + 1) % 4;
          placeClock(clockPos);
          scheduleClockMove();
        }, 1300);
      }, CLOCK_MOVE_MS);
    }

    return {
      configure: function (next, motion) {
        config = next;
        el.classList.toggle('is-moving', motion !== 'off');
        placeClock(clockPos);
      },
      start: function (currentId) {
        if (active || !catalog.length) return false;
        active = true;
        var others = catalog.filter(function (c) { return c.id !== currentId; });
        order = shuffle(others.length ? others : catalog);
        pos = 0;
        clockPos = Math.floor(Math.random() * 4);
        placeClock(clockPos);
        renderClock();
        showSlide(order[0]).then(scheduleSlide);
        scheduleClockMove();
        el.classList.add('is-open');
        return true;
      },
      stop: function () {
        if (!active) return false;
        active = false;
        root.clearTimeout(slideTimer);
        root.clearTimeout(clockTimer);
        root.clearTimeout(moveTimer);
        el.classList.remove('is-open');
        return true;
      },
      isActive: function () { return active; }
    };
  };
})(window);
