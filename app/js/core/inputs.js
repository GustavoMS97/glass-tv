/*
 * Entradas HDMI.
 *
 * A lista de fontes vem de tizen.systeminfo.getPropertyValue('VIDEOSOURCE'),
 * que devolve { connected: [...], disconnected: [...] } com objetos
 * SystemInfoVideoSourceInfo { type: 'HDMI' | 'TV' | ..., number }.
 * O objeto original precisa ser passado intacto para tizen.tvwindow.setSource().
 */
(function (root) {
  'use strict';

  var G = root.GlassTV;

  var PORTS = [1, 2, 3, 4];

  /** Converte a resposta do VIDEOSOURCE em dados simples (ou "desconhecido"). */
  function normalize(info) {
    if (!info || (!Array.isArray(info.connected) && !Array.isArray(info.disconnected))) {
      return { known: false, connected: [], disconnected: [] };
    }
    function simple(list) {
      return (Array.isArray(list) ? list : [])
        .filter(function (s) { return s && typeof s.type === 'string'; })
        .map(function (s) { return { type: s.type, number: Number(s.number) }; });
    }
    return { known: true, connected: simple(info.connected), disconnected: simple(info.disconnected) };
  }

  /** Localiza o objeto ORIGINAL da fonte (para setSource). Conectadas primeiro. */
  function findSource(info, type, number) {
    if (!info) return null;
    var lists = [info.connected, info.disconnected];
    for (var l = 0; l < lists.length; l++) {
      var list = Array.isArray(lists[l]) ? lists[l] : [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].type === type && Number(list[i].number) === number) return list[i];
      }
    }
    return null;
  }

  /** 'connected' | 'disconnected' | 'absent' | 'unknown' */
  function portStatus(sources, number) {
    if (!sources || !sources.known) return 'unknown';
    function has(list) {
      return list.some(function (s) { return s.type === 'HDMI' && s.number === number; });
    }
    if (has(sources.connected)) return 'connected';
    if (has(sources.disconnected)) return 'disconnected';
    return 'absent';
  }

  /**
   * Entradas a exibir no menu, conforme as preferências.
   * Se "ocultar desconectadas" esvaziar a lista, mostra as visíveis mesmo assim
   * (fallback: true) para o menu nunca ficar sem item focável.
   */
  function visiblePorts(prefs, sources) {
    var visible = (prefs && prefs.visible) || {};
    var base = PORTS.filter(function (n) { return visible[n] !== false; }).map(function (n) {
      return { number: n, status: portStatus(sources, n) };
    });
    if (!base.length) {
      base = PORTS.map(function (n) { return { number: n, status: portStatus(sources, n) }; });
    }
    if (prefs && prefs.hideDisconnected && sources && sources.known) {
      var connected = base.filter(function (p) { return p.status === 'connected'; });
      if (connected.length) return { ports: connected, fallback: false };
      return { ports: base, fallback: true };
    }
    return { ports: base, fallback: false };
  }

  G.inputs = {
    PORTS: PORTS,
    normalize: normalize,
    findSource: findSource,
    portStatus: portStatus,
    visiblePorts: visiblePorts
  };
})(typeof window !== 'undefined' ? window : globalThis);
