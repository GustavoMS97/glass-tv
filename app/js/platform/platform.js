/*
 * Camada de plataforma: isola TODAS as chamadas às APIs da TV.
 *
 * Na TV (Tizen) usa somente APIs públicas e documentadas pela Samsung:
 *   - tizen.application.getAppsInfo / launch / launchAppControl
 *       privilégios: application.info, application.launch (nível public)
 *   - tizen.systeminfo.getPropertyValue('VIDEOSOURCE')
 *   - tizen.tvwindow.setSource / show / hide
 *       privilégio: tv.window (nível public)
 *   - tizen.tvinputdevice.getSupportedKeys / registerKey
 *       privilégio: tv.inputdevice (nível public)
 *
 * NÃO usa: IDs de apps internos não documentados (ex.: visualizador de TV do
 * sistema), a API REST local da TV (porta 8001), comandos sdb/shell, nem
 * qualquer método privado para forçar a troca de entrada.
 *
 * Fora da TV, um adaptador de PRÉVIA simula a TV para desenvolvimento no Mac.
 * Parâmetros de URL da prévia (para testar incompatibilidades):
 *   ?apps=none        a lista de apps falha (como se a API não existisse)
 *   ?hdmi=none        TV Window indisponível
 *   ?sources=1,3      portas HDMI "conectadas" (padrão: 1,2)
 *   ?sources=unknown  detecção de fontes indisponível
 *   ?without=Disney%2B remove apps da lista simulada (simula app não instalado)
 */
(function (root) {
  'use strict';

  var G = root.GlassTV;

  function platformError(name, message) {
    var err = new Error(message || name);
    err.name = name;
    return err;
  }

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var timer = root.setTimeout(function () {
        if (done) return;
        done = true;
        reject(platformError('TimeoutError', label + ': a TV não respondeu em ' + ms + ' ms'));
      }, ms);
      promise.then(function (value) {
        if (done) return;
        done = true;
        root.clearTimeout(timer);
        resolve(value);
      }, function (err) {
        if (done) return;
        done = true;
        root.clearTimeout(timer);
        reject(err);
      });
    });
  }

  /** Chama uma API Tizen baseada em callbacks, capturando exceções síncronas. */
  function call(fn) {
    return new Promise(function (resolve, reject) {
      try {
        fn(resolve, reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  function mapApp(app) {
    return {
      id: app.id,
      name: app.name,
      iconPath: app.iconPath || null,
      show: app.show !== false,
      packageId: app.packageId || null,
      version: app.version || null
    };
  }

  var emitter = {
    handlers: {},
    on: function (event, fn) {
      (this.handlers[event] = this.handlers[event] || []).push(fn);
    },
    emit: function (event, data) {
      (this.handlers[event] || []).forEach(function (fn) { fn(data); });
    }
  };

  // ------------------------------------------------------------------ Tizen
  function createTizenPlatform(tz) {
    var lastVideoSource = null;
    var registeredKeys = [];
    var selfId = null;
    try { selfId = tz.application.getCurrentApplication().appInfo.id; } catch (e) { /* sem id */ }

    var features = {
      apps: !!(tz.application && typeof tz.application.getAppsInfo === 'function'),
      launch: !!(tz.application && typeof tz.application.launch === 'function'),
      videoSources: !!(tz.systeminfo && typeof tz.systeminfo.getPropertyValue === 'function'),
      tvWindow: !!(tz.tvwindow && typeof tz.tvwindow.setSource === 'function' && typeof tz.tvwindow.show === 'function'),
      inputDevice: !!(tz.tvinputdevice && typeof tz.tvinputdevice.registerKey === 'function')
    };

    function capability(key) {
      try { return tz.systeminfo.getCapability(key); } catch (e) { return null; }
    }

    var api = {
      mode: 'tizen',
      isPreview: false,
      selfId: selfId,
      features: features,

      getInstalledApps: function () {
        if (!features.apps) return Promise.reject(platformError('NotSupportedError', 'getAppsInfo indisponível'));
        return withTimeout(call(function (ok, fail) {
          tz.application.getAppsInfo(function (list) { ok(list.map(mapApp)); }, fail);
        }), 8000, 'getAppsInfo');
      },

      launchApp: function (appId) {
        if (!features.launch) return Promise.reject(platformError('NotSupportedError', 'launch indisponível'));
        return withTimeout(call(function (ok, fail) {
          tz.application.launch(appId, ok, fail);
        }), 8000, 'launch').catch(function (err) {
          // Alternativa documentada: AppControl com a operação padrão.
          if (!tz.ApplicationControl || typeof tz.application.launchAppControl !== 'function') throw err;
          return withTimeout(call(function (ok, fail) {
            var control = new tz.ApplicationControl('http://tizen.org/appcontrol/operation/default', null, null, null, null);
            tz.application.launchAppControl(control, appId, function () { ok(); }, fail, null);
          }), 8000, 'launchAppControl');
        });
      },

      getVideoSources: function () {
        if (!features.videoSources) return Promise.reject(platformError('NotSupportedError', 'systeminfo indisponível'));
        return withTimeout(call(function (ok, fail) {
          tz.systeminfo.getPropertyValue('VIDEOSOURCE', function (info) {
            lastVideoSource = info;
            ok(G.inputs.normalize(info));
          }, fail);
        }), 5000, 'VIDEOSOURCE');
      },

      /**
       * Exibe a entrada HDMI `number` em tela cheia DENTRO da Glass TV:
       * tvwindow.setSource() troca a fonte da janela de TV do aplicativo e
       * tvwindow.show() a exibe ocupando 100% da tela.
       */
      showHdmi: function (number) {
        if (!features.tvWindow) return Promise.reject(platformError('NotSupportedError', 'TV Window indisponível'));
        return api.getVideoSources().then(function () {
          var source = G.inputs.findSource(lastVideoSource, 'HDMI', number);
          if (!source) throw platformError('NotFoundError', 'HDMI ' + number + ' não existe neste aparelho');
          return withTimeout(call(function (ok, fail) {
            tz.tvwindow.setSource(source, function () { ok(); }, fail, 'MAIN');
          }), 6000, 'setSource');
        }).then(function () {
          return withTimeout(call(function (ok, fail) {
            tz.tvwindow.show(function () { ok(); }, fail, ['0px', '0px', '100%', '100%'], 'MAIN');
          }), 6000, 'show');
        });
      },

      hideHdmi: function () {
        if (!features.tvWindow) return Promise.resolve();
        return withTimeout(call(function (ok, fail) {
          tz.tvwindow.hide(function () { ok(); }, fail, 'MAIN');
        }), 4000, 'hide').catch(function () { /* já estava oculta */ });
      },

      registerKeys: function (names) {
        if (!features.inputDevice) return [];
        var supported = {};
        try {
          tz.tvinputdevice.getSupportedKeys().forEach(function (k) { supported[k.name] = true; });
        } catch (e) { return []; }
        names.forEach(function (name) {
          if (!supported[name]) return;
          try {
            tz.tvinputdevice.registerKey(name);
            registeredKeys.push(name);
          } catch (e) { /* tecla indisponível neste controle */ }
        });
        return registeredKeys.slice();
      },

      exit: function () {
        try { tz.application.getCurrentApplication().exit(); } catch (e) { /* ignora */ }
      },

      diagnostics: function () {
        return {
          modo: 'TV (Tizen)',
          appId: selfId,
          plataforma: capability('http://tizen.org/feature/platform.version'),
          modelo: capability('http://tizen.org/system/model_name'),
          teclasRegistradas: registeredKeys.slice()
        };
      },

      on: emitter.on.bind(emitter)
    };
    return api;
  }

  // ------------------------------------------------------------------ Prévia
  function createPreviewPlatform(search) {
    var params = new URLSearchParams(search || '');
    var appsMode = params.get('apps');
    var hdmiMode = params.get('hdmi');
    var sourcesParam = params.get('sources');

    // IDs propositalmente fictícios ("preview.*"): só existem na simulação.
    var APPS = [
      ['preview.netflix', 'Netflix'], ['preview.youtube', 'YouTube'], ['preview.primevideo', 'Prime Video'],
      ['preview.disneyplus', 'Disney+'], ['preview.globoplay', 'Globoplay'], ['preview.max', 'Max'],
      ['preview.spotify', 'Spotify'], ['preview.appletv', 'Apple TV'], ['preview.tvplus', 'Samsung TV Plus'],
      ['preview.browser', 'Internet'], ['preview.youtubekids', 'YouTube Kids'], ['preview.system', 'Serviço do sistema']
    ].map(function (a) { return { id: a[0], name: a[1], iconPath: null, show: a[0] !== 'preview.system' }; });
    var without = (params.get('without') || '').split(',').filter(Boolean);
    APPS = APPS.filter(function (a) { return without.indexOf(a.name) === -1; });

    var connected = (sourcesParam && sourcesParam !== 'unknown' ? sourcesParam : '1,2')
      .split(',').map(Number).filter(function (n) { return n >= 1 && n <= 4; });
    var registered = [];

    function delay(ms, value) {
      return new Promise(function (resolve) { root.setTimeout(function () { resolve(value); }, ms); });
    }

    var api = {
      mode: 'preview',
      isPreview: true,
      selfId: 'preview.glasstv',
      features: {
        apps: appsMode !== 'none',
        launch: true,
        videoSources: sourcesParam !== 'unknown',
        tvWindow: hdmiMode !== 'none',
        inputDevice: true
      },

      getInstalledApps: function () {
        if (appsMode === 'none') return delay(120).then(function () { throw platformError('NotSupportedError', 'getAppsInfo indisponível (simulado)'); });
        return delay(120, APPS.map(function (a) { return Object.assign({}, a); }));
      },

      launchApp: function (appId) {
        var app = APPS.filter(function (a) { return a.id === appId; })[0];
        if (!app) return delay(80).then(function () { throw platformError('NotFoundError', 'App não encontrado: ' + appId); });
        return delay(150).then(function () { emitter.emit('preview-app', app); });
      },

      getVideoSources: function () {
        if (sourcesParam === 'unknown') return delay(60).then(function () { throw platformError('NotSupportedError', 'VIDEOSOURCE indisponível (simulado)'); });
        var info = { connected: [{ type: 'TV', number: 1 }], disconnected: [] };
        [1, 2, 3, 4].forEach(function (n) {
          (connected.indexOf(n) >= 0 ? info.connected : info.disconnected).push({ type: 'HDMI', number: n });
        });
        return delay(60, G.inputs.normalize(info));
      },

      showHdmi: function () {
        if (hdmiMode === 'none') return delay(150).then(function () { throw platformError('NotSupportedError', 'TV Window indisponível (simulado)'); });
        return delay(220);
      },

      hideHdmi: function () { return delay(40); },

      registerKeys: function (names) { registered = names.slice(); return registered; },

      exit: function () { emitter.emit('preview-exit'); },

      diagnostics: function () {
        return {
          modo: 'Prévia no navegador (simulação)',
          appId: 'preview.glasstv',
          plataforma: null,
          modelo: null,
          teclasRegistradas: registered.slice()
        };
      },

      on: emitter.on.bind(emitter)
    };
    return api;
  }

  /** Mensagem amigável para um erro de plataforma. */
  function describeError(err) {
    var name = err && err.name;
    switch (name) {
      case 'SecurityError': return 'Permissão negada pela TV.';
      case 'NotSupportedError': return 'Recurso não suportado neste aparelho.';
      case 'NotFoundError': return 'Não encontrado neste aparelho.';
      case 'TimeoutError': return 'A TV não respondeu a tempo.';
      case 'InvalidValuesError': return 'Valor rejeitado pela TV.';
      default: return (err && err.message) || 'Erro desconhecido.';
    }
  }

  G.platform = {
    create: function () {
      var tz = root.tizen;
      return tz ? createTizenPlatform(tz) : createPreviewPlatform(root.location ? root.location.search : '');
    },
    createPreviewPlatform: createPreviewPlatform,
    createTizenPlatform: createTizenPlatform,
    describeError: describeError
  };
})(typeof window !== 'undefined' ? window : globalThis);
