/*
 * Ajustes.
 *
 * Duas zonas de foco: a lista de seções (esquerda) e o conteúdo (direita).
 * Regras de navegação, iguais em todas as seções:
 *   ▲ ▼      move entre linhas (dentro da grade, entre miniaturas)
 *   ◀ ▶      altera valores das linhas com ‹ › ; nas demais, ◀ volta às seções
 *   OK       ativa / alterna
 *   Voltar   do conteúdo → seções; das seções → fecha os Ajustes
 * Linhas informativas não recebem foco.
 */
(function (root) {
  'use strict';

  var G = root.GlassTV;
  var D = G.dom;
  var h = D.h;
  var doc = root.document;

  var SECTIONS = [
    { id: 'wallpaper', title: 'Fundo de tela', icon: 'image', desc: 'Escolha a paisagem da tela inicial. As imagens ficam armazenadas no próprio app, sem internet.' },
    { id: 'dock', title: 'Dock', icon: 'dock', desc: 'Escolha e organize os atalhos. Os apps são localizados pelo nome, na lista fornecida pela própria TV.' },
    { id: 'home', title: 'Tela inicial', icon: 'clock', desc: 'Informações exibidas sobre o wallpaper.' },
    { id: 'appearance', title: 'Animações e vidro', icon: 'sparkle', desc: 'Ajuste a fluidez e o custo visual da interface.' },
    { id: 'screensaver', title: 'Protetor de tela', icon: 'moon', desc: 'Modo de descanso com wallpapers em transição lenta.' },
    { id: 'inputs', title: 'Entradas HDMI', icon: 'inputs', desc: 'Escolha quais entradas aparecem no menu Entradas.' },
    { id: 'about', title: 'Sobre e diagnóstico', icon: 'info', desc: 'Versão, recursos detectados nesta TV e ferramentas.' }
  ];

  var LABELS = {
    'wallpaper.rotateMinutes': { 0: 'Desligada', 5: 'A cada 5 min', 15: 'A cada 15 min', 30: 'A cada 30 min', 60: 'A cada hora' },
    'appearance.motion': { full: 'Completas', reduced: 'Reduzidas', off: 'Desligadas' },
    'appearance.glass': { full: 'Desfoque real', lite: 'Leve (mais rápido)' },
    'screensaver.delayMinutes': { 1: '1 min', 2: '2 min', 5: '5 min', 10: '10 min', 15: '15 min', 30: '30 min' },
    'screensaver.intervalSeconds': { 30: '30 s', 60: '1 min', 120: '2 min', 300: '5 min' }
  };

  function isFocusable(row) {
    return row.kind !== 'header' && row.kind !== 'info';
  }

  function offsetWithin(el, container) {
    var top = 0;
    var node = el;
    while (node && node !== container) {
      top += node.offsetTop;
      node = node.offsetParent;
    }
    return top;
  }

  G.ui.createSettingsView = function (ctx) {
    var el = doc.getElementById('settings');
    var store = ctx.store;
    var st = { zone: 'nav', section: 0, row: 0, sub: 0, moving: -1, confirmReset: false, showApps: false };
    var rows = [];
    var focusables = [];
    var rowEls = [];
    var navEls = [];
    var isOpen = false;
    var scrollTarget = 0; // valor-alvo (a rolagem suave atualiza scrollTop aos poucos)

    // ------------------------------------------------------------ esqueleto
    var titleEl = h('h2', { className: 'settings__title' });
    var descEl = h('p', { className: 'settings__desc' });
    var rowsEl = h('div', { className: 'settings__rows' });
    var navList = h('ul', { className: 'settings__sections' });
    SECTIONS.forEach(function (s) {
      var li = h('li', { className: 'nav-item' }, [D.icon(s.icon), h('span', { text: s.title })]);
      navEls.push(li);
      navList.appendChild(li);
    });
    el.appendChild(h('div', { className: 'scrim' }));
    el.appendChild(h('div', { className: 'settings__panel' }, [
      h('aside', { className: 'settings__nav' }, [
        h('h1', { className: 'settings__heading', text: 'Ajustes' }),
        navList,
        h('footer', { className: 'hints' }, [
          h('span', null, [h('span', { className: 'key', text: '▲ ▼' }), 'Navegar']),
          h('span', null, [h('span', { className: 'key', text: 'OK' }), 'Selecionar']),
          h('span', null, [h('span', { className: 'key', text: 'Voltar' }), 'Retornar'])
        ])
      ]),
      h('div', { className: 'settings__content' }, [titleEl, descEl, rowsEl])
    ]));

    // ------------------------------------------------------------ fábricas de linhas
    function get(path) { return store.getPath(path); }

    function choice(key, label, path, detail) {
      return {
        kind: 'choice', key: key, label: label, detail: detail, value: get(path),
        options: G.store.CHOICES[path].map(function (v) { return { value: v, label: LABELS[path][v] }; }),
        onChange: function (v) { store.set(path, v); }
      };
    }

    function toggle(key, label, path, detail, guard) {
      return {
        kind: 'toggle', key: key, label: label, detail: detail, value: !!get(path),
        onChange: function (v) {
          if (guard && guard(v) === false) return;
          store.set(path, v);
        }
      };
    }

    function info(label, value) { return { kind: 'info', label: label, value: value }; }
    function header(label) { return { kind: 'header', label: label }; }
    function action(key, label, onRun, opts) {
      var o = opts || {};
      return { kind: 'action', key: key, label: label, detail: o.detail, danger: !!o.danger, onRun: onRun };
    }

    // ------------------------------------------------------------ seções
    function wallpaperRows() {
      var current = get('wallpaper.id');
      return [
        {
          kind: 'grid', key: 'walls', columns: 3,
          items: ctx.catalog.map(function (w) {
            return { id: w.id, name: w.name, thumb: w.thumb, selected: w.id === current };
          }),
          onSelect: function (item) { store.set('wallpaper.id', item.id); }
        },
        choice('rotate', 'Troca automática', 'wallpaper.rotateMinutes'),
        toggle('wall-motion', 'Movimento lento do fundo', 'wallpaper.motion',
          'Aproximação sutil e contínua. Com o vidro em desfoque real, exige mais da TV.'),
        info('Fotos próprias: adicione pelo Mac com tools/wallpapers.mjs add e reinstale o app.')
      ];
    }

    function dockDetail(r) {
      if (r.type === 'inputs') return { text: 'Fixo — pode mudar de posição' };
      if (r.status === 'ok') return { text: 'Encontrado nesta TV' };
      if (r.status === 'missing') return { text: 'Não encontrado nesta TV', warn: true };
      return { text: 'Não foi possível verificar nesta TV', warn: true };
    }

    function dockRows() {
      var items = get('dock.items');
      var installed = ctx.state.installedApps;
      var out = [header('No dock')];
      items.forEach(function (item, i) {
        var r = G.apps.resolveItem(item, installed);
        var detail = st.moving === i ? { text: 'Use ▲ ▼ para mover · OK para concluir' } : dockDetail(r);
        out.push({
          kind: 'buttons', key: 'dock-' + i, label: r.name, detail: detail.text, warn: detail.warn,
          moving: st.moving === i,
          buttons: r.type === 'inputs'
            ? [{ id: 'move', label: 'Mover' }]
            : [{ id: 'move', label: 'Mover' }, { id: 'remove', label: 'Remover' }],
          onButton: function (btn) {
            if (btn.id === 'move') {
              st.moving = i;
              renderContent();
            } else if (btn.id === 'remove') {
              store.update(function (s) { s.dock.items.splice(i, 1); });
              ctx.toast.show(r.name + ' removido do dock.', { kind: 'ok' });
            }
          }
        });
      });
      out.push(info('“Ajustes” fica sempre no fim do dock.'));
      out.push(header('Adicionar ao dock'));

      if (ctx.state.appsStatus === 'loading') {
        out.push(info('Procurando aplicativos instalados…'));
      } else if (ctx.state.appsStatus === 'error') {
        out.push(info('Não foi possível listar os aplicativos desta TV.', G.platform.describeError(ctx.state.appsError)));
        out.push(action('retry-apps', 'Tentar novamente', function () { ctx.actions.refreshApps(); }));
      } else {
        var addable = G.apps.addable(items, installed, ctx.platform.selfId);
        if (!addable.length) out.push(info('Todos os aplicativos detectados já estão no dock.'));
        addable.forEach(function (app) {
          out.push(action('add-' + app.id, '＋  ' + app.name, function () {
            if (get('dock.items').length >= G.store.MAX_DOCK_ITEMS) {
              ctx.toast.show('O dock está cheio.', { detail: 'Remova um atalho antes de adicionar outro.', kind: 'warn' });
              return;
            }
            store.update(function (s) { s.dock.items.push({ type: 'app', appId: app.id, name: app.name }); });
            ctx.toast.show(app.name + ' adicionado ao dock.', { kind: 'ok' });
          }));
        });
      }
      return out;
    }

    function homeRows() {
      return [
        toggle('show-clock', 'Mostrar relógio', 'home.showClock'),
        toggle('show-date', 'Mostrar data', 'home.showDate'),
        toggle('clock-24h', 'Formato 24 horas', 'home.clock24h')
      ];
    }

    function appearanceRows() {
      return [
        choice('motion', 'Animações', 'appearance.motion', 'Reduzidas ou desligadas deixam a navegação mais imediata.'),
        choice('glass', 'Vidro fosco', 'appearance.glass', ctx.state.supportsBackdrop
          ? 'O modo Leve dispensa o desfoque e exige menos da TV.'
          : 'Este navegador não suporta desfoque; o modo Leve é usado automaticamente.')
      ];
    }

    function screensaverRows() {
      return [
        toggle('ss-on', 'Protetor de tela', 'screensaver.enabled'),
        choice('ss-delay', 'Iniciar após', 'screensaver.delayMinutes', 'Tempo sem usar o controle remoto.'),
        choice('ss-interval', 'Trocar imagem a cada', 'screensaver.intervalSeconds'),
        toggle('ss-clock', 'Mostrar relógio', 'screensaver.showClock'),
        action('ss-preview', 'Visualizar agora', function () { ctx.actions.startScreensaver(); }),
        info('Qualquer botão encerra o protetor. A Glass TV não altera energia nem o protetor da própria TV.')
      ];
    }

    function inputsRows() {
      var sources = ctx.state.sources;
      var out = [];
      var STATUS = { connected: 'Dispositivo conectado', disconnected: 'Sem dispositivo', absent: 'Não existe neste aparelho', unknown: 'Detecção indisponível' };
      G.inputs.PORTS.forEach(function (n) {
        out.push(toggle('hdmi-' + n, 'Mostrar HDMI ' + n, 'inputs.visible.' + n,
          STATUS[G.inputs.portStatus(sources, n)],
          function (v) {
            if (v) return true;
            var vis = get('inputs.visible');
            var others = G.inputs.PORTS.filter(function (p) { return p !== n && vis[p] !== false; });
            if (!others.length) {
              ctx.toast.show('Mantenha ao menos uma entrada visível.', { kind: 'warn' });
              return false;
            }
            return true;
          }));
      });
      out.push(toggle('hide-disc', 'Ocultar entradas sem dispositivo', 'inputs.hideDisconnected',
        sources && sources.known ? 'Usa a detecção de conexão informada pela TV.' : 'A detecção de conexão não está disponível neste aparelho.'));
      return out;
    }

    function aboutRows() {
      var p = ctx.platform;
      var diag = p.diagnostics();
      var f = p.features;
      var ua = root.navigator.userAgent;
      var chrome = /Chrome\/(\d+)/.exec(ua);
      var apps = ctx.state.installedApps;
      var appsText = !f.apps ? 'Indisponível'
        : ctx.state.appsStatus === 'ok' ? 'Disponível · ' + apps.length + ' apps'
          : ctx.state.appsStatus === 'error' ? 'Falhou · ' + G.platform.describeError(ctx.state.appsError)
            : 'Verificando…';
      var src = ctx.state.sources;
      var srcText = !f.videoSources ? 'Indisponível' : src && src.known
        ? 'Disponível · conectadas: ' + (src.connected.filter(function (s) { return s.type === 'HDMI'; })
          .map(function (s) { return 'HDMI ' + s.number; }).join(', ') || 'nenhuma')
        : 'Sem resposta';
      var out = [
        info('Versão', G.version),
        info('Modo', diag.modo),
        info('Motor web', chrome ? 'Chromium ' + chrome[1] : '—'),
        info('Plataforma Tizen', diag.plataforma || '—'),
        info('Modelo', diag.modelo || '—'),
        header('Recursos da TV'),
        info('Lista de aplicativos', appsText),
        info('Abrir aplicativos', f.launch ? 'API presente' : 'Indisponível'),
        info('Fontes de vídeo', srcText),
        info('Janela de TV (exibir HDMI)', f.tvWindow ? (p.isPreview ? 'Simulada' : 'API presente') : 'Indisponível'),
        info('Teclas 1–4 do controle', diag.teclasRegistradas.length ? 'Registradas' : 'Não registradas'),
        header('Ferramentas')
      ];
      if (Array.isArray(apps)) {
        out.push(action('apps-list', st.showApps ? 'Ocultar aplicativos detectados' : 'Mostrar aplicativos detectados (' + apps.length + ')', function () {
          st.showApps = !st.showApps;
          renderContent();
        }));
        if (st.showApps) {
          apps.slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'pt-BR'); })
            .forEach(function (a) {
              out.push({ kind: 'item', key: 'app-' + a.id, label: a.name + (a.show === false ? ' (oculto)' : ''), detail: a.id, mono: true });
            });
        }
      }
      out.push(action('reset', st.confirmReset ? 'Pressione OK novamente para confirmar' : 'Restaurar configurações padrão', function () {
        if (!st.confirmReset) {
          st.confirmReset = true;
          renderContent();
          return;
        }
        st.confirmReset = false;
        store.reset();
        ctx.toast.show('Configurações restauradas.', { kind: 'ok' });
      }, { danger: true, detail: 'Wallpaper, dock, protetor e entradas voltam ao padrão.' }));
      if (!p.isPreview) {
        out.push(action('exit', 'Fechar a Glass TV', function () { p.exit(); },
          { detail: 'Encerra o app. Para voltar, abra-o novamente pela lista de apps da TV.' }));
      }
      return out;
    }

    var BUILDERS = {
      wallpaper: wallpaperRows, dock: dockRows, home: homeRows, appearance: appearanceRows,
      screensaver: screensaverRows, inputs: inputsRows, about: aboutRows
    };

    // ------------------------------------------------------------ renderização
    function buildRow(row) {
      var main = h('div', { className: 'row__main' }, [
        h('div', { className: 'row__label', text: row.label }),
        row.detail ? h('div', { className: 'row__detail' + (row.warn ? ' is-warn' : ''), text: row.detail }) : null
      ]);
      switch (row.kind) {
        case 'header':
          return h('div', { className: 'row row--header', text: row.label });
        case 'info':
          return h('div', { className: 'row row--info' }, [
            h('div', { className: 'row__main', text: row.label }),
            row.value ? h('div', { className: 'row__value', text: row.value }) : null
          ]);
        case 'toggle':
          return h('div', { className: 'row' }, [main, h('div', { className: 'row__value' }, [
            h('div', { className: 'switch' + (row.value ? ' is-on' : '') })
          ])]);
        case 'choice': {
          var current = row.options.filter(function (o) { return o.value === row.value; })[0];
          return h('div', { className: 'row' }, [main, h('div', { className: 'row__value' }, [
            h('span', { className: 'chev', text: '‹' }),
            h('span', { text: current ? current.label : '' }),
            h('span', { className: 'chev', text: '›' })
          ])]);
        }
        case 'action':
          return h('div', { className: 'row' + (row.danger ? ' row--danger' : '') }, [main]);
        case 'item':
          return h('div', { className: 'row' + (row.mono ? ' row--mono' : '') }, [main]);
        case 'buttons':
          return h('div', { className: 'row' + (row.moving ? ' is-moving' : '') }, [main,
            h('div', { className: 'row__buttons' }, row.buttons.map(function (b) {
              return h('div', { className: 'btn', text: b.label });
            }))
          ]);
        case 'grid': {
          var grid = h('div', { className: 'wall-grid' });
          row.items.forEach(function (item) {
            grid.appendChild(h('div', {
              className: 'wall' + (item.selected ? ' is-selected' : ''),
              style: { 'background-image': D.cssUrl(item.thumb) }
            }, [
              h('div', { className: 'wall__name', text: item.name }),
              h('div', { className: 'wall__check', html: D.ICONS.check })
            ]));
          });
          return h('div', { className: 'row row--grid' }, [grid]);
        }
        default:
          return h('div', { className: 'row' }, [main]);
      }
    }

    function currentRow() { return rows[focusables[st.row]]; }

    function renderNav() {
      navEls.forEach(function (n, i) {
        n.classList.toggle('is-active', i === st.section);
        n.classList.toggle('is-focused', st.zone === 'nav' && i === st.section);
      });
    }

    function renderContent(opts) {
      var o = opts || {};
      var section = SECTIONS[st.section];
      var keepKey = !o.reset && currentRow() ? currentRow().key : null;
      rows = BUILDERS[section.id]();
      focusables = [];
      rows.forEach(function (r, i) { if (isFocusable(r)) focusables.push(i); });
      if (o.reset) {
        st.row = 0;
        st.sub = 0;
      } else if (keepKey) {
        for (var k = 0; k < focusables.length; k++) {
          if (rows[focusables[k]].key === keepKey) st.row = k;
        }
      }
      st.row = Math.max(0, G.focus.safeIndex(st.row, focusables.length));

      titleEl.textContent = section.title;
      descEl.textContent = section.desc;
      D.clear(rowsEl);
      rowEls = rows.map(function (r) {
        var e = buildRow(r);
        rowsEl.appendChild(e);
        return e;
      });
      if (o.reset) {
        scrollTarget = 0;
        rowsEl.scrollTop = 0;
        rowsEl.classList.remove('has-above');
        rowsEl.classList.toggle('has-below', rowsEl.scrollHeight > rowsEl.clientHeight + 2);
      }
      updateFocus();
    }

    function scrollToShow(target) {
      var top = offsetWithin(target, rowsEl);
      var bottom = top + target.offsetHeight;
      var pad = 56;
      var max = Math.max(0, rowsEl.scrollHeight - rowsEl.clientHeight);
      var next = scrollTarget;
      if (top - pad < next) next = top - pad;
      else if (bottom + pad > next + rowsEl.clientHeight) next = bottom + pad - rowsEl.clientHeight;
      next = G.util.clamp(next, 0, max);
      scrollTarget = next;
      rowsEl.scrollTop = next;
      // Esmaece as bordas quando há conteúdo fora da área visível.
      rowsEl.classList.toggle('has-above', next > 2);
      rowsEl.classList.toggle('has-below', next < max - 2);
    }

    function updateFocus() {
      renderNav();
      Array.prototype.forEach.call(rowsEl.querySelectorAll('.is-focused'), function (n) { n.classList.remove('is-focused'); });
      if (st.zone !== 'content' || !focusables.length) return;
      var ri = focusables[st.row];
      var row = rows[ri];
      var rowEl = rowEls[ri];
      rowEl.classList.add('is-focused');
      var target = rowEl;
      if (row.kind === 'grid' || row.kind === 'buttons') {
        var subs = rowEl.querySelectorAll(row.kind === 'grid' ? '.wall' : '.btn');
        st.sub = G.focus.safeIndex(st.sub, subs.length);
        if (subs[st.sub]) {
          subs[st.sub].classList.add('is-focused');
          if (row.kind === 'grid') target = subs[st.sub];
        }
      }
      scrollToShow(target);
    }

    function toNav() {
      st.zone = 'nav';
      st.confirmReset = false;
      updateFocus();
    }

    function cycle(row, delta, wrap) {
      var n = row.options.length;
      var i = 0;
      row.options.forEach(function (o, k) { if (o.value === row.value) i = k; });
      var next = wrap ? (i + delta + n) % n : G.util.clamp(i + delta, 0, n - 1);
      if (next !== i) row.onChange(row.options[next].value);
    }

    function moveDock(delta) {
      var items = get('dock.items');
      var from = st.moving;
      var to = G.util.clamp(from + delta, 0, items.length - 1);
      if (to === from) return;
      st.moving = to;
      // A linha em foco acompanha o item movido.
      store.update(function (s) { s.dock.items = G.focus.move(s.dock.items, from, to); });
      for (var k = 0; k < focusables.length; k++) {
        if (rows[focusables[k]].key === 'dock-' + to) st.row = k;
      }
      updateFocus();
    }

    function onContentKey(action) {
      var row = currentRow();
      if (!row) { toNav(); return true; }

      if (st.moving >= 0) {
        if (action === 'up' || action === 'down') moveDock(action === 'up' ? -1 : 1);
        else if (action === 'ok' || action === 'back') { st.moving = -1; renderContent(); }
        return true;
      }

      if (st.confirmReset && action !== 'ok') {
        st.confirmReset = false;
        renderContent();
        row = currentRow();
      }

      var g;
      switch (action) {
        case 'up':
        case 'down':
          if (row.kind === 'grid') {
            g = G.focus.grid(st.sub, action, row.items.length, row.columns);
            if (!g.edge) { st.sub = g.index; updateFocus(); return true; }
          }
          var next = G.focus.step(st.row, action === 'up' ? -1 : 1, focusables.length, false);
          if (next !== st.row) {
            var entering = rows[focusables[next]];
            st.row = next;
            st.sub = entering.kind === 'grid' && action === 'up'
              ? Math.floor((entering.items.length - 1) / entering.columns) * entering.columns
              : 0;
          }
          updateFocus();
          return true;
        case 'left':
          if (row.kind === 'grid') {
            g = G.focus.grid(st.sub, 'left', row.items.length, row.columns);
            if (!g.edge) { st.sub = g.index; updateFocus(); return true; }
          } else if (row.kind === 'choice') {
            cycle(row, -1, false);
            return true;
          } else if (row.kind === 'buttons' && st.sub > 0) {
            st.sub--;
            updateFocus();
            return true;
          }
          toNav();
          return true;
        case 'right':
          if (row.kind === 'grid') {
            g = G.focus.grid(st.sub, 'right', row.items.length, row.columns);
            if (!g.edge) { st.sub = g.index; updateFocus(); }
          } else if (row.kind === 'choice') {
            cycle(row, 1, false);
          } else if (row.kind === 'buttons' && st.sub < row.buttons.length - 1) {
            st.sub++;
            updateFocus();
          }
          return true;
        case 'ok':
          if (row.kind === 'grid') row.onSelect(row.items[st.sub]);
          else if (row.kind === 'choice') cycle(row, 1, true);
          else if (row.kind === 'toggle') row.onChange(!row.value);
          else if (row.kind === 'action') row.onRun();
          else if (row.kind === 'buttons') row.onButton(row.buttons[st.sub]);
          return true;
        case 'back':
          toNav();
          return true;
        default:
          return true;
      }
    }

    function onNavKey(action) {
      switch (action) {
        case 'up':
        case 'down': {
          var next = G.focus.step(st.section, action === 'up' ? -1 : 1, SECTIONS.length, false);
          if (next !== st.section) {
            st.section = next;
            st.moving = -1;
            st.showApps = false;
            st.confirmReset = false;
            renderContent({ reset: true });
          }
          return true;
        }
        case 'right':
        case 'ok':
          if (focusables.length) {
            st.zone = 'content';
            updateFocus();
          }
          return true;
        case 'back':
          return false; // o roteador fecha os Ajustes
        default:
          return true;
      }
    }

    // Qualquer mudança nas preferências redesenha a seção mantendo o foco.
    store.subscribe(function () { if (isOpen) renderContent(); });

    return {
      name: 'settings',
      el: el,
      open: function (params) {
        isOpen = true;
        st.zone = 'nav';
        st.section = 0;
        if (params && params.section) {
          SECTIONS.forEach(function (s, i) { if (s.id === params.section) st.section = i; });
        }
        st.moving = -1;
        st.confirmReset = false;
        st.showApps = false;
        renderContent({ reset: true });
        el.classList.add('is-open');
        ctx.actions.refreshApps();
        ctx.actions.refreshSources().then(function () { if (isOpen) renderContent(); });
      },
      close: function () {
        isOpen = false;
        st.moving = -1;
        el.classList.remove('is-open');
      },
      refresh: function () { if (isOpen) renderContent(); },
      onKey: function (action) {
        return st.zone === 'nav' ? onNavKey(action) : onContentKey(action);
      },
      debug: function () {
        var row = currentRow();
        return {
          zone: st.zone,
          section: SECTIONS[st.section].id,
          row: row ? row.key : null,
          rowKind: row ? row.kind : null,
          sub: st.sub,
          moving: st.moving,
          rows: rows.filter(isFocusable).map(function (r) { return r.key; })
        };
      }
    };
  };
})(window);
