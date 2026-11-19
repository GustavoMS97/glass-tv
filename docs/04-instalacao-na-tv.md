# Instalação, atualização e remoção na TV

Caminho usado e validado em 19/11/2026 (Mac Apple Silicon → TV Samsung 2023 em modo desenvolvedor).
Cada passo que toca na TV pede confirmação no `tools/tizen.sh`.

## 0. Ferramentas no Mac (uma vez)

O **Tizen Studio está sendo descontinuado** pela Samsung; o substituto oficial é o **Tizen SDK**
via extensão do VS Code.

1. No VS Code, instale a extensão **Tizen Extension** (`tizen.vscode-tizen-csharp`, publicada pela
   Tizen). Recomendado: em Configurações, defina `tizen.v2.analytics.log` como **Disable** (a
   extensão vem com o envio de logs de uso ligado).
2. Abra esta pasta no VS Code. A extensão ativa sozinha (o projeto tem `config.xml`), baixa o
   servidor dela e o SDK (~1,5 GB em `~/.tizen-extension-platform`, perfis **web** e **tv-web**,
   incluindo `sdb`, Java embutido e as extensões de TV Samsung).
   - Se o download travar (o servidor da Tizen oscila muito), recarregue a janela:
     `Cmd+Shift+P` › **Developer: Reload Window**.
3. `Cmd+Shift+P` › **Tizen: Install Tizen CLI** (instala a linha de comando `tizen`, usada pelo
   script para assinar e instalar).

> **Segurança:** o gerenciador de pacotes da extensão baixa com `curl -k` (sem verificar o
> certificado HTTPS). Na instalação de 19/11/2026, todos os 33 pacotes foram rebaixados com HTTPS
> verificado e conferidos contra o SHA-256 das listas oficiais: 9.907 arquivos idênticos, nenhum
> divergente.

> **Efeitos colaterais conhecidos:** a instalação acrescenta um bloco de `export PATH` ao
> `~/.zshrc` (não é necessário para o `tools/tizen.sh`; pode ser removido) e cria
> `~/.tizen`, `~/.sdb` e `~/.tizen.path.config`.

## 1. Modo desenvolvedor na TV

1. Botão Home › **Apps** › na tela de Apps, digite **12345** (no controle sem números, use o botão
   **123** para o teclado na tela).
2. **Developer mode: On** › em **Host PC IP**, o IP do Mac › OK.
3. **Reinicie a TV.** "Develop Mode" aparece no topo da tela de Apps.

IP do Mac: *Ajustes do Sistema › Wi‑Fi › Detalhes*. Se o IP do Mac mudar, atualize-o no modo
desenvolvedor da TV.

## 2. Certificado Samsung (uma vez; vale 2 anos)

1. Conecte a TV para o DUID ser preenchido sozinho: `sh tools/tizen.sh connect` (deixa a conexão
   aberta; ao terminar o certificado, rode `sh tools/tizen.sh disconnect`).
2. No VS Code: `Cmd+Shift+P` › **Tizen: Create Certificate** (abre dentro do VS Code) ›
   **Samsung** › **Samsung TV Profile**.
3. Nome do perfil (ex.: `glasstv`), autor (nome e senha — guarde a senha), login na conta Samsung
   pelo navegador, distribuidor **Public** com o DUID da TV.
4. Os arquivos ficam em `~/SamsungCertificate/<perfil>/`, **fora do repositório**. Faça backup.

> **Atenção:** o *Certificate Manager* avulso (janela separada) cria certificados **Tizen**
> genéricos ("Tizen Developers CA" / "Tizen Studio Public Signer"), que a TV Samsung não aceita.
> O certificado correto mostra o autor emitido por **"Samsung VD Author CA"**.

## 3. Configurar e empacotar (não toca na TV)

```sh
cp .env.example .env          # TV_IP, CERT_PROFILE e CERT_DIR (o .env é ignorado pelo git)
sh tools/tizen.sh check       # SDK, CLI, certificado fora do repo e privilégios
sh tools/tizen.sh package     # cópia filtrada em build/ → dist/GlassTV.wgt assinado
```

## 4. Instalar e abrir (toca na TV — cada comando pede confirmação)

```sh
sh tools/tizen.sh install     # instala dist/GlassTV.wgt
sh tools/tizen.sh run         # abre a Glass TV
```

Esses comandos conectam, executam e **encerram o servidor do `sdb`** ao terminar — enquanto roda,
ele escuta em todas as interfaces de rede (portas 26097/26099).

Erro **1010 (App install fail)**: quase sempre certificado — confira se é Samsung e se o DUID é o
da TV.

## 5. Testar

Copie o roteiro para a pasta ignorada `logs/` e anote lá (resultados podem conter IDs de apps):

```sh
mkdir -p logs && cp docs/06-roteiro-de-testes-na-tv.md logs/roteiro-tv.md
```

Ajustes › **Sobre e diagnóstico** mostra o que a TV expôs (APIs, apps detectados com IDs, fontes).

## 6. Abrir automaticamente ao ligar (opcional, na TV)

1. Fixe a Glass TV na faixa de apps da tela inicial.
2. *Configurações › Geral › Recursos inteligentes* › **Executar automaticamente o último app**: ligado.
3. Se existir a opção de iniciar com a tela inicial do Smart Hub, desligue-a.
4. Desligue a TV estando na Glass TV.

Depende de a TV aceitar o comportamento para apps em modo desenvolvedor. Para desfazer, desligue
a opção.

## 7. Atualizar o app

Depois de mudar o código (e testar na prévia com `npm run test:all`):

```sh
sh tools/tizen.sh package && sh tools/tizen.sh install
```

A nova versão substitui a anterior ("The previous version of the application will uninstall
automatically when you install the new version"). Requisitos: modo desenvolvedor ligado, IP do
Mac igual ao configurado na TV e certificado válido (renove antes de expirar e reinstale). O
VS Code não precisa estar aberto.

## 8. Desinstalar e reverter

- App: painel **Apps** da TV › Glass TV › **Excluir**, ou `sh tools/tizen.sh uninstall`.
- Modo desenvolvedor: Apps › `12345` › **Off** › reiniciar a TV.
- *Autorun Last App*: desligar a opção, se tiver ativado.
- Mac: desinstalar a extensão no VS Code e apagar `~/.tizen-extension-platform`, `~/.tizen`,
  `~/.sdb`, `~/.tizen.path.config` e o bloco Tizen do `~/.zshrc`. Guarde `~/SamsungCertificate`
  se quiser reinstalar no futuro.

Grandes atualizações de sistema da Samsung podem remover apps instalados em modo desenvolvedor;
nesse caso, basta reinstalar.
