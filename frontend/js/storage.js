let DB = {
  cargas: [],
  motoristas: [],
  rotas: [],
  settings: {}
};

async function apiGet(url) {
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
  return json;
}

async function apiPost(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
  return json;
}

async function apiPut(url, data) {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
  return json;
}

async function apiDelete(url) {
  const response = await fetch(url, { method: "DELETE" });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
  return json;
}

function pedidoFromDB(p) {
  return {
    id: p.id,
    codigo: p.codigo,
    descricao: p.descricao,
    tipo: p.tipo,
    peso: p.peso,
    volume: p.volume,
    cep: p.cep,
    destinoMunicipio: p.destino_municipio,
    destinoEstado: p.destino_estado,
    enderecoEntrega: p.endereco_entrega,
    numero: p.numero,
    complemento: p.complemento,
    cliente: p.cliente,
    telefone: p.telefone,
    coleta: p.coleta,
    entrega: p.entrega,
    prioridade: p.prioridade,
    veiculoTipo: p.veiculo_tipo,
    distanciaKm: p.distancia_km,
    valorFrete: p.valor_frete,
    status: p.status,
    observacoes: p.observacoes,
    lat: p.lat ? Number(p.lat) : null,
    lng: p.lng ? Number(p.lng) : null,
    dataEntrega: p.data_entrega || null
  };
}

function pedidoToDB(p) {
  return {
    ...(p.codigo ? { codigo: p.codigo } : {}),
    descricao: p.descricao,
    tipo: p.tipo,
    peso: Number(p.peso || 0),
    volume: p.volume,
    cep: p.cep || null,
    destino_municipio: p.destinoMunicipio,
    destino_estado: p.destinoEstado,
    endereco_entrega: p.enderecoEntrega,
    numero: p.numero || null,
    complemento: p.complemento || null,
    cliente: p.cliente,
    telefone: p.telefone,
    coleta: p.coleta || null,
    entrega: p.entrega || null,
    prioridade: p.prioridade,
    veiculo_tipo: p.veiculoTipo,
    distancia_km: Number(p.distanciaKm || 0),
    valor_frete: Number(p.valorFrete || 0),
    status: p.status,
    observacoes: p.observacoes,
    lat: p.lat || null,
    lng: p.lng || null,
    data_entrega: p.dataEntrega || null
  };
}

function motoristaFromDB(m) {
  return {
    id: m.id,
    nome: m.nome,
    telefone: m.telefone,
    categoria: m.categoria,
    capacidade: m.capacidade,
    cidade: m.cidade,
    estado: m.estado,
    status: m.status,
    observacoes: m.observacoes
  };
}

function motoristaToDB(m) {
  return {
    nome: m.nome,
    telefone: m.telefone,
    categoria: m.categoria,
    capacidade: Number(m.capacidade || 0),
    cidade: m.cidade,
    estado: m.estado,
    status: m.status,
    observacoes: m.observacoes
  };
}

function rotaFromDB(r) {
  return {
    id: r.id,
    codigo: r.codigo,
    nome: r.nome,
    tipoRota: r.tipo_rota,
    destinoMunicipio: r.destino_municipio,
    destinoEstado: r.destino_estado,
    motoristaId: r.motorista_id,
    saida: r.saida,
    chegada: r.chegada,
    distancia: r.distancia,
    freteTotal: r.frete_total,
    tempo: r.tempo,
    status: r.status,
    observacoes: r.observacoes,
    cargasIds: Array.isArray(r.cargas_ids) ? r.cargas_ids : []
  };
}

function rotaToDB(r) {
  return {
    nome: r.nome,
    tipo_rota: r.tipoRota,
    destino_municipio: r.destinoMunicipio,
    destino_estado: r.destinoEstado,
    motorista_id: r.motoristaId || null,
    saida: r.saida || null,
    chegada: r.chegada || null,
    distancia: Number(r.distancia || 0),
    frete_total: Number(r.freteTotal || 0),
    tempo: r.tempo || null,
    status: r.status,
    observacoes: r.observacoes,
    cargas_ids: Array.isArray(r.cargasIds) ? r.cargasIds : []
  };
}

async function initStorage() {
  const pedidos = await apiGet(`${API_BASE}/api/pedidos`);
  const motoristas = await apiGet(`${API_BASE}/api/motoristas`);
  const rotas = await apiGet(`${API_BASE}/api/rotas`);
  const settings = await apiGet(`${API_BASE}/api/configuracoes`);

  DB.cargas = Array.isArray(pedidos) ? pedidos.map(pedidoFromDB) : [];
  DB.motoristas = Array.isArray(motoristas) ? motoristas.map(motoristaFromDB) : [];
  DB.rotas = Array.isArray(rotas) ? rotas.map(rotaFromDB) : [];
  DB.settings = settings || {};
}

function getCargas() {
  return DB.cargas;
}

async function saveCarga(data) {
  const novo = await apiPost(`${API_BASE}/api/pedidos`, pedidoToDB(data));
  const convertido = pedidoFromDB(novo);
  DB.cargas.push(convertido);
  return convertido;
}

async function updateCarga(id, partialData) {
  const existing = DB.cargas.find((item) => item.id === id);
  const merged = { ...existing, ...partialData };
  const atualizado = await apiPut(`${API_BASE}/api/pedidos/${id}`, pedidoToDB(merged));
  const convertido = pedidoFromDB(atualizado);
  DB.cargas = DB.cargas.map((item) => item.id === id ? convertido : item);
  return convertido;
}

async function deleteCarga(id) {
  await apiDelete(`${API_BASE}/api/pedidos/${id}`);
  DB.cargas = DB.cargas.filter((item) => item.id !== id);
}

function getMotoristas() {
  return DB.motoristas;
}

async function saveMotorista(data) {
  const novo = await apiPost(`${API_BASE}/api/motoristas`, motoristaToDB(data));
  const convertido = motoristaFromDB(novo);
  DB.motoristas.push(convertido);
  return convertido;
}

async function updateMotorista(id, partialData) {
  const existing = DB.motoristas.find((item) => item.id === id);
  const merged = { ...existing, ...partialData };
  const atualizado = await apiPut(`${API_BASE}/api/motoristas/${id}`, motoristaToDB(merged));
  const convertido = motoristaFromDB(atualizado);
  DB.motoristas = DB.motoristas.map((item) => item.id === id ? convertido : item);
  return convertido;
}

async function deleteMotorista(id) {
  await apiDelete(`${API_BASE}/api/motoristas/${id}`);
  DB.motoristas = DB.motoristas.filter((item) => item.id !== id);
}

function getRotas() {
  return DB.rotas;
}

async function saveRota(data) {
  const novo = await apiPost(`${API_BASE}/api/rotas`, rotaToDB(data));
  const convertido = rotaFromDB(novo);
  DB.rotas.push(convertido);
  return convertido;
}

async function updateRota(id, partialData) {
  const existing = DB.rotas.find((item) => item.id === id);
  const merged = { ...existing, ...partialData };
  const atualizado = await apiPut(`${API_BASE}/api/rotas/${id}`, rotaToDB(merged));
  const convertido = rotaFromDB(atualizado);
  DB.rotas = DB.rotas.map((item) => item.id === id ? convertido : item);
  return convertido;
}

async function deleteRota(id) {
  await apiDelete(`${API_BASE}/api/rotas/${id}`);
  DB.rotas = DB.rotas.filter((item) => item.id !== id);
}

function getSettings() {
  return {
    ...DEFAULT_SETTINGS,
    empresa: DB.settings.empresa || DEFAULT_SETTINGS.empresa,
    telefone: DB.settings.telefone || DEFAULT_SETTINGS.telefone,
    endereco: DB.settings.endereco || DEFAULT_SETTINGS.endereco,
    cidadeBase: DB.settings.cidade_base || DEFAULT_SETTINGS.cidadeBase,
    estado: DB.settings.estado || DEFAULT_SETTINGS.estado,
    latitudeLoja: DB.settings.latitude_loja || DEFAULT_SETTINGS.latitudeLoja,
    longitudeLoja: DB.settings.longitude_loja || DEFAULT_SETTINGS.longitudeLoja,
    custoKm: DB.settings.custo_km || DEFAULT_SETTINGS.custoKm,
    custoAdicionalFixo: DB.settings.custo_adicional_fixo || DEFAULT_SETTINGS.custoAdicionalFixo,
    freteMinimo: DB.settings.frete_minimo || DEFAULT_SETTINGS.freteMinimo,
    entregaMoto: DB.settings.entrega_moto || DEFAULT_SETTINGS.entregaMoto,
    horario: DB.settings.horario || DEFAULT_SETTINGS.horario,
    tema: DB.settings.tema || DEFAULT_SETTINGS.tema
  };
}

function saveSettings(data) {
  DB.settings = { ...DB.settings, ...data };
}

function clearAllData() {
  console.warn("clearAllData desativado usando Supabase.");
}

function resetToEmptyData() {
  console.warn("resetToEmptyData desativado usando Supabase.");
}
