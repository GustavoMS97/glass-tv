/* Tela inicial: dock horizontal com foco por setas. */
(function (root) {
  'use strict';

  var G = root.GlassTV;
  var D = G.dom;
  var h = D.h;
  var doc = root.document;

  var DOCK_MAX_WIDTH = 1696; // 1920 − margens seguras
  var DOCK_PADDING = 28;
  var TILE_W = 200;
  var TILE_RATIO = 0.6;

  G.ui.createHomeView = function (ctx) {
    var el = doc.getElementById('home');
    var dockEl = doc.getElementById('dock');
    var captionEl = doc.getElementById('dock-caption').querySelector('.dock-caption__inner');
    var captionName = captionEl.querySelector('.dock-caption__name');
    var captionStatus = captionEl.querySelector('.dock-caption__status');
    var entries = [];
    var tiles = [];
    var index = 0;

    function statusText(entry) {
      if (entry.status === 'missing') return 'Não encontrado nesta TV';
      if (entry.type === 'app' && !entry.appId) return 'Indisponível';
      return '';
    }

    function buildTile(entry) {
      var tile;
      if (entry.type === 'inputs' || entry.type === 'settings') {
        tile = h('div', { className: 'tile tile--system' }, [
          h('div', { className: 'tile__body' }, [
            D.icon(entry.type === 'inputs' ? 'inputs' : 'sliders'),
            h('div', { className: 'tile__caption', text: entry.name })
          ])
        ]);
      } else {
        var len = entry.name.length;
        tile = h('div', {
          className: 'tile tile--app',
          style: { '--c1': entry.colors[0], '--c2': entry.colors[1] }
        }, [
          h('div', { className: 'tile__label' + (len > 15 ? ' is-xlong' : len > 10 ? ' is-long' : ''), text: entry.name })
        ]);
        if (entry.iconPath) {
          // Ícone fornecido pela própria TV (quando acessível). Falhou? Fica o rótulo.
          var img = h('img', { className: 'tile__img', attrs: { alt: '' } });
          img.onerror = function () {
            if (img.parentNode) img.parentNode.removeChild(img);
            updateFocus();
          };
          img.src = /^(file|https?|data):/.test(entry.iconPath) ? entry.iconPath : 'file://' + entry.iconPath;
          tile.appendChild(img);
        }
        if (entry.status === 'missing') {
          tile.classList.add('is-missing');
          tile.appendChild(h('div', { className: 'tile__badge', text: '!' }));
        }
      }
      tile.setAttribute('data-key', entry.key);
      return tile;
    }

    function layoutSize(count) {
      var gap = 24;
      var available = DOCK_MAX_WIDTH - DOCK_PADDING * 2 - gap * (count - 1) - 28; // 28 = divisória
      var w = Math.min(TILE_W, Math.floor(available / count));
      dockEl.style.setProperty('--tile-w', w + 'px');
      dockEl.style.setProperty('--tile-h', Math.round(w * TILE_RATIO) + 'px');
    }

    function updateFocus() {
      index = G.focus.safeIndex(index, tiles.length);
      tiles.forEach(function (t, i) { t.classList.toggle('is-focused', i === index); });
      var entry = entries[index];
      if (!entry) return;
      var tile = tiles[index];
      // Os tiles já mostram o nome; a legenda aparece só quando acrescenta
      // informação (status) ou quando o tile exibe o ícone da TV em vez do nome.
      var status = statusText(entry);
      var show = !!status || !!tile.querySelector('.tile__img');
      captionName.textContent = show ? entry.name : '';
      captionStatus.textContent = show ? status : '';
      captionEl.classList.toggle('is-empty', !show);
      // offsetLeft ignora o transform de escala da prévia: posições lógicas.
      var center = dockEl.offsetLeft + tile.offsetLeft + tile.offsetWidth / 2;
      if (dockEl.offsetWidth) captionEl.style.left = center + 'px';
    }

    function render() {
      var prevKey = entries[index] ? entries[index].key : null;
      var settings = ctx.store.get();
      entries = G.apps.resolveDock(settings.dock.items, ctx.state.installedApps);
      D.clear(dockEl);
      tiles = [];
      layoutSize(entries.length);
      entries.forEach(function (entry) {
        if (entry.type === 'settings') dockEl.appendChild(h('div', { className: 'dock__divider' }));
        var tile = buildTile(entry);
        tiles.push(tile);
        dockEl.appendChild(tile);
      });
      if (prevKey) {
        for (var i = 0; i < entries.length; i++) if (entries[i].key === prevKey) index = i;
      }
      updateFocus();
    }

    function move(delta) {
      var next = G.focus.step(index, delta, tiles.length, false);
      if (next !== index) {
        index = next;
        updateFocus();
      }
    }

    return {
      name: 'home',
      el: el,
      open: function () { render(); },
      close: function () {},
      onCover: function () { el.classList.add('is-covered'); },
      onReveal: function () { el.classList.remove('is-covered'); updateFocus(); },
      onKey: function (action, info) {
        switch (action) {
          case 'left': move(-1); return true;
          case 'right': move(1); return true;
          case 'ok': if (entries[index]) ctx.actions.activate(entries[index]); return true;
          case 'digit':
            if (info.digit >= 1 && info.digit <= 4) ctx.actions.openHdmi(info.digit);
            return true;
          case 'back':
            return true; // Na raiz, Voltar não fecha a Glass TV.
          default:
            return true;
        }
      },
      render: render,
      relayout: updateFocus,
      focusKey: function (key) {
        for (var i = 0; i < entries.length; i++) if (entries[i].key === key) index = i;
        updateFocus();
      },
      setPending: function (key, on) {
        tiles.forEach(function (t) { if (t.getAttribute('data-key') === key) t.classList.toggle('is-pending', on); });
      },
      debug: function () {
        return {
          index: index,
          focused: entries[index] ? entries[index].key : null,
          caption: captionName.textContent + (captionStatus.textContent ? ' · ' + captionStatus.textContent : ''),
          items: entries.map(function (e) { return { key: e.key, name: e.name, status: e.status, appId: e.appId || null }; })
        };
      }
    };
  };
})(window);
