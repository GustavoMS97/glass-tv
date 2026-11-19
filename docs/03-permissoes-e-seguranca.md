# Permissões e segurança

## Privilégios do `config.xml`

Todos de nível **public** (instalam com certificado Samsung comum de distribuidor; sem conta de
parceiro).

| Privilégio | Para quê | Sem ele |
|---|---|---|
| `http://tizen.org/privilege/application.info` | Listar apps instalados (`getAppsInfo`) para localizar Netflix etc. pelo nome e oferecer "Adicionar ao dock" | Apps ficam "Indisponível" |
| `http://tizen.org/privilege/application.launch` | Abrir o app escolhido (`launch` / `launchAppControl`) | Dock não abre apps |
| `http://tizen.org/privilege/tv.window` | Exibir a entrada HDMI na janela de TV do app (`tvwindow`) | Menu Entradas mostra aviso |
| `http://tizen.org/privilege/tv.inputdevice` | Registrar as teclas 1–4 como atalho de HDMI | Atalhos 1–4 não funcionam (setas/OK/Voltar continuam) |

**Não solicitados:** `internet`, `<access origin>`, serviços em segundo plano, inicialização no
boot, privilégios de parceiro/plataforma. Um teste automatizado falha se algum deles aparecer.

## O que a Glass TV não faz

- Não acessa a internet nem a rede local; não há telemetria (teste automatizado verifica a
  ausência de `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` etc.).
- Não abre portas nem roda servidor HTTP na TV.
- Não usa IDs de apps internos, API REST local da TV, `sdb shell`, nem métodos não documentados.
- Não altera firmware, arquivos do sistema, botão Home, Smart Hub, energia ou protetor da TV.
- Não pede conta, login ou dados pessoais.

## Dados do aparelho e o repositório público

- **Configuração local:** IP da TV, porta, perfil de certificado e pasta dos certificados ficam em
  `.env` (ignorado). O modelo versionado [`.env.example`](../.env.example) só tem valores
  fictícios (o IP de exemplo `192.0.2.10` é reservado para documentação, RFC 5737).
  `tools/tizen.sh` lê apenas essas chaves, sem executar o arquivo.
- **Certificados:** sempre fora do repositório. `tools/tizen.sh` recusa empacotar se encontrar
  `*.p12`, `*.pfx` ou `profiles.xml` dentro dele, ou se `CERT_DIR` apontar para dentro dele.
- **Build:** cópia de trabalho em `build/` e pacote em `dist/` (ambos ignorados); nada de
  assinatura é gerado em `app/`.
- **Diagnóstico:** a tela Ajustes › Sobre mostra modelo, versão da plataforma, apps e fontes
  **apenas na tela**, nada é gravado em arquivo. Qualquer registro feito durante os testes na
  TV (resultados do roteiro, saída de `sdb`, IDs de apps, capturas) vai para `logs/` ou `dumps/`
  (ignorados).
- **Fotos pessoais:** `app/wallpapers/user/` e `app/wallpapers/manifest.user.js` (ignorados).
- **Testes:** usam apenas dados fictícios (IDs `fixture.*`/`preview.*`, fontes HDMI inventadas).
- **Verificação automática:** `tests/unit/privacy.test.mjs` varre todos os arquivos que o git
  versionaria e falha se encontrar IP, MAC, caminho com nome de usuário, e-mail, segredo ou DUID
  preenchido.

## Dados

Somente preferências de interface em `localStorage` do próprio app (chave
`glasstv.settings.v1`). Valores inválidos voltam ao padrão. Desinstalar o app apaga tudo
("All application data is deleted when the application is uninstalled").

## Reversibilidade

| Ação | Como desfazer |
|---|---|
| Instalar o app | Remover pela lista de apps da TV, ou `sh tools/tizen.sh uninstall` |
| Ativar o modo desenvolvedor | Apps › Configurações de apps › `12345` › Modo desenvolvedor: **Desligado** |
| Ativar *Autorun Last App* | Desligar a opção em Configurações › Geral › Recursos inteligentes |

A interface original da Samsung permanece intacta: Home, Source e Smart Hub continuam iguais.

## Dependências

| Onde | Dependência | Situação |
|---|---|---|
| App na TV | nenhuma biblioteca | — |
| Testes/ferramentas no Mac | Node ≥ 20.10, Google Chrome, `sips` (nativo do macOS), `git` (varredura de privacidade) | nenhum pacote npm |
| Empacotar/instalar | Tizen SDK via extensão oficial do VS Code (`tizen.vscode-tizen-csharp`) | instalado em `~/.tizen-extension-platform`; pacotes conferidos contra o SHA-256 oficial (a extensão baixa com `curl -k`) |

Durante o uso, o servidor local da extensão escuta só em `127.0.0.1` (com token); o servidor do
`sdb` escuta em todas as interfaces enquanto está ligado, por isso `tools/tizen.sh` o encerra
após cada ação na TV.

Fontes de fonte tipográfica: só as do sistema (na TV, a fonte Samsung; no Mac, SF). Nenhuma
fonte ou imagem externa é baixada.
