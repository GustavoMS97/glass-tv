/*
 * Formatação de hora e data em português (sem depender de Intl/ICU,
 * cujo conjunto de locales embarcado na TV não é garantido).
 */
(function (root) {
  'use strict';

  var G = root.GlassTV;

  var DAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  var MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** { main: '21:07', suffix: '' } ou, em 12 h, { main: '9:07', suffix: 'PM' } */
  function formatTime(date, use24h) {
    var h = date.getHours();
    var m = pad(date.getMinutes());
    if (use24h) return { main: pad(h) + ':' + m, suffix: '' };
    var suffix = h < 12 ? 'AM' : 'PM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return { main: h12 + ':' + m, suffix: suffix };
  }

  /** 'Quarta-feira, 18 de novembro' */
  function formatDate(date) {
    var day = DAYS[date.getDay()];
    return day.charAt(0).toUpperCase() + day.slice(1) + ', ' + date.getDate() + ' de ' + MONTHS[date.getMonth()];
  }

  /** Milissegundos até a virada do próximo minuto. */
  function msToNextMinute(date) {
    return 60000 - (date.getSeconds() * 1000 + date.getMilliseconds());
  }

  G.time = { formatTime: formatTime, formatDate: formatDate, msToNextMinute: msToNextMinute };
})(typeof window !== 'undefined' ? window : globalThis);
