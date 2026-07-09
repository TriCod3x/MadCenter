# Histórico do Projeto Madcenter Entregas

> Arquivo de memória para sessões futuras de desenvolvimento.
> Atualizado em: 2026-06-09

---

## Visão Geral

Sistema de gerenciamento de entregas da **Madcenter** (loja em José de Freitas/PI). Permite que atendentes cadastrem pedidos, o admin monte rotas e atribua motoristas, e os motoristas acompanhem e registrem entregas em campo.

**Três perfis de usuário:**
- **Admin** — acesso total: pedidos, rotas, motoristas, veículos, usuários, relatórios, mapa
- **Atendente** — cadastra e acompanha pedidos do dia/mês
- **Motorista** — vê suas rotas, registra entregas, devolve pedidos ao mural

---

## Stack e Arquitetura

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + Express (porta 3001) |
| Banco | Supabase (PostgreSQL hospedado) |
| Auth | JWT (jsonwebtoken) + bcryptjs para senhas |
| Frontend | HTML/CSS/JS puro, sem framework |
| Mapas | Leaflet.js |
| Gráficos | Chart.js |
| CEP | ViaCEP API (gratuita) |
| Geocodificação | Nominatim (OpenStreetMap, gratuito) |

**Por que porta 3001?** Conflito com outro projeto local que já usa 3000.

**Por que sem framework frontend?** Projeto iniciado com foco em simplicidade e aprendizado. Funciona bem para escala atual.

**Arquivos principais:**
```
backend/
  server.js          — API REST completa (~620 linhas)
  .env               — PORT, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, JWT_SECRET

frontend/
  index.html         — painel admin
  atendente.html     — painel atendente
  motorista.html     — painel motorista
  login.html         — tela de login
  js/
    utils.js         — funções compartilhadas (api, toast, tema, máscara)
    icons.js         — SVGs inline (Icons.package, Icons.truck, etc.)
    data.js          — constantes (DEFAULT_SETTINGS, API_BASE para admin)
    storage.js       — cache em memória (DB.cargas/motoristas/rotas) + funções get/save/update/delete
    map.js           — mapa Leaflet do painel admin
    app.js           — lógica completa do painel admin (~2400 linhas)
    atendente.js     — lógica do painel atendente (~770 linhas)
    motorista.js     — lógica do painel motorista (~1050 linhas)
```

---

## Tabelas do Banco (Supabase)

### `pedidos`
Tabela central do sistema. Cada pedido é uma entrega.

| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | gen_random_uuid() |
| codigo | TEXT | Código alfanumérico do pedido |
| descricao | TEXT | Material/produto |
| tipo | TEXT | Tipo de carga |
| peso | NUMERIC | Em kg |
| volume | TEXT | Dimensões/volume |
| cep | TEXT | CEP do destino |
| destino_municipio | TEXT | Cidade de destino |
| destino_estado | TEXT | UF |
| endereco_entrega | TEXT | Rua/logradouro |
| numero | TEXT | Número do endereço |
| complemento | TEXT | Apto, bloco, etc. |
| cliente | TEXT | Nome do destinatário |
| telefone | TEXT | WhatsApp do cliente |
| coleta | TIMESTAMPTZ | Preenchido automaticamente ao mudar para "em rota" (UTC-3) |
| entrega | TIMESTAMPTZ | Preenchido automaticamente ao mudar para "entregue" (UTC-3) |
| prioridade | TEXT | urgente / alta / normal / baixa |
| veiculo_tipo | TEXT | FK para veiculos.id |
| distancia_km | NUMERIC | Calculado via Haversine |
| valor_frete | NUMERIC | R$ |
| status | TEXT | Ver fluxo abaixo |
| observacoes | TEXT | |
| lat | NUMERIC | Coordenadas do destino |
| lng | NUMERIC | |
| data_entrega | DATE | Data prevista de entrega |
| created_at | TIMESTAMPTZ | default now() |

**Constraint de status (pedidos_status_check):**
```sql
CHECK (status IN ('aguardando rota', 'disponivel', 'em rota', 'entregue', 'pendente', 'cancelado'))
```
> ⚠️ Os valores `'pendente'` e `'disponivel'` foram adicionados depois — se der erro de constraint ao fazer UPDATE, rodar:
```sql
ALTER TABLE pedidos DROP CONSTRAINT pedidos_status_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_status_check
  CHECK (status IN ('aguardando rota', 'disponivel', 'em rota', 'entregue', 'pendente', 'cancelado'));
```

---

### `rotas`
Agrupa pedidos em uma rota para um motorista.

| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| codigo | TEXT | Ex: RT-001 |
| nome | TEXT | Nome da rota |
| tipo_rota | TEXT | Rodoviária / Urbana / Mista |
| destino_municipio | TEXT | |
| destino_estado | TEXT | |
| motorista_id | UUID | FK para motoristas.id (nullable) |
| saida | TIMESTAMPTZ | Previsão de saída |
| chegada | TIMESTAMPTZ | Previsão de chegada |
| distancia | NUMERIC | km |
| frete_total | NUMERIC | R$ |
| tempo | TEXT | Duração estimada |
| status | TEXT | Ver fluxo abaixo |
| observacoes | TEXT | |
| cargas_ids | UUID[] | Array de IDs de pedidos vinculados |
| created_at | TIMESTAMPTZ | |

**Constraint de status (rotas_status_check):**
```sql
CHECK (status IN ('planejada', 'em andamento', 'concluida', 'cancelada'))
```
> ⚠️ Usar `'concluida'` SEM acento — ver seção "Decisões Importantes".

---

### `motoristas`
Perfil operacional dos motoristas (diferente de `usuarios`).

| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| nome | TEXT | Sincronizado com usuarios.nome |
| telefone | TEXT | |
| categoria | TEXT | B / C / D / E |
| capacidade | NUMERIC | kg máximo do veículo |
| cidade | TEXT | |
| estado | TEXT | UF |
| status | TEXT | disponível / em rota / inativo |
| observacoes | TEXT | |

> Ao criar um usuário com perfil `"motorista"`, o backend cria automaticamente um espelho na tabela `motoristas`. Ao excluir o usuário, também exclui o motorista.

---

### `usuarios`
Contas de login de atendentes e motoristas.

| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| nome | TEXT | Login e nome de exibição |
| perfil | TEXT | atendente / motorista |
| senha_hash | TEXT | bcrypt, 10 rounds |
| ativo | BOOLEAN | default true |
| criado_em | TIMESTAMPTZ | |

---

### `admin_auth`
Contas de login do(s) admin(s). Separada de `usuarios` para maior controle.

| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| usuario | TEXT | Login do admin |
| senha_hash | TEXT | bcrypt |
| ativo | BOOLEAN | |

> O login verifica primeiro `admin_auth` (via supabaseAdmin/service_role), depois `usuarios`.

---

### `veiculos`
Tipos de veículo disponíveis para seleção nos pedidos.

| Coluna | Tipo | Notas |
|---|---|---|
| id | TEXT PK | Slug: ex `caminhonete`, `moto` |
| nome | TEXT | Nome de exibição |
| capacidade | NUMERIC | kg |
| custo_base | NUMERIC | R$ fixo |
| custo_km | NUMERIC | R$/km |
| uso | TEXT | Descrição ideal de uso |

> **Bug corrigido:** o campo `veiculo_tipo` no pedido deve salvar o `id` (slug), não o `nome`. Havia um bug onde o select enviava o nome ao invés do id.

---

### `configuracoes`
Única linha. Configurações globais da empresa.

| Coluna | Tipo |
|---|---|
| id | UUID PK |
| empresa | TEXT |
| telefone | TEXT |
| endereco | TEXT |
| cidade_base | TEXT |
| estado | TEXT |
| latitude_loja | NUMERIC |
| longitude_loja | NUMERIC |
| custo_km | NUMERIC |
| custo_adicional_fixo | NUMERIC |
| frete_minimo | NUMERIC |
| entrega_moto | NUMERIC |
| horario | TEXT |
| tema | TEXT |

---

### `relatorios`
Histórico de relatórios gerados pelo admin.

| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| nome | TEXT | Nome dado pelo admin |
| periodo_inicio | DATE | |
| periodo_fim | DATE | |
| total_pedidos | INT | |
| total_entregas | INT | |
| total_frete | NUMERIC | |
| gerado_por | TEXT | Nome do usuário admin |
| gerado_em | TIMESTAMPTZ | default now() |

**SQL para criar:**
```sql
CREATE TABLE relatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT,
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  total_pedidos INT,
  total_entregas INT,
  total_frete NUMERIC,
  gerado_por TEXT,
  gerado_em TIMESTAMP DEFAULT now()
);
```

---

### `rota_pedidos` (auxiliar)
Tabela de junção secundária. O relacionamento principal é via `rotas.cargas_ids` (array). Esta tabela é usada para algumas queries e é limpada junto com o pedido ao cancelar.

---

### RLS Policies

O Supabase tem RLS (Row Level Security) ativado. Políticas importantes:

- **`pedidos`**: leitura/escrita permitida para a service_role (supabaseAdmin). Para anon, verificar se há policies permissivas. Se der erro de permissão em produção, adicionar:
```sql
CREATE POLICY "allow_all_service_role" ON pedidos
  USING (auth.role() = 'service_role');
```

- **`relatorios`**: todas as operações usam `supabaseAdmin` no backend para bypass de RLS (a tabela pode ter RLS restritivo).

- **`admin_auth`**: lida via `supabaseAdmin` porque RLS bloqueia leitura anon na tabela de credenciais.

> **Regra geral:** se uma operação administrativa retornar erro de permissão, trocar `supabase` por `supabaseAdmin` na rota correspondente.

---

## Fluxo de Status

### Pedidos
```
[Atendente cadastra]
      ↓
"aguardando rota"
      ↓ (admin adiciona à rota)
"disponivel"
      ↓ (motorista pega o pedido / rota fica "em andamento")
"em rota"
      ↓                    ↓
"entregue"            "pendente"  ← motorista deixa para depois (permanece na rota)
                           ↓
                      volta para "em rota" na próxima tentativa

"cancelado" ← admin cancela (limpa da rota automaticamente)

[Motorista devolve pedido ao mural]
"em rota" → "disponivel" (se ainda em rota planejada) ou "aguardando rota"
```

### Rotas
```
[Admin cria]
      ↓
"planejada"  ← sem motorista ainda, pedidos podem ser adicionados
      ↓ (motorista aceita / admin atribui)
"em andamento"
      ↓                    ↓
"concluida"           "cancelada"
(todos entregues)     (admin cancela ou todos pedidos removidos)
```

**Sincronização automática:**
- Quando todos os pedidos de uma rota ficam `"entregue"`, a rota vira `"concluida"` e o motorista volta a `"disponível"` — feito no `PUT /api/pedidos/:id` do backend (app.js também chama essa lógica via `checkRotaConclusion`).
- Quando um pedido é cancelado, é removido de `cargas_ids` de todas as rotas ativas. Se a rota ficar sem pedidos, ela é cancelada.

---

## Decisões de Arquitetura Importantes

### `utils.js` — centralização de funções
**Problema:** `atendente.js` e `motorista.js` tinham cópias idênticas de `apiGet`, `apiPost`, `apiPut`, `sair()`, `aplicarTema()`, `alternarTema()`.

**Solução:** `frontend/js/utils.js` criado com versões canônicas de todas essas funções. Carregado em todos os HTMLs após `icons.js` e antes dos demais scripts.

**Exceções que NÃO foram centralizadas:**
- `motorista.js` mantém seu próprio `sair()` — tem limpeza de `navigator.geolocation.clearWatch` que é específica
- `motorista.js` mantém seu próprio `alternarTema()` — precisa chamar `state.map.invalidateSize()` após trocar tema
- `app.js` mantém seu próprio `toast()` (usa `#toast`) e `applyTheme()` (usa `document.body.dataset.theme`, diferente dos outros que usam `document.documentElement`)
- `app.js` mantém `applyPhoneMask()` — usada em handlers inline no HTML

---

### `supabaseAdmin` no backend
**Problema:** RLS do Supabase bloqueava certas operações com a chave anon.

**Solução:** `supabaseAdmin` usa a chave `SUPABASE_SERVICE_KEY` (service_role) que ignora RLS.

**Onde é usado:**
- Login admin (`admin_auth` table)
- Todas as rotas de `/api/relatorios` (a tabela tem RLS restritivo)
- `GET /api/auth/login` para ler `admin_auth`

**Onde NÃO usar:** operações normais de pedidos, motoristas, rotas — essas usam `supabase` (anon) para respeitar as policies de segurança.

---

### JWT Middleware
**Implementação:** função `autenticar(req, res, next)` em `server.js`. Middleware global `app.use("/api", ...)` que intercepta todas as rotas `/api/*` exceto `POST /api/auth/login`.

**Token aceito via:**
1. Header `Authorization: Bearer <token>` — para chamadas fetch normais
2. Query param `?token=<token>` — para download de CSV via link `<a href>` (não dá para setar headers em downloads diretos)

**No frontend:** `utils.js` injeta o token automaticamente em todos os helpers `apiGet/apiPost/apiPut/apiDelete/apiPatch`. O token é armazenado em `sessionStorage("madcenter_token")` com expiração de 8h.

---

### Status `"concluida"` sem acento
**Problema:** inconsistência — backend usava `"concluida"` (sem acento) nos filtros `.not()`, mas o frontend enviava e comparava `"concluída"` (com acento), causando registros duplicados ou não encontrados.

**Decisão:** padronizar para `"concluida"` (sem acento) em TODO o código para valores de status que vão/vêm do banco.

**Labels de exibição** ao usuário mantêm acento: `"Concluída"`, `"concluídas"`.

**SQL para migrar dados existentes que têm acento:**
```sql
UPDATE rotas SET status = 'concluida' WHERE status = 'concluída';
```

---

### Pedidos não são deletados, apenas cancelados
**Decisão:** pedidos cancelados permanecem no banco para fins de histórico e relatórios. O botão "Excluir" no painel admin é permanente, mas o fluxo normal é "Cancelar" (muda status para `"cancelado"`).

---

### Porta 3001 e API_BASE
Todos os arquivos JS de frontend detectam a porta:
```javascript
const API_BASE = window.location.port === "3001" ? "" : "http://localhost:3001";
```
- Se servido pelo próprio Node (porta 3001): usa caminhos relativos (`""`)
- Se aberto via Live Server (portas 5500/5501): aponta para `http://localhost:3001`

**CORS** configurado para: `localhost:5500`, `localhost:5501`, `127.0.0.1:5500`, `127.0.0.1:5501`, `localhost:3000`.

---

## Funcionalidades por Tela

### Login (`login.html`)
- Campo nome + senha
- POST `/api/auth/login` — verifica `admin_auth` primeiro, depois `usuarios`
- Redireciona para a página correta conforme `perfil` retornado no JWT
- Token e dados guardados em `sessionStorage`

---

### Admin — Dashboard (`index.html` → app.js)
- Cards de resumo: total de pedidos, em rota, entregues hoje, aguardando rota
- Tabela "Próximos pedidos" (5 mais recentes, não concluídos)
- Gráfico de entregas do mês (Chart.js, dados em UTC-3)
- Mini lista de rotas ativas

---

### Admin — Pedidos
- Tabela com todos os pedidos + filtros (status, prioridade, destino, busca livre)
- CRUD completo via modal genérico (app.js `openForm/closeForm`)
- Formulário de novo pedido: busca CEP (ViaCEP), geocodificação (Nominatim), seleção de destino no mapa (Leaflet map picker)
- Cálculo de frete automático (Haversine + configurações de custo)
- Ao editar: não permite editar pedidos `"em rota"` pelo painel admin

---

### Admin — Motoristas
- Tabela com status e histórico de rotas concluídas por motorista (expandível)
- CRUD via modal genérico
- Ao criar usuário motorista: espelho automático criado em `motoristas`

---

### Admin — Rotas
- Tabela com status, motorista, pedidos vinculados
- Criação de rota: seleção de pedidos disponíveis, cálculo automático de frete total
- Atribuição de motorista
- Status sincronizado com conclusão de pedidos

---

### Admin — Mapa (`map.js`)
- Mapa Leaflet com todas as rotas ativas
- Filtros por status, motorista, cidade
- Cards de resumo (total, planejadas, em andamento, concluídas)
- Legenda de status
- Marker de destino com cores por status
- Polilinha de rota (tracejada = planejada, sólida = em andamento)

---

### Admin — Veículos
- CRUD de tipos de veículo
- Proteção ao excluir: não permite se houver pedidos vinculados

---

### Admin — Usuários
- CRUD de atendentes e motoristas
- Toggle ativar/desativar sem excluir
- Ao criar motorista: entrada automática em `motoristas`
- Ao alterar nome: sincroniza `motoristas`

---

### Admin — Relatórios
- Lista de relatórios gerados (nome, período, totais)
- Modal "Gerar relatório": nome + período + totais calculados automaticamente dos pedidos entregues
- Botão "Baixar CSV": gera arquivo com BOM UTF-8, separador `;`, datas em BR UTC-3
- Download via link com token na query string: `/api/relatorios/:id/csv?token=...`

---

### Atendente (`atendente.html` → atendente.js)
- Cards de resumo: pedidos hoje, aguardando rota, em rota, entregues hoje, total do mês
- Lista de pedidos do dia (só os de hoje)
- Formulário de novo pedido com busca CEP, mapa picker, máscara de telefone
- Formulário de edição inline (não pode editar pedidos em rota)
- Seção "Pedidos do Mês" com tabela, busca em tempo real, filtro de status, contador "Exibindo X de Y"
- Mini estatísticas do mês (total, em andamento, entregues, cancelados)

---

### Motorista (`motorista.html` → motorista.js)
- Tela de seleção de motorista (login por nome)
- Lista de entregas do dia (pedidos das suas rotas `"em andamento"`)
- Para cada pedido: botão "Entregue", "Deixar para depois", "Devolver ao mural"
- Barra de progresso das entregas
- Mapa Leaflet com posição atual (GPS) e destinos
- Modal de veículo ao confirmar entrega
- Botão "Mural de pedidos" — vê pedidos `"disponivel"` e pode pegá-los
- Tema claro/escuro com invalidação do mapa ao trocar

---

## Bugs Corrigidos e Soluções

### 1. Duplicação de rotas ao cancelar/repegar pedido
**Problema:** quando o motorista devolvia um pedido ao mural e depois repegava, uma nova rota era criada sem cancelar a anterior, gerando duplicatas.

**Solução:** `PUT /api/pedidos/:id/cancelar-motorista` busca todas as rotas ativas que contêm o pedido via `cargas_ids`, atualiza a rota para `"planejada"` com `motorista_id: null` em vez de criar uma nova.

---

### 2. Mapa Leaflet renderizando pela metade
**Problema:** ao trocar tema ou abrir aba do mapa, o Leaflet não recalculava o tamanho do container.

**Solução:** `state.map.invalidateSize()` chamado com `setTimeout(..., 60)` após a troca de tema em `motorista.js`. O `alternarTema()` de `motorista.js` tem essa lógica adicional e por isso **não foi removido** quando o `aplicarTema()` foi centralizado no `utils.js`.

---

### 3. Timezone UTC-3 no gráfico do dashboard
**Problema:** datas de entrega vinham em UTC do banco, mas o gráfico agrupava por data UTC, causando contagens erradas para usuários no horário de Brasília (UTC-3).

**Solução:** função `toBrasilia(isoStr)` converte timestamps antes de agrupar por data. Também aplicada nas colunas `coleta` e `entrega` do CSV de relatório.

---

### 4. `concluida` vs `concluída` — constraint quebrada
**Problema:** o frontend enviava `"concluída"` (com acento ã), mas o `CHECK constraint` no banco esperava `"concluida"`. O Supabase retornava erro de violação de constraint ao tentar concluir uma rota.

**Solução:** padronização completa para `"concluida"` sem acento em todos os arquivos. Ver SQL de migração acima.

---

### 5. RLS bloqueando inserts e selects
**Problema:** operações na tabela `admin_auth` e `relatorios` retornavam `{}` ou erro de permissão com a chave anon.

**Solução:** usar `supabaseAdmin` (service_role) nas rotas de login admin e em todas as rotas de relatórios. Para `pedidos`, se RLS estiver ativo, criar policy explícita.

---

### 6. `veiculo_tipo` enviando nome em vez de id
**Problema:** o select de veículos no formulário de pedido estava configurado para exibir e salvar o `nome` do veículo, mas a coluna `veiculo_tipo` é FK para `veiculos.id` (um slug como `"caminhonete"`).

**Solução:** corrigido o binding do select para usar `value=id` e `text=nome` no HTML gerado dinamicamente.

---

### 7. `pedidos_status_check` com valores insuficientes
**Problema:** ao implementar o fluxo `"disponivel"` e `"pendente"`, o banco retornava violação de constraint porque esses valores não estavam no CHECK original.

**Solução:** recriar a constraint incluindo todos os status possíveis: `'aguardando rota', 'disponivel', 'em rota', 'entregue', 'pendente', 'cancelado'`.

---

### 8. Rotas retornando 404 após adicionar no código
**Problema:** novas rotas adicionadas ao `server.js` retornavam 404.

**Causa:** servidor ainda rodando a versão antiga em memória — não tinha sido reiniciado.

**Solução:** sempre matar o processo node (`Stop-Process -Name "node"`) e reiniciar após modificar `server.js`.

---

## Rotas da API (`backend/server.js`)

Todas as rotas (exceto login) exigem header `Authorization: Bearer <token>` ou query param `?token=<token>`.

| Método | Caminho | Descrição |
|---|---|---|
| POST | `/api/auth/login` | Login (público) |
| GET | `/api/pedidos` | Lista pedidos (colunas específicas) |
| POST | `/api/pedidos` | Cria pedido |
| PUT | `/api/pedidos/:id` | Atualiza pedido (auto-preenche datas por status) |
| DELETE | `/api/pedidos/:id` | Exclui pedido (limpa das rotas) |
| PUT | `/api/pedidos/:id/cancelar-motorista` | Motorista devolve pedido ao mural |
| PUT | `/api/pedidos/:id/deixar-para-depois` | Muda status para "pendente" |
| GET | `/api/motoristas` | Lista motoristas |
| POST | `/api/motoristas` | Cria motorista |
| PUT | `/api/motoristas/:id` | Atualiza motorista |
| DELETE | `/api/motoristas/:id` | Exclui motorista |
| GET | `/api/rotas` | Lista rotas |
| POST | `/api/rotas` | Cria rota |
| PUT | `/api/rotas/:id` | Atualiza rota |
| DELETE | `/api/rotas/:id` | Exclui rota |
| GET | `/api/configuracoes` | Retorna configurações (1 linha) |
| GET | `/api/usuarios` | Lista usuários (sem senha_hash) — suporta ?perfil= e ?ativo= |
| POST | `/api/usuarios` | Cria usuário (hash senha + espelho em motoristas) |
| PUT | `/api/usuarios/:id` | Edita usuário (sincroniza nome em motoristas) |
| DELETE | `/api/usuarios/:id` | Exclui usuário (cascata para motoristas) |
| PATCH | `/api/usuarios/:id/toggle` | Ativa/desativa usuário |
| GET | `/api/veiculos` | Lista veículos |
| POST | `/api/veiculos` | Cria veículo |
| PUT | `/api/veiculos/:id` | Atualiza veículo |
| DELETE | `/api/veiculos/:id` | Exclui veículo (protegido se tiver pedidos) |
| GET | `/api/relatorios` | Lista relatórios (supabaseAdmin) |
| POST | `/api/relatorios` | Cria relatório (supabaseAdmin) |
| DELETE | `/api/relatorios/:id` | Exclui relatório (supabaseAdmin) |
| GET | `/api/relatorios/:id/csv` | Download CSV — aceita `?token=` para links diretos |

---

## Carregamento de Scripts (ordem importante)

### `index.html` (admin)
```html
leaflet.min.js → chart.umd.min.js → icons.js → utils.js → data.js → storage.js → map.js → app.js
```

### `atendente.html`
```html
leaflet.min.js → icons.js → utils.js → atendente.js
```

### `motorista.html`
```html
leaflet.min.js → icons.js → utils.js → motorista.js
```

> `utils.js` deve sempre vir após `icons.js` (usa `Icons.sun/moon`) e antes dos scripts que dependem de `apiGet/showToast/etc`.

---

## sessionStorage — Chaves

| Chave | Conteúdo |
|---|---|
| `madcenter_token` | JWT token (expiração 8h) |
| `madcenter_perfil` | `"admin"` / `"atendente"` / `"motorista"` |
| `madcenter_nome` | Nome do usuário logado |

## localStorage — Chaves

| Chave | Conteúdo |
|---|---|
| `madcenter_tema` | `"dark"` / `"light"` |

---

## Pendências e Próximos Passos

### Funcionalidades futuras
- **Página pública de acompanhamento** — cliente acompanha entrega via link com código do pedido (sem login)
- **Impressão de romaneio** — PDF/print com lista de pedidos de uma rota
- **Notificações em tempo real** — Supabase Realtime para atualizar tela automaticamente quando status muda
- **Push notifications** — alertar motorista quando nova rota for atribuída
- **Deploy em produção** — Railway/Render para o backend, domínio próprio

### Melhorias técnicas
- Adicionar paginação na listagem de pedidos (hoje carrega tudo)
- Refresh token para não precisar logar novamente após 8h
- Testes automatizados nas rotas críticas do backend
- Compressão gzip nas respostas do Express
- Cache de geocodificação para não bater na API Nominatim repetidamente

### Débitos técnicos conhecidos
- `storage.js` ainda usa cache in-memory (`DB.cargas` etc.) — em caso de múltiplas abas, os caches podem dessincronizar
- O campo `codigo` de pedido não tem auto-incremento — é preenchido manualmente
- `rota_pedidos` é pouco usada e pode ser eliminada em favor de confiar só em `cargas_ids`
