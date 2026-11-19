/* Menu "Entradas": cartões HDMI 1–4 em linha. */
(function (root) {
  'use strict';

  var G = root.GlassTV;
  var D = G.dom;
  var h = D.h;
  var doc = root.document;

  var STATUS_TEXT = {
    connected: 'Dispositivo conectado',
    disconnected: 'Sem dispositivo',
    absent: 'Indisponível',
    unknown: ''
  };

  G.ui.createInputsView = function (ctx) {
    var el = doc.getElementById('inputs');
    var cardsEl = doc.getElementById('inputs-cards');
    var noteEl = doc.getElementById('inputs-note');
    var ports = [];
    var cards = [];
    var index = 0;
    var isOpen = false;

    function render() {
      var prev = ports[index] ? ports[index].number : ctx.state.lastHdmi;
      var result = G.inputs.visiblePorts(ctx.store.get().inputs, ctx.state.sources);
      ports = result.ports;
      index = 0;
      ports.forEach(function (p, i) { if (p.number === prev) index = i; });

      D.clear(cardsEl);
      cards = ports.map(function (port) {
        var status = h('div', { className: 'input-card__status' + (port.status === 'connected' ? ' is-connected' : '') });
        if (STATUS_TEXT[port.status]) {
          status.appendChild(h('span', { className: 'input-card__dot' }));
          status.appendChild(doc.createTextNode(STATUS_TEXT[port.status]));
        }
        var card = h('div', { className: 'input-card', attrs: { 'data-number': String(port.number) } }, [
          D.icon('monitor'),
          h('div', { className: 'input-card__name', text: 'HDMI ' + port.number }),
          status
        ]);
        cardsEl.appendChild(card);
        return card;
      });

      if (result.fallback) noteEl.textContent = 'Nenhum dispositivo detectado — exibindo todas as entradas visíveis.';
      else if (!ctx.platform.features.tvWindow) noteEl.textContent = 'A exibição de HDMI não está disponível neste aparelho.';
      else noteEl.textContent = '';
      updateFocus();
    }

    function updateFocus() {
      index = G.focus.safeIndex(index, cards.length);
      cards.forEach(function (c, i) { c.classList.toggle('is-focused', i === index); });
    }

    return {
      name: 'inputs',
      el: el,
      open: function () {
        isOpen = true;
        render();
        el.classList.add('is-open');
        // Atualiza o estado das portas sem bloquear a abertura do menu.
        ctx.actions.refreshSources().then(function () { if (isOpen) render(); });
      },
      close: function () {
        isOpen = false;
        el.classList.remove('is-open');
      },
      // Ao voltar da visualização HDMI, o foco fica na entrada exibida por último.
      onReveal: function () {
        ports.forEach(function (p, i) { if (p.number === ctx.state.lastHdmi) index = i; });
        updateFocus();
      },
      onKey: function (action, info) {
        switch (action) {
          case 'left':
          case 'right':
            index = G.focus.step(index, action === 'left' ? -1 : 1, cards.length, false);
            updateFocus();
            return true;
          case 'ok':
            if (ports[index]) ctx.actions.openHdmi(ports[index].number);
            return true;
          case 'digit':
            if (info.digit >= 1 && info.digit <= 4) ctx.actions.openHdmi(info.digit);
            return true;
          case 'back':
            return false; // o roteador fecha o menu
          default:
            return true;
        }
      },
      setPending: function (number, on) {
        cards.forEach(function (c) {
          if (Number(c.getAttribute('data-number')) === number) c.classList.toggle('is-pending', on);
        });
      },
      debug: function () {
        return {
          index: index,
          focused: ports[index] ? ports[index].number : null,
          ports: ports.map(function (p) { return { number: p.number, status: p.status }; }),
          note: noteEl.textContent
        };
      }
    };
  };
})(window);
