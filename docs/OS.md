# O&M OS — módulo de Ordens de Serviço

**O&M OS** é o nome do sistema. As Ordens de Serviço que ele emite são
documentos da **Em Conta Ltda**, cujo papel timbrado é usado na geração.

## Visão geral

| Tela | Rota | Quem acessa |
| --- | --- | --- |
| Painel (indicadores + Kanban) | `/painel` | Todos |
| Listagem com busca e filtros | `/os` | Todos |
| Abertura de OS | `/os/nova` | Todos |
| Detalhes da OS | `/os/[id]` | Todos |
| Edição da OS | `/os/[id]/editar` | Todos (OS cancelada: só administrador) |
| Instituições / Responsáveis / Usinas / Usuários / Configurações | `/admin/...` | Administrador |

Toda restrição é aplicada **no servidor**. Esconder um link no frontend nunca é
a única barreira: as rotas de API repetem a verificação com `requireUser()` /
`requireAdmin()`.

## Numeração da OS

Formato `AAAAMMDDNNN` — ano, mês, dia e sequência de 3 dígitos que **reinicia a
cada dia**:

```
31/08/2026 → 20260831001, 20260831002, 20260831003
01/09/2026 → 20260901001
```

O dia é o **dia de negócio** no fuso configurado (`NEXT_PUBLIC_APP_TIMEZONE`,
padrão `America/Campo_Grande`), não o dia UTC. Uma OS aberta às 22h de 31/08 em
Campo Grande recebe número de 31/08, mesmo já sendo 01/09 em UTC.

### Como a unicidade é garantida

Três camadas, todas no backend (`src/lib/os/numbering.ts` e `service.ts`):

1. **Reserva atômica** — um único comando do PostgreSQL faz a reserva:

   ```sql
   INSERT INTO "OrderSequence" ("day", "lastSeq")
   VALUES ($1, 1)
   ON CONFLICT ("day")
   DO UPDATE SET "lastSeq" = "OrderSequence"."lastSeq" + 1
   RETURNING "lastSeq"
   ```

   Não existe janela entre ler e escrever, como haveria em um `SELECT` seguido
   de `UPDATE`. A primeira transação insere ou incrementa a linha e mantém o
   lock até o commit; a segunda espera esse lock e lê o valor já incrementado.

2. **Constraint UNIQUE** — `ServiceOrder.number` é único no banco
   (`ServiceOrder_number_key`). É a garantia final: nem um bug de aplicação
   consegue gravar número repetido.

3. **Retry** — se ainda assim houver colisão (`P2002`), a criação é repetida em
   uma nova transação, até 5 vezes.

A reserva do número e a criação da OS ocorrem **na mesma transação**, então uma
falha depois da reserva não deixa buracos por commit parcial nem OS sem evento
de histórico.

A validação das referências (usina, instituição, responsável) roda **antes** de
abrir a transação: são leituras puras, e mantê-las fora encurta o tempo em que a
transação segura uma conexão do pool e o lock da linha de `OrderSequence` — o
gargalo real sob rajada. A integridade referencial continua garantida pelas
foreign keys.

### Pool de conexões

Cada transação interativa ocupa uma conexão enquanto dura. O padrão do Prisma
(`num_cpus × 2 + 1`) é pequeno demais para rajadas: 50 aberturas simultâneas
esgotavam o pool e falhavam com `P2024` antes de chegar ao banco.

`src/lib/prisma.ts` aplica `connection_limit=25` e `pool_timeout=30` quando a
`DATABASE_URL` não os define — a URL sempre tem precedência, então dá para
ajustar por ambiente sem tocar no código.

O contador vive no banco, não em memória: reiniciar a aplicação não reinicia a
sequência. `tests/numbering.test.ts` cobre 20 e 50 aberturas simultâneas, a
continuidade após "reinício" do processo e a rejeição de número duplicado pela
constraint.

O frontend **nunca** calcula esse número.

## Fluxo de status

```
                 ┌──────────────┐
    ┌───────────►│    ABERTA    │◄────────────┐
    │            └──────┬───────┘             │
    │                   ▼                     │
    │            ┌──────────────┐             │
    │      ┌────►│ EM ANDAMENTO │◄────┐       │ (somente
    │      │     └──────┬───────┘     │       │  administrador)
    │      │            ▼             │       │
    │      │     ┌──────────────┐     │       │
    │      └─────┤  AGUARDANDO  ├─────┘       │
    │            └──────┬───────┘             │
    │                   ▼                     │
    │            ┌──────────────┐             │
    │            │  CONCLUÍDA   ├─────────────┤
    │            └──────────────┘             │
    │            ┌──────────────┐             │
    └────────────┤  CANCELADA   ├─────────────┘
                 └──────────────┘
```

- Qualquer status ativo pode ir para **Concluída** ou **Cancelada**.
- **Reabrir** uma OS encerrada (Concluída/Cancelada) é ação de administrador.
- Uma OS **Cancelada** só pode ser editada por administrador.

A movimentação acontece por drag-and-drop no Kanban **ou** pelo seletor em cada
card e pelos botões da tela de detalhes — a operação nunca depende só do arrastar,
o que mantém o sistema utilizável em toque e por teclado.

Toda transição valida a permissão no servidor, grava `updatedById` e registra um
evento `STATUS_ALTERADO` no histórico com data, hora e autor.

## Cálculo do atendimento

```
custoHorasTécnicas = quantidadeTécnicos × valorHoraTécnica × horasPorTécnico
custoQuilometragem = (kmIda + kmVolta) × valorKm
totalAtendimento   = custoHorasTécnicas + custoQuilometragem
```

Exemplo (cenário de referência):

```
2 técnicos × R$ 150,00 × 3 horas   = R$ 900,00
(200 km + 200 km) × R$ 1,50        = R$ 600,00
TOTAL DO ATENDIMENTO               = R$ 1.500,00
```

### Precisão

Nenhum valor monetário usa ponto flutuante. O banco guarda **inteiros**:

| Grandeza | Unidade armazenada | Exemplo |
| --- | --- | --- |
| Dinheiro | centavos | `R$ 150,00` → `15000` |
| Horas | centésimos de hora | `3,5 h` → `350` |
| Quilometragem | centésimos de km | `200 km` → `20000` |

Os produtos ficam em "centavos × centésimos" e são reduzidos a centavos com
arredondamento meio-para-cima (`divideRound`, em `src/lib/money.ts`).

### O backend nunca confia no cliente

O formulário mostra uma prévia usando a **mesma função** `calculateCosts`, mas ao
salvar o servidor recebe apenas os dados básicos (técnicos, horas, km), busca os
valores unitários vigentes e recalcula tudo. Subtotais e total enviados pelo
cliente são ignorados.

### Valores unitários

Ficam centralizados na tabela `Setting`, com padrão de fábrica em
`src/lib/rates.ts`:

| Chave | Padrão |
| --- | --- |
| `costs.technicalHourlyRateCents` | `15000` (R$ 150,00) |
| `costs.kmRateCents` | `150` (R$ 1,50) |

Um administrador altera esses valores em `/admin/configuracoes`, sem alteração de
código nem deploy.

### Integridade histórica

Cada OS grava, na própria linha, os valores unitários usados no momento do
cálculo (`technicalHourlyRateCents`, `kmRateCents`) junto com os subtotais e o
total. Se amanhã a hora técnica passar a R$ 170,00, o documento de uma OS antiga
continua mostrando R$ 150,00 e o mesmo total. Os valores só mudam se a própria OS
for editada e recalculada.

## Padronização de texto

Aplicada no backend, antes de persistir (`src/lib/text.ts`):

- **Descrição** — sempre gravada e exibida em **CAIXA ALTA**. Não é `text-transform`
  de CSS: o dado no banco já está normalizado.
- **Demais campos** (título, local, nomes de cadastro) — se o usuário digitou
  tudo em caixa alta, o texto é convertido para minúsculas preservando siglas
  conhecidas (SESI, SENAI, FIEMS, UFV, MS…), numerais romanos e tokens com
  dígitos. O sistema **não** capitaliza automaticamente a primeira letra, e a
  capitalização intencional do usuário é mantida intacta.

```
"Realizar manutenção preventiva."  → "REALIZAR MANUTENÇÃO PREVENTIVA."   (descrição)
"manutenção preventiva"            → "manutenção preventiva"              (título)
"ATENDIMENTO FIEMS"                → "atendimento FIEMS"                  (título)
```

## Datas e fuso horário

O fuso de negócio é `America/Campo_Grande` (`NEXT_PUBLIC_APP_TIMEZONE`). Ele é
aplicado **apenas na camada de negócio/apresentação**; o banco guarda instantes
absolutos em `timestamptz`.

O cálculo do dia usa `Intl.DateTimeFormat` com `timeZone` explícito, então o
resultado **não depende do fuso do sistema operacional** do servidor — um
container em UTC e uma máquina em Tóquio produzem o mesmo prefixo de OS.
`tests/numbering.test.ts` verifica isso alternando `process.env.TZ`.

- `openedAt`, `createdAt`, `updatedAt` — instantes completos, exibidos no
  fuso de negócio como `DD/MM/AAAA` ou `DD/MM/AAAA HH:mm`.
- `expectedDate` (previsão) — campo de **data pura**, ancorado ao meio-dia UTC.
  Assim a data exibida é a mesma em qualquer fuso, sem "pular um dia".

Uma OS ainda não encerrada cuja previsão já passou é destacada como **atrasada**
no Kanban e na listagem.

Nenhuma data é gravada como texto formatado (`01/09/2026`): a formatação
brasileira acontece na exibição, a partir do instante armazenado.

## Documento oficial

### Fluxo

```
EM CONTA_O&M_papel timbrado.docx   (template na raiz)
            ↓  análise automática do pacote OOXML
   página, margens, cabeçalho, rodapé, imagens
            ↓  preenchimento com os dados da OS
        DOCX da Ordem de Serviço
            ↓
              PDF
```

### Como o timbrado é preservado

`src/lib/docs/template.ts` **lê e analisa o `.docx` fornecido** — nada é
hardcoded. Dele são extraídos:

- dimensão da página e margens (do `<w:sectPr>`);
- as partes de cabeçalho e rodapé referenciadas como `default`;
- as imagens embutidas nessas partes (`word/media/*.png`), com largura, altura e
  o recuo do parágrafo que define a posição horizontal.

Valores lidos do arquivo atual:

| Item | Valor |
| --- | --- |
| Página | A4 — 11906 × 16838 twips (595,3 × 841,9 pt) |
| Margens | esq. 1418 · dir. 1701 · sup. 1560 · inf. 1843 twips |
| Cabeçalho | `word/header2.xml` → `image1.png` (615×132 px), recuo −1843 twips |
| Rodapé | `word/footer2.xml` → `image2.png` (254×146 px), recuo −851 twips |

**DOCX** — o pacote original é reaberto e **apenas `word/document.xml` é
substituído**. Cabeçalho, rodapé, imagens, estilos, tema, fontes e o próprio
`<w:sectPr>` são copiados byte a byte. É o arquivo oficial com o corpo preenchido,
não uma recriação.

**PDF** — renderizado com `pdf-lib` reaproveitando **as mesmas imagens** extraídas
do template, desenhadas nas **mesmas coordenadas que o Word calcula**
(margem + recuo do parágrafo), sobre uma página com as dimensões e margens lidas
do `<w:sectPr>`. Os banners são repetidos em todas as páginas.

> Trocar o arquivo `.docx` da raiz (ou apontar `OS_DOCX_TEMPLATE` para outro)
> atualiza automaticamente o DOCX **e** o PDF. O template é lido com cache
> invalidado por data de modificação.

### Conversão DOCX → PDF

Por padrão **não há dependência de sistema operacional**: o PDF é renderizado em
JavaScript puro, o que faz o resultado ser idêntico em desenvolvimento, produção
e container.

Se você preferir que o PDF seja a conversão literal do DOCX, defina
`SOFFICE_PATH` apontando para o executável do LibreOffice:

```bash
# Linux
SOFFICE_PATH=/usr/bin/soffice
# Windows
SOFFICE_PATH="C:\Program Files\LibreOffice\program\soffice.exe"
```

Nesse modo o LibreOffice passa a ser **dependência de infraestrutura** e precisa
estar instalado na imagem/servidor (em Debian/Ubuntu: `apt-get install -y
libreoffice-writer`). Se a conversão falhar por qualquer motivo, o sistema volta
sozinho para o renderizador nativo — a emissão do documento nunca fica
indisponível.

Nenhum serviço externo ou API paga é utilizado.

### Armazenamento dos documentos

Os documentos são **gerados sob demanda e transmitidos na resposta HTTP**. Nada é
gravado em disco pela aplicação: não há diretório de saída, não há arquivo
persistido, não há limpeza a fazer. O DOCX e o PDF existem apenas como buffers em
memória durante a requisição.

Isso é intencional e tem duas consequências práticas:

- **Compatível com ambientes efêmeros/serverless.** Não há dependência de
  filesystem persistente, então o sistema roda igual em container, Vercel,
  Fly.io ou VM. Não é necessário object storage.
- **Sempre coerente com o dado atual.** Como cada OS guarda os valores unitários
  usados no cálculo, regerar o documento de uma OS antiga produz exatamente o
  mesmo resultado de antes. Não há o que arquivar: o documento é uma projeção
  determinística da OS.

O único caminho que toca o disco é a conversão opcional via LibreOffice
(`SOFFICE_PATH`), que escreve em um diretório temporário criado com `mkdtemp`
(nome aleatório, sem colisão entre requisições concorrentes) e o remove em um
bloco `finally`, mesmo em caso de erro. Nenhum dado vindo do usuário — título,
responsável, nome de arquivo — participa da construção desse caminho.

O nome apresentado ao cliente é derivado do número da OS e passa por
`sanitizeFileNamePart`, que remove acentos, separadores de caminho e caracteres
inválidos: defesa contra path traversal e contra nomes quebrados no Windows.

### Conteúdo e nome dos arquivos

O documento traz: identificação (número, status, abertura, previsão),
atendimento (título, usina, instituição, responsável, local), descrição,
**Custos do atendimento** com a memória de cálculo por bloco (serviço técnico e
deslocamento), a faixa **TOTAL DO ATENDIMENTO** e a área **Aprovação do serviço**
(nome, cargo/função, data e assinatura).

```
OS-20260831001.pdf
OS-20260831001.docx
```

O nome é montado a partir do número da OS e passa por `sanitizeFileNamePart`,
que remove acentos, separadores de caminho e caracteres inválidos — defesa contra
path traversal e nomes quebrados no Windows.

O download exige sessão válida e tem rate limit por usuário. Cada geração é
registrada no histórico da OS.

## Banco de dados

PostgreSQL (Neon). O schema é versionado em `prisma/migrations` e aplicado com
`prisma migrate deploy` — nunca com `db push` nem `migrate reset` contra o banco
real.

Duas conexões, com papéis distintos:

| Variável | Endpoint | Usada por |
| --- | --- | --- |
| `DATABASE_URL` | pooled (`-pooler`) | aplicação em runtime |
| `DIRECT_URL` | direto | `prisma migrate` e introspecção |

O pooler do Neon (PgBouncer) não suporta os advisory locks do Prisma Migrate;
por isso o `directUrl` no `datasource`.

Todos os campos de data/hora são `timestamptz`: instantes absolutos, sem
ambiguidade de fuso no banco. O fuso de negócio é aplicado só na camada de
negócio/apresentação.

### Tabelas

| Tabela | Papel |
| --- | --- |
| `User` | Usuários, perfil (`USER` / `ADMIN`) e `mustChangePassword` |
| `Session` | Sessões ativas (apenas o hash do token é gravado) |
| `Institution` | Instituições — inativação lógica |
| `Responsible` | Responsáveis — inativação lógica, vínculo opcional com `User` |
| `Plant` | Usinas — inativação lógica |
| `OrderSequence` | Contador diário da numeração |
| `ServiceOrder` | A OS, com o snapshot dos custos |
| `ServiceOrderEvent` | Histórico (timeline) |
| `Setting` | Configurações administrativas (valores unitários) |

### Cadastros inativos

Instituições, responsáveis e usinas nunca somem do histórico:

- **não aparecem** para seleção em novas OS;
- **continuam visíveis** nas OS que já os utilizavam;
- ao editar uma OS antiga, o cadastro inativo já vinculado segue disponível (para
  não apagar a informação ao salvar);
- excluir só remove de fato quando o cadastro **nunca** foi usado; havendo OS
  vinculada, o sistema apenas **desativa** e informa isso na tela.

Usuários nunca são excluídos — apenas desativados —, porque assinam o histórico.

### SQL cru e `search_path`

A camada de dados usa exclusivamente a API tipada do Prisma. Isso não é só
estilo: consultas com `$queryRaw` **não** são qualificadas com o schema da
conexão (`?schema=`), então uma tabela referenciada sem qualificação cai no
`search_path` da sessão — normalmente `public` — mesmo quando o resto da
aplicação está operando em outro schema. A reserva do número da OS chegou a ser
escrita em SQL cru e gravava o contador no schema errado; hoje usa
`orderSequence.upsert`, que o Prisma compila para o mesmo
`INSERT … ON CONFLICT … RETURNING` atômico, com o schema correto.

### Índices

Além das chaves únicas (`ServiceOrder.number`, `User.email`, nomes dos
cadastros), há índices para as consultas frequentes: `status`, `openedAt`,
`expectedDate`, `institutionId`, `responsibleId`, `plantId`, o composto
`(status, expectedDate)` e `(serviceOrderId, createdAt)` no histórico.

As listagens usam projeções (`select`) com as relações já incluídas — sem N+1 — e
são paginadas. O Kanban tem teto de carga por consulta e avisa na tela quando o
resultado foi truncado.

## Histórico

Eventos registrados em `ServiceOrderEvent`, com tipo, data/hora, autor e o
detalhamento dos campos alterados (valor anterior → novo):

`OS criada` · `Status alterado` · `Responsável alterado` · `Previsão alterada` ·
`Informações editadas` · `Custos alterados` · `Documento gerado`

Só dados de negócio já visíveis na própria OS são gravados — nenhum segredo,
token ou credencial.

## Segurança

- Senhas com **scrypt** (`node:crypto`, N=2^15), sem dependência nativa.
- Sessão em cookie **httpOnly**, `SameSite=Lax`, `Secure` em produção; o token é
  assinado com HMAC e o banco guarda apenas o **hash** — o valor original nunca é
  persistido.
- Autorização sempre no servidor (`requireUser` / `requireAdmin`).
- Toda entrada validada com Zod nas duas pontas; o backend nunca confia em
  totais, números ou status vindos do cliente.
- Prisma usa consultas parametrizadas (sem SQL injection); React escapa a saída
  (sem XSS); o XML do DOCX é escapado explicitamente.
- CSRF: `SameSite=Lax` + verificação de origem em toda rota que altera estado.
- Rate limit em login (por IP e por conta) e na geração de documentos.
- IDs são `cuid` (não sequenciais), documentos exigem sessão, e nomes de arquivo
  são sanitizados.
- Trocar a senha ou desativar um usuário encerra todas as sessões dele.
- Nenhum segredo no código: tudo vem de variáveis de ambiente.
- Não existe senha padrão. O primeiro administrador é provisionado por
  `INITIAL_ADMIN_EMAIL`/`INITIAL_ADMIN_PASSWORD`, nasce com
  `mustChangePassword` e **não opera o sistema** — nem pela API — enquanto não
  definir uma nova senha. Concluída a troca, todas as sessões daquele usuário
  são invalidadas e uma nova é emitida, então a credencial de provisionamento
  deixa de valer em qualquer dispositivo.
- `SESSION_SECRET`, `DATABASE_URL` e `DIRECT_URL` nunca aparecem em logs, na
  documentação nem no `.env.example`.

### Provisionamento do primeiro acesso

```
seed  → cria o admin com mustChangePassword = true
login → sessão válida, mas requireUser() responde 403 PASSWORD_CHANGE_REQUIRED
        e a UI redireciona para /trocar-senha
troca → nova senha, mustChangePassword = false, sessões antigas revogadas
```

## Testes

```bash
npm test
```

Os testes de integração rodam contra o **PostgreSQL real**, no schema dedicado
`os_test` do mesmo banco. O schema é recriado do zero a cada execução e recebe
as mesmas migrations de produção; o schema `public`, onde vivem os dados reais,
nunca é tocado. O `globalSetup` se recusa a rodar se o schema alvo não tiver o
prefixo `os_test`.

Isso garante que o que se valida aqui é o comportamento do Postgres — incluindo
constraints, `ON DELETE`, tipos e concorrência real — e não o de outro banco.

| Arquivo | Cobre |
| --- | --- |
| `tests/costs.test.ts` | Cenário obrigatório, decimais, zero, negativos, arredondamento, formatação BRL |
| `tests/numbering.test.ts` | Primeira/segunda OS do dia, virada de dia às 23:59/00:01, independência do fuso do SO, 20 e 50 aberturas concorrentes, continuidade após reinício, UNIQUE |
| `tests/text.test.ts` | Padronização de texto, caixa alta da descrição, datas, nome de arquivo |
| `tests/service.test.ts` | Criação, edição, status, histórico, filtros, paginação, cadastros inativos, integridade histórica |
| `tests/permissions.test.ts` | Usuário comum barrado na API administrativa, 401 sem sessão, exclusão lógica, bloqueio enquanto a troca de senha inicial está pendente |
| `tests/documents.test.ts` | DOCX/PDF gerados, template preservado byte a byte, `sectPr` intacto, valores e memória de cálculo, PDF íntegro |

Os testes de concorrência abrem 20 e 50 OS simultâneas e verificam que saem
números distintos, sequenciais, sem buracos e com o mesmo prefixo diário — além
de conferir que o contador e a quantidade de eventos batem ao final (nenhuma
transação parcialmente persistida).

## Produção

```bash
npm ci
npx prisma migrate deploy     # aplica o schema no banco de destino
npx prisma generate
npm run build
npm start
```

O seed (`npm run db:seed`) é executado **uma vez**, para provisionar o primeiro
administrador e os cadastros iniciais. É idempotente: rodá-lo de novo não
duplica nada nem redefine a senha de quem já existe.

### Checklist antes do primeiro deploy

- [ ] `DATABASE_URL` (pooled) e `DIRECT_URL` (direta) apontando para o banco de produção
- [ ] `SESSION_SECRET` com pelo menos 32 caracteres, gerado aleatoriamente
- [ ] `INITIAL_ADMIN_EMAIL` e `INITIAL_ADMIN_PASSWORD` definidos só para o provisionamento
- [ ] HTTPS ativo (o cookie de sessão usa `Secure` quando `NODE_ENV=production`)
- [ ] `npx prisma migrate deploy` executado
- [ ] Primeiro login feito e senha inicial trocada
- [ ] `INITIAL_ADMIN_PASSWORD` removida do ambiente depois do primeiro acesso

A aplicação já envia `X-Content-Type-Options`, `X-Frame-Options` e
`Referrer-Policy`. `Strict-Transport-Security` fica a cargo do proxy/CDN à
frente, porque só deve ser emitido em domínios servidos exclusivamente por
HTTPS — enviá-lo de dentro da aplicação quebraria um acesso interno via HTTP.

### Ambiente de execução

Não há dependência de sistema operacional nem de filesystem persistente: a
geração de DOCX/PDF é feita em memória, em JavaScript puro. O sistema roda
igual em container, VM ou plataforma serverless.

A única dependência opcional de SO é o LibreOffice, e apenas se `SOFFICE_PATH`
for configurado — com fallback automático para o renderizador nativo.
