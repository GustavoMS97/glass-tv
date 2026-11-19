/* Avisos curtos no topo da tela (não roubam o foco). */
(function (root) {
  'use strict';

  var G = root.GlassTV;
  var h = G.dom.h;

  G.ui.createToasts = function (host) {
    var MAX = 2;

    function remove(el) {
      if (!el.parentNode) return;
      el.classList.remove('is-in');
      root.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 320);
    }

    return {
      /** @param {string} text  @param {{detail?: string, kind?: 'info'|'warn'|'error'|'ok', duration?: number}} [opts] */
      show: function (text, opts) {
        var o = opts || {};
        var el = h('div', { className: 'toast glass toast--' + (o.kind || 'info') }, [
          h('span', { className: 'toast__dot' }),
          h('div', null, [
            h('div', { className: 'toast__text', text: text }),
            o.detail ? h('div', { className: 'toast__detail', text: o.detail }) : null
          ])
        ]);
        el.setAttribute('data-text', text);
        host.appendChild(el);
        while (host.children.length > MAX) host.removeChild(host.firstChild);
        root.requestAnimationFrame(function () { el.classList.add('is-in'); });
        root.setTimeout(function () { remove(el); }, o.duration || 4200);
      },
      debug: function () {
        return Array.prototype.map.call(host.children, function (el) { return el.getAttribute('data-text'); });
      }
    };
  };
})(window);
