# Instalação na TV (Etapas 3 e 4)

> **Nada desta página foi executado ainda.** Cada passo que instala software no Mac ou toca na TV
> depende da sua aprovação explícita. O script `tools/tizen.sh` pede confirmação antes de qualquer
> comando que acesse a TV.

## 0. Pré-requisitos no Mac (aprovação necessária)

1. **Tizen Studio** — baixar somente do site oficial (developer.tizen.org / developer.samsung.com).
2. No *Package Manager* do Tizen Studio:
   - **TV Extensions** compatível com 2023 (a tabela de grupos indica "TV Extension 7.0 or higher");
   - **Samsung Certificate Extension**.
3. Conta gratuita no Samsung Developers (necessária para gerar o certificado).

## 1. Modo desenvolvedor na TV (procedimento oficial)

1. Na TV, abra o **Smart Hub** › painel **Apps** › role até **Configurações de apps**.
2. Digite **12345** com o controle (ou o teclado numérico na tela).
3. Ligue **Developer mode**, informe o **IP do Mac** e confirme.
4. **Reinicie a TV.** Depois, "Develop Mode" aparece no topo do painel Apps.

IP do Mac: *Ajustes do Sistema › Wi‑Fi/Rede › Detalhes*. A TV e o Mac precisam estar na mesma rede.

## 2. Certificado Samsung (autor + distribuidor)

1. Obtenha o **DUID** da TV ("Menu › Support › Contact Samsung › Unique Device ID", segundo a
   documentação; o Device Manager também exibe o DUID após conectar).
2. Tizen Studio › **Tools › Certificate Manager** › *Cancel* na migração › **+** › **Samsung** › **TV**.
3. Crie o certificado de **autor** (faça backup — "Keep your certificates backed up in a safe location").
4. Crie o certificado de **distribuidor** com nível de privilégio **Public** e o DUID da TV.
5. Guarde os arquivos do certificado **fora do repositório** (ex.: `$HOME/SamsungCertificate/<perfil>`)
   e faça backup deles. O nome do perfil e essa pasta vão no `.env` (`CERT_PROFILE`, `CERT_DIR`).

## 3. Configurar e empacotar (não toca na TV)

```sh
cp .env.example .env          # preencha TV_IP, CERT_PROFILE e CERT_DIR (o .env é ignorado pelo git)
sh tools/tizen.sh check       # CLI, certificado fora do repo e privilégios
sh tools/tizen.sh package     # cópia em build/ → dist/GlassTV.wgt assinado
```

## 4. Conectar e instalar (toca na TV — cada comando pede confirmação)

```sh
sh tools/tizen.sh connect     # sdb connect <IP>:26101
sh tools/tizen.sh install     # tizen install …
sh tools/tizen.sh run         # abre a Glass TV
```

Pela interface gráfica: **Tools › Device Manager** › *Remote Device Manager* › **+** (nome, IP,
porta 26101) › *Connection: On*; depois clique com o botão direito no dispositivo ›
**Permit to install applications** (necessário com certificado Samsung).

Erro **1010 (App install fail)**: quase sempre certificado — confira o DUID e o perfil.

## 5. Testar

Copie o roteiro para a pasta ignorada `logs/` e anote lá (resultados podem conter IDs de apps e
outros dados do aparelho, que não devem ir para o repositório):

```sh
mkdir -p logs && cp docs/06-roteiro-de-testes-na-tv.md logs/roteiro-tv.md
```
Ajustes › **Sobre e diagnóstico** mostra o que a TV expôs (APIs, apps detectados com IDs, fontes).

## 6. Abrir automaticamente ao ligar (opcional, na TV)

1. Fixe a Glass TV na faixa de apps da tela inicial.
2. *Configurações › Geral › Recursos inteligentes* › **Executar automaticamente o último app**: ligado.
3. Se existir a opção de iniciar com a tela inicial do Smart Hub, desligue-a.
4. Desligue a TV estando na Glass TV.

Funciona apenas se a TV aceitar esse comportamento para apps em modo desenvolvedor — **a
verificar**. Para desfazer, desligue a opção.

## 7. Atualizar

Gere um novo pacote e instale de novo — "The previous version of the application will uninstall
automatically when you install the new version". A preservação das preferências na atualização
será verificada no aparelho.

## 8. Desinstalar e reverter

- Pela TV: painel **Apps** › Glass TV › **Excluir** (forma oficial), ou `sh tools/tizen.sh uninstall`.
- Desligar o modo desenvolvedor: Apps › Configurações de apps › `12345` › **Off** › reiniciar.
- Desligar *Autorun Last App*, se tiver ativado.

Observação: grandes atualizações de sistema da Samsung podem remover apps instalados em modo
desenvolvedor; nesse caso, basta reinstalar.
