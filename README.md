# 🚚 Madcenter Entregas — Gestão Operacional de Entregas

> Plataforma web completa para gerenciamento de pedidos, rotas e motoristas de uma loja de construção em Timon/MA.

![Madcenter](https://img.shields.io/badge/Madcenter-Entregas-1c6b30?style=for-the-badge)
![Version](https://img.shields.io/badge/versão-1.0.0-green?style=for-the-badge)
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

O **Madcenter Entregas** é um sistema de gestão operacional desenvolvido para a **Madcenter Construção**, loja de materiais de construção localizada em Timon/MA. O sistema conecta atendentes, motoristas e administradores em um fluxo integrado: do cadastro do pedido até a confirmação da entrega, com rastreamento em tempo real no mapa.

---

## 👥 Perfis de Acesso

| Perfil | Tela | Função |
|--------|------|--------|
| **Admin** | Painel completo | Gerencia tudo — pedidos, rotas, motoristas, usuários e relatórios |
| **Atendente** | Tela exclusiva | Cadastra pedidos no balcão da loja |
| **Motorista** | Tela mobile | Visualiza e executa suas entregas do dia |

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
- Controle de status: `aguardando rota` → `em rota` → `entregue`

### 🛣️ Rotas
- **Criação automática** de rota ao salvar um pedido
- **Agrupamento inteligente**: pedidos a menos de 3km são agrupados na mesma rota
- Associação de motorista diretamente na tabela de rotas
- Atualização automática de status ao vincular motorista (`planejada` → `em andamento`)
- Modal "Ver pedidos" com ações de entrega por pedido
- Botão "Pendente para outro dia" para reagendamento

### 🗺️ Mapa de Entregas
- Mapa interativo com **Leaflet.js** e **OpenStreetMap**
- Traçado de rotas pelas **ruas reais** via **OSRM** (Open Source Routing Machine)
- Ponto de partida recalculado a partir da última entrega realizada
- Marcadores por status: planejada · em andamento · concluída · cancelada
- Filtros por status, motorista e cidade
- Atualização em tempo real após cada ação

### 🧑‍✈️ Motoristas
- Cadastro com categoria CNH e cidade de atuação
- Controle de disponibilidade direto na tabela
- Status atualizado automaticamente pelo fluxo de rotas
- Link de acesso à página mobile gerado com um clique

### 👩‍💼 Tela do Atendente
- Tela exclusiva e separada do painel admin
- Login com usuário e senha cadastrados no banco
- Cards de resumo: pedidos do dia, aguardando rota, em rota
- Formulário otimizado para cadastro rápido no balcão
- Seleção de localização no mapa igual ao painel admin
- Lista de pedidos cadastrados no dia

### 📱 Tela do Motorista (Mobile)
- Tela exclusiva e responsiva para uso no celular
- Login com usuário e senha do banco de dados
- Abas: **Minhas Entregas** e **Mural de Pedidos disponíveis**
- O motorista escolhe quais pedidos quer pegar
- Criação automática de rota ao aceitar pedidos
- Barra de progresso das entregas
- Mapa com rota real via OSRM e geolocalização própria em tempo real
- Botão "Abrir no Google Maps" para navegação
- Layout 2 colunas no desktop (pedidos + mapa lado a lado)

### 📊 Dashboard
- Gráfico de entregas realizadas por **hoje / semana / mês** (Chart.js)
- Cards de resumo: pedidos, motoristas, rotas e entregas
- **Exportação de relatório CSV** com filtro de período
- Relatório inclui: código, cliente, material, destino, motorista, data, peso e frete

### 🔐 Autenticação
- Login com **JWT** (JSON Web Token) para todos os perfis
- Senhas armazenadas com **bcrypt** (hash seguro)
- Gerenciamento de usuários pelo admin (criar, editar, ativar/desativar)
- Sem senhas hardcoded no código-fonte
- Token expira em 8 horas

### ⚙️ Configurações
- Dados da empresa (nome, telefone, endereço)
- Coordenadas da loja base
- Parâmetros de cálculo de frete (custo por km, mínimo, fixo)
- Tema claro/escuro com persistência nas três telas

---

## 🗂️ Estrutura do Projeto

```
RotasMadCenter/
├── backend/
│   ├── server.js              # API REST com Express + Supabase + JWT
│   ├── .env                   # Variáveis de ambiente (não commitado)
│   ├── .env.example           # Modelo de variáveis de ambiente
│   └── package.json
├── frontend/
│   ├── index.html             # Painel administrativo principal
│   ├── login.html             # Tela de login (admin)
│   ├── atendente.html         # Tela exclusiva do atendente
│   ├── motorista.html         # Tela mobile do motorista
│   ├── assets/
│   │   ├── favicon.svg               # Ícone da aba do navegador
│   │   ├── logo_madcenter.svg        # Logo colorida
│   │   └── logo_madcenter_white.svg  # Logo branca (sidebar)
│   ├── css/
│   │   ├── style.css          # Estilos do painel admin
│   │   ├── atendente.css      # Estilos da tela do atendente
│   │   └── motorista.css      # Estilos da tela do motorista
│   └── js/
│       ├── app.js             # Lógica principal do painel admin
│       ├── storage.js         # Camada de dados (API calls + cache local)
│       ├── map.js             # Mapa de entregas (Leaflet + OSRM)
│       ├── atendente.js       # Lógica da tela do atendente
│       ├── motorista.js       # Lógica da tela do motorista
│       ├── icons.js           # Biblioteca de ícones SVG próprios
│       └── data.js            # Constantes, configs e dados base
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
| Rotas reais | OSRM (Open Source Routing Machine) |
| Gráficos | Chart.js |
| CEP | ViaCEP API |
| Municípios | IBGE API |
| Distância | Algoritmo de Haversine |
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

Edite o `.env` com suas credenciais:
```env
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_ANON_KEY=sua-chave-publica-aqui
JWT_SECRET=sua-chave-secreta-aqui
PORT=3000
```

### 3. Instale as dependências
```bash
npm install
```

### 4. Inicie o servidor
```bash
node server.js
```

### 5. Acesse no navegador
```
http://localhost:3000                    # Painel Admin
http://localhost:3000/atendente.html     # Tela Atendente
http://localhost:3000/motorista.html     # Tela Motorista
```

---

## 🗄️ Tabelas do Supabase

```sql
-- Usuários do sistema (autenticação)
CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('admin', 'atendente', 'motorista')),
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMP DEFAULT now()
);

-- Pedidos
CREATE TABLE pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT,
  descricao TEXT,
  tipo TEXT,
  peso NUMERIC,
  volume TEXT,
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
  veiculo_tipo TEXT,
  distancia_km NUMERIC,
  valor_frete NUMERIC,
  status TEXT,
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
  tipo_rota TEXT,
  destino_municipio TEXT,
  destino_estado TEXT,
  motorista_id UUID REFERENCES motoristas(id),
  saida TIMESTAMP,
  chegada TIMESTAMP,
  distancia NUMERIC,
  frete_total NUMERIC,
  tempo TEXT,
  status TEXT DEFAULT 'planejada',
  observacoes TEXT,
  cargas_ids UUID[] DEFAULT '{}',
  criado_em TIMESTAMP DEFAULT now()
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
  entrega_moto TEXT,
  horario TEXT,
  tema TEXT
);
```

---

## 🔄 Fluxo Operacional

```
Atendente cadastra pedido no balcão
        ↓
Pedido fica com status "aguardando rota"
        ↓
Aparece no Mural de Pedidos para os motoristas
        ↓
Motorista escolhe o pedido e aceita
        ↓
Sistema cria rota automaticamente
(agrupa pedidos a menos de 3km na mesma rota)
        ↓
Status: planejada → em andamento
        ↓
Motorista sai para entrega
Mapa traça rota real pelas ruas (OSRM)
        ↓
Pedido marcado como "Entregue"
        ↓
Mapa recalcula a partir do ponto entregue
        ↓
Todos entregues → Rota "concluída" · Motorista "disponível"
        ↓
Admin acompanha tudo em tempo real no painel
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
