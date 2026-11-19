/*
 * Catálogo e resolução dos aplicativos do dock.
 *
 * IMPORTANTE: este arquivo NÃO contém IDs de aplicativos. A Samsung não
 * documenta publicamente os IDs de Netflix, YouTube etc., e eles variam entre
 * modelos/anos. Os apps padrão são localizados pelo NOME na lista que a própria
 * TV devolve em tizen.application.getAppsInfo(); o ID usado no lançamento é o
 * que o aparelho informou. Se o app não for encontrado, o item aparece como
 * indisponível em vez de tentar um ID inventado.
 */
(function (root) {
  'use strict';

  var G = root.GlassTV;
  var U = G.util;

  var KNOWN = {
    netflix: {
      name: 'Netflix',
      strict: [/^netflix$/],
      loose: [/netflix/],
      colors: ['#3a0a0d', '#b8121b']
    },
    youtube: {
      name: 'YouTube',
      strict: [/^youtube$/],
      loose: [/^youtube(?!.*\b(kids|music|tv)\b)/],
      colors: ['#3b0a0a', '#d4262b']
    },
    prime: {
      name: 'Prime Video',
      strict: [/^(amazon )?prime video$/],
      loose: [/prime ?video/],
      colors: ['#06203a', '#1673c4']
    },
    disney: {
      name: 'Disney+',
      strict: [/^disney ?(\+|plus)$/],
      loose: [/^disney/],
      colors: ['#06123a', '#2a4fd1']
    }
  };

  var PALETTE = [
    ['#1d2b45', '#3f6db3'],
    ['#2b1d45', '#7a4fc0'],
    ['#123a33', '#2f9b84'],
    ['#3a2a12', '#c08a2f'],
    ['#3a1230', '#b83f8f'],
    ['#14323f', '#3593b8'],
    ['#2f2f36', '#6b6f7d']
  ];

  /** Apps que fazem sentido no dock: visíveis no menu e diferentes do próprio Glass TV. */
  function launchable(installed, selfId) {
    if (!Array.isArray(installed)) return [];
    return installed
      .filter(function (app) {
        return app && typeof app.id === 'string' && app.id &&
          app.show !== false && app.id !== selfId;
      })
      .slice()
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'pt-BR'); });
  }

  /** Procura um app conhecido por nome (primeiro exato, depois aproximado). */
  function findKnown(key, installed) {
    var def = KNOWN[key];
    if (!def || !Array.isArray(installed)) return null;
    var tiers = [def.strict, def.loose];
    for (var t = 0; t < tiers.length; t++) {
      for (var i = 0; i < installed.length; i++) {
        var name = U.normalizeName(installed[i].name);
        for (var p = 0; p < tiers[t].length; p++) {
          if (tiers[t][p].test(name)) return installed[i];
        }
      }
    }
    return null;
  }

  /** App adicionado por ID cujo nome é de um app conhecido (herda as cores). */
  function knownByName(name) {
    if (!name) return null;
    var keys = Object.keys(KNOWN);
    for (var i = 0; i < keys.length; i++) {
      if (findKnown(keys[i], [{ name: name }])) {
        var strict = KNOWN[keys[i]].strict.some(function (re) { return re.test(U.normalizeName(name)); });
        if (strict) return KNOWN[keys[i]];
      }
    }
    return null;
  }

  function paletteFor(key) {
    return PALETTE[U.hash(key) % PALETTE.length];
  }

  function monogram(name) {
    var words = String(name || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/);
    if (!words[0]) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  /**
   * Resolve um item salvo do dock contra a lista de apps instalados.
   * @param {object} item  { type: 'inputs' } | { type: 'app', match?, appId?, name? }
   * @param {Array|null} installed  lista da TV, ou null se a lista estiver indisponível
   * @returns {{type, key, name, appId, status, iconPath, colors, monogram}}
   *   status: 'ok' | 'missing' (não instalado) | 'unknown' (não foi possível verificar)
   */
  function resolveItem(item, installed) {
    if (item.type === 'inputs') {
      return { type: 'inputs', key: 'inputs', name: 'Entradas', status: 'ok' };
    }
    if (item.type === 'settings') {
      return { type: 'settings', key: 'settings', name: 'Ajustes', status: 'ok' };
    }

    var known = item.match ? KNOWN[item.match] : knownByName(item.name);
    var name = item.name || (known && known.name) || item.appId || 'App';
    var key = item.appId ? 'id:' + item.appId : 'match:' + item.match;
    var out = {
      type: 'app',
      key: key,
      name: name,
      appId: item.appId || null,
      status: 'unknown',
      iconPath: null,
      colors: known ? known.colors : paletteFor(key),
      monogram: monogram(name)
    };

    if (!Array.isArray(installed)) return out;

    var found = null;
    if (item.appId) {
      for (var i = 0; i < installed.length; i++) {
        if (installed[i].id === item.appId) { found = installed[i]; break; }
      }
    } else if (item.match) {
      found = findKnown(item.match, installed);
    }

    if (found) {
      out.status = 'ok';
      out.appId = found.id;
      out.iconPath = found.iconPath || null;
      if (!item.name && !known && found.name) out.name = found.name;
    } else {
      out.status = 'missing';
    }
    return out;
  }

  /** Itens do dock prontos para exibir: salvos + "Ajustes" fixo ao final. */
  function resolveDock(items, installed) {
    var list = (items || []).map(function (item) { return resolveItem(item, installed); });
    list.push(resolveItem({ type: 'settings' }));
    return list;
  }

  /** Apps instalados que ainda não estão no dock (para a tela de ajustes). */
  function addable(items, installed, selfId) {
    var list = launchable(installed, selfId);
    var used = {};
    (items || []).forEach(function (item) {
      var r = resolveItem(item, installed);
      if (r.appId) used[r.appId] = true;
    });
    return list.filter(function (app) { return !used[app.id]; });
  }

  G.apps = {
    KNOWN: KNOWN,
    launchable: launchable,
    findKnown: findKnown,
    resolveItem: resolveItem,
    resolveDock: resolveDock,
    addable: addable,
    monogram: monogram
  };
})(typeof window !== 'undefined' ? window : globalThis);
