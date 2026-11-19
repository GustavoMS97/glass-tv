/*
 * Visualização HDMI em tela cheia dentro da Glass TV.
 *
 * Na TV, a imagem é desenhada pela janela de TV (tizen.tvwindow) no plano de
 * vídeo; esta tela apenas tira a interface da frente e trata as teclas:
 *   Voltar  → oculta a janela de TV e retorna ao menu Entradas
 *   1–4     → troca diretamente para outra entrada
 * Na prévia, exibe uma tela simulada claramente identificada.
 */
(function (root) {
  'use strict';

  var G = root.GlassTV;
  var D = G.dom;
  var h = D.h;
  var doc = root.document;

  var OSD_MS = 3200;

  G.ui.createHdmiView = function (ctx) {
    var el = doc.getElementById('hdmi');
    var simEl = el.querySelector('.hdmi__sim');
    var osdEl = el.querySelector('.hdmi__osd');
    var number = null;
    var osdTimer = null;

    function renderSim() {
      D.clear(simEl);
      if (!ctx.platform.isPreview) return;
      var bars = h('div', { className: 'hdmi__sim-bars' });
      ['#d8d8d8', '#d8d24a', '#4ad2d0', '#4ad24f', '#d24ad0', '#d2474a', '#4a52d2'].forEach(function (c) {
        bars.appendChild(h('span', { style: { background: c } }));
      });
      simEl.appendChild(bars);
      simEl.appendChild(h('div', { className: 'hdmi__sim-name', text: 'HDMI ' + number }));
      simEl.appendChild(h('p', {
        className: 'hdmi__sim-text',
        text: 'Simulação. Na TV, a imagem desta entrada é exibida aqui em tela cheia pela API oficial TV Window.'
      }));
    }

    function showOsd() {
      D.clear(osdEl);
      osdEl.appendChild(D.icon('monitor'));
      osdEl.appendChild(h('span', { text: 'HDMI ' + number }));
      osdEl.appendChild(h('small', { text: 'Voltar para sair' }));
      osdEl.classList.add('is-visible');
      root.clearTimeout(osdTimer);
      osdTimer = root.setTimeout(function () { osdEl.classList.remove('is-visible'); }, OSD_MS);
    }

    return {
      name: 'hdmi',
      el: el,
      blocksScreensaver: true,
      open: function (params) {
        number = params.number;
        if (!ctx.platform.isPreview) doc.documentElement.classList.add('tv-window-active');
        renderSim();
        el.classList.add('is-open');
        showOsd();
      },
      close: function () {
        el.classList.remove('is-open');
        osdEl.classList.remove('is-visible');
        doc.documentElement.classList.remove('tv-window-active');
        ctx.platform.hideHdmi();
      },
      switchTo: function (next) {
        number = next;
        renderSim();
        showOsd();
      },
      onKey: function (action, info) {
        if (action === 'back') return false;
        if (action === 'digit' && info.digit >= 1 && info.digit <= 4 && info.digit !== number) {
          ctx.actions.openHdmi(info.digit);
          return true;
        }
        showOsd();
        return true;
      },
      debug: function () { return { number: number, osd: osdEl.classList.contains('is-visible') }; }
    };
  };
})(window);
