/* Relógio e data da tela inicial. Atualiza só na virada do minuto. */
(function (root) {
  'use strict';

  var G = root.GlassTV;

  G.ui.createClock = function (el) {
    var timeEl = el.querySelector('.clock__time');
    var mainEl = el.querySelector('.clock__main');
    var suffixEl = el.querySelector('.clock__suffix');
    var dateEl = el.querySelector('.clock__date');
    var config = { showClock: true, showDate: true, clock24h: true };
    var timer = null;

    function render() {
      var now = new Date();
      var t = G.time.formatTime(now, config.clock24h);
      mainEl.textContent = t.main;
      suffixEl.textContent = t.suffix;
      dateEl.textContent = G.time.formatDate(now);
      return now;
    }

    function tick() {
      var now = render();
      if (timer) root.clearTimeout(timer);
      timer = root.setTimeout(tick, G.time.msToNextMinute(now) + 30);
    }

    return {
      configure: function (next) {
        config = next;
        timeEl.classList.toggle('is-hidden', !next.showClock);
        dateEl.classList.toggle('is-hidden', !next.showDate);
        el.style.display = next.showClock || next.showDate ? '' : 'none';
        render();
      },
      start: tick,
      pause: function () { if (timer) root.clearTimeout(timer); timer = null; },
      resume: tick
    };
  };
})(window);
