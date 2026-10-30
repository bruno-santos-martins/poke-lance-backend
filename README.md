# PokéLance — Backend

API REST e serviço de eventos em tempo real da aplicação PokéLance. O backend gerencia usuários, lotes, lances, carteiras, liquidação automática, relatórios e auditoria.

## Tecnologias

- Node.js 22+, Express 5 e TypeScript.
- PostgreSQL 16 e Prisma 6.
- Socket.IO para atualizações em tempo real.
- JWT e bcrypt para autenticação.
- Zod para validação de dados.
- Vitest e Supertest para testes.

## Requisitos

- Node.js 22 ou superior e npm.
- PostgreSQL 16, local ou hospedado.
- Docker Desktop com Docker Compose, caso queira iniciar o PostgreSQL localmente pelo Compose.

## Configuração local

Os comandos desta seção são executados a partir da pasta `backend`.

1. Instale as dependências e crie o arquivo de ambiente:

   ```powershell
   npm install
   Copy-Item .env.example .env
   ```

2. Configure as variáveis em `.env`:

   ```env
   DATABASE_URL="postgresql://auction:auction@localhost:5432/pokemon_auction?schema=public"
   JWT_SECRET="substitua-por-um-segredo-aleatorio-com-32-caracteres-ou-mais"
   PORT=4000
   CLIENT_ORIGIN="http://localhost:5173"
   UPLOADS_DIR="./uploads"
   ```

   `JWT_SECRET` deve ter pelo menos 32 caracteres. `CLIENT_ORIGIN` deve corresponder à origem do frontend autorizada para CORS e Socket.IO.

3. Inicie o PostgreSQL pelo Docker Compose ou use uma instância PostgreSQL existente:

   ```powershell
   npm run db:up
   ```

4. Gere o Prisma Client, aplique as migrations e, opcionalmente, carregue os dados de demonstração:

   ```powershell
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```

5. Inicie a API:

   ```powershell
   npm run dev
   ```

A API fica disponível em `http://localhost:4000`. O endpoint `GET /health` verifica se o servidor está respondendo.

## Dados de demonstração

O comando `npm run db:seed` cria contas locais para avaliação. Todas usam a senha `Senha123!`:

| Perfil | E-mail |
|---|---|
| Leiloeiro | `vendedor@leilao.local` |
| Licitante | `ana@leilao.local` |
| Licitante | `bruno@leilao.local` |

Use essas contas apenas em desenvolvimento. Não execute o seed em produção sem revisar os dados e credenciais criados.

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Executa a API em modo de desenvolvimento. |
| `npm run build` | Compila o backend TypeScript. |
| `npm start` | Inicia o servidor compilado. |
| `npm run start:prod` | Inicia o servidor compilado para produção. |
| `npm test` | Executa todos os testes. |
| `npm run test:unit` | Executa os testes unitários. |
| `npm run test:integration` | Executa os testes de integração. |
| `npm run db:up` | Inicia o serviço PostgreSQL do Docker Compose. |
| `npm run db:generate` | Gera o Prisma Client. |
| `npm run db:migrate` | Cria/aplica migrations em desenvolvimento. |
| `npm run db:deploy` | Aplica migrations existentes em produção. |
| `npm run db:seed` | Carrega dados locais de demonstração. |

## API

As rotas da aplicação usam o prefixo `/api`. Rotas protegidas recebem o token no cabeçalho `Authorization: Bearer <token>` e exigem o perfil indicado.

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| `POST` | `/api/auth/register` | Público | Registra leiloeiro ou licitante. |
| `POST` | `/api/auth/login` | Público | Autentica o usuário e retorna JWT. |
| `GET` | `/api/lots` | Público | Lista lotes abertos. |
| `GET` | `/api/lots/:id` | Público | Consulta detalhes de um lote. |
| `POST` | `/api/lots` | Leiloeiro | Cria um lote. |
| `DELETE` | `/api/lots/:id` | Leiloeiro | Cancela o próprio lote e estorna o lance vigente. |
| `POST` | `/api/lots/:id/bids` | Licitante | Registra um lance. |
| `GET` | `/api/lots/:id/audit` | Público | Consulta e verifica o histórico encadeado de lances. |
| `GET` | `/api/pokemon/search?q=...` | Público | Busca Pokémon pela PokéAPI. |
| `GET` | `/api/pokemon/:id` | Público | Consulta detalhes de um Pokémon. |
| `GET` | `/api/wallet` | Licitante | Consulta saldo e valores comprometidos. |
| `POST` | `/api/wallet/deposits` | Licitante | Adiciona saldo para demonstração. |
| `GET` | `/api/bidder/report` | Licitante | Consulta lances, compras e transações. |
| `GET` | `/api/seller/reports` | Leiloeiro | Consulta relatório dos lotes vendidos. |
| `GET` | `/api/seller/audit` | Leiloeiro | Consulta auditoria dos próprios lotes. |
| `GET` | `/api/seller/auctioned-lots` | Leiloeiro | Lista lotes liquidados e contatos dos ganhadores dos próprios lotes. |
| `GET` | `/api/receipts/:id` | Público ou autenticado | Consulta comprovativo de lote liquidado. |

O servidor também expõe `/health`. O Socket.IO usa as salas `lot:join` e `lot:leave` e emite eventos de lances e atualização de lotes e carteiras.

## Regras, persistência e auditoria

- Os valores monetários são inteiros em centavos de BRL.
- A liquidação verifica lotes expirados a cada cinco segundos e atualiza as carteiras dentro de transações PostgreSQL.
- Lances guardam sequência e hash encadeado SHA-256, verificáveis pelo endpoint de auditoria.
- O modelo `Audit` registra ações como cadastro, login, criação e cancelamento de lote, lance, depósito e liquidação.
- Em caso de cancelamento, o lote e seu histórico são preservados; o valor comprometido do lance vigente é liberado.
- O nome e o e-mail do ganhador só são retornados ao leiloeiro autenticado que é dono do lote.
- Imagens de cartas são armazenadas em `UPLOADS_DIR` e servidas pela rota `/uploads`. Em produção, use armazenamento persistente.

## Arquitetura

```text
src/
  core/
    domain/                 Regras e modelos do domínio
    ports/                  Contratos de repositórios e serviços
  application/
    dtos/                   Schemas de validação
    use-cases/               Casos de uso da aplicação
  adapters/
    in/
      http/                  Rotas e middlewares HTTP
      websocket/             Eventos Socket.IO
    out/
      crypto/                JWT e hashes
      database/prisma/       Persistência e repositórios Prisma
      external-api/          Integração PokéAPI
      storage/               Persistência local de imagens
  main/                      Inicialização e configuração do servidor
  test/
    unit/                    Testes unitários
    integration/             Testes de integração HTTP
```

O núcleo (`core`) define domínio e contratos; `application` implementa os casos de uso; os adaptadores `in` recebem as chamadas externas; os adaptadores `out` conectam banco, criptografia, PokéAPI e armazenamento. `main` configura o processo servidor.

## Docker Compose

Para subir API, PostgreSQL, aplicar migrations e carregar dados de demonstração em conjunto:

```powershell
docker compose up --build
```

O Compose usa volumes para persistir o banco e as imagens. Para parar os serviços:

```powershell
docker compose down
```

## Deploy no Render com Node

Crie um Web Service usando Node e a raiz do repositório do backend. Configure:

- **Build Command:** `npm ci && npm run db:generate && npm run build`
- **Pre-Deploy Command:** `npm run db:deploy`
- **Start Command:** `npm run start:prod`
- **Environment:** `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN` e `UPLOADS_DIR`.

Use a URL interna do PostgreSQL do Render em `DATABASE_URL`; configure `CLIENT_ORIGIN` com a origem pública do frontend e um `JWT_SECRET` forte e exclusivo. Se imagens devem persistir entre deploys, associe um disco persistente e aponte `UPLOADS_DIR` para o caminho montado.
