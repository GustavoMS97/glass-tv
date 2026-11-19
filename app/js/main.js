/*
 * Glass TV — inicialização, roteamento de telas e ciclo de vida.
 *
 * Pilha de telas: home → (inputs → hdmi) | settings | appsim.
 * "Voltar" sempre desce um nível; na raiz não faz nada.
 * Ao retornar de outro app (visibilitychange), a interface volta à tela
 * inicial com o foco no último item usado.
 */
(function (root) {
  'use strict';

  var G = root.GlassTV;
  var doc = root.document;
  var html = doc.documentElement;

  function safeStorage() {
    try {
      var s = root.localStorage;
      s.setItem('glasstv.__probe', '1');
      s.removeItem('glasstv.__probe');
      return s;
    } catch (err) {
      return null;
    }
  }

  function supportsBackdrop() {
    var css = root.CSS;
    return !!(css && css.supports && (css.supports('backdrop-filter', 'blur(2px)') || css.supports('-webkit-backdrop-filter', 'blur(2px)')));
  }

  var store = G.store.createStore(safeStorage());
  var platform = G.platform.create();
  var params = new URLSearchParams(root.location.search);
  // Paisagens incluídas (manifest.js) + fotos pessoais opcionais (manifest.user.js,
  // carregado em loadUserWallpapers). O mesmo array é compartilhado pelas telas.
  var catalog = (G.wallpapers || []).slice();

  var state = {
    installedApps: null,
    appsStatus: 'loading',
    appsError: null,
    sources: null,
    lastHdmi: 1,
    lastLaunchedKey: null,
    supportsBackdrop: supportsBackdrop()
  };

  var toast = G.ui.createToasts(doc.getElementById('toasts'));
  var wallpaper = G.ui.createWallpaper(doc.getElementById('wallpaper'), catalog);
  var clock = G.ui.createClock(doc.getElementById('clock'));
  var screensaver = G.ui.createScreensaver(doc.getElementById('screensaver'), catalog);

  var ctx = { store: store, platform: platform, state: state, toast: toast, catalog: catalog, actions: {} };
  var views = {};
  var stack = [];

  // ------------------------------------------------------------ roteador
  function top() { return stack[stack.length - 1]; }

  var router = {
    push: function (name, p) {
      var view = views[name];
      if (!view || stack.indexOf(view) >= 0) return;
      var prev = top();
      if (prev && prev.onCover) prev.onCover();
      stack.push(view);
      view.open(p || {});
      updateIdlePolicy();
    },
    pop: function () {
      if (stack.length <= 1) return false;
      stack.pop().close();
      var t = top();
      if (t.onReveal) t.onReveal();
      updateIdlePolicy();
      return true;
    },
    resetHome: function () {
      while (stack.length > 1) router.pop();
    },
    names: function () { return stack.map(function (v) { return v.name; }); }
  };
  ctx.router = router;

  // ------------------------------------------------------------ protetor / inatividade
  var idleOverrideMs = platform.isPreview && params.get('idle') ? Number(params.get('idle')) * 1000 : 0;

  var idle = G.idle.createIdleTimer({
    timeoutMs: 5 * 60000,
    enabled: false,
    onIdle: function () { startScreensaver(); }
  });

  function updateIdlePolicy() {
    var s = store.get().screensaver;
    var t = top();
    idle.configure({
      enabled: s.enabled && !doc.hidden && !(t && t.blocksScreensaver),
      timeoutMs: idleOverrideMs || s.delayMinutes * 60000
    });
  }

  function startScreensaver() {
    var t = top();
    if (t && t.blocksScreensaver) return;
    screensaver.start(wallpaper.current());
  }

  // ------------------------------------------------------------ ações
  var launching = false;
  var hdmiPending = false;

  ctx.actions.refreshApps = function () {
    if (!platform.features.apps) {
      state.appsStatus = 'error';
      state.appsError = { name: 'NotSupportedError' };
      state.installedApps = null;
      onAppsChanged();
      return Promise.resolve();
    }
    if (state.installedApps === null) state.appsStatus = 'loading';
    return platform.getInstalledApps().then(function (list) {
      state.installedApps = list;
      state.appsStatus = 'ok';
      state.appsError = null;
    }, function (err) {
      state.installedApps = null;
      state.appsStatus = 'error';
      state.appsError = err;
    }).then(onAppsChanged);
  };

  function onAppsChanged() {
    views.home.render();
    views.settings.refresh();
  }

  ctx.actions.refreshSources = function () {
    if (!platform.features.videoSources) {
      state.sources = G.inputs.normalize(null);
      return Promise.resolve(state.sources);
    }
    return platform.getVideoSources().then(function (s) {
      state.sources = s;
      return s;
    }, function () {
      state.sources = G.inputs.normalize(null);
      return state.sources;
    });
  };

  ctx.actions.activate = function (entry) {
    if (entry.type === 'inputs') return router.push('inputs');
    if (entry.type === 'settings') return router.push('settings');

    if (entry.status === 'missing') {
      toast.show(entry.name + ' não foi encontrado nesta TV.', {
        detail: 'Instale pela loja de apps da Samsung ou remova o atalho em Ajustes › Dock.',
        kind: 'warn'
      });
      return;
    }
    if (!entry.appId) {
      toast.show('Não foi possível localizar ' + entry.name + '.', {
        detail: 'A lista de aplicativos desta TV não está disponível. Veja Ajustes › Sobre e diagnóstico.',
        kind: 'warn'
      });
      return;
    }
    if (launching) return;
    launching = true;
    state.lastLaunchedKey = entry.key;
    views.home.setPending(entry.key, true);
    platform.launchApp(entry.appId).catch(function (err) {
      toast.show('Não foi possível abrir ' + entry.name + '.', { detail: G.platform.describeError(err), kind: 'error' });
    }).then(function () {
      launching = false;
      views.home.setPending(entry.key, false);
    });
  };

  ctx.actions.openHdmi = function (number) {
    if (hdmiPending) return;
    if (!platform.features.tvWindow) {
      toast.show('Não é possível exibir HDMI ' + number + ' por aqui.', {
        detail: 'A API TV Window não está disponível neste aparelho. Use o botão Source do controle.',
        kind: 'error'
      });
      return;
    }
    hdmiPending = true;
    views.inputs.setPending(number, true);
    platform.showHdmi(number).then(function () {
      state.lastHdmi = number;
      if (top() === views.hdmi) views.hdmi.switchTo(number);
      else router.push('hdmi', { number: number });
    }, function (err) {
      toast.show('Não foi possível exibir HDMI ' + number + '.', { detail: G.platform.describeError(err), kind: 'error' });
    }).then(function () {
      hdmiPending = false;
      views.inputs.setPending(number, false);
    });
  };

  ctx.actions.startScreensaver = function () {
    // Pequeno atraso para a tecla OK que acionou não encerrar o protetor.
    root.setTimeout(function () { screensaver.start(wallpaper.current()); }, 350);
  };

  // App aberto (a TV coloca a Glass TV em segundo plano) …
  ctx.actions.handleHidden = function () {
    idle.pause();
    clock.pause();
    wallpaper.pause();
    screensaver.stop();
  };

  // … e retorno à Glass TV.
  ctx.actions.handleVisible = function () {
    router.resetHome();
    clock.resume();
    wallpaper.resume();
    idle.resume();
    updateIdlePolicy();
    if (state.lastLaunchedKey) views.home.focusKey(state.lastLaunchedKey);
    ctx.actions.refreshApps();
  };

  // ------------------------------------------------------------ preferências
  function applySettings(s, changed) {
    var all = !changed || changed === '*';
    var glass = state.supportsBackdrop ? s.appearance.glass : 'lite';
    html.setAttribute('data-motion', s.appearance.motion);
    html.setAttribute('data-glass', glass);
    clock.configure(s.home);
    if (all || changed === 'wallpaper.id') wallpaper.set(s.wallpaper.id);
    wallpaper.setMotion(s.wallpaper.motion && s.appearance.motion !== 'off');
    wallpaper.setRotation(s.wallpaper.rotateMinutes);
    screensaver.configure({
      intervalSeconds: s.screensaver.intervalSeconds,
      showClock: s.screensaver.showClock,
      clock24h: s.home.clock24h
    }, s.appearance.motion);
    if (all || changed.indexOf('dock') === 0) views.home.render();
    updateIdlePolicy();
  }

  // ------------------------------------------------------------ teclas
  function onKeyDown(event) {
    var key = G.keys.fromEvent(event, { preview: platform.isPreview });
    idle.poke();

    if (screensaver.isActive()) {
      // Qualquer tecla apenas encerra o protetor (não é repassada à tela).
      screensaver.stop();
      event.preventDefault();
      return;
    }
    if (!key) return;
    event.preventDefault();

    var view = top();
    if (!view) return;
    var handled = view.onKey(key.action, key);
    if (!handled && key.action === 'back') router.pop();
  }

  // ------------------------------------------------------------ prévia: escala da "tela"
  function fitStage() {
    var stage = doc.getElementById('stage');
    var scale = Math.min(root.innerWidth / 1920, root.innerHeight / 1080);
    if (!platform.isPreview || Math.abs(scale - 1) < 0.001) {
      stage.style.transform = '';
      return;
    }
    var x = (root.innerWidth - 1920 * scale) / 2;
    var y = (root.innerHeight - 1080 * scale) / 2;
    stage.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')';
  }

  // ------------------------------------------------------------ boot
  function boot() {
    views.home = G.ui.createHomeView(ctx);
    views.inputs = G.ui.createInputsView(ctx);
    views.hdmi = G.ui.createHdmiView(ctx);
    views.settings = G.ui.createSettingsView(ctx);
    views.appsim = G.ui.createAppSimView(ctx);

    if (platform.isPreview) {
      html.classList.add('is-preview');
      platform.on('preview-app', function (app) {
        router.push('appsim', { app: app });
        ctx.actions.handleHidden();
      });
      platform.on('preview-exit', function () {
        toast.show('Na TV, a Glass TV seria encerrada agora.', { kind: 'info' });
      });
      root.addEventListener('resize', fitStage);
      fitStage();
    }

    router.push('home');
    applySettings(store.get(), '*');
    store.subscribe(applySettings);
    clock.start();

    platform.registerKeys(G.keys.OPTIONAL_TV_KEYS);
    doc.addEventListener('keydown', onKeyDown, true);
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden) ctx.actions.handleHidden();
      else ctx.actions.handleVisible();
    });

    ctx.actions.refreshSources();
    ctx.actions.refreshApps().then(function () {
      G.debug.ready = true;
    });

    root.requestAnimationFrame(function () {
      doc.body.classList.remove('is-booting');
      views.home.relayout();
    });
    // Fontes podem carregar depois: reposiciona a legenda do dock.
    root.setTimeout(function () { views.home.relayout(); }, 400);
  }

  // Ganchos de inspeção para os testes automatizados (somente leitura + atalhos).
  G.debug = {
    ready: false,
    state: function () {
      return {
        views: router.names(),
        home: views.home.debug(),
        inputs: views.inputs.debug(),
        hdmi: views.hdmi.debug(),
        settings: views.settings.debug(),
        appsim: views.appsim.debug(),
        screensaver: screensaver.isActive(),
        wallpaper: wallpaper.current(),
        catalog: catalog.map(function (w) { return w.id; }),
        toasts: toast.debug(),
        appsStatus: state.appsStatus,
        prefs: store.get(),
        html: { motion: html.getAttribute('data-motion'), glass: html.getAttribute('data-glass'), tvWindow: html.classList.contains('tv-window-active') }
      };
    },
    triggerIdle: startScreensaver,
    store: store
  };

  // ------------------------------------------------------------ fotos pessoais (opcional)
  function userManifestSrc() {
    var mode = platform.isPreview ? params.get('usermanifest') : null;
    if (mode === 'none') return null; // prévia: só as paisagens incluídas
    if (mode === 'missing') return 'wallpapers/manifest.user.missing.js'; // prévia: simula arquivo ausente
    if (mode === 'fixture') return '../tests/fixtures/manifest.user.fixture.js'; // prévia: dados fictícios
    return 'wallpapers/manifest.user.js';
  }

  /** Carrega manifest.user.js se existir; ausente ou inválido, segue sem ele. */
  function loadUserWallpapers(done) {
    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      var ids = {};
      catalog.forEach(function (w) { ids[w.id] = true; });
      (Array.isArray(G.userWallpapers) ? G.userWallpapers : []).forEach(function (w) {
        if (!w || typeof w.id !== 'string' || typeof w.src !== 'string' || ids[w.id]) return;
        ids[w.id] = true;
        catalog.push({ id: w.id, name: String(w.name || w.id), src: w.src, thumb: w.thumb || w.src, origin: 'user' });
      });
      done();
    }
    var src = userManifestSrc();
    if (!src) return finish();
    var script = doc.createElement('script');
    script.onload = finish;
    script.onerror = finish;
    script.src = src;
    doc.head.appendChild(script);
    root.setTimeout(finish, 2000);
  }

  loadUserWallpapers(boot);
})(window);
