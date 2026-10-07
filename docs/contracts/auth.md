# Contrato: autenticação, envelope de erro e schema de usuários (`auth.md`)

**Estado:** rascunho de 07/10/2026. **Escreve:** Augusto. **Assina:** Caio (monta login, cadastro e o cliente HTTP só com este arquivo) e Akita (escreve a migração `0001_initial` e o diagrama do schema a partir da §2.9, e implementa o login pelo Google e pela 42 em F6.8 com a §2.8).

## 1. Para que serve

O backend diz quem é o User a cada requisição e a cada socket. Este arquivo define como alguém vira User (e-mail e senha, Google ou 42), como a sessão sobrevive a recarregar a página (access em memória, refresh em cookie), o formato de todo erro que o backend devolve e as tabelas de usuários.

As outras Slices não reimplementam nada disto: usam `CurrentUser`, `RateLimit`, `authenticate_ws_token` e `issue_tokens` (§2.7), e todo erro delas sai no envelope da §2.5.

## 2. Formas

### 2.1 Convenções

- **Prefixo.** Toda rota começa em `/api`, e o backend enxerga o caminho inteiro: o Nginx não reescreve ([infra.md](infra.md) §2.3, item 2).
- **Corpo.** JSON em UTF-8, nas duas direções.
- **Tempo.** ISO-8601 em UTC com `Z`. No banco, `TIMESTAMPTZ`; no Python, `datetime.now(timezone.utc)`.
- **Ids.** `user_id` é inteiro, sempre ([README](README.md#o-que-já-está-decidido)).
- **Access token.** Vai em `Authorization: Bearer <access>`. Nunca em query string, nunca em cookie.
- **Três métodos de login:** e-mail pessoal com senha, Google ou 42. Os dois últimos são OAuth 2.0 e passam pelas mesmas rotas, com `{provider}` ∈ `google`, `42` (§4, decisão 1).

### 2.2 Rotas

| Método | Rota | Entrada | Sucesso | Erros (`code`) |
|---|---|---|---|---|
| POST | `/api/auth/signup` | `{email, username, password, preferred_language?}` | 201 `AuthResponse` + cookie de refresh | 409 `email_taken` / `username_taken`; 422 `validation_error`; 429 `rate_limited` |
| POST | `/api/auth/login` | `{email, password}` | 200 `AuthResponse` + cookie de refresh | 401 `invalid_credentials`; 422 `validation_error`; 429 `rate_limited` |
| POST | `/api/auth/refresh` | cookie | 200 `AuthResponse` (§2.6 diz quando vem cookie novo) **ou** 200 `{"authenticated": false}` | 401 `invalid_refresh` (cookie apagado na mesma resposta); 403 `forbidden` (Origin) |
| POST | `/api/auth/logout` | cookie | 204, cookie apagado | 403 `forbidden` (Origin) |
| GET | `/api/auth/me` | Bearer | 200 `PrivateUser` | 401 `unauthorized` |
| GET | `/api/auth/oauth/{provider}/login` | — | 302 para o provedor + cookie `oauth_state` | 404 `not_found` (provedor desconhecido) |
| GET | `/api/auth/oauth/{provider}/callback` | `?code&state` (ou `?error`) | 302 para `/` + cookie de refresh | 302 para `/login?error=<code>` |

**`AuthResponse`** (signup, login, refresh):

| Campo | Tipo | Conteúdo |
|---|---|---|
| `authenticated` | `true` | presente em toda resposta de `/refresh`, para a casca ler um campo só |
| `access_token` | string | JWT de acesso (§2.6) |
| `token_type` | `"bearer"` | |
| `expires_in` | int | segundos até o access vencer (`ACCESS_TOKEN_TTL_S`, 900) |
| `user` | `PrivateUser` | §2.3 |

Regras que valem para as rotas acima:

- **`/refresh` sem cookie não é erro.** Responde 200 `{"authenticated": false}`: é o caso normal de quem abre o site sem sessão, e um 401 apareceria em vermelho no console do Chrome (§4, decisão 4).
- **`/logout` sempre responde 204**, com ou sem cookie, com cookie válido ou não. Sair duas vezes não é erro.
- **`/refresh` e `/logout` conferem o cabeçalho `Origin`**: precisa ser `https://${PUBLIC_HOST}`. Sem ele, ou com outro valor, 403 `forbidden`. É a segunda barreira contra CSRF, depois do `SameSite` (arq. §4, decisão 1).
- **Rate limit** (dependência `RateLimit`, §2.7): `signup` e `login` 5 por minuto por IP; `refresh` 30 por minuto por IP. O sexto login em um minuto dá 429 com `Retry-After` (é o "pronto quando" de F6.5).
- **O callback do OAuth nunca devolve token no endereço.** Ele grava o cookie de refresh e redireciona para `/`; a casca chama `/refresh` como em qualquer carregamento de página e recebe o access por ali (§2.8).

### 2.3 O objeto User

Duas formas. Ninguém além do próprio User vê o e-mail.

**`PublicUser`**: o que qualquer um vê (perfil público, lista de amigos, lobby).

| Campo | Tipo | Conteúdo |
|---|---|---|
| `id` | int | |
| `username` | string | `[a-z0-9_]{3,20}` |
| `avatar_url` | string | **sempre uma URL**: sem avatar enviado, é a URL do avatar padrão (o banco guarda `NULL`, o serializador preenche) |
| `created_at` | string ISO-8601 | |

**`PrivateUser`**: o que o próprio User recebe (`/me`, login, signup, refresh). É `PublicUser` mais:

| Campo | Tipo | Conteúdo |
|---|---|---|
| `email` | string | minúsculo |
| `preferred_language` | `"pt-BR" \| "en" \| "es"` | os códigos de [i18n.md](i18n.md) |
| `has_password` | bool | `false` em conta criada só por OAuth; a tela de perfil esconde "trocar senha" |
| `providers` | `string[]` | provedores vinculados: subconjunto de `["google", "42"]`, em ordem alfabética |

Status online **não** está no User: é presença, e vem de `/ws/app` ([ws-manager.md](ws-manager.md)).

### 2.4 Validação

Mesmas regras no front (Caio) e no back (Pydantic). O front valida para não gerar 422 à toa; o back valida porque o front não é confiável.

| Campo | Normalização | Regra | `code` por campo |
|---|---|---|---|
| `email` | `strip()` e minúsculas | obrigatório; formato de e-mail; até 254 caracteres | `required`, `invalid_format`, `too_long` |
| `username` | `strip()` e minúsculas | obrigatório; 3–20 caracteres de `[a-z0-9_]` | `required`, `too_short`, `too_long`, `invalid_format` |
| `password` (signup) | nenhuma (espaço conta) | obrigatório; 8–128 caracteres; ao menos uma letra e um dígito | `required`, `too_short`, `too_long`, `weak_password` |
| `password` (login) | nenhuma | obrigatório; até 128 caracteres | `required`, `too_long` |
| `preferred_language` | — | opcional; um dos três códigos | `invalid_value` |

No login, a senha não é conferida contra as regras do signup: dizer "senha fraca" no login revelaria a regra a quem testa senhas.

### 2.5 Envelope de erro

Toda resposta de erro de **qualquer** rota do backend, de qualquer Slice:

```json
{"error": {"code": "validation_error", "message": "texto para log", "request_id": "3f2b9c…", "fields": {"password": "too_short"}}}
```

| Campo | Conteúdo |
|---|---|
| `code` | o que a casca traduz; lista fechada abaixo |
| `message` | para log e depuração, em inglês; **nunca aparece na tela** |
| `request_id` | o mesmo do cabeçalho `X-Request-ID` e do log (§2.10) |
| `fields` | só no 422: `{campo: code}`, **um código por campo**, nunca uma frase |

Significado dos status: 401 = sem token, token inválido ou vencido; 403 = autenticado, mas proibido; 404 = recurso não existe; 409 = conflito com o estado atual; 422 = entrada inválida, com `fields`; 429 = rate limit, com `Retry-After`; 500 = erro nosso, sem stack no corpo.

**`code` gerais** (qualquer rota; produzidos pelos handlers de F0.3 e F6.5):

| `code` | Status | Quando |
|---|---|---|
| `validation_error` | 422 | corpo, query ou caminho inválido (default de 422; uma rota pode usar um `code` próprio, como `invalid_options` em [matches-api.md](matches-api.md)) |
| `unauthorized` | 401 | sem `Authorization`, token inválido ou vencido |
| `forbidden` | 403 | autenticado sem permissão, ou `Origin` inválido |
| `not_found` | 404 | rota inexistente (as Slices usam `code` específico para recurso, como `match_not_found`) |
| `method_not_allowed` | 405 | |
| `payload_too_large` | 413 | corpo acima do limite do backend |
| `rate_limited` | 429 | |
| `internal_error` | 500 | qualquer exceção não tratada |

**`code` de auth:** `invalid_credentials`, `email_taken`, `username_taken`, `invalid_refresh`, `oauth_failed`, `oauth_cancelled`, `oauth_email_conflict`.

**`code` por campo** (valores de `fields`): `required`, `invalid_format`, `too_short`, `too_long`, `weak_password`, `invalid_value`.

O handler de 422 traduz o erro do Pydantic para esses códigos, então qualquer modelo Pydantic de qualquer Slice já sai traduzível sem código extra:

| Tipo do erro no Pydantic | `code` |
|---|---|
| `missing` | `required` |
| `string_too_short` | `too_short` |
| `string_too_long` | `too_long` |
| `string_pattern_mismatch`, `value_error` (e-mail) | `invalid_format` |
| `literal_error`, `enum` | `invalid_value` |
| qualquer outro | `invalid_value` |

`weak_password` é o único que não sai do Pydantic: vem de um validador próprio do signup.

A lista é fechada aqui e cresce só por PR que muda este arquivo. Os `code` de outros contratos (`matches-api.md` §2.6, `ws-messages.md` §2.7) são listas deles, no mesmo envelope.

### 2.6 Tokens e sessão

**Access** — JWT assinado, curto, guardado **só em memória** pela casca.

| Item | Valor |
|---|---|
| Biblioteca | `PyJWT`, HS256 |
| Segredo | `JWT_SECRET` do `.env`, 32 bytes ou mais |
| Claims | `sub` (o `user_id` **como texto**: a RFC 7519 define `sub` como string, e o PyJWT recusa inteiro), `exp`, `iat`, `jti`, `typ: "access"` |
| Duração | `ACCESS_TOKEN_TTL_S` = 900 s |

**Refresh** — opaco, longo, em cookie que o JavaScript não lê.

| Item | Valor |
|---|---|
| Valor | `secrets.token_urlsafe(48)`; o banco guarda só o `sha256` em hexadecimal |
| Duração | `REFRESH_TOKEN_TTL_S` = 604800 s (7 dias), contados de cada rotação |
| Cookie | `refresh_token=<valor>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=604800` |
| Apagar | o mesmo cookie com `Max-Age=0` |

**Rotação em `/api/auth/refresh`.** O que o servidor faz depende do estado do token recebido:

| Estado do token do cookie | Resposta | Efeito no banco |
|---|---|---|
| Sem cookie | 200 `{"authenticated": false}` | nenhum |
| Não existe, vencido, ou revogado | 401 `invalid_refresh`, cookie apagado | nenhum |
| Válido e nunca usado | 200 `AuthResponse` + **cookie novo** | o token recebido ganha `rotated_at = now` e `replaced_by = novo`; nasce um token novo na mesma `family_id` |
| Já rotacionado há **menos de 10 s**, com o sucessor ainda válido | 200 `AuthResponse` **sem `Set-Cookie`** | nenhum (janela de graça, §4 decisão 5) |
| Já rotacionado há 10 s ou mais | 401 `invalid_refresh`, cookie apagado | **reuso**: todos os tokens da `family_id` recebem `revoked_at = now`; log de aviso |

**Logout** revoga só o token do cookie (`revoked_at = now`) e apaga o cookie. As outras sessões do mesmo User, em outros navegadores, continuam.

**O que a casca faz** (Caio, F7.1):

1. Ao carregar a página: `POST /api/auth/refresh`. `authenticated: false` → tela pública; `AuthResponse` → guarda o access em memória.
2. Renova sozinha quando passar 80 % de `expires_in`, antes de o access vencer. Assim a casca nunca recebe 401 por expiração em fluxo normal.
3. Se mesmo assim uma rota devolver 401, chama `/refresh` **uma vez** e repete a requisição; se falhar de novo, vai para o login. Nunca entra em laço.
4. Recebeu 401 `invalid_refresh`: sessão acabou, vai para o login.

### 2.7 O que as outras Slices usam

```python
from app.auth.deps import CurrentUser, OptionalUser   # Annotated[User, Depends(...)]
from app.db.session import DbSession                  # Annotated[AsyncSession, Depends(...)]
from app.core.ratelimit import RateLimit
from app.auth.service import authenticate_ws_token, issue_tokens


@router.get("/api/users/me/friends")
async def list_friends(user: CurrentUser, session: DbSession): ...


@router.get("/api/users/{user_id}/stats")
async def stats(user_id: int, viewer: OptionalUser, session: DbSession): ...   # rota pública


@router.post("/api/matches", dependencies=[Depends(RateLimit(10, 60, key="user"))])
async def create_match(user: CurrentUser, session: DbSession): ...
```

| Nome | Assinatura | Comportamento |
|---|---|---|
| `CurrentUser` | `User` (modelo SQLAlchemy) | sem token, token inválido, vencido, `typ` diferente de `"access"` ou User inexistente: 401 `unauthorized` |
| `OptionalUser` | `User \| None` | igual, mas sem token devolve `None` em vez de 401 (token presente e inválido continua 401) |
| `DbSession` | `AsyncSession` | uma sessão por requisição; commit é de quem escreve |
| `RateLimit(times, seconds, key)` | dependência | `key="ip"` usa `request.client.host` (o `uvicorn --proxy-headers` já põe o IP real, [infra.md](infra.md) §4 decisão 6); `key="user"` exige `CurrentUser`. Estourou: 429 `rate_limited` com `Retry-After` |
| `authenticate_ws_token(token: str) -> User` | `async`, abre a própria sessão | token inválido, vencido ou User inexistente: levanta `InvalidToken`. Quem chama fecha o socket com `4401` |
| `issue_tokens(session, user, response) -> AuthResponse` | `async` | cria o refresh na família nova, grava o cookie em `response` e devolve o corpo. É o que signup, login e o callback do OAuth chamam |

A autenticação do WebSocket vale **só no `join`** (§4, decisão 9). Um socket aberto não cai quando o access vence.

### 2.8 Login por OAuth: Google e 42

OAuth 2.0 Authorization Code, o mesmo fluxo para os dois provedores; só muda a tabela de endereços. Implementado por quem é dono de F6.8 (Akita, plano §9), num módulo genérico (`app/auth/oauth.py`) com um adaptador por provedor.

| | Google | 42 |
|---|---|---|
| Autorização | `https://accounts.google.com/o/oauth2/v2/auth` | `https://api.intra.42.fr/oauth/authorize` |
| Token | `https://oauth2.googleapis.com/token` | `https://api.intra.42.fr/oauth/token` |
| Dados do User | `https://openidconnect.googleapis.com/v1/userinfo` | `https://api.intra.42.fr/v2/me` |
| Escopo | `openid email profile` | `public` |
| PKCE | sim (S256) | só se a intra aceitar ("Em aberto" 11) |
| Id do provedor | `sub` (texto) | `id` (inteiro, gravado como texto) |
| E-mail confiável para vincular | só com `email_verified = true` | o `email` da intra ("Em aberto" 12) |
| `username` sugerido | parte do e-mail antes do `@` | `login` (ex.: `rdel-fra` vira `rdel_fra`) |
| Credenciais no `.env` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `FT_CLIENT_ID`, `FT_CLIENT_SECRET` |

1. **`GET /api/auth/oauth/{provider}/login`**: provedor fora da lista → 404 `not_found`. Gera `state` (e `code_verifier`, onde houver PKCE) aleatórios; grava no cookie `oauth_state`, junto com o nome do provedor (assinado com `JWT_SECRET`, `HttpOnly; Secure; SameSite=Lax; Path=/api/auth/oauth; Max-Age=600`), e redireciona para a URL de autorização do provedor com `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state` e, se houver, `code_challenge`.
2. **`GET /api/auth/oauth/{provider}/callback`**:
   - `?error=access_denied` (o User recusou) → 302 `/login?error=oauth_cancelled`.
   - `state` diferente do cookie, provedor do cookie diferente do caminho, cookie ausente ou vencido → 302 `/login?error=oauth_failed`.
   - Troca `code` (e `code_verifier`) por um token do provedor e lê os dados do User. Falha de rede ou resposta inválida → `oauth_failed`. O token do provedor é usado só aqui e descartado: nada é guardado.
3. **Qual User entra:**

| Situação | O que acontece |
|---|---|
| Já existe `oauth_accounts (provider, id)` | entra esse User |
| Não existe, mas há User com o mesmo e-mail, e o e-mail é confiável (tabela acima) | vincula (`INSERT` em `oauth_accounts`) e entra |
| Há User com o mesmo e-mail, mas o e-mail não é confiável | 302 `/login?error=oauth_email_conflict`; nada é vinculado |
| Ninguém com esse e-mail | cria o User: `password_hash = NULL`, `username` a partir do sugerido (§4, decisão 12) |

4. Chama `issue_tokens`, apaga o cookie `oauth_state` e redireciona para `/`.

Como o vínculo é pelo e-mail, quem tem conta por senha e entra pela 42 ou pelo Google com o mesmo e-mail cai na mesma conta, e a mesma conta pode ter os dois provedores (`providers: ["42", "google"]`).

A URL de retorno é derivada, não configurada: `https://${PUBLIC_HOST}/api/auth/oauth/{provider}/callback`, pelo mesmo motivo de [infra.md](infra.md) §2.5 (uma fonte para o nome público). Por isso `FT_REDIRECT_URI` sai do `.env`.

Os botões "Entrar com Google" e "Entrar com 42" na casca são links comuns para `/api/auth/oauth/{provider}/login`. **Nenhum script de provedor entra na página** (a biblioteca de botão do Google escreve avisos no console).

### 2.9 Tabelas

Tipos do PostgreSQL, alinhados com [rooms.md](rooms.md) §2.7 (`BIGINT` para ids, `TIMESTAMPTZ`, `TEXT` com `CHECK` em vez de `ENUM`). Entram na migração `0001_initial`, escrita pelo Akita a partir daqui ([rooms.md](rooms.md) §2.9); mudanças depois disso passam pela minha revisão.

**`users`** — dona: F6 (Augusto)

| Coluna | Tipo | Nulo | Observação |
|---|---|---|---|
| `id` | `BIGSERIAL` | não | PK; é o `user_id` em todo lugar |
| `email` | `TEXT` | não | `UNIQUE`; `CHECK (email = lower(email))` |
| `username` | `TEXT` | não | `UNIQUE`; `CHECK (username ~ '^[a-z0-9_]{3,20}$')` |
| `password_hash` | `TEXT` | sim | Argon2id (`pwdlib[argon2]`); `NULL` = conta só de OAuth |
| `avatar_url` | `TEXT` | sim | `NULL` = avatar padrão |
| `preferred_language` | `TEXT` | não | `CHECK IN ('pt-BR','en','es')`; default em "Em aberto" 6 |
| `created_at` | `TIMESTAMPTZ` | não | `DEFAULT now()` |
| `last_seen_at` | `TIMESTAMPTZ` | sim | atualizado quando o último `/ws/app` do User fecha |

**`refresh_tokens`** — dona: F6

| Coluna | Tipo | Nulo | Observação |
|---|---|---|---|
| `id` | `BIGSERIAL` | não | PK |
| `user_id` | `BIGINT` | não | FK → `users(id)` `ON DELETE CASCADE` |
| `token_hash` | `TEXT` | não | `UNIQUE`; `sha256` em hexadecimal |
| `family_id` | `UUID` | não | uma família por login; índice `ix_refresh_tokens_family` |
| `created_at` | `TIMESTAMPTZ` | não | `DEFAULT now()` |
| `expires_at` | `TIMESTAMPTZ` | não | |
| `rotated_at` | `TIMESTAMPTZ` | sim | quando foi trocado por um sucessor; base da janela de graça |
| `replaced_by` | `BIGINT` | sim | FK → `refresh_tokens(id)` `ON DELETE SET NULL` |
| `revoked_at` | `TIMESTAMPTZ` | sim | logout ou reuso |
| `user_agent` | `TEXT` | sim | até 255 caracteres; só para depuração |

**`oauth_accounts`** — dona: F6

| Coluna | Tipo | Nulo | Observação |
|---|---|---|---|
| `id` | `BIGSERIAL` | não | PK |
| `user_id` | `BIGINT` | não | FK → `users(id)` `ON DELETE CASCADE` |
| `provider` | `TEXT` | não | `CHECK IN ('google','42')` |
| `provider_user_id` | `TEXT` | não | o `sub` do Google, ou o `id` numérico da 42 em texto |
| `created_at` | `TIMESTAMPTZ` | não | `DEFAULT now()` |

`UNIQUE (provider, provider_user_id)` e `UNIQUE (user_id, provider)`: um User pode ter Google e 42 vinculados ao mesmo tempo, mas uma conta de cada.

**`friendships`** — dona do schema: F6; as rotas são do Caio (F6.7). Amizade **unilateral**: adicionar é uma linha, remover é apagá-la, sem pedido nem aceite.

| Coluna | Tipo | Nulo | Observação |
|---|---|---|---|
| `user_id` | `BIGINT` | não | quem adicionou; FK → `users(id)` `ON DELETE CASCADE` |
| `friend_id` | `BIGINT` | não | quem foi adicionado; FK → `users(id)` `ON DELETE CASCADE` |
| `created_at` | `TIMESTAMPTZ` | não | `DEFAULT now()` |

PK `(user_id, friend_id)`; `CHECK (user_id <> friend_id)`; índice `ix_friendships_friend (friend_id)`, que é a consulta da presença: "quem me tem como amigo" recebe o meu `online`.

### 2.10 Logging e métrica

- Todo log é JSON em stdout com `request_id` (gerado por requisição, ou o `X-Request-ID` recebido se for um UUID válido), devolvido no cabeçalho `X-Request-ID`.
- **Nunca vão para o log:** senha, token, valor de cookie, cabeçalho `Authorization`, `code` e `state` do OAuth.
- Métrica `auth_login_total{result}` (counter, [infra.md](infra.md) §2.6): `result` ∈ `success`, `invalid_credentials`, `rate_limited`, `oauth_success`, `oauth_failed`. Sem label de provedor: o painel de logins falhos (F8.9) não precisa dela, e cada label nova multiplica as séries.

## 3. Exemplo

Signup:

```http
POST /api/auth/signup
Content-Type: application/json

{"email": "Augusto@Example.com", "username": "augusto", "password": "catacumba42", "preferred_language": "pt-BR"}
```

```http
HTTP/1.1 201 Created
Set-Cookie: refresh_token=Yp3…; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=604800
X-Request-ID: 3f2b9c1e-6a0d-4f7e-9b1a-2c8d4e5f6a7b
```

```json
{
  "authenticated": true,
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "token_type": "bearer",
  "expires_in": 900,
  "user": {
    "id": 7, "username": "augusto", "avatar_url": "/media/avatars/default.png",
    "created_at": "2026-10-07T14:02:11Z",
    "email": "augusto@example.com", "preferred_language": "pt-BR",
    "has_password": true, "providers": []
  }
}
```

Refresh sem sessão (primeira visita):

```json
{"authenticated": false}
```

Login errado (a mesma resposta para e-mail inexistente, senha errada e conta só de OAuth):

```json
{"error": {"code": "invalid_credentials", "message": "invalid email or password", "request_id": "9a1c…"}}
```

Signup inválido:

```json
{"error": {"code": "validation_error", "message": "request validation failed", "request_id": "b7e2…",
           "fields": {"username": "invalid_format", "password": "weak_password"}}}
```

`GET /api/auth/me` de uma conta criada pelo Google:

```json
{"id": 12, "username": "rafael_h", "avatar_url": "/media/avatars/default.png", "created_at": "2026-10-08T09:15:00Z",
 "email": "rafael.h@gmail.com", "preferred_language": "en", "has_password": false, "providers": ["google"]}
```

`GET /api/auth/me` de uma conta criada pela 42 (o `login` `rdel-fra` virou `rdel_fra`) que depois também vinculou o Google pelo mesmo e-mail:

```json
{"id": 9, "username": "rdel_fra", "avatar_url": "/media/avatars/default.png", "created_at": "2026-10-08T10:02:40Z",
 "email": "rdel-fra@student.42sp.org.br", "preferred_language": "pt-BR", "has_password": false, "providers": ["42", "google"]}
```

Payload de um access token decodificado:

```json
{"sub": "7", "typ": "access", "iat": 1791381731, "exp": 1791382631, "jti": "c0a8…"}
```

## 4. Decisões

1. **Três métodos de login: e-mail com senha, Google e 42.** Decisão do time em 07/10. O módulo *Remote authentication with OAuth 2.0* vale 1 ponto com um provedor ou com dois; ter dois tira o risco do plano §8.2 (intra demorando a liberar o app): se um provedor travar, o outro sozinho já fecha o módulo, e o Plano B de 2FA deixa de ser necessário. As rotas são as mesmas para os dois, com `{provider}` no caminho, então o segundo provedor custa um adaptador, não um fluxo novo.
2. **Login só por e-mail** (pergunta 1 do briefing). Uma porta a menos para validar, limitar e testar; o `username` é para exibição.
3. **`fields` leva um código por campo** (pergunta 2). Só código é traduzível; o handler converte o erro do Pydantic, então nenhuma Slice escreve tradução de erro à mão.
4. **`/refresh` sem cookie responde 200 `{"authenticated": false}`** (pergunta 3). O Chrome mostra em vermelho, no console, toda resposta 4xx de `fetch`, e console limpo é critério de rejeição. "Não há sessão" é o estado normal de quem chega, não um erro. Junto vêm: a casca renova o access antes de vencer (nunca recebe 401 por expiração), e o front valida as mesmas regras (raramente recebe 422). Os 4xx que sobram são erro do próprio User (senha errada, e-mail em uso), não do site.
5. **Janela de graça de 10 s na rotação.** Duas abas que recarregam juntas mandam o mesmo cookie; com rotação estrita a segunda pareceria reuso e a família seria revogada, deslogando o User sem motivo. Como as abas dividem o cookie, a segunda já tem o cookie novo que a primeira recebeu: basta devolver um access novo, sem `Set-Cookie`. Depois de 10 s, reaparecer com o token velho é reuso de verdade (RFC 9700 §4.14.2).
6. **Cookie de refresh com `Path=/api/auth`**, não `/api/auth/refresh` como na arq. §4 decisão 1. Com o caminho estreito, o navegador não manda o cookie para `/api/auth/logout`, e o logout não consegue revogar o token. Os outros caminhos sob `/api/auth` recebem o cookie e o ignoram.
7. **Cookie `oauth_state` com `SameSite=Lax`**, e não `Strict`. O callback é uma navegação que vem de `accounts.google.com`, outro site; com `Strict` o navegador não mandaria o cookie e todo `state` seria recusado. `Lax` vai em navegação de topo com `GET`, que é exatamente o callback. O `state` mora em cookie, e não num dicionário do servidor, porque precisa estar preso ao navegador que começou o login: é isso que impede alguém de logar a vítima na conta do atacante.
8. **Refresh opaco com tabela, access JWT sem tabela.** O access é conferido a cada requisição e precisa ser barato; o refresh precisa poder ser revogado, e JWT sem tabela não revoga. Detalhes no [ADR 0002](../adr/002-tokens.md).
9. **O WebSocket é autenticado só no `join`** (pergunta 6). O access dura 15 min e uma partida pode durar mais; derrubar o socket no meio da partida por expiração seria pior que o risco, que é pequeno (o User já provou quem é ao abrir).
10. **Conta só de OAuth que tenta login por senha recebe `invalid_credentials`** (pergunta 8), a mesma resposta de senha errada. Uma mensagem própria ("esta conta usa Google" ou "usa a 42") revelaria que o e-mail está cadastrado. O hash é calculado mesmo sem User ou sem senha, para o tempo de resposta não denunciar nada.
11. **Logout revoga só o token atual** (pergunta 9). Sair de um navegador não deve deslogar os outros; a família inteira só cai por reuso.
12. **`username` de conta criada por OAuth vem do provedor, normalizado.** Na 42, o `login`; no Google, que não tem login, a parte do e-mail antes do `@`. Nos dois casos: minúsculas, o que não for `[a-z0-9_]` vira `_` (o `login` da 42 pode ter hífen, como `rdel-fra`), corta em 20 e completa até 3; se já existe, ganha sufixo numérico (`rafael_h`, `rafael_h2`). Pedir um username no meio do fluxo seria mais uma tela.
13. **Vincular a um User existente só com e-mail confiável.** No Google, `email_verified = true`; sem isso, quem cadastrasse no Google o e-mail de outra pessoa entraria na conta dela. Na 42, o e-mail é administrado pela escola ("Em aberto" 12).
14. **Dados do User lidos na API do provedor** (`userinfo` no Google, `/v2/me` na 42), não do `id_token` do Google. É o mesmo caminho para os dois provedores e dispensa conferir assinatura com as chaves públicas do Google: a resposta vem por TLS direto do provedor.
15. **PKCE onde o provedor aceita, mesmo com `client_secret`.** A RFC 9700 §2.1.1 recomenda para todo cliente: protege o `code` se ele vazar no redirecionamento. O `state` continua obrigatório nos dois.
16. **Signup já faz login.** Devolve o mesmo corpo do login e o cookie (a arq. §9.1 devolvia só `{user}`). Economiza uma requisição e um caminho de erro na tela de cadastro.
17. **Senha com teto de 128 caracteres.** O Argon2id é caro de propósito; sem teto, uma senha de 1 MB vira ataque de negação de serviço no login.
18. **`avatar_url` é sempre uma URL na API.** O banco guarda `NULL` para "padrão", e só o serializador sabe qual é a URL padrão; trocar o avatar padrão não exige migração.

## 5. Em aberto

| # | Questão | Quem decide | Quando |
|---|---|---|---|
| 1 | **URL de retorno na demo, nos dois provedores.** O Google exige HTTPS e um domínio público na URL de retorno, com exceção só para `localhost`; `catacombs.local` e IP puro (o plano de [infra.md](infra.md) §5.1) devem ser recusados. As regras da intra da 42 são a pergunta 8 do Akita ([infra.md](infra.md) §5.4). Opções: demonstrar o OAuth só na máquina que serve, por `https://localhost`; ou usar um nome do tipo `192.168.0.42.nip.io` no certificado e no `PUBLIC_HOST`. **Testar no Google Cloud Console e na intra antes de qualquer outra coisa da F6.8.** | Akita (dono de F6.8 e da infra) | S1 |
| 2 | Tela de consentimento do Google em modo "Testing" só aceita os e-mails cadastrados como testadores. Publicar o app (escopos básicos não exigem verificação, a conferir) ou cadastrar os e-mails da avaliação? | Akita | S2 |
| 3 | **Documentos que ainda dizem só 42**, para cada dono atualizar citando a decisão 1: plano §1 (linha 8), §5 (F6.8), §7 e §8.2 (o Plano B de 2FA vira "o outro provedor"); arq. §4 decisão 6, §9.1 (rotas com `{provider}`), §10.3 e §14 (`oauth42.py` vira `oauth.py`); [infra.md](infra.md) §2.5 (entram `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`; sai `FT_REDIRECT_URI`); [rooms.md](rooms.md) §2.8 (rótulo "contas 42" vira "contas OAuth", e `rotated_at` em `refresh_tokens`); `caminho-5-akita.md` (F6.8 com dois provedores). | Roberto (plano e arq.), Akita (infra, rooms, slice) | junto com a revisão deste contrato |
| 4 | A foto do provedor (Google ou 42) vira avatar? Proposta: não na primeira versão; o avatar continua sendo o padrão até o User enviar um. Baixar a imagem exige o mesmo caminho de validação do upload (F6.6). | Caio | S3 |
| 5 | URL do avatar padrão e onde os avatares ficam guardados ([infra.md](infra.md) §5.2). Este contrato só precisa da URL. | Caio e Akita | com [i18n.md](i18n.md) |
| 6 | Default de `preferred_language` quando o signup não manda o campo (e no login por OAuth, que não manda nada). Proposta: o idioma de reserva de [i18n.md](i18n.md). A casca manda o idioma atual no signup. | Caio | com [i18n.md](i18n.md) |
| 7 | Sessão com prazo absoluto? Hoje cada rotação renova os 7 dias, então quem usa o site toda semana nunca é deslogado. Proposta: aceitar (é demo) e escrever no README. | Augusto | S2 |
| 8 | Limites do rate limit: `signup` e `login` 5/min por IP, `refresh` 30/min por IP. Na demo, várias máquinas atrás do mesmo roteador têm IPs diferentes na rede local, então não dividem o balde. Confirmar no ensaio. | Augusto | S2 |
| 9 | Exclusão de conta não está no escopo ([rooms.md](rooms.md) §5.8). `ON DELETE CASCADE` em `refresh_tokens`, `oauth_accounts` e `friendships` já deixa o caminho pronto, mas `matches.created_by` é `RESTRICT`. | Augusto e Akita | se entrar no escopo |
| 10 | Amizade unilateral foi proposta por mim para a tabela; as rotas e a tela são do Caio. Confirmar ao assinar. | Caio | revisão deste contrato |
| 11 | A intra da 42 aceita PKCE (`code_challenge`)? Se aceitar, os dois provedores ficam iguais; se não, a 42 fica só com `state`, que já basta para o fluxo com `client_secret`. Testar no cadastro do app. | Akita | S1, com o "Em aberto" 1 |
| 12 | O e-mail da 42 é confiável para vincular a uma conta existente? A API não manda `email_verified`. Proposta: sim, porque o e-mail da intra é administrado pela escola e não muda à vontade do User. Alternativa: nunca vincular pela 42 por e-mail, só criar conta nova. | Augusto e Akita | revisão deste contrato |
| 13 | F6.8 passa a ter dois provedores: estimativa de 2 d → cerca de 2,5–3 d, na S4 do Akita, que já está acima da capacidade ([caminho-5-akita.md](../slices/caminho-5-akita.md) §5). Proposta: a 42 primeiro (é o login que a avaliação espera ver), o Google em seguida; se a S4 estourar, o Google vem para a minha S5, que tem folga. | Akita e Augusto, na reunião de segunda | reunião de segunda |

---

> **Links para arquivos que ainda não existem:** [i18n.md](i18n.md) (Caio).
