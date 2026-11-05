Última atualização: 4 de novembro de 2026.

Esta política explica quais dados o Catacombs 42 guarda sobre você, para que servem, por quanto tempo ficam guardados e como pedir que sejam apagados.

## Quem somos

O Catacombs 42 é um projeto acadêmico de cinco estudantes da 42, feito para o ft_transcendence, o projeto final do currículo comum da escola. O site não tem fins comerciais, não mostra anúncios e não vende nem repassa dados a ninguém. Tudo o que está descrito aqui fica no servidor que roda o jogo.

## Dados da conta

Ao criar a sua conta, guardamos:

- **e-mail**, para você entrar e para identificar a conta. Só você vê o seu e-mail;
- **nome de usuário**, que aparece para os outros jogadores;
- **senha**, guardada só como hash Argon2id, um resumo do qual não dá para recuperar a senha. A senha em si nunca é gravada. Conta criada pelo login da 42 não tem senha;
- **idioma preferido**: português, inglês ou espanhol;
- **avatar**, se você enviar um. O servidor redesenha a imagem como PNG de 256 × 256 pixels e descarta os metadados do arquivo original, como a localização e o modelo da câmera. Ao trocar ou remover o avatar, o arquivo anterior é apagado;
- **data de criação da conta** e **data da última conexão**.

Para cada sessão aberta, ou seja, cada navegador em que você entrou, guardamos também quando ela começou e a identificação do navegador (o User-Agent, que diz o navegador e o sistema operacional), para investigar problemas de login.

## Jogo e amigos

Enquanto a partida acontece, nada é gravado: o estado do jogo fica só na memória do servidor. Quando ela termina, guardamos o resultado: modo, mapa, opções da sala, horário de início e de fim, quem jogou e, para cada jogador, vitória ou derrota, abates, mortes, dano causado e recebido, chaves coletadas, poções usadas, XP e Elo. Partidas interrompidas não entram no histórico de ninguém.

A partir das partidas calculamos as suas estatísticas, o seu XP, nível, Elo e conquistas. O seu nome de usuário, avatar, estatísticas, histórico de partidas, conquistas e posição no ranking ficam visíveis para outras pessoas no site.

Quando você adiciona alguém como amigo, guardamos esse vínculo. A amizade é de mão única: a outra pessoa não precisa aceitar. Quem adicionou você como amigo vê se você está online naquele momento. Hoje não há opção para esconder esse status.

## Login pela 42

Se você entrar pela 42, o site recebe da intra o seu identificador na 42, o seu e-mail e o seu login. O identificador liga a sua conta da 42 à conta do jogo; o e-mail cria ou encontra essa conta (se já existir uma conta com o mesmo e-mail, as duas viram uma só); e o login vira a sugestão de nome de usuário. A foto da intra não vira avatar. O token que a 42 entrega é usado só durante o login e descartado em seguida: o site não guarda nenhum acesso à sua conta da 42.

## Cookies e armazenamento local

O site usa dois cookies, os dois necessários para o login, e guarda uma informação no seu navegador:

- `refresh_token` mantém você conectado. A página não consegue lê-lo (HttpOnly), ele só viaja por HTTPS e só é enviado às rotas de login do próprio site. Vale por 7 dias e é trocado por um novo a cada uso; sair da conta o apaga. No servidor, guardamos só um hash dele;
- `oauth_state` existe só durante o login pela 42, por no máximo 10 minutos, para confirmar que a resposta da 42 pertence ao login que você começou;
- `localStorage["lang"]` guarda o idioma que você escolheu, para o site abrir nele da próxima vez. Esse valor fica só no seu navegador.

A chave de acesso de curta duração (15 minutos) fica só na memória da página e some quando você a fecha. Não usamos cookies de terceiros, anúncios nem ferramentas de análise, e a página não carrega scripts de outros sites.

## Logs e métricas

Para manter o site no ar e se proteger de abuso, o servidor registra:

- **log de acesso**: em cada requisição, o endereço IP, a data e a hora, o endereço acessado e a identificação do navegador;
- **limite de tentativas**: tentativas de login e de cadastro são contadas por endereço IP, para barrar quem tenta adivinhar senhas. A contagem fica só na memória do servidor, e cada tentativa é esquecida depois de um minuto;
- **métricas**: números do funcionamento do servidor, como quantidade de requisições, de partidas em andamento e de conexões, tempo de processamento e uso de CPU e memória. As métricas não têm nenhum dado pessoal e ficam guardadas por 7 dias.

Os logs ficam só no servidor e são descartados sempre que ele é reinstalado ou atualizado.

## Por quanto tempo guardamos e como pedir a remoção

Os dados da conta, das partidas e das amizades ficam guardados enquanto a conta existir. O site não tem um botão para excluir a conta: para isso, escreva para **catacombs42@student.42.fr** a partir do e-mail da conta. Em até 15 dias, apagamos o seu e-mail, a senha, o avatar, as sessões, o vínculo com a 42 e as amizades, e trocamos o seu nome de usuário por um nome anônimo. As partidas de que você participou continuam no histórico dos outros jogadores, sem nada que identifique você.

Se esta política mudar, a data no topo da página muda junto.
