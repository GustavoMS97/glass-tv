# Wallpapers

## Incluídos

Seis paisagens **originais**, geradas proceduralmente por `tools/wallpaper-generator/generator.html`
(sem fotos ou direitos de terceiros): Alvorada, Fiorde noturno, Floresta na neblina, Dunas douradas,
Aurora e Lago ao entardecer. Cada uma: JPEG 1920x1080 (~350 KB) + miniatura 480x270.

1920x1080 é a resolução em que a TV desenha apps web; imagens maiores só aumentariam memória e
tempo de carregamento sem ganho visível.

```sh
node tools/wallpapers.mjs generate          # regenera todas (Chrome headless + sips)
node tools/wallpapers.mjs generate aurora   # só uma
```

## Adicionar fotos suas

```sh
node tools/wallpapers.mjs add ~/Pictures/Paisagens   # JPG, PNG ou HEIC
node tools/wallpapers.mjs remove user-minha-foto     # remove uma adicionada
```

O script recorta ao centro em 16:9, redimensiona para 1920x1080, comprime (qualidade 84), descarta
os metadados da foto original (EXIF/GPS) e gera a miniatura. Usa apenas o `sips` do macOS.

**Suas fotos não vão para o repositório:**

| Arquivo | Conteúdo | Git |
|---|---|---|
| `app/wallpapers/manifest.js` | só as 6 paisagens incluídas | versionado |
| `app/wallpapers/manifest.user.js` | só as suas fotos (some quando não há nenhuma) | ignorado |
| `app/wallpapers/user/` (+ `user/thumbs/`) | imagens e miniaturas das suas fotos | ignorado |

O app carrega `manifest.user.js` se ele existir e funciona normalmente sem ele. As fotos entram no
pacote `.wgt` local — reempacote e reinstale para levá-las à TV (sem internet, sem servidor).

Dica: prefira fotos sem texto e com céu/área calma no topo esquerdo (relógio) e na base (dock).
