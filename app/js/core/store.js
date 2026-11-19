/*
 * Preferências do usuário, salvas localmente (localStorage).
 *
 * Sem conta, servidor ou banco remoto. Todo valor lido é validado contra os
 * padrões: dados corrompidos ou de versões antigas nunca quebram a interface,
 * apenas voltam ao padrão.
 */
(function (root) {
  'use strict';

  var G = root.GlassTV;
  var U = G.util;

  var STORAGE_KEY = 'glasstv.settings.v1';
  var MAX_DOCK_ITEMS = 12;

  var DEFAULTS = {
    version: 1,
    wallpaper: {
      id: 'alvorada',
      rotateMinutes: 0, // 0 = sem troca automática
      motion: false // movimento lento do fundo na tela inicial
    },
    home: {
      showClock: true,
      showDate: true,
      clock24h: true
    },
    dock: {
      // "Entradas" é fixo (pode mudar de posição, não pode ser removido).
      // "Ajustes" é sempre o último item e não é armazenado aqui.
      // Apps padrão são resolvidos pelo NOME no aparelho (sem IDs fixos).
      items: [
        { type: 'inputs' },
        { type: 'app', match: 'netflix' },
        { type: 'app', match: 'youtube' },
        { type: 'app', match: 'prime' },
        { type: 'app', match: 'disney' }
      ]
    },
    appearance: {
      motion: 'full', // full | reduced | off
      glass: 'full' // full (desfoque real) | lite (sem desfoque, mais leve)
    },
    screensaver: {
      enabled: true,
      delayMinutes: 5,
      intervalSeconds: 60,
      showClock: true
    },
    inputs: {
      visible: { 1: true, 2: true, 3: true, 4: true },
      hideDisconnected: false
    }
  };

  var CHOICES = {
    'wallpaper.rotateMinutes': [0, 5, 15, 30, 60],
    'appearance.motion': ['full', 'reduced', 'off'],
    'appearance.glass': ['full', 'lite'],
    'screensaver.delayMinutes': [1, 2, 5, 10, 15, 30],
    'screensaver.intervalSeconds': [30, 60, 120, 300]
  };

  /** Mescla `raw` sobre `defaults`, aceitando só valores do mesmo tipo. */
  function mergeTyped(defaults, raw) {
    var out = {};
    Object.keys(defaults).forEach(function (key) {
      var def = defaults[key];
      var val = raw ? raw[key] : undefined;
      if (U.isObject(def)) {
        out[key] = mergeTyped(def, U.isObject(val) ? val : {});
      } else if (Array.isArray(def)) {
        out[key] = Array.isArray(val) ? U.clone(val) : U.clone(def);
      } else {
        out[key] = typeof val === typeof def ? val : def;
      }
    });
    return out;
  }

  function sanitizeDock(items) {
    var known = G.apps ? G.apps.KNOWN : {};
    var seen = {};
    var out = [];
    var hasInputs = false;

    (Array.isArray(items) ? items : []).forEach(function (item) {
      if (!U.isObject(item)) return;
      if (item.type === 'inputs') {
        if (hasInputs) return;
        hasInputs = true;
        out.push({ type: 'inputs' });
        return;
      }
      if (item.type !== 'app') return;
      var entry;
      if (typeof item.appId === 'string' && item.appId) {
        entry = { type: 'app', appId: item.appId };
        if (typeof item.name === 'string' && item.name) entry.name = item.name.slice(0, 60);
        if (typeof item.match === 'string' && known[item.match]) entry.match = item.match;
      } else if (typeof item.match === 'string' && known[item.match]) {
        entry = { type: 'app', match: item.match };
      } else {
        return;
      }
      var id = entry.appId ? 'id:' + entry.appId : 'match:' + entry.match;
      if (seen[id]) return;
      seen[id] = true;
      out.push(entry);
    });

    if (!hasInputs) out.unshift({ type: 'inputs' });
    return out.slice(0, MAX_DOCK_ITEMS);
  }

  function sanitize(raw) {
    var s = mergeTyped(DEFAULTS, U.isObject(raw) ? raw : {});
    s.version = DEFAULTS.version;

    Object.keys(CHOICES).forEach(function (path) {
      if (CHOICES[path].indexOf(U.getPath(s, path)) === -1) {
        U.setPath(s, path, U.getPath(DEFAULTS, path));
      }
    });

    if (typeof s.wallpaper.id !== 'string' || !s.wallpaper.id) s.wallpaper.id = DEFAULTS.wallpaper.id;

    s.dock.items = sanitizeDock(s.dock.items);

    // Ao menos uma entrada HDMI precisa continuar visível.
    var anyVisible = [1, 2, 3, 4].some(function (n) { return s.inputs.visible[n] === true; });
    if (!anyVisible) s.inputs.visible = U.clone(DEFAULTS.inputs.visible);

    return s;
  }

  /**
   * @param {{getItem: Function, setItem: Function, removeItem?: Function} | null} storage
   * @param {string} [key]
   */
  function createStore(storage, key) {
    var storageKey = key || STORAGE_KEY;
    var listeners = [];
    var state = load();

    function load() {
      try {
        var raw = storage ? storage.getItem(storageKey) : null;
        return sanitize(raw ? JSON.parse(raw) : {});
      } catch (err) {
        return sanitize({});
      }
    }

    function save() {
      try {
        if (storage) storage.setItem(storageKey, JSON.stringify(state));
      } catch (err) {
        // Armazenamento cheio/indisponível: a sessão continua com o estado em memória.
      }
    }

    function commit(next, changed) {
      state = sanitize(next);
      save();
      listeners.slice().forEach(function (fn) {
        try { fn(state, changed); } catch (err) { if (root.console) root.console.error(err); }
      });
    }

    return {
      get: function () { return U.clone(state); },
      getPath: function (path) { return U.clone(U.getPath(state, path)); },
      set: function (path, value) {
        var next = U.clone(state);
        U.setPath(next, path, value);
        commit(next, path);
      },
      update: function (mutator) {
        var next = U.clone(state);
        mutator(next);
        commit(next, '*');
      },
      reset: function () { commit({}, '*'); },
      subscribe: function (fn) {
        listeners.push(fn);
        return function () {
          var i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        };
      }
    };
  }

  G.store = {
    STORAGE_KEY: STORAGE_KEY,
    MAX_DOCK_ITEMS: MAX_DOCK_ITEMS,
    DEFAULTS: DEFAULTS,
    CHOICES: CHOICES,
    sanitize: sanitize,
    createStore: createStore
  };
})(typeof window !== 'undefined' ? window : globalThis);
