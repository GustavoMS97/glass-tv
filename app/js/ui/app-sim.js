/*
 * SOMENTE NA PRÉVIA: simula "outro app aberto" para testar o fluxo
 * abrir app → voltar à Glass TV (na TV real isso é o evento visibilitychange).
 */
(function (root) {
  'use strict';

  var G = root.GlassTV;
  var D = G.dom;
  var h = D.h;
  var doc = root.document;

  G.ui.createAppSimView = function (ctx) {
    var el = doc.getElementById('appsim');
    var app = null;

    return {
      name: 'appsim',
      el: el,
      blocksScreensaver: true,
      open: function (params) {
        app = params.app;
        var known = G.apps.resolveItem({ type: 'app', appId: app.id, name: app.name }, [app]);
        el.style.setProperty('--c1', known.colors[0]);
        el.style.setProperty('--c2', known.colors[1]);
        D.clear(el);
        el.appendChild(h('div', { className: 'appsim__name', text: app.name }));
        el.appendChild(h('p', {
          className: 'appsim__text',
          text: 'Simulação: na TV, o aplicativo estaria aberto agora e a Glass TV ficaria em segundo plano. Pressione Voltar (Esc) para simular o retorno.'
        }));
        el.appendChild(h('div', { className: 'appsim__id', text: 'appId: ' + app.id }));
        el.classList.add('is-open');
      },
      close: function () { el.classList.remove('is-open'); },
      onKey: function (action) {
        if (action === 'back') ctx.actions.handleVisible();
        return true;
      },
      debug: function () { return { app: app ? app.id : null }; }
    };
  };
})(window);
