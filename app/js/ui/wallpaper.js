/* Wallpaper com transição suave (duas camadas em crossfade) e troca automática. */
(function (root) {
  'use strict';

  var G = root.GlassTV;
  var D = G.dom;

  G.ui.createWallpaper = function (el, catalog) {
    var layers = el.querySelectorAll('.wallpaper__layer');
    var front = -1;
    var currentId = null;
    var request = 0;
    var rotateMinutes = 0;
    var rotateTimer = null;
    var paused = false;

    function find(id) {
      for (var i = 0; i < catalog.length; i++) if (catalog[i].id === id) return catalog[i];
      return catalog[0] || null;
    }

    function show(id) {
      var entry = find(id);
      if (!entry || entry.id === currentId) return Promise.resolve(false);
      currentId = entry.id;
      var ticket = ++request;
      return D.preload(entry.src).then(function (ok) {
        if (ticket !== request || !ok) return false;
        var next = front === 0 ? 1 : 0;
        layers[next].style.backgroundImage = D.cssUrl(entry.src);
        // Reinicia a animação de movimento na camada que entra.
        layers[next].classList.remove('is-visible');
        void layers[next].offsetWidth;
        layers[next].classList.add('is-visible');
        if (front >= 0) layers[front].classList.remove('is-visible');
        front = next;
        return true;
      });
    }

    function scheduleRotation() {
      if (rotateTimer) root.clearTimeout(rotateTimer);
      rotateTimer = null;
      if (!rotateMinutes || paused || catalog.length < 2) return;
      rotateTimer = root.setTimeout(function () {
        api.next();
        scheduleRotation();
      }, rotateMinutes * 60000);
    }

    var api = {
      set: show,
      next: function () {
        var idx = 0;
        for (var i = 0; i < catalog.length; i++) if (catalog[i].id === currentId) idx = i;
        return show(catalog[(idx + 1) % catalog.length].id);
      },
      setRotation: function (minutes) {
        rotateMinutes = minutes || 0;
        scheduleRotation();
      },
      setMotion: function (on) { el.classList.toggle('is-moving', !!on); },
      pause: function () { paused = true; scheduleRotation(); },
      resume: function () { paused = false; scheduleRotation(); },
      current: function () { return currentId; }
    };
    return api;
  };
})(window);
