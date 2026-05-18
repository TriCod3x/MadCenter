const App = {
  page: "dashboard",
  filters: { status: "", prioridade: "", destino: "", text: "" },
  mapFilters: { status: "todos", driver: "todos", city: "todos" }
};

const pageNames = {
  dashboard: "Dashboard",
  pedidos: "Pedidos",
  motoristas: "Motoristas",
  rotas: "Rotas",
  mapa: "Mapa de Entregas",
  configuracoes: "Configurações"
};

const statusColors = {
  "aguardando rota": "yellow",
  "em rota": "blue",
  "entregue": "green",
  "próximo dia": "purple",
  "cancelado": "red",
  "disponível": "green",
  "em entrega": "blue",
  "inativo": "gray",
  "planejada": "yellow",
  "em andamento": "blue",
  "concluída": "green",
  "cancelada": "red"
};

const priorityOrder = { urgente: 3, alta: 2, normal: 1, baixa: 0 };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const fields = {
  cargas: [
    ["descricao", "Produto/material", "text", true],
    ["tipo", "Categoria do material", "select:Tintas,Elétrica,Hidráulica,Ferramentas,Pisos e revestimentos,Cimento e argamassa,Outros", true],
    ["peso", "Peso (kg)", "number", true],
    ["volume", "Volume", "text", false],
    ["destinoMunicipio", "Município de destino", "city", true],
    ["destinoEstado", "Estado de destino", "text", true],
    ["enderecoEntrega", "Endereço de entrega", "text", true],
    ["cliente", "Cliente", "text", true],
    ["telefone", "Telefone/WhatsApp", "text", true],
    ["coleta", "Data prevista de saída", "date", true],
    ["entrega", "Data prevista de entrega", "date", true],
    ["prioridade", "Prioridade", "select:baixa,normal,alta,urgente", true],
    ["veiculoTipo", "Tipo de veículo", "vehicle", true],
    ["status", "Status", "select:aguardando rota,em rota,próximo dia,entregue,cancelado", true],
    ["observacoes", "Observações", "textarea", false]
  ],
  motoristas: [
    ["nome", "Nome", "text", true],
    ["telefone", "WhatsApp", "text", true],
    ["categoria", "Categoria", "select:B,C,D,E", true],
    ["capacidade", "Capacidade do motorista (kg)", "number", true],
    ["cidade", "Cidade atual", "text", true],
    ["estado", "Estado atual", "text", true],
    ["status", "Status", "select:disponível,em entrega,inativo", true],
    ["observacoes", "Observações", "textarea", false]
  ],
  rotas: [
    ["nome", "Nome da rota", "text", true],
    ["tipoRota", "Tipo de rota", "select:Rodoviária,Urbana,Mista", true],
    ["destinoMunicipio", "Município de destino", "city", true],
    ["destinoEstado", "Estado de destino", "text", true],
    ["motoristaId", "Motorista", "driver", true],
    ["saida", "Previsão de saída", "datetime-local", true],
    ["chegada", "Previsão de chegada", "datetime-local", true],
    ["status", "Status", "select:planejada,em andamento,concluída,cancelada", true],
    ["observacoes", "Observações", "textarea", false]
  ]
};

document.addEventListener("DOMContentLoaded", async () => {
  await initStorage();
  applyTheme(getSettings().tema);
  bindLayoutEvents();
  renderFilters();
  showPage(App.page);
  renderAll();
});
renderAll();


function bindLayoutEvents() {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.page));
  });
  document.getElementById("menuToggle").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalBackdrop").addEventListener("click", (event) => {
    if (event.target.id === "modalBackdrop") closeModal();
  });
  document.querySelectorAll("[data-action='new']").forEach((button) => {
    button.addEventListener("click", () => openForm(button.dataset.entity));
  });
  document.getElementById("themeToggle").addEventListener("click", () => {
    const next = document.body.dataset.theme === "dark" ? "light" : "dark";
    saveSettings({ tema: next });
    applyTheme(next);
  });
  document.getElementById("quickSearch").addEventListener("input", (event) => {
    App.filters.text = event.target.value;
    renderAll();
  });
  document.getElementById("motoristasSearch").addEventListener("input", renderTables);
  document.getElementById("rotasSearch").addEventListener("input", renderTables);
  document.getElementById("generateRoutesBtn").addEventListener("click", generateRoutesByMunicipality);
  document.getElementById("mapReloadRoutes").addEventListener("click", renderMapPanel);
  document.getElementById("mapFitRoutes").addEventListener("click", fitAllMapRoutes);
  document.getElementById("restoreSeedBtn").addEventListener("click", () => {
    confirmAction("Restaurar dados de exemplo?", () => {
      initStorage(true);
      applyTheme(getSettings().tema);
      renderAll();
      toast("Dados exemplo restaurados.");
    });
  });
  document.getElementById("clearDataBtn").addEventListener("click", () => {
    confirmAction("Limpar todos os dados salvos?", () => {
      resetToEmptyData();
      renderAll();
      toast("Dados limpos.");
    });
  });
}

function showPage(page) {
  App.page = page;
  document.querySelectorAll(".page").forEach((section) => section.classList.toggle("active", section.id === `page-${page}`));
  document.querySelectorAll(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
  document.getElementById("pageTitle").textContent = pageNames[page] || "";
  if (page === "mapa") renderMapPanel();
  renderAll();
}

function renderAll() {
  renderDashboard();
  renderTables();
  renderSettings();
  if (App.page === "mapa") renderMapPanel();
}

function renderDashboard() {
  const cargas = getCargas();
  const motoristas = getMotoristas();
  const rotas = getRotas();
  const pending = cargas.filter((c) => ["aguardando rota", "próximo dia"].includes(c.status)).length;
  const progress = cargas.filter((c) => c.status === "em rota").length;
  const completed = cargas.filter((c) => c.status === "entregue").length;
  const nextDay = cargas.filter((c) => c.status === "próximo dia").length;
  const availableDrivers = motoristas.filter((m) => m.status === "disponível").length;
  const plannedRoutes = rotas.filter((r) => r.status === "planejada").length;
  const activeRoutes = rotas.filter((r) => r.status === "em andamento").length;

  const metrics = [
    ["Pedidos cadastrados", cargas.length],
    ["Aguardando rota", pending],
    ["Em rota", progress],
    ["Próximo dia", nextDay],
    ["Entregues", completed],
    ["Motoristas disponíveis", availableDrivers],
    ["Rotas planejadas", plannedRoutes],
    ["Rotas em andamento", activeRoutes]
  ];

  document.getElementById("dashboardMetrics").innerHTML = metrics.map(([label, value], index) => `
    <div class="metric-card"><div class="metric-icon">${index + 1}</div><span>${label}</span><strong>${value}</strong></div>
  `).join("");

  document.getElementById("latestCargas").innerHTML = cargas.slice(-5).reverse().map((c) => `
    <div class="list-item"><div><strong>${c.codigo} - ${c.descricao}</strong><span>${c.cliente} · ${c.destinoMunicipio}/${c.destinoEstado} · ${vehicleName(c.veiculoTipo)}</span></div>${badge(c.status)}</div>
  `).join("") || emptyText("Nenhum pedido cadastrado.");

  document.getElementById("nextRotas").innerHTML = rotas.filter((r) => r.status !== "concluída").slice(0, 5).map((r) => `
    <div class="list-item"><div><strong>${r.codigo} - ${r.nome}</strong><span>${r.destinoMunicipio}/${r.destinoEstado} · ${driverName(r.motoristaId)}</span></div>${badge(r.status)}</div>
  `).join("") || emptyText("Nenhuma rota prevista.");

  const alerts = [];
  const suggestions = buildRouteSuggestions();
  if (suggestions.length) {
    alerts.push(`Há ${suggestions.length} municípios com 2+ pedidos pendentes para gerar rota.`);
  }
  if (nextDay) {
    alerts.push(`${nextDay} pedido(s) marcado(s) como próximo dia.`);
  }
  if (!motoristas.length) {
    alerts.push("Nenhum motorista cadastrado. Cadastre motoristas antes de gerar rotas.");
  }
  if (!alerts.length) alerts.push("Nenhum alerta no momento.");

  document.getElementById("alertsList").innerHTML = alerts.map((alert) => `<div class="list-item"><strong>${alert}</strong></div>`).join("");
}

function buildRouteSuggestions() {
  const groups = {};
  getCargas().filter((c) => ["aguardando rota", "próximo dia"].includes(c.status)).forEach((c) => {
    const key = `${c.destinoMunicipio}|${c.destinoEstado}`;
    groups[key] = groups[key] || { municipio: c.destinoMunicipio, estado: c.destinoEstado, pedidos: [] };
    groups[key].pedidos.push(c);
  });
  return Object.values(groups).filter((group) => group.pedidos.length >= 2);
}

function renderFilters() {
  document.getElementById("cargasFilters").innerHTML = `
    <select id="filterPedidoStatus"><option value="">Todos os status</option><option value="aguardando rota">Aguardando rota</option><option value="em rota">Em rota</option><option value="próximo dia">Próximo dia</option><option value="entregue">Entregue</option><option value="cancelado">Cancelado</option></select>
    <select id="filterPedidoPrioridade"><option value="">Todas as prioridades</option><option value="urgente">Urgente</option><option value="alta">Alta</option><option value="normal">Normal</option><option value="baixa">Baixa</option></select>
    <input id="filterPedidoDestino" placeholder="Destino" type="text">
    <input id="filterPedidoText" placeholder="Buscar material ou cliente" type="search">
  `;

  document.getElementById("filterPedidoStatus").addEventListener("change", (event) => {
    App.filters.status = event.target.value;
    renderTables();
  });
  document.getElementById("filterPedidoPrioridade").addEventListener("change", (event) => {
    App.filters.prioridade = event.target.value;
    renderTables();
  });
  document.getElementById("filterPedidoDestino").addEventListener("input", (event) => {
    App.filters.destino = event.target.value;
    renderTables();
  });
  document.getElementById("filterPedidoText").addEventListener("input", (event) => {
    App.filters.text = event.target.value;
    renderTables();
  });
}

function renderTables() {
  renderPedidosTable();
  renderMotoristasTable();
  renderRotasTable();
}

function renderPedidosTable() {
  const filters = App.filters;
  const rows = getCargas().filter((c) => {
    const query = filters.text.trim().toLowerCase();
    const haystack = `${c.codigo} ${c.descricao} ${c.cliente} ${c.destinoMunicipio} ${c.destinoEstado}`.toLowerCase();
    return (!filters.status || c.status === filters.status)
      && (!filters.prioridade || c.prioridade === filters.prioridade)
      && (!filters.destino || c.destinoMunicipio.toLowerCase().includes(filters.destino.toLowerCase()) || c.destinoEstado.toLowerCase().includes(filters.destino.toLowerCase()))
      && (!query || haystack.includes(query));
  });
  table("pedidosTable", ["Código", "Cliente", "Material", "Destino", "Peso", "Veículo", "Frete", "Status", "Ações"], rows.map((c) => [
    c.codigo,
    c.cliente,
    c.descricao,
    `${c.destinoMunicipio}/${c.destinoEstado}`,
    `${c.peso} kg`,
    vehicleName(c.veiculoTipo),
    money.format(Number(c.valorFrete || 0)),
    badge(c.status),
    actionsPedido(c.id)
  ]));
}

function renderMotoristasTable() {
  const search = valueOf("motoristasSearch").toLowerCase();
  const rows = getMotoristas().filter((m) => `${m.nome} ${m.telefone} ${m.cidade} ${m.estado}`.toLowerCase().includes(search));
  table("motoristasTable", ["Nome", "WhatsApp", "Categoria", "Capacidade", "Cidade", "Status", "Ações"], rows.map((m) => [
    m.nome,
    m.telefone,
    m.categoria,
    `${m.capacidade} kg`,
    `${m.cidade}/${m.estado}`,
    badge(m.status),
    actions("motoristas", m.id)
  ]));
}

function renderRotasTable() {
  const search = valueOf("rotasSearch").toLowerCase();
  const rows = getRotas().filter((r) => `${r.codigo} ${r.nome} ${r.destinoMunicipio} ${r.destinoEstado}`.toLowerCase().includes(search));
  table("rotasTable", ["Código", "Nome", "Destino", "Motorista", "Pedidos", "Distância", "Frete", "Status", "Ações"], rows.map((r) => [
    r.codigo,
    r.nome,
    `${r.destinoMunicipio}/${r.destinoEstado}`,
    driverName(r.motoristaId),
    `${(r.cargasIds || []).length}`,
    `${Number(r.distancia || 0).toFixed(1)} km`,
    money.format(Number(r.freteTotal || 0)),
    badge(r.status),
    actions("rotas", r.id)
  ]));
}

function table(id, headers, rows) {
  const element = document.getElementById(id);
  if (!element) return;
  element.innerHTML = `
    <thead><tr>${headers.map((label) => `<th>${label}</th>`).join("")}</tr></thead>
    <tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}">Nenhum registro encontrado.</td></tr>`}</tbody>
  `;
}

function actions(entity, id) {
  return `
    <div class="actions-cell">
      <button class="table-action" onclick="openForm('${entity}','${id}')">Editar</button>
      <button class="table-action" onclick="confirmDelete('${entity}','${id}')">Excluir</button>
    </div>
  `;
}

function actionsPedido(id) {
  const pedido = getCargas().find((item) => item.id === id) || {};
  return `
    <div class="actions-cell">
      <button class="table-action" onclick="openForm('cargas','${id}')">Editar</button>
      ${pedido.status === 'em rota' ? `<button class="table-action" onclick="markAsDelivered('${id}')">Entrega feita</button>` : ''}
      <button class="table-action" onclick="confirmDelete('cargas','${id}')">Excluir</button>
    </div>
  `;
}

function openForm(entity, id = null) {
  App.modal = { entity, mode: id ? "edit" : "new", id };
  const item = id ? getCollection(entity).find((record) => record.id === id) : defaultItem(entity);
  document.getElementById("modalTitle").textContent = `${id ? "Editar" : "Cadastrar"} ${singular(entity)}`;
  document.getElementById("modalBody").innerHTML = `
    <form id="entityForm" class="form-grid">
      ${fields[entity].map((field) => fieldHtml(field, item)).join("")}
      <div class="modal-actions form-field full">
        <button class="secondary-button" type="button" onclick="closeModal()">Cancelar</button>
        <button class="primary-button" type="submit">Salvar</button>
      </div>
    </form>
  `;
  document.getElementById("entityForm").addEventListener("submit", submitEntityForm);
  openModal();
}

function defaultItem(entity) {
  if (entity === "cargas") {
    return { descricao: "", tipo: "Tintas", peso: 0, volume: "", destinoMunicipio: "Timon", destinoEstado: "MA", enderecoEntrega: "", cliente: "", telefone: "", coleta: "", entrega: "", prioridade: "normal", veiculoTipo: "caminhonete", status: "aguardando rota", observacoes: "" };
  }
  if (entity === "motoristas") {
    return { nome: "", telefone: "", categoria: "D", capacidade: 1800, cidade: "Timon", estado: "MA", status: "disponível", observacoes: "" };
  }
  if (entity === "rotas") {
    return { nome: "", tipoRota: "Rodoviária", destinoMunicipio: "Timon", destinoEstado: "MA", motoristaId: "", saida: "", chegada: "", status: "planejada", observacoes: "" };
  }
  return {};
}

function singular(entity) {
  return entity === "cargas" ? "pedido" : entity === "motoristas" ? "motorista" : entity === "rotas" ? "rota" : entity;
}

function fieldHtml(field, item) {
  const [name, label, type, required] = field;
  const value = item?.[name] ?? "";
  const requiredAttr = required ? "required" : "";

  if (type.startsWith("select:")) {
    const options = type.split(":")[1].split(",");
    const selectOptions = options.map((option) => `<option value="${option}" ${option === value ? "selected" : ""}>${option}</option>`).join("");
    return `
      <label class="form-field">
        <span>${label}</span>
        <select name="${name}" ${requiredAttr}>
          ${selectOptions}
        </select>
      </label>
    `;
  }

  if (type === "city") {
    const selectOptions = cityOptions().map((city) => `<option value="${city.nome}" ${city.nome === value ? "selected" : ""}>${city.nome} - ${city.estado}</option>`).join("");
    return `
      <label class="form-field">
        <span>${label}</span>
        <select name="${name}" ${requiredAttr}>
          ${selectOptions}
        </select>
      </label>
    `;
  }

  if (type === "driver") {
    const selectOptions = getMotoristas().map((driver) => `<option value="${driver.id}" ${driver.id === value ? "selected" : ""}>${driver.nome} (${driver.cidade}/${driver.estado})</option>`).join("");
    return `
      <label class="form-field">
        <span>${label}</span>
        <select name="${name}" ${requiredAttr}>
          <option value="">Selecione um motorista</option>
          ${selectOptions}
        </select>
      </label>
    `;
  }

  if (type === "vehicle") {
    const selectOptions = VEHICLE_TYPES.map((vehicle) => `<option value="${vehicle.id}" ${vehicle.id === value ? "selected" : ""}>${vehicle.nome}</option>`).join("");
    return `
      <label class="form-field">
        <span>${label}</span>
        <select name="${name}" ${requiredAttr}>
          ${selectOptions}
        </select>
      </label>
    `;
  }

  if (type === "textarea") {
    return `
      <label class="form-field full">
        <span>${label}</span>
        <textarea name="${name}" rows="4" ${requiredAttr}>${value || ""}</textarea>
      </label>
    `;
  }

  return `
    <label class="form-field${type === "datetime-local" ? " full" : ""}">
      <span>${label}</span>
      <input type="${type}" name="${name}" value="${value || ""}" ${requiredAttr}>
    </label>
  `;
}

function submitEntityForm(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form).entries());
  const entity = App.modal.entity;

  if (entity === "cargas") {
    data.peso = Number(data.peso || 0);
    data.distanciaKm = Number(data.distanciaKm || 0);
    data.valorFrete = Number(data.valorFrete || 0);
    const pick = computeCargoFreight(data);
    if (!pick.error) {
      data.distanciaKm = pick.distanceKm;
      data.valorFrete = pick.freight;
    }
  }

  if (entity === "motoristas") {
    data.capacidade = Number(data.capacidade || 0);
  }

  if (entity === "rotas") {
    data.motoristaId = data.motoristaId || "";
    data.cargasIds = data.cargasIds ? data.cargasIds.split(",").map((id) => id.trim()).filter(Boolean) : [];
    data.distancia = Number(data.distancia || 0);
    data.freteTotal = Number(data.freteTotal || 0);
  }

  if (App.modal.mode === "new") {
    if (entity === "cargas") saveCarga(data);
    if (entity === "motoristas") saveMotorista(data);
    if (entity === "rotas") saveRota(data);
  } else {
    if (entity === "cargas") updateCarga(App.modal.id, data);
    if (entity === "motoristas") updateMotorista(App.modal.id, data);
    if (entity === "rotas") updateRota(App.modal.id, data);
  }

  if (entity === "rotas" && data.motoristaId) {
    syncDriverStatus(data.motoristaId);
  }

  if (entity === "cargas") {
    const route = getRotas().find((rota) => rota.cargasIds?.includes(App.modal.id));
    if (route) syncRouteStatus(route.id);
  }

  closeModal();
  renderAll();
  toast(`${capitalizeFirstLetter(singular(entity))} salvo com sucesso.`);
}

function computeCargoFreight(data) {
  const origin = getStoreOrigin();
  const destination = getCityCoordinates(data.destinoMunicipio, data.destinoEstado);
  if (!destination) return { error: "Município de destino não cadastrado." };
  const vehicle = VEHICLE_TYPES.find((item) => item.id === data.veiculoTipo);
  if (!vehicle) return { error: "Tipo de veículo inválido." };
  const weight = Number(data.peso || 0);
  if (weight > vehicle.capacidade) {
    return { error: `O veículo ${vehicle.nome} suporta até ${vehicle.capacidade} kg.` };
  }
  const distanceKm = calculateDistanceKm(origin.lat, origin.lng, destination.lat, destination.lng);
  const freight = Math.max(vehicle.custoBase + distanceKm * vehicle.custoKm + Number(getSettings().custoAdicionalFixo || 0), Number(getSettings().freteMinimo || 0));
  return { origin, destination, distanceKm: Number(distanceKm.toFixed(1)), freight: Number(freight.toFixed(2)) };
}

function calculateDistanceKm(originLat, originLng, destLat, destLng) {
  const toRad = (degree) => degree * Math.PI / 180;
  const dLat = toRad(destLat - originLat);
  const dLng = toRad(destLng - originLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(originLat)) * Math.cos(toRad(destLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function badge(value) {
  const color = statusColors[value] || "gray";
  return `<span class="badge badge-${color}">${value || "sem status"}</span>`;
}

function getStoreOrigin() {
  const settings = getSettings();
  return {
    lat: Number(settings.latitudeLoja || STORE_LOCATION.lat),
    lng: Number(settings.longitudeLoja || STORE_LOCATION.lng)
  };
}

function cityOptions() {
  return Object.values(MUNICIPIOS_COORDS).sort((a, b) => a.nome.localeCompare(b.nome));
}

function vehicleName(id) {
  return VEHICLE_TYPES.find((vehicle) => vehicle.id === id)?.nome || "Não informado";
}

function inferRouteType(cargas) {
  const totalWeight = cargas.reduce((sum, carga) => sum + Number(carga.peso || 0), 0);
  const anyUrgent = cargas.some((carga) => carga.prioridade === "urgente");
  if (anyUrgent) return "Urbana";
  if (totalWeight > 1200) return "Rodoviária";
  return "Mista";
}

function driverName(id) {
  return getMotoristas().find((driver) => driver.id === id)?.nome || "Não vinculado";
}

function openModal() {
  document.getElementById("modalBackdrop").classList.add("active");
}

function closeModal() {
  document.getElementById("modalBackdrop").classList.remove("active");
}

function confirmAction(message, action) {
  if (window.confirm(message)) action();
}

function toast(message) {
  const toastElement = document.getElementById("toast");
  toastElement.textContent = message;
  toastElement.classList.add("active");
  setTimeout(() => toastElement.classList.remove("active"), 3000);
}

function valueOf(id) {
  const element = document.getElementById(id);
  return element ? element.value : "";
}

function emptyText(text) {
  return `<div class="empty-state">${text}</div>`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function capitalizeFirstLetter(text) {
  return String(text || "").charAt(0).toUpperCase() + String(text || "").slice(1);
}

function getCollection(entity) {
  if (entity === "cargas") return getCargas();
  if (entity === "motoristas") return getMotoristas();
  if (entity === "rotas") return getRotas();
  return [];
}

function generateRoutesByMunicipality() {
  const pending = getCargas().filter((c) => ["aguardando rota", "próximo dia"].includes(c.status));
  const availableDrivers = getMotoristas().filter((driver) => driver.status === "disponível").sort((a, b) => b.capacidade - a.capacidade);
  const groups = {};

  pending.forEach((pedido) => {
    const key = `${pedido.destinoMunicipio}|${pedido.destinoEstado}`;
    groups[key] = groups[key] || { municipio: pedido.destinoMunicipio, estado: pedido.destinoEstado, pedidos: [] };
    groups[key].pedidos.push(pedido);
  });

  let created = 0;
  let overflowCount = 0;

  Object.values(groups).forEach((group) => {
    if (group.pedidos.length < 2) return;
    const sorted = [...group.pedidos].sort((a, b) => (priorityOrder[b.prioridade || "normal"] || 0) - (priorityOrder[a.prioridade || "normal"] || 0));
    const smallestWeight = Math.min(...sorted.map((item) => Number(item.peso || 0)));
    const driver = availableDrivers.find((d) => d.capacidade >= smallestWeight);
    if (!driver) {
      group.pedidos.forEach((pedido) => updateCarga(pedido.id, { status: "próximo dia" }));
      overflowCount += group.pedidos.length;
      return;
    }

    let assigned = [];
    let usedWeight = 0;

    sorted.forEach((pedido) => {
      const weight = Number(pedido.peso || 0);
      if (assigned.length === 0 || usedWeight + weight <= driver.capacidade) {
        assigned.push(pedido);
        usedWeight += weight;
      } else {
        updateCarga(pedido.id, { status: "próximo dia" });
        overflowCount += 1;
      }
    });

    if (!assigned.length) return;
    const routeType = inferRouteType(assigned);
    const route = saveRota({
      nome: `${group.municipio} · ${driver.nome}`,
      tipoRota: routeType,
      destinoMunicipio: group.municipio,
      destinoEstado: group.estado,
      motoristaId: driver.id,
      cargasIds: assigned.map((pedido) => pedido.id),
      saida: `${assigned[0].coleta || ""}T08:00`,
      chegada: `${assigned[0].entrega || ""}T14:00`,
      distancia: Number(assigned.reduce((sum, pedido) => sum + Number(pedido.distanciaKm || 0), 0).toFixed(1)),
      freteTotal: Number(assigned.reduce((sum, pedido) => sum + Number(pedido.valorFrete || 0), 0).toFixed(2)),
      tempo: "3h00",
      status: "planejada",
      observacoes: "Rota gerada automaticamente por município."
    });

    assigned.forEach((pedido) => updateCarga(pedido.id, { status: "em rota" }));
    updateMotorista(driver.id, { status: "em entrega" });
    availableDrivers.splice(availableDrivers.indexOf(driver), 1);
    created += 1;
  });

  renderAll();
  if (created === 0) {
    toast("Nenhuma rota gerada. Verifique motoristas disponíveis e pedidos agrupáveis.");
  } else {
    toast(`Rotas geradas: ${created}. Pedidos deslocados para próximo dia: ${overflowCount}.`);
  }
}

function syncRouteStatus(routeId) {
  const route = getRotas().find((item) => item.id === routeId);
  if (!route) return;
  const pedidos = getCargas().filter((carga) => (route.cargasIds || []).includes(carga.id));
  if (!pedidos.length) return;
  if (pedidos.every((pedido) => pedido.status === "entregue")) {
    updateRota(routeId, { status: "concluída" });
    syncDriverStatus(route.motoristaId);
    return;
  }
  if (pedidos.some((pedido) => pedido.status === "em rota")) {
    updateRota(routeId, { status: "em andamento" });
    updateMotorista(route.motoristaId, { status: "em entrega" });
    return;
  }
  updateRota(routeId, { status: "planejada" });
  updateMotorista(route.motoristaId, { status: "em entrega" });
}

function syncDriverStatus(driverId) {
  const activeRoutes = getRotas().filter((rota) => rota.motoristaId === driverId && ["planejada", "em andamento"].includes(rota.status));
  if (!activeRoutes.length) {
    updateMotorista(driverId, { status: "disponível" });
  } else {
    updateMotorista(driverId, { status: "em entrega" });
  }
}

function markAsDelivered(id) {
  const pedido = getCargas().find((item) => item.id === id);
  if (!pedido) return;
  updateCarga(id, { status: "entregue" });
  const rota = getRotas().find((route) => (route.cargasIds || []).includes(id));
  if (rota) syncRouteStatus(rota.id);
  renderAll();
  toast("Entrega marcada como feita.");
}

function confirmDelete(entity, id) {
  confirmAction("Excluir este registro?", () => {
    if (entity === "cargas") deleteCarga(id);
    if (entity === "motoristas") deleteMotorista(id);
    if (entity === "rotas") {
      const route = getRotas().find((item) => item.id === id);
      if (route) syncDriverStatus(route.motoristaId);
      deleteRota(id);
    }
    renderAll();
    toast("Registro excluído.");
  });
}

function renderSettings() {
  const settings = getSettings();
  document.getElementById("settingsForm").innerHTML = `
    <div class="form-field full"><label>Empresa<input name="empresa" value="${settings.empresa || ""}" required></label></div>
    <div class="form-field"><label>Telefone<input name="telefone" value="${settings.telefone || ""}" required></label></div>
    <div class="form-field"><label>Endereço<input name="endereco" value="${settings.endereco || ""}" required></label></div>
    <div class="form-field"><label>Cidade base<input name="cidadeBase" value="${settings.cidadeBase || ""}" required></label></div>
    <div class="form-field"><label>Estado base<input name="estado" value="${settings.estado || ""}" required></label></div>
    <div class="form-field"><label>Latitude<input name="latitudeLoja" type="number" step="0.000001" value="${settings.latitudeLoja || ""}" required></label></div>
    <div class="form-field"><label>Longitude<input name="longitudeLoja" type="number" step="0.000001" value="${settings.longitudeLoja || ""}" required></label></div>
    <div class="form-field"><label>Frete mínimo<input name="freteMinimo" type="number" step="0.01" value="${settings.freteMinimo || 0}" required></label></div>
    <div class="form-field"><label>Entrega em moto<select name="entregaMoto"><option value="sim" ${settings.entregaMoto === "sim" ? "selected" : ""}>Sim</option><option value="não" ${settings.entregaMoto !== "sim" ? "selected" : ""}>Não</option></select></label></div>
    <div class="form-field full"><label>Horário de funcionamento<textarea name="horario" rows="3">${settings.horario || ""}</textarea></label></div>
    <div class="form-field full"><label>Tema<select name="tema"><option value="light" ${settings.tema === "light" ? "selected" : ""}>Claro</option><option value="dark" ${settings.tema === "dark" ? "selected" : ""}>Escuro</option></select></label></div>
    <div class="form-field full"><button class="primary-button" type="submit">Salvar configurações</button></div>
  `;
  document.getElementById("settingsForm").addEventListener("submit", submitSettingsForm);
}

function submitSettingsForm(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  saveSettings({
    empresa: data.empresa,
    telefone: data.telefone,
    endereco: data.endereco,
    cidadeBase: data.cidadeBase,
    estado: data.estado,
    latitudeLoja: Number(data.latitudeLoja),
    longitudeLoja: Number(data.longitudeLoja),
    freteMinimo: Number(data.freteMinimo),
    entregaMoto: data.entregaMoto,
    horario: data.horario,
    tema: data.tema
  });
  applyTheme(data.tema);
  toast("Configurações salvas.");
}

function renderMapPanel() {
  const statusOptions = ["todos", "planejada", "em andamento", "concluída", "cancelada"];
  const drivers = getMotoristas();
  const cities = [...new Set(getRotas().map((route) => coordKey(route.destinoMunicipio, route.destinoEstado)))].sort();

  document.getElementById("mapStatusFilter").innerHTML = statusOptions.map((status) => `<option value="${status}">${status === "todos" ? "Todos os status" : status}</option>`).join("");
  document.getElementById("mapDriverFilter").innerHTML = `<option value="todos">Todos os motoristas</option>${drivers.map((driver) => `<option value="${driver.id}">${driver.nome}</option>`).join("")}`;
  document.getElementById("mapCityFilter").innerHTML = `<option value="todos">Todas as cidades</option>${cities.map((key) => {
    const city = MUNICIPIOS_COORDS[key];
    return `<option value="${key}">${city?.nome || key}</option>`;
  }).join("")}`;

  document.getElementById("mapStatusFilter").value = App.mapFilters.status;
  document.getElementById("mapDriverFilter").value = App.mapFilters.driver;
  document.getElementById("mapCityFilter").value = App.mapFilters.city;

  ["mapStatusFilter", "mapDriverFilter", "mapCityFilter"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => {
      App.mapFilters = {
        status: document.getElementById("mapStatusFilter").value,
        driver: document.getElementById("mapDriverFilter").value,
        city: document.getElementById("mapCityFilter").value
      };
      renderLogisticsMap(App.mapFilters).catch(() => {
        toast("Não foi possível atualizar o mapa. Verifique a conexão ou a API de rotas.");
      });
    });
  });

  renderLogisticsMap(App.mapFilters).catch(() => {
    toast("Não foi possível carregar o mapa. Verifique a conexão ou a API de rotas.");
  });
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  document.getElementById("themeToggle").textContent = `Tema: ${theme === "dark" ? "Escuro" : "Claro"}`;
}
