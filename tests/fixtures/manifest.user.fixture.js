/* Fixture FICTÍCIO de manifest.user.js usado só pelos testes E2E da prévia
   (?usermanifest=fixture). Reaproveita imagens incluídas no projeto. */
(function (root) {
  'use strict';
  var G = root.GlassTV = root.GlassTV || {};
  G.userWallpapers = [
    {
      id: 'user-exemplo',
      name: 'Foto de exemplo',
      src: 'wallpapers/dunas.jpg',
      thumb: 'wallpapers/thumbs/dunas.jpg',
      origin: 'user'
    },
    // Entradas inválidas devem ser ignoradas pelo app:
    { id: 'user-sem-imagem', name: 'Sem src' },
    { id: 'alvorada', name: 'ID repetido', src: 'wallpapers/lago.jpg' },
    null
  ];
})(typeof window !== 'undefined' ? window : globalThis);
