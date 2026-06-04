[README.md](https://github.com/user-attachments/files/28577538/README.md)
# 🚚 Madcenter Entregas — Gestão Operacional de Entregas

> Plataforma web para gerenciamento de pedidos, rotas e motoristas de uma loja de construção em Timon/MA.

![Madcenter](https://img.shields.io/badge/Madcenter-Entregas-1c6b30?style=for-the-badge)
![Version](https://img.shields.io/badge/versão-1.0.0-green?style=for-the-badge)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=black)
![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=for-the-badge&logo=leaflet&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=for-the-badge&logo=chartdotjs&logoColor=white)

---

## 📋 Sobre o Projeto

O **Madcenter Entregas** é um sistema de gestão operacional desenvolvido para a **Madcenter Construção**, loja de materiais de construção localizada em Timon/MA. O sistema permite controlar pedidos, organizar rotas por proximidade geográfica, acompanhar motoristas em tempo real no mapa e gerar relatórios de entregas.

---

## ✨ Funcionalidades

### 📦 Pedidos
- Cadastro completo com busca de endereço via **CEP (ViaCEP)**
- Preenchimento automático de município, estado e endereço
- Seleção de localização no mapa com **geocodificação reversa**
- Autocomplete de municípios via **API do IBGE**
- Cálculo automático de frete por distância (**Haversine**, R$ 0,50/km)
- Máscara de telefone e validação de campos
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
- Traçado automático de rotas em sequência (ponto a ponto)
- Ponto de partida recalculado a partir da última entrega realizada
- Marcadores por status: 🟡 planejada · 🔵 em andamento · 🟢 concluída · 🔴 cancelada
- Filtros por status, motorista e cidade
- Atualização em tempo real após cada ação

### 🧑‍✈️ Motoristas
- Cadastro com categoria CNH e cidade de atuação
- Controle de disponibilidade direto na tabela (`disponível` / `em entrega`)
- Status atualizado automaticamente pelo fluxo de rotas
- Link de acesso à página mobile gerado com um clique

### 📱 Página do Motorista (Mobile)
- Tela exclusiva e simplificada para uso no celular
- Login por seleção de nome (sem senha)
- Lista de entregas do dia com detalhes completos
- Botões "✅ Entregue" e "📅 Deixar para depois"
- Barra de progresso das entregas
- Mapa com geolocalização em tempo real
- Botão "Abrir no Google Maps" para navegação

### 📊 Dashboard
- Gráfico de entregas realizadas por **hoje / semana / mês** (Chart.js)
- Cards de resumo: total de pedidos, motoristas ativos, rotas em andamento
- **Exportação de relatório CSV** com filtro de período
- Relatório inclui: código, cliente, material, destino, motorista, data, peso e frete

### ⚙️ Configurações
- Dados da empresa (nome, telefone, endereço)
- Coordenadas da loja base
- Parâmetros de cálculo de frete (custo por km, mínimo, fixo)
- Tema claro/escuro com persistência

---

## 🗂️ Estrutura do Projeto

```
RotasMadCenter/
├── backend/
│   ├── server.js          # API REST com Express + Supabase
│   ├── .env               # Variáveis de ambiente (não commitado)
│   └── package.json
├── frontend/
│   ├── index.html         # Painel administrativo principal
│   ├── login.html         # Tela de login
│   ├── motorista.html     # Página mobile do motorista
│   ├── assets/
│   │   └── logo_madcenter_white.svg
│   ├── css/
│   │   ├── style.css      # Estilos do painel admin
│   │   └── motorista.css  # Estilos da página mobile
│   └── js/
│       ├── app.js         # Lógica principal do painel
│       ├── storage.js     # Camada de dados (API calls + DB local)
│       ├── map.js         # Mapa de entregas (Leaflet)
│       ├── motorista.js   # Lógica da página do motorista
│       └── data.js        # Constantes, configs e dados base
```

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML5, CSS3, JavaScript (Vanilla) |
| Backend | Node.js + Express |
| Banco de Dados | Supabase (PostgreSQL) |
| Mapas | Leaflet.js + OpenStreetMap |
| Gráficos | Chart.js |
| CEP | ViaCEP API |
| Municípios | IBGE API |
| Distância | Algoritmo de Haversine |

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

Edite o `.env` com suas credenciais do Supabase:
```env
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_ANON_KEY=sua-chave-publica-aqui
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
http://localhost:3000
```

---

## 🗄️ Tabelas do Supabase

```sql
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
Novo Pedido cadastrado
        ↓
Sistema verifica rotas planejadas num raio de 3km
        ↓
┌─────────────────┬──────────────────────┐
│  Rota próxima   │   Sem rota próxima   │
│   encontrada    │                      │
│       ↓         │         ↓            │
│ Pedido adicionado│  Nova rota criada   │
│  à rota existente│  automaticamente    │
└─────────────────┴──────────────────────┘
        ↓
Motorista é vinculado à rota
        ↓
Status: planejada → em andamento
        ↓
Motorista acessa página mobile e realiza entregas
        ↓
Pedido marcado como "Entregue"
        ↓
Mapa recalcula rota a partir do ponto entregue
        ↓
Todos entregues → Rota "concluída" · Motorista "disponível"
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
