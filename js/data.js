const STORE_LOCATION = {
  name: "Madcenter Construção",
  city: "Timon",
  state: "MA",
  lat: -4.760287,
  lng: -42.573777
};

const VEHICLE_TYPES = [
  { id: "moto", nome: "Moto", capacidade: 20, custoBase: 8, custoKm: 1.2, uso: "entregas pequenas e rápidas" },
  { id: "caminhonete", nome: "Caminhonete", capacidade: 500, custoBase: 25, custoKm: 2.5, uso: "entregas médias" },
  { id: "bau-leve", nome: "Caminhão baú leve", capacidade: 1500, custoBase: 60, custoKm: 4, uso: "materiais protegidos de chuva" },
  { id: "tres-quartos", nome: "Caminhão 3/4", capacidade: 3000, custoBase: 90, custoKm: 5.5, uso: "cargas maiores" },
  { id: "carroceria-aberta", nome: "Caminhão carroceria aberta", capacidade: 5000, custoBase: 120, custoKm: 6.5, uso: "materiais de construção volumosos" },
  { id: "carga-pesada", nome: "Caminhão carga pesada", capacidade: 10000, custoBase: 200, custoKm: 9, uso: "grandes volumes e cargas pesadas" }
];

const MUNICIPIOS_COORDS = {
  "timon-ma": { nome: "Timon", estado: "MA", lat: -4.760287, lng: -42.573777 },
  "teresina-pi": { nome: "Teresina", estado: "PI", lat: -5.0892, lng: -42.8016 },
  "caxias-ma": { nome: "Caxias", estado: "MA", lat: -4.8589, lng: -43.3561 },
  "codo-ma": { nome: "Codó", estado: "MA", lat: -4.4556, lng: -43.8924 },
  "campo maior-pi": { nome: "Campo Maior", estado: "PI", lat: -4.8278, lng: -42.1686 },
  "parnaiba-pi": { nome: "Parnaíba", estado: "PI", lat: -2.9055, lng: -41.7754 },
  "sao luis-ma": { nome: "São Luís", estado: "MA", lat: -2.5307, lng: -44.3068 },
  "floriano-pi": { nome: "Floriano", estado: "PI", lat: -6.7669, lng: -43.0224 },
  "altos-pi": { nome: "Altos", estado: "PI", lat: -5.0397, lng: -42.4617 },
  "coelho neto-ma": { nome: "Coelho Neto", estado: "MA", lat: -4.2524, lng: -43.0108 },
  "jose de freitas-pi": { nome: "José de Freitas", estado: "PI", lat: -4.7564, lng: -42.5756 }
};

const DEFAULT_SETTINGS = {
  empresa: "Madcenter Construção",
  segmento: "Loja de construção",
  telefone: "(86) 99999-4500",
  endereco: "Sede Madcenter - Timon/MA",
  cidadeBase: STORE_LOCATION.city,
  estado: STORE_LOCATION.state,
  latitudeLoja: STORE_LOCATION.lat,
  longitudeLoja: STORE_LOCATION.lng,
  custoKm: 4.6,
  custoAdicionalFixo: 0,
  entregaMoto: "sim",
  freteMinimo: 10,
  horario: "Segunda a sábado, 7h às 18h",
  tema: "light"
};

const SEED_DATA = {
  cargas: [
    {
      id: "car-001", codigo: "PD-1001", descricao: "20 latas de tinta acrílica Suvinil e acessórios", tipo: "Tintas", peso: 620, volume: "18 volumes",
      origemMunicipio: "Timon", origemEstado: "MA", origemEmpresa: "Madcenter Construção", origemLat: STORE_LOCATION.lat, origemLng: STORE_LOCATION.lng,
      enderecoColeta: "Madcenter Construção - Setor de tintas", destinoMunicipio: "Teresina", destinoEstado: "PI", enderecoEntrega: "Av. Jóquei Clube, 880",
      cliente: "Fernanda Lima", telefone: "(86) 97777-4433", coleta: "2026-05-15", entrega: "2026-05-15",
      prioridade: "normal", veiculoTipo: "bau-leve", distanciaKm: 44.4, valorFrete: 237.6, status: "em rota", observacoes: "Rota com materiais elétricos."
    },
    {
      id: "car-002", codigo: "PD-1002", descricao: "Materiais elétricos para obra", tipo: "Elétrica", peso: 220, volume: "8 caixas",
      origemMunicipio: "Timon", origemEstado: "MA", origemEmpresa: "Madcenter Construção", origemLat: STORE_LOCATION.lat, origemLng: STORE_LOCATION.lng,
      enderecoColeta: "Madcenter Construção - Elétrica", destinoMunicipio: "Teresina", destinoEstado: "PI", enderecoEntrega: "Condomínio Solar Leste",
      cliente: "Carlos Andrade", telefone: "(86) 98888-1001", coleta: "2026-05-15", entrega: "2026-05-15",
      prioridade: "alta", veiculoTipo: "bau-leve", distanciaKm: 44.4, valorFrete: 237.6, status: "em rota", observacoes: "Entregar junto com tintas."
    },
    {
      id: "car-003", codigo: "PD-1003", descricao: "Kit hidráulico residencial completo", tipo: "Hidráulica", peso: 380, volume: "12 caixas",
      origemMunicipio: "Timon", origemEstado: "MA", origemEmpresa: "Madcenter Construção", origemLat: STORE_LOCATION.lat, origemLng: STORE_LOCATION.lng,
      enderecoColeta: "Madcenter Construção - Hidráulica", destinoMunicipio: "Caxias", destinoEstado: "MA", enderecoEntrega: "Canteiro Vale Verde, BR-316",
      cliente: "Construtora Vale Verde", telefone: "(99) 98111-2200", coleta: "2026-05-16", entrega: "2026-05-16",
      prioridade: "normal", veiculoTipo: "caminhonete", distanciaKm: 87.2, valorFrete: 243, status: "aguardando rota", observacoes: "Itens conferidos por obra."
    },
    {
      id: "car-004", codigo: "PD-1004", descricao: "Ferramentas manuais e equipamentos", tipo: "Ferramentas", peso: 90, volume: "5 caixas",
      origemMunicipio: "Timon", origemEstado: "MA", origemEmpresa: "Madcenter Construção", origemLat: STORE_LOCATION.lat, origemLng: STORE_LOCATION.lng,
      enderecoColeta: "Madcenter Construção - Ferramentas", destinoMunicipio: "Caxias", destinoEstado: "MA", enderecoEntrega: "Rua 1, lote 22",
      cliente: "Construtora Vale Verde", telefone: "(99) 98111-2200", coleta: "2026-05-16", entrega: "2026-05-16",
      prioridade: "normal", veiculoTipo: "caminhonete", distanciaKm: 87.2, valorFrete: 243, status: "aguardando rota", observacoes: "Pode ir com kit hidráulico."
    },
    {
      id: "car-005", codigo: "PD-1005", descricao: "15 caixas de piso cerâmico", tipo: "Pisos e revestimentos", peso: 980, volume: "15 caixas",
      origemMunicipio: "Timon", origemEstado: "MA", origemEmpresa: "Madcenter Construção", origemLat: STORE_LOCATION.lat, origemLng: STORE_LOCATION.lng,
      enderecoColeta: "Madcenter Construção - Acabamento", destinoMunicipio: "Codó", destinoEstado: "MA", enderecoEntrega: "Residencial Nova Vida, Quadra 4",
      cliente: "Residencial Nova Vida", telefone: "(99) 99910-0010", coleta: "2026-05-17", entrega: "2026-05-17",
      prioridade: "urgente", veiculoTipo: "tres-quartos", distanciaKm: 154.1, valorFrete: 937.6, status: "aguardando rota", observacoes: "Material frágil."
    },
    {
      id: "car-006", codigo: "PD-1006", descricao: "Argamassa e rejunte", tipo: "Cimento e argamassa", peso: 1100, volume: "2 pallets",
      origemMunicipio: "Timon", origemEstado: "MA", origemEmpresa: "Madcenter Construção", origemLat: STORE_LOCATION.lat, origemLng: STORE_LOCATION.lng,
      enderecoColeta: "Madcenter Construção - Depósito", destinoMunicipio: "Codó", destinoEstado: "MA", enderecoEntrega: "Residencial Nova Vida, Quadra 4",
      cliente: "Residencial Nova Vida", telefone: "(99) 99910-0010", coleta: "2026-05-17", entrega: "2026-05-17",
      prioridade: "alta", veiculoTipo: "tres-quartos", distanciaKm: 154.1, valorFrete: 937.6, status: "aguardando rota", observacoes: "Parada em Caxias antes do destino."
    },
    {
      id: "car-007", codigo: "PD-1007", descricao: "Pequena entrega de ferramentas", tipo: "Ferramentas", peso: 12, volume: "1 caixa",
      origemMunicipio: "Timon", origemEstado: "MA", origemEmpresa: "Madcenter Construção", origemLat: STORE_LOCATION.lat, origemLng: STORE_LOCATION.lng,
      enderecoColeta: "Madcenter Construção - Balcão", destinoMunicipio: "Teresina", destinoEstado: "PI", enderecoEntrega: "Rua das Palmeiras, 430",
      cliente: "Carlos Andrade", telefone: "(86) 98888-1001", coleta: "2026-05-15", entrega: "2026-05-15",
      prioridade: "urgente", veiculoTipo: "moto", distanciaKm: 44.4, valorFrete: 61.28, status: "em rota", observacoes: "Entrega rápida por moto."
    },
    {
      id: "car-008", codigo: "PD-1008", descricao: "Tubos PVC e conexões", tipo: "Hidráulica", peso: 160, volume: "10 volumes",
      origemMunicipio: "Timon", origemEstado: "MA", origemEmpresa: "Madcenter Construção", origemLat: STORE_LOCATION.lat, origemLng: STORE_LOCATION.lng,
      enderecoColeta: "Madcenter Construção - Hidráulica", destinoMunicipio: "José de Freitas", destinoEstado: "PI", enderecoEntrega: "Rua Central, 77",
      cliente: "João Materiais", telefone: "(86) 98222-3030", coleta: "2026-05-13", entrega: "2026-05-14",
      prioridade: "baixa", veiculoTipo: "caminhonete", distanciaKm: 2.1, valorFrete: 30.25, status: "entregue", observacoes: "Entrega finalizada."
    }
  ],
  motoristas: [
    { id: "mot-001", nome: "Francisco Moura", telefone: "(86) 99921-4432", documento: "123.456.789-10", cnh: "04588912300", categoria: "D", cidade: "Timon", estado: "MA", status: "em entrega", observacoes: "Responsável por entregas urbanas e Teresina." },
    { id: "mot-002", nome: "Raimundo Alves", telefone: "(99) 98845-1122", documento: "234.567.891-00", cnh: "05512398745", categoria: "D", cidade: "Timon", estado: "MA", status: "disponível", observacoes: "Disponível para entregas regionais." },
    { id: "mot-003", nome: "José Pereira", telefone: "(86) 97718-5544", documento: "345.678.912-11", cnh: "06677712340", categoria: "E", cidade: "Caxias", estado: "MA", status: "disponível", observacoes: "Experiência com carga pesada." },
    { id: "mot-004", nome: "Marcos Lima", telefone: "(98) 99654-3300", documento: "456.789.123-22", cnh: "07732145698", categoria: "A", cidade: "Timon", estado: "MA", status: "em entrega", observacoes: "Entregas rápidas de moto." }
  ],
  caminhoes: [
    { id: "cam-001", placa: "MDC4C21", marca: "Mercedes-Benz", modelo: "Caminhão baú leve", ano: 2021, carroceria: "Baú leve", capacidade: 3500, cidade: "Timon", estado: "MA", status: "em rota", motoristaId: "mot-001", observacoes: "Ideal para tintas, elétrica e ferramentas." },
    { id: "cam-002", placa: "MAD8J44", marca: "Fiat", modelo: "Caminhonete", ano: 2022, carroceria: "Caminhonete", capacidade: 500, cidade: "Timon", estado: "MA", status: "disponível", motoristaId: "mot-002", observacoes: "Entregas médias." },
    { id: "cam-003", placa: "CTR2F19", marca: "Ford", modelo: "Caminhão 3/4", ano: 2019, carroceria: "Carga seca", capacidade: 5000, cidade: "Timon", estado: "MA", status: "disponível", motoristaId: "mot-003", observacoes: "Bom para rotas intermunicipais." },
    { id: "cam-004", placa: "MOT0A12", marca: "Honda", modelo: "Moto entrega rápida", ano: 2023, carroceria: "Baú de moto", capacidade: 20, cidade: "Timon", estado: "MA", status: "em rota", motoristaId: "mot-004", observacoes: "Pequenas entregas." }
  ],
  rotas: [
    {
      id: "rot-001", codigo: "RT-2001", nome: "Rota Teresina - Tintas e elétrica",
      origemMunicipio: "Timon", origemEstado: "MA", destinoMunicipio: "Teresina", destinoEstado: "PI",
      paradas: "", cargasIds: ["car-001", "car-002"], caminhaoId: "cam-001", motoristaId: "mot-001", veiculoTipo: "bau-leve",
      saida: "2026-05-15T08:00", chegada: "2026-05-15T12:00", distancia: 44.4, freteTotal: 237.6, tempo: "1h20", custo: 237.6,
      status: "em andamento", observacoes: "Tintas e materiais elétricos para Teresina."
    },
    {
      id: "rot-002", codigo: "RT-2002", nome: "Rota Caxias - Hidráulica e ferramentas",
      origemMunicipio: "Timon", origemEstado: "MA", destinoMunicipio: "Caxias", destinoEstado: "MA",
      paradas: "", cargasIds: ["car-003", "car-004"], caminhaoId: "cam-002", motoristaId: "mot-002", veiculoTipo: "caminhonete",
      saida: "2026-05-16T07:30", chegada: "2026-05-16T11:00", distancia: 87.2, freteTotal: 243, tempo: "1h45", custo: 243,
      status: "planejada", observacoes: "Kit hidráulico e ferramentas."
    },
    {
      id: "rot-003", codigo: "RT-2003", nome: "Rota Codó via Caxias - Pisos e argamassa",
      origemMunicipio: "Timon", origemEstado: "MA", destinoMunicipio: "Codó", destinoEstado: "MA",
      paradas: "Caxias", cargasIds: ["car-005", "car-006"], caminhaoId: "cam-003", motoristaId: "mot-003", veiculoTipo: "tres-quartos",
      saida: "2026-05-17T06:30", chegada: "2026-05-17T15:30", distancia: 154.1, freteTotal: 937.6, tempo: "4h10", custo: 937.6,
      status: "planejada", observacoes: "Parada em Caxias antes do destino final."
    },
    {
      id: "rot-004", codigo: "RT-2004", nome: "Rota rápida Teresina - Moto",
      origemMunicipio: "Timon", origemEstado: "MA", destinoMunicipio: "Teresina", destinoEstado: "PI",
      paradas: "", cargasIds: ["car-007"], caminhaoId: "cam-004", motoristaId: "mot-004", veiculoTipo: "moto",
      saida: "2026-05-15T09:00", chegada: "2026-05-15T10:30", distancia: 44.4, freteTotal: 61.28, tempo: "1h05", custo: 61.28,
      status: "em andamento", observacoes: "Pequena entrega de ferramentas."
    }
  ]
};
