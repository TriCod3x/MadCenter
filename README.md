# 🚚 Madcenter Entregas — Gestão Operacional de Entregas

> Plataforma web completa para gerenciamento de pedidos, rotas e motoristas de uma loja de construção em José de Freitas/PI.

![Madcenter](https://img.shields.io/badge/Madcenter-Entregas-1c6b30?style=for-the-badge)
![Version](https://img.shields.io/badge/versão-2.0.0-green?style=for-the-badge)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=black)
![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=leaflet&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![OSRM](https://img.shields.io/badge/OSRM-7D4698?style=for-the-badge)

---

## 📋 Sobre o Projeto

O **Madcenter Entregas** é um sistema de gestão operacional desenvolvido para a **Madcenter Construção**, loja de materiais de construção localizada em José de Freitas/PI. O sistema conecta atendentes, motoristas e administradores em um fluxo integrado: do cadastro do pedido até a confirmação da entrega, com rastreamento em tempo real no mapa.

---

## 👥 Perfis de Acesso

| Perfil | Tela | Função |
|--------|------|--------|
| **Admin** | Painel completo | Gerencia tudo — pedidos, rotas, motoristas, veículos, usuários e relatórios |
| **Atendente** | Tela exclusiva | Cadastra e edita pedidos no balcão da loja |
| **Motorista** | Tela mobile | Visualiza, aceita e executa suas entregas do dia |

---

## ✨ Funcionalidades

### 📦 Pedidos
- Cadastro completo com busca de endereço via **CEP (ViaCEP)**
- Preenchimento automático de município, estado e endereço
- Seleção de localização no mapa com **geocodificação reversa**
- Autocomplete de municípios via **API do IBGE**
- Cálculo automático de frete por distância (**Haversine**)
- Máscara de telefone e validação de campos
- CEP obrigatório para garantir geolocalização correta
- Controle de status: `aguardando rota` → `disponivel` → `em rota` → `entregue`
- **Edição de pedidos pelo atendente** (exceto pedidos em rota ou entregues)
- Data de saída e entrega preenchidas automaticamente pelo sistema

### 🛣️ Rotas
- **Criação automática** de rota ao salvar um pedido
- **Agrupamento inteligente**: pedidos a menos de 3km são agrupados na mesma rota
- Associação de motorista diretamente na tabela de rotas
- Atualização automática de status ao vincular motorista (`planejada` → `em andamento`)
- Modal "Ver pedidos" com ações de entrega por pedido e veículo utilizado
- Proteção contra duplicação: pedido único por rota ativa
- Rota cancelada automaticamente ao excluir ou cancelar todos os pedidos vinculados
- Rota reutilizada ao cancelar e repegar o mesmo pedido (sem duplicação)

### 🗺️ Mapa de Entregas
- Mapa interativo com **Leaflet.js** e **OpenStreetMap**
- Traçado de rotas pelas **ruas reais** via **OSRM**
- Ponto de partida recalculado a partir da última entrega realizada
- Marcadores por status: planejada · em andamento · concluida · cancelada
- Filtros por status, motorista e cidade
- Legenda recolhível
- Zoom e posição preservados durante atualizações de dados

### 🧑‍✈️ Motoristas
- Cadastro com categoria CNH, cidade e estado de atuação
- Controle de disponibilidade direto na tabela
- Status atualizado automaticamente pelo fluxo de rotas
- Link de acesso à página mobile gerado com um clique

### 🚛 Veículos
- Gerenciamento completo dos tipos de veículo da frota
- Campos: nome, capacidade (kg), custo base (R$), custo por km e uso ideal
- CRUD completo: adicionar, editar e excluir veículos
- Proteção de exclusão: veículos vinculados a pedidos não podem ser removidos

### 👩‍💼 Tela do Atendente
- Tela exclusiva e separada do painel admin
- Login com usuário e senha cadastrados no banco
- Cards de resumo: pedidos do dia, aguardando rota, em rota, entregues hoje, total do mês
- Formulário otimizado para cadastro rápido no balcão (sem campo de veículo ou data)
- Seleção de localização no mapa igual ao painel admin
- Lista de pedidos cadastrados no dia com **opção de edição**
- **Tabela "Pedidos do Mês"** com busca e filtro por status
- Mini resumo estatístico do mês

### 📱 Tela do Motorista (Mobile)
- Tela exclusiva e responsiva para uso no celular
- Login com usuário e senha do banco de dados
- Abas: **Minhas Entregas** e **Mural de Pedidos disponíveis**
- O motorista escolhe quais pedidos quer pegar
- **Modal de seleção de veículo** ao aceitar pedido
- Criação automática de rota ao aceitar pedidos
- Barra de progresso das entregas
- Mapa com rota real via OSRM e geolocalização em tempo real
- Botão "Abrir no Google Maps" para navegação
- **Botão "Cancelar pedido"**: devolve ao mural sem criar nova rota
- **Botão "Deixar para depois"**: marca como `pendente` sem desvinculá-lo
- Layout 2 colunas no desktop

### 📊 Dashboard
- Gráfico de entregas realizadas por **hoje / semana / mês** (Chart.js) com fuso UTC-3
- Cards de resumo: pedidos, motoristas, rotas e entregas
- Últimos pedidos e rotas em destaque

### 📈 Relatórios
- Seção dedicada com histórico de todos os relatórios gerados
- Geração por período customizado com nome identificador
- Download CSV formatado para Excel brasileiro (separador `;`, BOM UTF-8)
- Botão "Baixar novamente" para qualquer relatório do histórico
- Dados nunca deletados — histórico permanente

### 🔐 Autenticação e Segurança
- Login com **JWT** para todos os perfis
- **Middleware JWT** protegendo todas as rotas da API
- Senhas armazenadas com **bcrypt**
- Token expira em 8 horas
- `supabaseAdmin` (service key) usado em todas as operações de servidor

### ⚙️ Configurações
- Dados da empresa, coordenadas da loja base
- Parâmetros de cálculo de frete
- Tema claro/escuro com persistência nas três telas

---

## 🗂️ Estrutura do Projeto

```
RotasMadCenter/
├── backend/
│   ├── server.js
│   ├── .env                   # Não commitado
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── index.html             # Painel admin
│   ├── login.html
│   ├── atendente.html
│   ├── motorista.html
│   ├── assets/
│   ├── css/
│   │   ├── style.css
│   │   ├── atendente.css
│   │   └── motorista.css
│   └── js/
│       ├── app.js             # Lógica do painel admin
│       ├── storage.js         # Camada de dados
│       ├── map.js             # Mapa (Leaflet + OSRM)
│       ├── atendente.js
│       ├── motorista.js
│       ├── utils.js           # Funções compartilhadas (toast, tema, API, CEP)
│       ├── icons.js           # Ícones SVG próprios
│       └── data.js            # Constantes e configs
└── memoria/
    └── HISTORICO.md           # Histórico de decisões e alterações
```

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML5, CSS3, JavaScript (Vanilla) |
| Backend | Node.js + Express |
| Banco de Dados | Supabase (PostgreSQL) |
| Autenticação | JWT + bcrypt |
| Mapas | Leaflet.js + OpenStreetMap |
| Rotas reais | OSRM |
| Gráficos | Chart.js |
| CEP | ViaCEP API |
| Municípios | IBGE API |
| Distância | Haversine |
| Ícones | SVG próprios (icons.js) |

---

## 🚀 Como Rodar Localmente

### Pré-requisitos
- Node.js 18+
- Conta no [Supabase](https://supabase.com)

### 1. Clone o repositório
```bash
git clone https://github.com/TriCod3x/MadCenter.git
cd MadCenter
```

### 2. Configure o ambiente
```bash
cd backend
cp .env.example .env
```

Edite o `.env`:
```env
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_ANON_KEY=sua-chave-anonima-aqui
SUPABASE_SERVICE_KEY=sua-chave-service-role-aqui
JWT_SECRET=sua-chave-secreta-jwt-aqui
PORT=3001
```

### 3. Instale e inicie
```bash
npm install
npm start
```

### 4. Acesse
```
http://localhost:3001                    # Painel Admin
http://localhost:3001/atendente.html     # Tela Atendente
http://localhost:3001/motorista.html     # Tela Motorista
```

---

## 🗄️ Tabelas do Supabase

```sql
-- Admin
CREATE TABLE admin_auth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL
);

-- Usuários (atendentes e motoristas)
CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('admin', 'atendente', 'motorista')),
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMP DEFAULT now()
);

-- Veículos
CREATE TABLE veiculos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  capacidade NUMERIC,
  custo_base NUMERIC,
  custo_km NUMERIC,
  uso TEXT
);

-- Pedidos
CREATE TABLE pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT,
  descricao TEXT,
  tipo TEXT,
  peso NUMERIC,
  cep TEXT,
  destino_municipio TEXT,
  destino_estado TEXT,
  endereco_entrega TEXT,
  numero TEXT,
  complemento TEXT,
  cliente TEXT,
  telefone TEXT,
  coleta TIMESTAMP,
  entrega TIMESTAMP,
  prioridade TEXT,
  veiculo_tipo TEXT REFERENCES veiculos(id),
  distancia_km NUMERIC,
  valor_frete NUMERIC,
  status TEXT CHECK (status = ANY (ARRAY[
    'aguardando rota','em rota','entregue','cancelado','disponivel','pendente'
  ])),
  observacoes TEXT,
  lat NUMERIC,
  lng NUMERIC,
  criado_em TIMESTAMP DEFAULT now()
);

-- Motoristas
CREATE TABLE motoristas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT,
  telefone TEXT,
  categoria TEXT,
  capacidade NUMERIC DEFAULT 0,
  cidade TEXT,
  estado TEXT,
  status TEXT DEFAULT 'disponível',
  observacoes TEXT
);

-- Rotas
CREATE TABLE rotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT,
  nome TEXT,
  destino_municipio TEXT,
  destino_estado TEXT,
  motorista_id UUID REFERENCES motoristas(id),
  distancia NUMERIC,
  frete_total NUMERIC,
  status TEXT DEFAULT 'planejada' CHECK (status = ANY (ARRAY[
    'planejada','em andamento','concluida','cancelada'
  ])),
  observacoes TEXT,
  cargas_ids UUID[] DEFAULT '{}',
  criado_em TIMESTAMP DEFAULT now()
);

-- Junção rota-pedidos
CREATE TABLE rota_pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id UUID REFERENCES rotas(id),
  pedido_id UUID REFERENCES pedidos(id) UNIQUE
);

-- Municípios
CREATE TABLE municipios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT,
  estado TEXT,
  lat NUMERIC,
  lng NUMERIC
);

-- Configurações
CREATE TABLE configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa TEXT,
  telefone TEXT,
  endereco TEXT,
  cidade_base TEXT,
  estado TEXT,
  latitude_loja NUMERIC,
  longitude_loja NUMERIC,
  custo_km NUMERIC,
  custo_adicional_fixo NUMERIC,
  frete_minimo NUMERIC,
  tema TEXT
);

-- Relatórios
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

## 🔄 Fluxo Operacional

```
Atendente cadastra pedido
        ↓
Status: "aguardando rota" → sistema cria rota → "disponivel"
        ↓
Aparece no Mural de Pedidos
        ↓
Motorista escolhe pedido → seleciona veículo → aceita
        ↓
Data de saída registrada · Rota: planejada → em andamento
        ↓
Motorista realiza entrega com mapa OSRM
        ↓
"Entregue" → data registrada · Rota: concluida
        ↓
Admin acompanha em tempo real · Gera relatório CSV
```

---

## 👥 Contribuidores

| Nome | GitHub |
|------|--------|
| João William | [@zJoaozz](https://github.com/zJoaozz) |
| Ítalo Gabriel | [@italogabriel7](https://github.com/italogabriel7) |

---

## 📄 Licença

Este projeto é de uso interno da **Madcenter Construção**. Todos os direitos reservados.
