# Roteiro da defesa

Versão curta do [teste-2-pcs.md](teste-2-pcs.md), validado na 42 em 01/11 (PC com `slirp4netns`) e em 14/11 (c1r5p2 e c1r4p1, sem `slirp4netns`). Detalhes e plano B estão lá.

- **Host:** o PC que roda a stack (Docker rootless, portas 8080/8443). Tudo o que dá para automatizar está no [subir-host.sh](subir-host.sh); aqui ficam os passos em volta dele.
- **Clientes:** os outros PCs do cluster. Só rodam o [instalar-ca.sh](instalar-ca.sh) e abrem o Chrome; nada de Docker, nada de sudo.

## 0. Antes de ir (em casa)

- [ ] `.env` de casa com todas as chaves da `main`: `diff <(grep -o '^[A-Z0-9_]*=' .env.example | sort) <(grep -o '^[A-Z0-9_]*=' .env | sort)` sem saída.
- [ ] `FT_CLIENT_SECRET` válido na intra.
- [ ] Saber qual login vai servir. O `.env` vai para o **home** desse login, por mensagem direta; nunca para o sgoinfre, nem para pasta aberta a outros.

## 1. Host

No PC que vai servir, logado com o login do host:

```bash
# 1. código (o -b é a branch ou a tag da defesa)
mkdir -p ~/defesa && cd ~/defesa
git clone -b main https://github.com/robertodelfranco/ft_transcendence.git && cd ft_transcendence

# 2. tudo o resto: Docker, .env, certificado, stack, conferência e a CA no sgoinfre
ENV_CASA=~/caminho/do/.env bash docs/infra/subir-host.sh
```

O script mostra cada passo e grava o log em `~/subir-host.log`. No fim, ele imprime o site, o Grafana, a URL de callback e o comando dos clientes. **Se falhar**, a última linha `ERRO:` diz o que fazer. Corrija e rode de novo, porque o que já está certo fica como está. Se não souber o que fazer, mande o `~/subir-host.log` para o time.

### O que o script faz

| Passo | O quê |
|---|---|
| Docker | instala o rootless se faltar; imagens no goinfre; port driver `slirp4netns` ou, no PC sem o pacote, `builtin` sem `userland-proxy`. Só reinicia o Docker se essa config mudou |
| `.env` | mantém o `.env` do clone, se já existir; senão copia o `ENV_CASA` (ou gera com `GERAR_ENV=1`). Ajusta a borda (`PUBLIC_HOST`, portas) e confere as chaves sem mostrar valor |
| Certificado | `~/bin/mkcert` (v1.4.4); certificado para o hostname, o IP, `localhost` e `127.0.0.1`. Só gera de novo se faltar algum nome |
| Stack | `docker compose up --build --wait`; se o banco recusar a senha, explica o volume velho |
| Conferência | 8 serviços de pé, só o proxy com porta, `/api/health`, redirect HTTP→HTTPS, 3 alvos no Prometheus, IP de origem real no Nginx |
| Clientes | `rootCA.pem`, `instalar-ca.sh` e `SITE` em `/sgoinfre/$USER/defesa`. A chave da CA nunca sai do home |

### Parâmetros

Passe na linha de comando, antes do `bash`, ou edite o bloco do topo do script:

| Variável | Padrão | Quando mudar |
|---|---|---|
| `ENV_CASA` | vazio | o caminho do `.env` de casa, na primeira execução |
| `GERAR_ENV` | `0` | `1` quando não há `.env` de casa: segredos novos e **sem login pela 42** |
| `PUBLIC_NAME` | `hostname -f` | o nome que os clientes digitam, se não for o hostname |
| `HOST_IP` | 1º IP do `hostname -I` | se o PC tiver mais de uma rede e o primeiro IP não for o do cluster |
| `HTTP_PORT` / `HTTPS_PORT` | `8080` / `8443` | se essas portas estiverem ocupadas (o rootless não abre abaixo de 1024) |
| `EXTRA_NAMES` | vazio | outros nomes no certificado, separados por espaço |
| `SHARE` | `/sgoinfre/$USER/defesa` | onde os clientes pegam a CA |
| `WAIT_TIMEOUT` | `300` | se o build passar de 5 min |

Exemplo: `ENV_CASA=~/env-casa HTTPS_PORT=9443 bash docs/infra/subir-host.sh`.

### Depois do script (à mão)

1. **Intra** (app da 42): acrescente a URL de retorno que o script imprimiu, `https://<HOST>:8443/api/auth/oauth/42/callback`.
2. **Log ao vivo** num terminal separado: `cd ~/defesa/ft_transcendence && docker compose logs -f proxy`. Quando um cliente abrir o site, o IP dele aparece no começo da linha.
3. **Clientes:** passe a eles o login do host. Eles rodam o comando do §2.

## 2. Cliente (cada PC)

```bash
bash /sgoinfre/<login-do-host>/defesa/instalar-ca.sh
```

O script instala a CA do host no Chrome deste PC e confere se o site responde com ela. O log vai para `~/instalar-ca.log`. Depois:

1. Feche **todas** as janelas do Chrome e abra uma **janela anônima** (`Ctrl+Shift+N`; sem extensões sujando o console).
2. Abra `https://<HOST>:8443`. Use sempre o **hostname**: pelo IP, o Nginx redireciona para ele.
3. Um player por **janela** (nunca abas da mesma janela), cada um com a própria conta.

**Plano B, se o script falhar:** `cp /sgoinfre/<login-do-host>/defesa/rootCA.pem ~/rootCA.pem`. Depois, no Chrome: `chrome://settings/certificates` → **Certificados locais** → **Personalizado** → **Instalados por você** → **Certificados confiáveis** → **Importar** → `~/rootCA.pem`.

## 3. Durante a defesa

| O quê | Onde |
|---|---|
| Site | `https://<HOST>:8443` |
| Grafana | `https://<HOST>:8443/grafana/` (admin do `.env`) |
| Logs | `docker compose logs -f backend` |
| Partidas no banco | `docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select id, status from matches order by id desc limit 5"'` |
| Alerta `TargetDown` | `docker compose stop backend` → espera ~1 min → `docker compose start backend` (se der 502: `docker compose restart proxy`) |
| Banco do zero (apaga também avatares e métricas) | `docker compose down -v && docker compose up -d --wait` |

## 4. Depois

1. **Clientes primeiro**, enquanto a pasta do host ainda existe: `bash /sgoinfre/<login-do-host>/defesa/instalar-ca.sh --remover`. Se a pasta já sumiu, exclua "mkcert development CA" em `chrome://settings/certificates`.
2. **Host:** `cd ~/defesa/ft_transcendence && docker compose down -v && rm -rf ~/defesa /sgoinfre/$USER/defesa ~/subir-host.log`. O `.env` tem o secret da 42, o `JWT_SECRET` e a senha do Grafana: apague também a cópia que veio de casa.
