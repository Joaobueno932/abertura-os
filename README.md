# O&M OS

Sistema de Ordens de Serviço de operação e manutenção da **Em Conta Ltda**:
abertura, acompanhamento em Kanban, orçamento do atendimento e emissão do
documento oficial no papel timbrado da empresa.

> **O&M OS** é o nome do sistema. As Ordens de Serviço continuam sendo emitidas
> pela **Em Conta Ltda**, que aparece no papel timbrado e nos documentos.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Framework | Next.js 15 (App Router) + React 19 + TypeScript (strict) |
| Banco | PostgreSQL (Neon) via Prisma 6, com migrations versionadas |
| Estilo | Tailwind CSS v4 com design system próprio |
| Autenticação | Sessão própria: scrypt (`node:crypto`) + cookie httpOnly assinado |
| Validação | Zod (frontend e backend) |
| Documentos | JSZip (DOCX a partir do timbrado) + pdf-lib (PDF) |
| Testes | Vitest, executando contra o PostgreSQL real |

Sem dependências nativas: tudo é JavaScript puro, então o projeto roda igual em
Windows, Linux e container.

## Primeiros passos

```bash
npm install
cp .env.example .env      # preencha as variáveis (ver abaixo)
npm run db:setup          # migrate deploy + prisma generate + seed
npm run dev               # http://localhost:3000
```

> **Rede corporativa.** Alguns firewalls (FortiGate com Application Control)
> bloqueiam `registry.npmjs.org` e interceptam o TLS com uma CA própria. Se o
> `npm install` travar ou responder 403:
>
> ```bash
> NODE_OPTIONS=--use-system-ca npm install --registry=https://registry.yarnpkg.com/
> ```
>
> O `package-lock.json` continua apontando para `registry.npmjs.org`; o espelho é
> só o caminho de download.

### Administrador inicial

Não existe senha padrão. O seed provisiona o primeiro administrador a partir de
`INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD`; sem elas, o seed falha.

O usuário criado nasce com **troca de senha obrigatória**: no primeiro login o
sistema exige uma nova senha antes de liberar qualquer funcionalidade — e a
restrição vale também para a API, não só para a interface. A senha de
provisionamento serve para um acesso e nada mais.

Rodar o seed novamente **nunca** redefine a senha de um administrador existente.

Depois do primeiro acesso, cadastre pelo menos uma **usina** e um
**responsável** em `/admin` antes de abrir a primeira OS.

## Build e produção

```bash
npm run build             # prisma generate + build do Next
npm run db:migrate        # aplica as migrations no banco de destino
npm start
```

## Scripts

| Script | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | `prisma generate` + build de produção |
| `npm start` | Servidor de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest contra o PostgreSQL, no schema `os_test` |
| `npm run db:migrate` | `prisma migrate deploy` (produção) |
| `npm run db:migrate:dev` | Cria/aplica migrations (desenvolvimento — ver nota abaixo) |
| `npm run db:generate` | Gera o Prisma Client |
| `npm run db:seed` | Seed idempotente |
| `npm run db:setup` | migrate deploy + generate + seed |

## Variáveis de ambiente

Nomes e formato estão em [`.env.example`](.env.example). Nenhum valor real é
versionado.

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | sim | PostgreSQL usado pela aplicação. No Neon, o endpoint **pooled** |
| `DIRECT_URL` | sim | Conexão **direta** (sem `-pooler`), usada por `prisma migrate` |
| `SESSION_SECRET` | em produção | Assina os cookies de sessão (≥ 32 caracteres) |
| `NEXT_PUBLIC_APP_TIMEZONE` | não | Fuso de negócio. Padrão `America/Campo_Grande` |
| `OS_DOCX_TEMPLATE` | não | Caminho do `.docx` timbrado. Padrão: o arquivo na raiz |
| `SOFFICE_PATH` | não | LibreOffice para converter DOCX→PDF. Vazio = renderização nativa |
| `INITIAL_ADMIN_EMAIL` | no seed | E-mail do administrador provisionado |
| `INITIAL_ADMIN_PASSWORD` | no seed | Senha de provisionamento (≥ 10 caracteres, uso único) |
| `INITIAL_ADMIN_NAME` | não | Nome exibido do administrador |

> **Criar novas migrations.** `prisma migrate dev` precisa de um *shadow
> database* para calcular o diff. No Neon, crie um branch/banco descartável e
> aponte `shadowDatabaseUrl` no `datasource`, **ou** gere o SQL sem shadow:
>
> ```bash
> npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
> ```
>
> Foi assim que a migration inicial PostgreSQL deste projeto foi gerada.

### Por que existe `DIRECT_URL`

O endpoint pooled do Neon (PgBouncer) não suporta os advisory locks que o
Prisma Migrate usa. A aplicação usa o pooled (`DATABASE_URL`), e as migrations
usam a conexão direta (`DIRECT_URL`) — mesmas credenciais, host sem `-pooler`.

## Documentação do módulo

Regras de numeração, concorrência, fuso horário, cálculo do atendimento, uso do
template DOCX, geração de PDF, segurança e modelo de dados:
**[docs/OS.md](docs/OS.md)**.
