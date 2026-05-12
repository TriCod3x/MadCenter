const App = {
  page: "dashboard",
  modal: { entity: null, mode: null, id: null },
  mapFilters: { status: "todos", driver: "todos", truck: "todos", city: "todos", vehicleType: "todos" },
  mapLayers: {
    showStore: true,
    showPending: true,
    showInProgress: true,
    showCompleted: true,
    showPlannedRoutes: true,
    showActiveRoutes: true,
    showCompletedRoutes: true,
    showDrivers: true,
    showLegend: true
  }
};

const pageNames = {
  dashboard: "Dashboard",
  cargas: "Pedidos/Cargas",
  motoristas: "Motoristas",
  caminhoes: "Caminhões",
  rotas: "Rotas",
  mapa: "Mapa de Entregas",
  unificar: "Unificar Entregas",
  clientes: "Clientes",
  configuracoes: "Configurações"
};

const statusColors = {
  "aguardando separação": "yellow",
  "aguardando rota": "orange",
  "em rota": "blue",
  entregue: "green",
  cancelado: "red",
  disponível: "green",
  "em entrega": "blue",
  inativo: "gray",
  manutenção: "orange",
  planejada: "yellow",
  "em andamento": "blue",
  concluída: "green",
  cancelada: "red",
  baixa: "gray",
  normal: "blue",
  alta: "orange",
  urgente: "red"
};

const metricIcons = ["▣", "!", "▰", "✓", "◉", "▰", "⌁", "⇄"];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const fields = {
  cargas: [
    ["descricao", "Produto/material", "text", true],
    ["tipo", "Categoria do material", "select:Cimento e argamassa,Tintas,Elétrica,Hidráulica,Ferramentas,Iluminação,Pisos e revestimentos,Madeiras,Acabamento,Outros", true],
    ["peso", "Peso aproximado em kg", "number", true],
    ["volume", "Volume", "text", false],
    ["destinoMunicipio", "Destino com seleção de município cadastrado", "city", true],
    ["enderecoEntrega", "Endereço de entrega", "text", true],
    ["cliente", "Cliente", "text", true],
    ["telefone", "Telefone/WhatsApp do cliente", "text", true],
    ["coleta", "Data prevista de saída", "date", true],
    ["entrega", "Data prevista de entrega", "date", true],
    ["prioridade", "Prioridade", "select:baixa,normal,alta,urgente", true],
    ["veiculoTipo", "Tipo de veículo da entrega", "vehicle", true],
    ["distanciaKm", "Distância estimada em km", "number", false],
    ["valorFrete", "Valor do frete", "number", true],
    ["status", "Status", "select:aguardando separação,aguardando rota,em rota,entregue,cancelado", true],
    ["observacoes", "Observações", "textarea", false]
  ],
  motoristas: [
    ["nome", "Nome", "text", true], ["telefone", "WhatsApp", "text", true],
    ["documento", "CPF ou documento", "text", true], ["cnh", "CNH", "text", true],
    ["categoria", "Categoria", "select:B,C,D,E", true], ["cidade", "Cidade atual", "text", true],
    ["estado", "Estado atual", "text", true], ["status", "Status", "select:disponível,em entrega,inativo", true],
    ["observacoes", "Observações", "textarea", false]
  ],
  caminhoes: [
    ["placa", "Placa", "text", true], ["marca", "Marca", "text", true], ["modelo", "Modelo", "text", true],
    ["ano", "Ano", "number", true], ["carroceria", "Tipo de carroceria", "text", true],
    ["capacidade", "Capacidade em kg", "number", true], ["cidade", "Cidade atual", "text", true],
    ["estado", "Estado atual", "text", true], ["status", "Status", "select:disponível,em rota,manutenção,inativo", true],
    ["motoristaId", "Motorista vinculado", "driver", false], ["observacoes", "Observações", "textarea", false]
  ],
  rotas: [
    ["nome", "Nome da rota", "text", true], ["destinoMunicipio", "Cidade de destino", "city", true],
    ["paradas", "Paradas intermediárias (;)", "text", false], ["cargasIds", "Pedidos/cargas vinculados", "loads", true],
    ["veiculoTipo", "Tipo de veículo", "vehicle", true], ["caminhaoId", "Caminhão", "truck", true],
    ["motoristaId", "Motorista", "driver", true], ["saida", "Previsão de saída", "datetime-local", true],
    ["chegada", "Previsão de chegada", "datetime-local", true], ["distancia", "Distância total estimada", "number", false],
    ["freteTotal", "Frete total estimado", "number", false], ["tempo", "Tempo estimado", "text", true],
    ["custo", "Custo estimado", "number", false], ["status", "Status", "select:planejada,em andamento,concluída,cancelada", true],
    ["observacoes", "Observações", "textarea", false]
  ]
};

document.addEventListener("DOMContentLoaded", () => {
  initStorage();
  applyTheme(getSettings().tema);
  bindLayoutEvents();
  renderAll();
});

function bindLayoutEvents() {
  document.querySelectorAll(".nav-link").forEach((btn) => btn.addEventListener("click", () => showPage(btn.dataset.page)));
  document.getElementById("menuToggle").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalBackdrop").addEventListener("click", (event) => {
    if (event.target.id === "modalBackdrop") closeModal();
  });
  document.querySelectorAll("[data-action='new']").forEach((btn) => btn.addEventListener("click", () => openForm(btn.dataset.entity)));
  document.getElementById("themeToggle").addEventListener("click", () => {
    const next = document.body.dataset.theme === "dark" ? "light" : "dark";
    saveSettings({ tema: next });
    applyTheme(next);
  });
  document.getElementById("quickSearch").addEventListener("input", (event) => quickSearch(event.target.value));
  ["motoristasSearch", "caminhoesSearch", "rotasSearch"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderTables);
  });
  bindMapPanelEvents();
  document.getElementById("restoreSeedBtn").addEventListener("click", () => confirmAction("Restaurar dados exemplo da Madcenter?", () => {
    initStorage(true);
    applyTheme(getSettings().tema);
    renderAll();
    toast("Dados exemplo restaurados.");
  }));
  document.getElementById("clearDataBtn").addEventListener("click", () => confirmAction("Limpar todos os dados salvos?", () => {
    resetToEmptyData();
    renderAll();
    toast("Dados limpos.");
  }));
}

function showPage(page) {
  App.page = page;
  document.querySelectorAll(".page").forEach((el) => el.classList.remove("active"));
  document.getElementById(`page-${page}`).classList.add("active");
  document.querySelectorAll(".nav-link").forEach((el) => el.classList.toggle("active", el.dataset.page === page));
  document.getElementById("pageTitle").textContent = pageNames[page];
  document.getElementById("sidebar").classList.remove("open");
  if (page === "mapa") renderMapPanel();
  if (page === "unificar") renderUnification();
  if (page === "clientes") renderClientesTable();
}

function renderAll() {
  renderDashboard();
  renderFilters();
  renderTables();
  renderClientesTable();
  renderSettings();
  renderUnification();
  renderMapFilters();
  if (App.page === "mapa") renderMapPanel();
}

function calculateDistanceKm(originLat, originLng, destLat, destLng) {
  const toRad = (value) => value * Math.PI / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(destLat - originLat);
  const dLng = toRad(destLng - originLng);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(originLat)) * Math.cos(toRad(destLat)) * Math.sin(dLng / 2) ** 2;
  return Number((earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
}

function calculateFreight(distanceKm, vehicleType, cargoWeight = 0) {
  const vehicle = getVehicleType(vehicleType);
  const settings = getSettings();
  if (!vehicle) return 0;
  const raw = vehicle.custoBase + (Number(distanceKm || 0) * vehicle.custoKm) + Number(settings.custoAdicionalFixo || 0);
  return Number(Math.max(raw, Number(settings.freteMinimo || 0)).toFixed(2));
}

function getVehicleType(id) {
  return VEHICLE_TYPES.find((vehicle) => vehicle.id === id);
}

function getAvailableVehicles() {
  const settings = getSettings();
  return VEHICLE_TYPES.filter((vehicle) => settings.entregaMoto === "sim" || vehicle.id !== "moto");
}

function suggestVehicleByWeight(weight) {
  return getAvailableVehicles().find((vehicle) => Number(weight || 0) <= vehicle.capacidade) || getAvailableVehicles().at(-1);
}

function getStoreOrigin() {
  const settings = getSettings();
  return {
    name: settings.empresa || STORE_LOCATION.name,
    city: STORE_LOCATION.city,
    state: STORE_LOCATION.state,
    lat: Number(settings.latitudeLoja || STORE_LOCATION.lat),
    lng: Number(settings.longitudeLoja || STORE_LOCATION.lng)
  };
}

function cityOptions() {
  const unique = {};
  Object.values(MUNICIPIOS_COORDS).forEach((city) => {
    unique[`${city.nome}/${city.estado}`] = city;
  });
  return Object.values(unique);
}

function getDestinationCoord(city, state) {
  return getCityCoord(city, state);
}

function computeCargoFreight(data) {
  const origin = getStoreOrigin();
  const dest = getDestinationCoord(data.destinoMunicipio, data.destinoEstado);
  if (!dest) return { error: "Este município ainda não possui coordenada cadastrada. Cadastre a coordenada ou use uma cidade da lista para calcular o frete." };
  const vehicle = getVehicleType(data.veiculoTipo);
  if (!vehicle) return { error: "Escolha o tipo de veículo da entrega." };
  const weight = Number(data.peso || 0);
  if (weight > vehicle.capacidade) return { error: `${vehicle.nome} suporta até ${vehicle.capacidade} kg. Escolha outro veículo para essa entrega.` };
  const distanceKm = calculateDistanceKm(origin.lat, origin.lng, dest.lat, dest.lng);
  const freight = calculateFreight(distanceKm, vehicle.id, weight);
  return { origin, dest, vehicle, weight, distanceKm, freight };
}

function badge(value) {
  return `<span class="badge badge-${statusColors[value] || "gray"}">${value || "sem status"}</span>`;
}

function driverName(id) {
  return getMotoristas().find((m) => m.id === id)?.nome || "Não vinculado";
}

function truckName(id) {
  const truck = getCaminhoes().find((c) => c.id === id);
  return truck ? `${truck.placa} - ${truck.modelo}` : "Não vinculado";
}

function vehicleName(id) {
  return getVehicleType(id)?.nome || "Não informado";
}

function renderDashboard() {
  const cargas = getCargas();
  const motoristas = getMotoristas();
  const caminhoes = getCaminhoes();
  const rotas = getRotas();
  const suggestions = buildUnificationSuggestions();
  const metrics = [
    ["Pedidos cadastrados", cargas.length],
    ["Entregas aguardando", cargas.filter((c) => ["aguardando separação", "aguardando rota"].includes(c.status)).length],
    ["Entregas em rota", cargas.filter((c) => c.status === "em rota").length],
    ["Entregas concluídas", cargas.filter((c) => c.status === "entregue").length],
    ["Motoristas disponíveis", motoristas.filter((m) => m.status === "disponível").length],
    ["Caminhões disponíveis", caminhoes.filter((c) => c.status === "disponível").length],
    ["Rotas ativas", rotas.filter((r) => ["planejada", "em andamento"].includes(r.status)).length],
    ["Podem ser unificadas", suggestions.length]
  ];
  document.getElementById("dashboardMetrics").innerHTML = metrics.map(([label, value], index) => `
    <div class="metric-card"><div class="metric-icon">${metricIcons[index]}</div><span>${label}</span><strong>${value}</strong></div>
  `).join("");

  document.getElementById("latestCargas").innerHTML = cargas.slice(-5).reverse().map((c) => `
    <div class="list-item"><div><strong>${c.codigo} - ${c.descricao}</strong><span>${c.cliente} · ${c.destinoMunicipio}/${c.destinoEstado} · ${vehicleName(c.veiculoTipo)} · ${money.format(Number(c.valorFrete || 0))}</span></div>${badge(c.status)}</div>
  `).join("") || emptyText("Nenhum pedido/carga cadastrado.");

  document.getElementById("nextRotas").innerHTML = rotas.filter((r) => r.status !== "concluída").slice(0, 5).map((r) => `
    <div class="list-item"><div><strong>${r.codigo} - ${r.nome}</strong><span>${formatDate(r.saida)} · ${driverName(r.motoristaId)} · ${vehicleName(r.veiculoTipo)}</span></div>${badge(r.status)}</div>
  `).join("") || emptyText("Nenhuma rota prevista.");

  const routedLoadIds = new Set(rotas.flatMap((r) => r.cargasIds || []));
  const alerts = [];
  cargas.filter((c) => !routedLoadIds.has(c.id) && ["aguardando separação", "aguardando rota"].includes(c.status)).forEach((c) => alerts.push(`Pedido de material aguardando rota: ${c.codigo} - ${c.descricao}.`));
  caminhoes.filter((c) => !c.motoristaId && c.status === "disponível").forEach((c) => alerts.push(`Caminhão disponível para nova entrega: ${c.placa}.`));
  if (suggestions.length) alerts.push("Entregas para municípios próximos podem ser unificadas.");
  cargas.filter((c) => Number(c.peso) > 5000 && c.status !== "entregue").forEach((c) => alerts.push(`Carga pesada exige caminhão com maior capacidade: ${c.codigo}.`));
  document.getElementById("alertsList").innerHTML = alerts.map((a) => `<div class="list-item"><strong>${a}</strong></div>`).join("") || emptyText("Sem alertas no momento.");
}

function renderFilters() {
  document.getElementById("cargasFilters").innerHTML = `
    <select id="filterCargaStatus"><option value="">Status</option><option>aguardando separação</option><option>aguardando rota</option><option>em rota</option><option>entregue</option><option>cancelado</option></select>
    <select id="filterCargaPrioridade"><option value="">Prioridade</option><option>baixa</option><option>normal</option><option>alta</option><option>urgente</option></select>
    <input id="filterCargaOrigem" placeholder="Origem">
    <input id="filterCargaDestino" placeholder="Destino">
    <input id="filterCargaData" type="date">
    <input id="filterCargaText" placeholder="Buscar pedido, cliente ou material">
  `;
  document.querySelectorAll("#cargasFilters input, #cargasFilters select").forEach((el) => el.addEventListener("input", renderTables));
}

function renderTables() {
  renderCargasTable();
  renderMotoristasTable();
  renderCaminhoesTable();
  renderRotasTable();
  renderClientesTable();
  renderDashboard();
}

function renderCargasTable() {
  const filters = {
    status: valueOf("filterCargaStatus"), prioridade: valueOf("filterCargaPrioridade"), origem: valueOf("filterCargaOrigem"),
    destino: valueOf("filterCargaDestino"), data: valueOf("filterCargaData"), text: valueOf("filterCargaText")
  };
  const rows = getCargas().filter((c) => {
    const haystack = Object.values(c).join(" ").toLowerCase();
    return (!filters.status || c.status === filters.status)
      && (!filters.prioridade || c.prioridade === filters.prioridade)
      && (!filters.origem || c.origemMunicipio.toLowerCase().includes(filters.origem.toLowerCase()))
      && (!filters.destino || c.destinoMunicipio.toLowerCase().includes(filters.destino.toLowerCase()))
      && (!filters.data || c.coleta === filters.data || c.entrega === filters.data)
      && (!filters.text || haystack.includes(filters.text.toLowerCase()));
  });
  table("cargasTable", ["Código", "Cliente", "Material", "Destino", "Peso", "Veículo", "Distância", "Frete", "Status", "Ações"], rows.map((c) => [
    c.codigo, c.cliente, c.descricao, `${c.destinoMunicipio}/${c.destinoEstado}`, `${c.peso} kg`,
    vehicleName(c.veiculoTipo), `${Number(c.distanciaKm || 0).toFixed(1)} km`, money.format(Number(c.valorFrete || 0)), badge(c.status), actions("cargas", c.id)
  ]));
}

function renderMotoristasTable() {
  const search = valueOf("motoristasSearch").toLowerCase();
  const rows = getMotoristas().filter((m) => Object.values(m).join(" ").toLowerCase().includes(search));
  table("motoristasTable", ["Nome", "WhatsApp", "CNH", "Categoria", "Cidade atual", "Status", "Ações"], rows.map((m) => [
    m.nome, m.telefone, m.cnh, m.categoria, `${m.cidade}/${m.estado}`, badge(m.status), actions("motoristas", m.id)
  ]));
}

function renderCaminhoesTable() {
  const search = valueOf("caminhoesSearch").toLowerCase();
  const rows = getCaminhoes().filter((c) => Object.values(c).join(" ").toLowerCase().includes(search));
  table("caminhoesTable", ["Placa", "Modelo", "Capacidade", "Carroceria", "Cidade atual", "Status", "Motorista", "Ações"], rows.map((c) => [
    c.placa, c.modelo, `${c.capacidade} kg`, c.carroceria, `${c.cidade}/${c.estado}`, badge(c.status), driverName(c.motoristaId), actions("caminhoes", c.id)
  ]));
}

function renderRotasTable() {
  const search = valueOf("rotasSearch").toLowerCase();
  const rows = getRotas().filter((r) => Object.values(r).join(" ").toLowerCase().includes(search));
  table("rotasTable", ["Código", "Nome da rota", "Destino", "Motorista", "Caminhão", "Veículo", "Pedidos", "Distância", "Frete", "Status", "Ações"], rows.map((r) => [
    r.codigo, r.nome, `${r.destinoMunicipio}/${r.destinoEstado}`, driverName(r.motoristaId), truckName(r.caminhaoId),
    vehicleName(r.veiculoTipo), (r.cargasIds || []).length, `${Number(r.distancia || 0).toFixed(1)} km`, money.format(Number(r.freteTotal || r.custo || 0)), badge(r.status), actions("rotas", r.id, true)
  ]));
}

function renderClientesTable() {
  const grouped = {};
  getCargas().forEach((c) => {
    grouped[c.cliente] = grouped[c.cliente] || { cliente: c.cliente, telefone: c.telefone, cidade: `${c.destinoMunicipio}/${c.destinoEstado}`, pedidos: 0, valor: 0 };
    grouped[c.cliente].pedidos += 1;
    grouped[c.cliente].valor += Number(c.valorFrete || 0);
  });
  table("clientesTable", ["Cliente", "WhatsApp", "Cidade principal", "Pedidos", "Fretes cadastrados"], Object.values(grouped).map((c) => [
    c.cliente, c.telefone, c.cidade, c.pedidos, money.format(c.valor)
  ]));
}

function table(id, headers, rows) {
  const element = document.getElementById(id);
  if (!element) return;
  element.innerHTML = `
    <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}">Nenhum registro encontrado.</td></tr>`}</tbody>
  `;
}

function actions(entity, id, includeMap = false) {
  return `<div class="actions-cell">
    <button class="table-action" onclick="openDetails('${entity}','${id}')">Detalhes</button>
    <button class="table-action" onclick="openForm('${entity}','${id}')">Editar</button>
    ${includeMap ? `<button class="table-action" onclick="showPage('mapa')">Mapa</button>` : ""}
    <button class="table-action" onclick="confirmDelete('${entity}','${id}')">Excluir</button>
  </div>`;
}

function openForm(entity, id = null) {
  App.modal = { entity, mode: id ? "edit" : "new", id };
  const item = id ? getCollection(entity).find((x) => x.id === id) : defaultItem(entity);
  document.getElementById("modalTitle").textContent = `${id ? "Editar" : "Cadastrar"} ${singular(entity)}`;
  document.getElementById("modalBody").innerHTML = `
    <form id="entityForm" class="form-grid">
      ${entity === "cargas" ? originNoticeHtml() : ""}
      ${fields[entity].map((field) => fieldHtml(field, item)).join("")}
      ${entity === "cargas" ? freightPanelHtml() : ""}
      ${entity === "rotas" ? routeFreightPanelHtml() : ""}
      <div class="modal-actions form-field full">
        <button class="secondary-button" type="button" onclick="closeModal()">Cancelar</button>
        <button class="primary-button" type="submit">Salvar</button>
      </div>
    </form>
  `;
  const form = document.getElementById("entityForm");
  form.addEventListener("submit", submitEntityForm);
  if (entity === "cargas") bindCargoFreightEvents(form);
  if (entity === "rotas") bindRouteFreightEvents(form);
  openModal();
}

function defaultItem(entity) {
  if (entity === "cargas") {
    const origin = getStoreOrigin();
    return {
      origemMunicipio: origin.city,
      origemEstado: origin.state,
      origemEmpresa: origin.name,
      origemLat: origin.lat,
      origemLng: origin.lng,
      enderecoColeta: `${origin.name} - Timon/MA`,
      status: "aguardando rota",
      prioridade: "normal",
      veiculoTipo: "caminhonete",
      distanciaKm: 0,
      valorFrete: 0
    };
  }
  if (entity === "rotas") {
    return { origemMunicipio: STORE_LOCATION.city, origemEstado: STORE_LOCATION.state, veiculoTipo: "caminhonete", status: "planejada", distancia: 0, freteTotal: 0, custo: 0 };
  }
  return {};
}

function originNoticeHtml() {
  const origin = getStoreOrigin();
  return `<div class="origin-notice form-field full"><strong>Origem: ${origin.name} - ${origin.city}/${origin.state}</strong><span>Ponto de saída padrão das entregas. Latitude ${origin.lat}, longitude ${origin.lng}.</span></div>`;
}

function freightPanelHtml() {
  return `<div class="freight-panel form-field full">
    <div class="suggestion-box" id="vehicleSuggestion">Informe o peso para ver o veículo sugerido.</div>
    <div class="freight-cards">
      <div class="freight-card"><span>Distância</span><strong id="freightDistance">0,0 km</strong></div>
      <div class="freight-card"><span>Veículo</span><strong id="freightVehicle">-</strong></div>
      <div class="freight-card"><span>Capacidade</span><strong id="freightCapacity">-</strong></div>
      <div class="freight-card highlight"><span>Frete estimado</span><strong id="freightValue">R$ 0,00</strong></div>
    </div>
    <div id="freightMessage" class="freight-message"></div>
    <div class="button-row">
      <button class="secondary-button" type="button" id="useSuggestedVehicleBtn">Usar veículo sugerido</button>
      <button class="warning-button" type="button" id="calculateFreightBtn">Calcular frete</button>
    </div>
  </div>`;
}

function routeFreightPanelHtml() {
  return `<div class="freight-panel form-field full">
    <div id="routeFreightMessage" class="freight-message">O frete total será estimado pelos pedidos vinculados e veículo selecionado.</div>
    <div class="button-row"><button class="warning-button" type="button" id="calculateRouteFreightBtn">Calcular frete da rota</button></div>
  </div>`;
}

function fieldHtml([name, label, type, required], item) {
  const value = item[name] ?? "";
  const req = required ? "required" : "";
  const full = type === "textarea" || type === "loads" ? " full" : "";
  if (type.startsWith("select:")) {
    return `<div class="form-field${full}"><label>${label}</label><select name="${name}" ${req}>${type.split(":")[1].split(",").map((o) => `<option value="${o}" ${value === o ? "selected" : ""}>${o}</option>`).join("")}</select></div>`;
  }
  if (type === "city") {
    return `<div class="form-field"><label>${label}</label><select name="${name}" ${req}><option value="">Selecione</option>${cityOptions().map((city) => `<option value="${city.nome}" data-state="${city.estado}" ${value === city.nome ? "selected" : ""}>${city.nome}/${city.estado}</option>`).join("")}</select></div>`;
  }
  if (type === "vehicle") {
    return `<div class="form-field"><label>${label}</label><select name="${name}" ${req}>${getAvailableVehicles().map((vehicle) => `<option value="${vehicle.id}" ${value === vehicle.id ? "selected" : ""}>${vehicle.nome} - até ${vehicle.capacidade} kg</option>`).join("")}</select></div>`;
  }
  if (type === "textarea") {
    return `<div class="form-field full"><label>${label}</label><textarea name="${name}" ${req}>${value}</textarea></div>`;
  }
  if (type === "driver") {
    return `<div class="form-field"><label>${label}</label><select name="${name}" ${req}><option value="">Selecione</option>${getMotoristas().map((m) => `<option value="${m.id}" ${value === m.id ? "selected" : ""}>${m.nome} (${m.status})</option>`).join("")}</select></div>`;
  }
  if (type === "truck") {
    return `<div class="form-field"><label>${label}</label><select name="${name}" ${req}><option value="">Selecione</option>${getCaminhoes().map((c) => `<option value="${c.id}" ${value === c.id ? "selected" : ""}>${c.placa} - ${c.modelo} (${c.status})</option>`).join("")}</select></div>`;
  }
  if (type === "loads") {
    const selected = new Set(value || []);
    return `<div class="form-field full"><label>${label}</label><select name="${name}" multiple size="5" ${req}>${getCargas().filter((c) => !["entregue", "cancelado"].includes(c.status) || selected.has(c.id)).map((c) => `<option value="${c.id}" ${selected.has(c.id) ? "selected" : ""}>${c.codigo} - ${c.descricao} (${c.peso} kg / ${c.status})</option>`).join("")}</select></div>`;
  }
  const readonly = ["distanciaKm"].includes(name) ? "readonly" : "";
  return `<div class="form-field${full}"><label>${label}</label><input name="${name}" type="${type}" value="${value}" ${req} ${readonly}></div>`;
}

function bindCargoFreightEvents(form) {
  const update = () => updateCargoFreightPreview(form, false);
  ["peso", "destinoMunicipio", "veiculoTipo"].forEach((name) => form.elements[name]?.addEventListener("input", update));
  form.elements.peso?.addEventListener("input", () => updateVehicleSuggestion(form));
  document.getElementById("calculateFreightBtn").addEventListener("click", () => updateCargoFreightPreview(form, true));
  document.getElementById("useSuggestedVehicleBtn").addEventListener("click", () => {
    const suggested = suggestVehicleByWeight(Number(form.elements.peso.value || 0));
    if (suggested) form.elements.veiculoTipo.value = suggested.id;
    updateCargoFreightPreview(form, true);
  });
  updateVehicleSuggestion(form);
  updateCargoFreightPreview(form, false);
}

function updateVehicleSuggestion(form) {
  const suggested = suggestVehicleByWeight(Number(form.elements.peso.value || 0));
  const box = document.getElementById("vehicleSuggestion");
  if (box && suggested) box.innerHTML = `<strong>Veículo sugerido:</strong> ${suggested.nome} <span>${suggested.uso}</span>`;
}

function readCargoFormData(form) {
  const selectedCity = form.elements.destinoMunicipio?.selectedOptions?.[0];
  const data = Object.fromEntries(new FormData(form).entries());
  data.destinoEstado = selectedCity?.dataset.state || "";
  data.peso = Number(data.peso || 0);
  data.valorFrete = Number(data.valorFrete || 0);
  data.distanciaKm = Number(data.distanciaKm || 0);
  return data;
}

function updateCargoFreightPreview(form, writeValues) {
  const data = readCargoFormData(form);
  const result = computeCargoFreight(data);
  const msg = document.getElementById("freightMessage");
  const vehicle = getVehicleType(data.veiculoTipo);
  document.getElementById("freightVehicle").textContent = vehicle?.nome || "-";
  document.getElementById("freightCapacity").textContent = vehicle ? `${vehicle.capacidade} kg` : "-";
  if (result.error) {
    msg.className = "freight-message error";
    msg.textContent = result.error;
    return result;
  }
  document.getElementById("freightDistance").textContent = `${result.distanceKm.toFixed(1)} km`;
  document.getElementById("freightValue").textContent = money.format(result.freight);
  msg.className = "freight-message success";
  msg.textContent = `Resumo: Origem ${result.origin.name} - ${result.origin.city}/${result.origin.state}. Destino ${result.dest.nome}/${result.dest.estado}. Distância aproximada ${result.distanceKm.toFixed(1)} km. Veículo ${result.vehicle.nome}. Peso ${result.weight} kg. Frete estimado ${money.format(result.freight)}.`;
  if (writeValues) {
    form.elements.distanciaKm.value = result.distanceKm;
    form.elements.valorFrete.value = result.freight;
  }
  return result;
}

function bindRouteFreightEvents(form) {
  document.getElementById("calculateRouteFreightBtn").addEventListener("click", () => updateRouteFreightPreview(form, true));
  ["cargasIds", "veiculoTipo", "destinoMunicipio"].forEach((name) => form.elements[name]?.addEventListener("input", () => updateRouteFreightPreview(form, false)));
  updateRouteFreightPreview(form, false);
}

function readRouteFormData(form) {
  const selectedCity = form.elements.destinoMunicipio?.selectedOptions?.[0];
  const data = Object.fromEntries(new FormData(form).entries());
  data.destinoEstado = selectedCity?.dataset.state || "";
  data.cargasIds = [...form.elements.cargasIds.selectedOptions].map((o) => o.value);
  data.distancia = Number(data.distancia || 0);
  data.freteTotal = Number(data.freteTotal || 0);
  data.custo = Number(data.custo || 0);
  return data;
}

function computeRouteFreight(data) {
  const loads = getCargas().filter((c) => data.cargasIds.includes(c.id));
  const totalWeight = loads.reduce((sum, load) => sum + Number(load.peso || 0), 0);
  const vehicle = getVehicleType(data.veiculoTipo);
  if (!vehicle) return { error: "Escolha o tipo de veículo da rota." };
  if (totalWeight > vehicle.capacidade) return { error: `${vehicle.nome} suporta até ${vehicle.capacidade} kg. Peso total selecionado: ${totalWeight} kg.` };
  const origin = getStoreOrigin();
  const destinations = loads.length
    ? loads.map((load) => getDestinationCoord(load.destinoMunicipio, load.destinoEstado)).filter(Boolean)
    : [getDestinationCoord(data.destinoMunicipio, data.destinoEstado)].filter(Boolean);
  if (!destinations.length) return { error: "Este município ainda não possui coordenada cadastrada. Cadastre a coordenada ou use uma cidade da lista para calcular o frete." };
  const distance = estimateMultiStopDistance(origin, destinations);
  const freight = calculateFreight(distance, vehicle.id, totalWeight);
  return { vehicle, totalWeight, distance, freight };
}

function estimateMultiStopDistance(origin, destinations) {
  let current = { lat: origin.lat, lng: origin.lng };
  let total = 0;
  destinations.forEach((dest) => {
    total += calculateDistanceKm(current.lat, current.lng, dest.lat, dest.lng);
    current = dest;
  });
  return Number(total.toFixed(1));
}

function updateRouteFreightPreview(form, writeValues) {
  const data = readRouteFormData(form);
  const result = computeRouteFreight(data);
  const msg = document.getElementById("routeFreightMessage");
  if (result.error) {
    msg.className = "freight-message error";
    msg.textContent = result.error;
    return result;
  }
  msg.className = "freight-message success";
  msg.textContent = `Rota estimada com ${result.vehicle.nome}. Peso total ${result.totalWeight} kg. Distância ${result.distance.toFixed(1)} km. Frete total ${money.format(result.freight)}.`;
  if (writeValues) {
    form.elements.distancia.value = result.distance;
    form.elements.freteTotal.value = result.freight;
    form.elements.custo.value = result.freight;
  }
  return result;
}

function submitEntityForm(event) {
  event.preventDefault();
  const form = event.target;
  const entity = App.modal.entity;
  const data = entity === "cargas" ? readCargoFormData(form) : entity === "rotas" ? readRouteFormData(form) : Object.fromEntries(new FormData(form).entries());
  fields[entity].forEach(([name, , type]) => {
    if (type === "loads" && entity !== "rotas") data[name] = [...form.elements[name].selectedOptions].map((o) => o.value);
    if (type === "number") data[name] = Number(data[name] || 0);
  });

  if (entity === "cargas") {
    const origin = getStoreOrigin();
    Object.assign(data, {
      origemEmpresa: origin.name,
      origemMunicipio: origin.city,
      origemEstado: origin.state,
      origemLat: origin.lat,
      origemLng: origin.lng,
      enderecoColeta: `${origin.name} - ${origin.city}/${origin.state}`
    });
    const freightResult = computeCargoFreight(data);
    if (freightResult.error) return toast(freightResult.error);
    if (!data.distanciaKm) data.distanciaKm = freightResult.distanceKm;
    if (!data.valorFrete) data.valorFrete = freightResult.freight;
  }

  if (entity === "rotas") {
    const origin = getStoreOrigin();
    data.origemMunicipio = origin.city;
    data.origemEstado = origin.state;
    const routeResult = computeRouteFreight(data);
    if (routeResult.error) return toast(routeResult.error);
    if (!data.distancia) data.distancia = routeResult.distance;
    if (!data.freteTotal) data.freteTotal = routeResult.freight;
    if (!data.custo) data.custo = routeResult.freight;
  }

  const error = validateEntity(entity, data, App.modal.id);
  if (error) return toast(error);

  if (App.modal.mode === "edit") updateByEntity(entity, App.modal.id, data);
  else saveByEntity(entity, data);
  closeModal();
  renderAll();
  toast("Registro salvo com sucesso.");
}

function validateEntity(entity, data, editingId) {
  for (const [name, label, , required] of fields[entity]) {
    const value = data[name];
    if (required && (Array.isArray(value) ? !value.length : !String(value ?? "").trim())) return `${label} é obrigatório.`;
  }
  if (entity === "cargas") {
    if (!(data.peso > 0)) return "Peso aproximado precisa ser número válido.";
    if (!(data.valorFrete >= 0)) return "Valor do frete precisa ser número válido.";
    const vehicle = getVehicleType(data.veiculoTipo);
    if (vehicle && Number(data.peso) > vehicle.capacidade) return `${vehicle.nome} suporta até ${vehicle.capacidade} kg. Escolha outro veículo para essa entrega.`;
  }
  if (entity === "caminhoes" && !(data.capacidade > 0)) return "Capacidade do caminhão precisa ser número válido.";
  if (entity === "rotas") return validateRoute(data, editingId);
  return "";
}

function validateRoute(data, editingId) {
  if (!data.cargasIds?.length) return "Não é permitido criar rota sem pedido/carga.";
  if (!data.motoristaId) return "Não é permitido criar rota sem motorista.";
  if (!data.caminhaoId) return "Não é permitido criar rota sem caminhão.";
  const cargas = getCargas().filter((c) => data.cargasIds.includes(c.id));
  if (cargas.some((c) => ["entregue", "cancelado"].includes(c.status))) return "Não é permitido vincular pedido entregue ou cancelado.";
  const vehicle = getVehicleType(data.veiculoTipo);
  const totalPeso = cargas.reduce((sum, c) => sum + Number(c.peso || 0), 0);
  if (vehicle && totalPeso > vehicle.capacidade) return `${vehicle.nome} suporta até ${vehicle.capacidade} kg. Peso total selecionado: ${totalPeso} kg.`;
  const caminhao = getCaminhoes().find((c) => c.id === data.caminhaoId);
  if (caminhao && totalPeso > Number(caminhao.capacidade || 0)) return `Peso total (${totalPeso} kg) ultrapassa a capacidade do caminhão.`;
  if (data.status === "em andamento") {
    const active = getRotas().filter((r) => r.id !== editingId && r.status === "em andamento");
    if (active.some((r) => r.motoristaId === data.motoristaId)) return "Motorista já está em uma rota em andamento.";
    if (active.some((r) => r.caminhaoId === data.caminhaoId)) return "Caminhão já está em uma rota em andamento.";
  }
  return "";
}

function openDetails(entity, id) {
  const item = getCollection(entity).find((x) => x.id === id);
  document.getElementById("modalTitle").textContent = `Detalhes de ${singular(entity)}`;
  const entries = Object.entries(item).map(([key, value]) => {
    let shown = Array.isArray(value) ? value.map((idValue) => getCargas().find((c) => c.id === idValue)?.codigo || idValue).join(", ") : value;
    if (key === "motoristaId") shown = driverName(value);
    if (key === "caminhaoId") shown = truckName(value);
    if (key === "veiculoTipo") shown = vehicleName(value);
    if (key === "valorFrete" || key === "freteTotal" || key === "custo") shown = money.format(Number(value || 0));
    return `<div class="detail-item"><span>${labelize(key)}</span><strong>${shown || "Não informado"}</strong></div>`;
  }).join("");
  document.getElementById("modalBody").innerHTML = `<div class="details-grid">${entries}</div>`;
  openModal();
}

function confirmDelete(entity, id) {
  confirmAction("Excluir este registro?", () => {
    deleteByEntity(entity, id);
    renderAll();
    toast("Registro excluído.");
  });
}

function confirmAction(message, onConfirm) {
  document.getElementById("modalTitle").textContent = "Confirmação";
  document.getElementById("modalBody").innerHTML = `<p>${message}</p><div class="modal-actions"><button class="secondary-button" onclick="closeModal()">Cancelar</button><button class="danger-button" id="confirmActionBtn">Confirmar</button></div>`;
  document.getElementById("confirmActionBtn").addEventListener("click", () => { closeModal(); onConfirm(); });
  openModal();
}

function renderUnification() {
  const suggestions = buildUnificationSuggestions();
  document.getElementById("unificationSuggestions").innerHTML = suggestions.length ? suggestions.map((s, i) => `
    <div class="suggestion-card">
      <h3>${s.nome}</h3>
      <div>${badge("planejada")} <strong>${s.cargas.length}</strong> pedidos compatíveis</div>
      <p><strong>Pedidos compatíveis:</strong> ${s.cargas.map((c) => `${c.codigo}: ${c.descricao} - ${c.destinoMunicipio} - ${c.peso} kg`).join(" · ")}</p>
      <p><strong>Cidades próximas:</strong> ${s.destinos.join(", ")}</p>
      <p><strong>Peso total:</strong> ${s.pesoTotal} kg</p>
      <p><strong>Menor veículo possível:</strong> ${vehicleName(s.veiculoTipo)}</p>
      <p><strong>Caminhão recomendado:</strong> ${truckName(s.caminhaoId)}</p>
      <p><strong>Motorista disponível:</strong> ${driverName(s.motoristaId)}</p>
      <p><strong>Frete individual total:</strong> ${money.format(s.freteIndividual)}</p>
      <p><strong>Frete rota unificada:</strong> ${money.format(s.freteUnificado)}</p>
      <p><strong>Economia estimada:</strong> ${money.format(s.economia)}</p>
      <p><strong>Rota sugerida:</strong> Madcenter → ${s.destinos.join(" → ")}</p>
      <button class="primary-button" onclick="createSuggestedRoute(${i})">Criar rota unificada</button>
    </div>
  `).join("") : emptyText("Nenhuma sugestão disponível com os pedidos, motoristas e caminhões atuais.");
}

function buildUnificationSuggestions() {
  const cargas = getCargas().filter((c) => ["aguardando rota", "aguardando separação"].includes(c.status));
  const caminhoes = getCaminhoes().filter((c) => c.status === "disponível");
  const motoristas = getMotoristas().filter((m) => m.status === "disponível");
  const groups = {};
  cargas.forEach((c) => {
    const key = `${c.destinoMunicipio}/${c.destinoEstado}`;
    groups[key] = groups[key] || [];
    groups[key].push(c);
  });

  return Object.entries(groups).flatMap(([destino, items]) => {
    if (items.length < 2) return [];
    const sorted = items
      .filter((carga, _, list) => list.some((other) => other.id !== carga.id && datesCompatible(carga, other)))
      .sort((a, b) => new Date(a.entrega) - new Date(b.entrega));
    if (sorted.length < 2) return [];
    const pesoTotal = sorted.reduce((sum, c) => sum + Number(c.peso || 0), 0);
    const vehicle = suggestVehicleByWeight(pesoTotal);
    const caminhao = caminhoes.find((c) => Number(c.capacidade) >= pesoTotal);
    const motorista = motoristas[0];
    const destCoords = sorted.map((c) => getDestinationCoord(c.destinoMunicipio, c.destinoEstado)).filter(Boolean);
    if (!vehicle || !caminhao || !motorista || !destCoords.length) return [];
    const origin = getStoreOrigin();
    const distanciaUnificada = estimateMultiStopDistance(origin, destCoords);
    const freteUnificado = calculateFreight(distanciaUnificada, vehicle.id, pesoTotal);
    const freteIndividual = sorted.reduce((sum, c) => sum + Number(c.valorFrete || 0), 0);
    const destinos = [...new Set(sorted.map((c) => `${c.destinoMunicipio}/${c.destinoEstado}`))];
    return [{
      nome: `Rota unificada Madcenter → ${destino}`,
      cargas: sorted,
      destinos,
      pesoTotal,
      veiculoTipo: vehicle.id,
      caminhaoId: caminhao.id,
      motoristaId: motorista.id,
      freteIndividual,
      freteUnificado,
      economia: Math.max(0, Number((freteIndividual - freteUnificado).toFixed(2))),
      distanciaUnificada,
      destinoFinal: sorted[sorted.length - 1]
    }];
  });
}

function datesCompatible(a, b) {
  const aColeta = new Date(a.coleta).getTime();
  const bColeta = new Date(b.coleta).getTime();
  const aEntrega = new Date(a.entrega).getTime();
  const bEntrega = new Date(b.entrega).getTime();
  const pickupGapDays = Math.abs(aColeta - bColeta) / 86400000;
  return pickupGapDays <= 2 && Math.max(aColeta, bColeta) <= Math.min(aEntrega, bEntrega);
}

function createSuggestedRoute(index) {
  const suggestion = buildUnificationSuggestions()[index];
  if (!suggestion) return toast("Sugestão não encontrada.");
  const origin = getStoreOrigin();
  saveRota({
    nome: suggestion.nome,
    origemMunicipio: origin.city,
    origemEstado: origin.state,
    destinoMunicipio: suggestion.destinoFinal.destinoMunicipio,
    destinoEstado: suggestion.destinoFinal.destinoEstado,
    paradas: suggestion.cargas.slice(0, -1).map((c) => c.destinoMunicipio).join("; "),
    cargasIds: suggestion.cargas.map((c) => c.id),
    caminhaoId: suggestion.caminhaoId,
    motoristaId: suggestion.motoristaId,
    veiculoTipo: suggestion.veiculoTipo,
    saida: `${suggestion.cargas[0].coleta}T07:00`,
    chegada: `${suggestion.destinoFinal.entrega}T18:00`,
    distancia: suggestion.distanciaUnificada,
    freteTotal: suggestion.freteUnificado,
    tempo: "Estimado automaticamente",
    custo: suggestion.freteUnificado,
    status: "planejada",
    observacoes: "Criada automaticamente pela tela Unificar Entregas."
  });
  suggestion.cargas.forEach((c) => updateCarga(c.id, { status: "em rota" }));
  renderAll();
  toast("Rota unificada criada com sucesso.");
}

function bindMapPanelEvents() {
  ["mapStatusFilter", "mapDriverFilter", "mapTruckFilter", "mapCityFilter", "mapVehicleTypeFilter"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => {
      App.mapFilters = {
        status: valueOf("mapStatusFilter") || "todos",
        driver: valueOf("mapDriverFilter") || "todos",
        truck: valueOf("mapTruckFilter") || "todos",
        city: valueOf("mapCityFilter") || "todos",
        vehicleType: valueOf("mapVehicleTypeFilter") || "todos"
      };
      renderMapPanel();
    });
  });
  document.querySelectorAll("#mapLayerControls input[type='checkbox']").forEach((input) => {
    input.addEventListener("change", () => {
      App.mapLayers[input.dataset.layer] = input.checked;
      renderMapPanel();
    });
  });
  document.getElementById("mapReloadRoutes")?.addEventListener("click", () => {
    clearRouteGeometryCache();
    renderMapPanel();
    toast("Cache de rotas limpo. Recalculando rotas no mapa.");
  });
  document.getElementById("mapFitRoutes")?.addEventListener("click", () => fitAllMapRoutes());
}

function renderMapFilters() {
  const status = document.getElementById("mapStatusFilter");
  if (!status) return;
  status.innerHTML = [
    ["todos", "Todos os status"], ["em andamento", "Em andamento"], ["planejada", "Planejadas"],
    ["concluída", "Concluídas"], ["cancelada", "Canceladas"]
  ].map(([value, label]) => `<option value="${value}" ${App.mapFilters.status === value ? "selected" : ""}>${label}</option>`).join("");

  document.getElementById("mapDriverFilter").innerHTML = `<option value="todos">Todos os motoristas</option>${getMotoristas().map((driver) => `<option value="${driver.id}" ${App.mapFilters.driver === driver.id ? "selected" : ""}>${driver.nome}</option>`).join("")}`;
  document.getElementById("mapTruckFilter").innerHTML = `<option value="todos">Todos os veículos/frota</option>${getCaminhoes().map((truck) => `<option value="${truck.id}" ${App.mapFilters.truck === truck.id ? "selected" : ""}>${truck.placa} - ${truck.modelo}</option>`).join("")}`;
  const cities = {};
  getRotas().forEach((route) => cities[coordKey(route.destinoMunicipio, route.destinoEstado)] = `${route.destinoMunicipio}/${route.destinoEstado}`);
  document.getElementById("mapCityFilter").innerHTML = `<option value="todos">Todas as cidades</option>${Object.entries(cities).map(([value, label]) => `<option value="${value}" ${App.mapFilters.city === value ? "selected" : ""}>${label}</option>`).join("")}`;
  document.getElementById("mapVehicleTypeFilter").innerHTML = `<option value="todos">Todos os tipos</option>${VEHICLE_TYPES.map((vehicle) => `<option value="${vehicle.id}" ${App.mapFilters.vehicleType === vehicle.id ? "selected" : ""}>${vehicle.nome}</option>`).join("")}`;
}

async function renderMapPanel() {
  renderMapFilters();
  const routes = await loadMapRoutes(App.mapFilters, App.mapLayers);
  renderMapSummary(routes);
  renderMapRouteCards(routes);
}

function renderMapSummary(routes) {
  const loads = routes.flatMap((route) => route.pedidos);
  const summary = [
    ["Total de rotas", routes.length],
    ["Em andamento", loads.filter((load) => load.status === "em rota").length],
    ["Pendentes", loads.filter((load) => ["aguardando rota", "aguardando separação"].includes(load.status)).length],
    ["Concluídas", loads.filter((load) => load.status === "entregue").length],
    ["Motoristas em rota", new Set(routes.map((route) => route.motoristaId)).size],
    ["Distância total", `${routes.reduce((sum, route) => sum + Number(route.distanciaKm || 0), 0).toFixed(1)} km`],
    ["Frete total", money.format(routes.reduce((sum, route) => sum + Number(route.freteTotal || 0), 0))]
  ];
  document.getElementById("mapSummary").innerHTML = summary.map(([label, value]) => `<div class="map-summary-card"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderMapRouteCards(routes) {
  document.getElementById("mapRouteCards").innerHTML = routes.length ? routes.map((route) => `
    <div class="map-route-card" style="border-left-color:${route.color}">
      <div class="map-route-title">
        <strong>${route.nome}</strong>
        ${badge(route.status)}
      </div>
      <div class="driver-chip" style="--driver-color:${route.color}">${route.motorista}</div>
      <p><b>Veículo:</b> ${route.veiculo}</p>
      <p><b>Origem:</b> ${route.origem}</p>
      <p><b>Destino:</b> ${route.destino}</p>
      <p><b>Paradas:</b> ${route.paradas}</p>
      <p><b>Distância:</b> ${formatDistance(route.distanciaKm)} · <b>Tempo:</b> ${route.tempo}</p>
      <p><b>Frete:</b> ${money.format(route.freteTotal)} · <b>Pedidos:</b> ${route.pedidos.length}</p>
      ${route.fallback ? '<p class="map-card-warning">Distância aproximada em linha reta. Rota por estrada indisponível no momento.</p>' : ""}
      <div class="map-card-actions">
        <button class="secondary-button" type="button" onclick="focusRoute('${route.id}')">Focar no mapa</button>
        <button class="secondary-button" type="button" onclick="openMapRouteDetails('${route.id}')">Ver detalhes</button>
      </div>
    </div>
  `).join("") : emptyText("Nenhuma rota encontrada para os filtros atuais.");
}

function openMapRouteDetails(routeId) {
  const route = getMapRouteViewData().find((item) => item.id === routeId);
  if (!route) return toast("Rota não encontrada no mapa.");
  document.getElementById("modalTitle").textContent = route.nome;
  document.getElementById("modalBody").innerHTML = `
    <div class="details-grid">
      <div class="detail-item"><span>Motorista</span><strong>${route.motorista}</strong></div>
      <div class="detail-item"><span>Veículo</span><strong>${route.veiculo}</strong></div>
      <div class="detail-item"><span>Status</span><strong>${route.status}</strong></div>
      <div class="detail-item"><span>Pedidos</span><strong>${route.pedidos.map((load) => load.codigo).join(", ")}</strong></div>
      <div class="detail-item"><span>Distância</span><strong>${formatDistance(route.distanciaKm)}</strong></div>
      <div class="detail-item"><span>Tempo</span><strong>${route.tempo}</strong></div>
      <div class="detail-item"><span>Frete total</span><strong>${money.format(route.freteTotal)}</strong></div>
      <div class="detail-item"><span>Cidades atendidas</span><strong>${route.cidades.join(", ")}</strong></div>
    </div>
  `;
  openModal();
}

function renderSettings() {
  const settings = getSettings();
  document.getElementById("settingsForm").innerHTML = `
    ${[
      ["empresa", "Nome da empresa", "text"], ["telefone", "WhatsApp da loja", "text"],
      ["endereco", "Endereço da loja", "text"], ["cidadeBase", "Cidade base", "text"],
      ["estado", "Estado", "text"], ["latitudeLoja", "Latitude da loja", "number"],
      ["longitudeLoja", "Longitude da loja", "number"], ["custoAdicionalFixo", "Custo adicional fixo", "number"],
      ["freteMinimo", "Valor mínimo de frete", "number"], ["custoKm", "Custo médio por km padrão", "number"],
      ["horario", "Horário de funcionamento", "text"]
    ].map(([name, label, type]) => `<div class="form-field"><label>${label}</label><input name="${name}" type="${type}" step="0.000001" value="${settings[name] || ""}" required></div>`).join("")}
    <div class="form-field"><label>Permitir entrega por moto</label><select name="entregaMoto"><option value="sim" ${settings.entregaMoto === "sim" ? "selected" : ""}>Sim</option><option value="nao" ${settings.entregaMoto === "nao" ? "selected" : ""}>Não</option></select></div>
    <div class="form-field"><label>Tema visual</label><select name="tema"><option value="light" ${settings.tema === "light" ? "selected" : ""}>Claro</option><option value="dark" ${settings.tema === "dark" ? "selected" : ""}>Escuro</option></select></div>
    <div class="modal-actions form-field full"><button class="primary-button" type="submit">Salvar configurações</button></div>
  `;
  document.getElementById("settingsForm").onsubmit = (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    ["latitudeLoja", "longitudeLoja", "custoAdicionalFixo", "freteMinimo", "custoKm"].forEach((key) => data[key] = Number(data[key]));
    saveSettings(data);
    applyTheme(data.tema);
    toast("Configurações salvas.");
    if (App.page === "mapa") renderLogisticsMap();
  };
}

function quickSearch(term) {
  const text = term.trim();
  if (!text) return;
  if (App.page !== "cargas") showPage("cargas");
  document.getElementById("filterCargaText").value = text;
  renderTables();
}

function applyTheme(theme) {
  document.body.dataset.theme = theme === "dark" ? "dark" : "light";
}

function getCollection(entity) {
  return ({ cargas: getCargas, motoristas: getMotoristas, caminhoes: getCaminhoes, rotas: getRotas })[entity]();
}

function saveByEntity(entity, data) {
  ({ cargas: saveCarga, motoristas: saveMotorista, caminhoes: saveCaminhao, rotas: saveRota })[entity](data);
}

function updateByEntity(entity, id, data) {
  ({ cargas: updateCarga, motoristas: updateMotorista, caminhoes: updateCaminhao, rotas: updateRota })[entity](id, data);
}

function deleteByEntity(entity, id) {
  ({ cargas: deleteCarga, motoristas: deleteMotorista, caminhoes: deleteCaminhao, rotas: deleteRota })[entity](id);
}

function valueOf(id) {
  return document.getElementById(id)?.value || "";
}

function openModal() {
  document.getElementById("modalBackdrop").classList.add("open");
}

function closeModal() {
  document.getElementById("modalBackdrop").classList.remove("open");
}

function toast(message) {
  const box = document.getElementById("toast");
  box.textContent = message;
  box.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove("show"), 3600);
}

function emptyText(text) {
  return `<div class="list-item"><span>${text}</span></div>`;
}

function formatDate(value) {
  if (!value) return "Sem data";
  return new Date(value).toLocaleString("pt-BR");
}

function singular(entity) {
  return ({ cargas: "pedido/carga", motoristas: "motorista", caminhoes: "caminhão", rotas: "rota" })[entity];
}

function labelize(key) {
  const labels = {
    descricao: "Produto/material",
    tipo: "Categoria do material",
    peso: "Peso aproximado",
    coleta: "Previsão de saída",
    entrega: "Previsão de entrega",
    cargasIds: "Pedidos/cargas",
    caminhaoId: "Caminhão",
    motoristaId: "Motorista",
    veiculoTipo: "Tipo de veículo",
    distanciaKm: "Distância estimada",
    valorFrete: "Valor do frete",
    freteTotal: "Frete total estimado",
    origemLat: "Latitude da origem",
    origemLng: "Longitude da origem"
  };
  return labels[key] || key.replace(/Ids$/, "s").replace(/Id$/, "").replace(/([A-Z])/g, " $1").replace(/^./, (m) => m.toUpperCase());
}
