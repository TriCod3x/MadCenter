const App = {
  page: "dashboard",
  filters: { status: "", prioridade: "", destino: "", text: "" },
  mapFilters: { status: "", driver: "todos", city: "todos" }
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
    ["cep", "CEP", "cep", false],
    ["destinoMunicipio", "Município de destino", "city", true],
    ["destinoEstado", "Estado de destino", "text", true],
    ["enderecoEntrega", "Endereço de entrega", "text", true],
    ["numero", "Número", "text", false],
    ["complemento", "Complemento", "text", false],
    ["cliente", "Cliente", "text", true],
    ["telefone", "Telefone/WhatsApp", "phone", true],
    ["coleta", "Data prevista de saída", "date", true],
    ["entrega", "Data prevista de entrega", "date", true],
    ["prioridade", "Prioridade", "select:baixa,normal,alta,urgente", true],
    ["veiculoTipo", "Tipo de veículo", "vehicle", true],
    ["status", "Status", "select:aguardando rota,em rota,próximo dia,entregue,cancelado", true],
    ["observacoes", "Observações", "textarea", false]
  ],
  motoristas: [
    ["nome", "Nome", "text", true],
    ["telefone", "WhatsApp", "phone", true],
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

const SESSION_KEY = "madcenter_auth";

// Estado do seletor de localização no mapa
let _mapPicker = null;
let _mapPickerMarker = null;
let _mapPickerCoords = null;
let _mapPickerForm = null;
let _mapPickerInitTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (localStorage.getItem(SESSION_KEY) !== "1") {
    window.location.replace("login.html");
    return;
  }
  applyTheme(localStorage.getItem("madcenter_tema") || "dark");
  bindLayoutEvents();
  renderFilters();
  showPage(App.page);
  try {
    await initStorage();
    renderAll();
  } catch (e) {
    console.error("Erro ao carregar dados do servidor:", e);
    toast("Erro ao conectar ao servidor. Verifique se o backend está rodando.");
  }
});

function bindLayoutEvents() {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.page));
  });
  document.getElementById("menuToggle").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalBackdrop").addEventListener("click", (event) => {
    if (event.target.id === "modalBackdrop") closeModal();
  });
  document.getElementById("mapPickerClose").addEventListener("click", closeMapPicker);
  document.getElementById("mapPickerCancel").addEventListener("click", closeMapPicker);
  document.getElementById("mapPickerConfirm").addEventListener("click", confirmMapLocation);
  document.getElementById("mapPickerBackdrop").addEventListener("click", (event) => {
    if (event.target.id === "mapPickerBackdrop") closeMapPicker();
  });
  document.querySelectorAll("[data-action='new']").forEach((button) => {
    button.addEventListener("click", () => openForm(button.dataset.entity));
  });
  document.getElementById("themeToggle").addEventListener("click", () => {
    const next = document.body.dataset.theme === "dark" ? "light" : "dark";
    localStorage.setItem("madcenter_tema", next);
    applyTheme(next);
  });
  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    window.location.replace("login.html");
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
      applyTheme(localStorage.getItem("madcenter_tema") || "dark");
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
  const munInput = document.querySelector('#entityForm [name="destinoMunicipio"]');
  if (munInput) setupMunicipioAutocomplete(munInput);
  openModal();
}

function defaultItem(entity) {
  if (entity === "cargas") {
    return { descricao: "", tipo: "Tintas", peso: 0, volume: "", cep: "", destinoMunicipio: "Timon", destinoEstado: "MA", enderecoEntrega: "", numero: "", complemento: "", cliente: "", telefone: "", coleta: "", entrega: "", prioridade: "normal", veiculoTipo: "caminhonete", status: "aguardando rota", observacoes: "", lat: null, lng: null };
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
    return `
      <label class="form-field">
        <span>${label}</span>
        <div class="mun-autocomplete-wrap">
          <input type="text" name="${name}" value="${value || ""}" placeholder="Digite 3+ letras para buscar…" autocomplete="off" ${requiredAttr}>
          <ul class="mun-suggestions" hidden></ul>
        </div>
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

  if (type === "phone") {
    return `
      <label class="form-field">
        <span>${label}</span>
        <input type="tel" name="${name}" value="${value || ""}" placeholder="(99) 9 9999-9999" maxlength="16" autocomplete="tel" oninput="applyPhoneMask(this)" ${requiredAttr}>
      </label>
    `;
  }

  if (type === "cep") {
    const freteFormatado = item?.valorFrete ? money.format(Number(item.valorFrete)) : "";
    return `
      <label class="form-field">
        <span>${label}</span>
        <div class="cep-wrap">
          <div class="cep-input-row">
            <input type="text" name="${name}" value="${value || ""}" placeholder="00000-000" maxlength="9" autocomplete="postal-code" oninput="applyCepMask(this)" onblur="lookupCep(this)">
            <button type="button" class="btn-map-picker" onclick="openMapPicker()">📍 Selecionar no mapa</button>
          </div>
          <span class="cep-msg" id="cepMsg"></span>
        </div>
      </label>
      <label class="form-field">
        <span>Frete estimado (R$ 0,50/km)</span>
        <input type="text" id="freteDisplay" readonly placeholder="Calculado ao selecionar local" value="${freteFormatado}">
      </label>
      <input type="hidden" name="lat" value="${item?.lat || ""}">
      <input type="hidden" name="lng" value="${item?.lng || ""}">
      <input type="hidden" name="valorFrete" value="${item?.valorFrete || ""}">
      <input type="hidden" name="distanciaKm" value="${item?.distanciaKm || ""}">
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

async function submitEntityForm(event) {
  event.preventDefault();
  try {
    const form = event.target;
    const data = Object.fromEntries(new FormData(form).entries());
    const entity = App.modal.entity;

    console.log("submitEntityForm →", entity, data);

    if (entity === "cargas") {
      data.peso = Number(data.peso || 0);
      data.distanciaKm = Number(data.distanciaKm || 0);
      data.valorFrete = Number(data.valorFrete || 0);
      data.lat = data.lat ? Number(data.lat) : null;
      data.lng = data.lng ? Number(data.lng) : null;
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
      if (entity === "cargas") await saveCarga(data);
      if (entity === "motoristas") await saveMotorista(data);
      if (entity === "rotas") await saveRota(data);
    } else {
      if (entity === "cargas") await updateCarga(App.modal.id, data);
      if (entity === "motoristas") await updateMotorista(App.modal.id, data);
      if (entity === "rotas") await updateRota(App.modal.id, data);
    }

    if (entity === "rotas" && data.motoristaId) {
      await syncDriverStatus(data.motoristaId);
    }

    if (entity === "cargas") {
      const route = getRotas().find((rota) => rota.cargasIds?.includes(App.modal.id));
      if (route) await syncRouteStatus(route.id);
      await autoGenerateRouteForMunicipality(data.destinoMunicipio, data.destinoEstado);
    }

    closeModal();
    renderAll();
    toast(`${capitalizeFirstLetter(singular(entity))} salvo com sucesso.`);
  } catch (e) {
    console.error("Erro ao salvar:", e);
    toast(`Erro ao salvar: ${e.message || "verifique o console."}`);
  }
}

function computeCargoFreight(data) {
  const origin = getStoreOrigin();

  // Prefere coordenadas exatas (do picker/CEP) quando disponíveis
  let destination;
  if (data.lat && data.lng && Number(data.lat) !== 0 && Number(data.lng) !== 0) {
    destination = { lat: Number(data.lat), lng: Number(data.lng) };
  } else {
    destination = getCityCoordinates(data.destinoMunicipio, data.destinoEstado);
    if (!destination) return { error: "Município de destino não cadastrado." };
  }

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

function applyCepMask(input) {
  let v = input.value.replace(/\D/g, "");
  if (v.length > 5) v = v.slice(0, 5) + "-" + v.slice(5, 8);
  input.value = v;
}

function applyPhoneMask(input) {
  const d = input.value.replace(/\D/g, "").slice(0, 11);
  if (!d) { input.value = ""; return; }
  let v;
  if (d.length <= 2) {
    v = `(${d}`;
  } else if (d.length <= 6) {
    v = `(${d.slice(0, 2)}) ${d.slice(2)}`;
  } else if (d.length <= 10) {
    v = `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  } else {
    v = `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
  }
  input.value = v;
}

async function lookupCep(input) {
  const cep = input.value.replace(/\D/g, "");
  const msg = document.getElementById("cepMsg");
  if (!msg) return;
  if (cep.length !== 8) {
    if (cep.length > 0) { msg.textContent = "CEP incompleto."; msg.className = "cep-msg cep-error"; }
    return;
  }
  msg.textContent = "Buscando…";
  msg.className = "cep-msg";
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();
    if (data.erro) {
      msg.textContent = "CEP não encontrado.";
      msg.className = "cep-msg cep-error";
      return;
    }
    const form = input.closest("form");
    setCepField(form, "enderecoEntrega", data.logradouro || "");
    setCepField(form, "destinoEstado", data.uf || "");
    const munInput = form.querySelector('[name="destinoMunicipio"]');
    if (munInput && data.localidade) munInput.value = data.localidade;
    msg.textContent = `✓ ${data.logradouro ? data.logradouro + ", " : ""}${data.localidade}/${data.uf}`;
    msg.className = "cep-msg cep-ok";
    geocodeEndereco(data, form);
  } catch (e) {
    msg.textContent = "Erro ao buscar CEP.";
    msg.className = "cep-msg cep-error";
  }
}

function setupMunicipioAutocomplete(input) {
  const wrap = input.closest(".mun-autocomplete-wrap");
  const list = wrap?.querySelector(".mun-suggestions");
  if (!list) return;

  let timer = null;

  function closeList() { list.innerHTML = ""; list.hidden = true; }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const term = input.value.trim();
    if (term.length < 3) { closeList(); return; }

    timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://servicodados.ibge.gov.br/api/v1/localidades/municipios?nome=${encodeURIComponent(term)}&orderBy=nome`
        );
        const data = await res.json();
        if (!Array.isArray(data) || !data.length) {
          list.innerHTML = '<li class="mun-no-results">Nenhum município encontrado</li>';
          list.hidden = false;
          return;
        }
        list.innerHTML = data.slice(0, 10).map((m) => {
          const uf = m.microrregiao?.mesorregiao?.UF?.sigla || "";
          return `<li class="mun-item" data-nome="${m.nome}" data-uf="${uf}">
            ${m.nome}${uf ? `<span class="mun-uf"> – ${uf}</span>` : ""}
          </li>`;
        }).join("");
        list.hidden = false;

        list.querySelectorAll(".mun-item").forEach((li) => {
          li.addEventListener("click", () => {
            input.value = li.dataset.nome;
            const form = input.closest("form");
            if (form && li.dataset.uf) setCepField(form, "destinoEstado", li.dataset.uf);
            closeList();
          });
        });
      } catch (e) {
        console.warn("IBGE API:", e);
      }
    }, 300);
  });

  input.addEventListener("keydown", (e) => { if (e.key === "Escape") closeList(); });

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) closeList();
  }, { capture: true });
}

function setCepField(form, name, value) {
  const el = form.querySelector(`[name="${name}"]`);
  if (el) el.value = value;
}

async function geocodeEndereco(viaCepData, form) {
  try {
    const parts = [viaCepData.logradouro, viaCepData.bairro, viaCepData.localidade, viaCepData.uf, "Brasil"].filter(Boolean);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(parts.join(", "))}&format=json&limit=1&countrycodes=br`;
    const res = await fetch(url);
    const results = await res.json();
    if (results.length) {
      const lat = Number(results[0].lat);
      const lng = Number(results[0].lon);
      setCepField(form, "lat", lat);
      setCepField(form, "lng", lng);
      updateFreteEstimado(form, lat, lng);
      // Sincroniza marcador no picker se estiver aberto
      if (_mapPicker) {
        if (_mapPickerMarker) {
          _mapPickerMarker.setLatLng([lat, lng]);
        } else {
          const pinIcon = L.divIcon({ html: "📍", className: "custom-pin", iconSize: [30, 30], iconAnchor: [15, 30] });
          _mapPickerMarker = L.marker([lat, lng], { icon: pinIcon }).addTo(_mapPicker);
        }
        _mapPicker.setView([lat, lng], 14);
        _mapPickerCoords = { lat, lng };
        document.getElementById("mapPickerInfo").textContent =
          `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)} — Ponto atualizado pelo CEP`;
      }
    }
  } catch (e) {
    console.warn("Geocodificação falhou:", e);
  }
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
  return { lat: STORE_LOCATION.lat, lng: STORE_LOCATION.lng };
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

// ── Seletor de localização no mapa ─────────────────────────────────────────

function _destroyMapPicker() {
  if (_mapPickerInitTimer) { clearTimeout(_mapPickerInitTimer); _mapPickerInitTimer = null; }
  if (_mapPicker) {
    if (_mapPickerMarker) {
      try { _mapPickerMarker.remove(); } catch (e) { /* ignore */ }
      _mapPickerMarker = null;
    }
    _mapPicker.off();
    try { _mapPicker.remove(); } catch (e) { /* ignore Leaflet cleanup errors */ }
    _mapPicker = null;
  }
}

function openMapPicker() {
  _mapPickerForm = document.getElementById("entityForm");
  if (!_mapPickerForm) return;

  document.getElementById("mapPickerBackdrop").classList.add("active");
  document.getElementById("mapPickerInfo").textContent = "Clique no mapa para marcar o destino";

  _destroyMapPicker();
  _mapPickerCoords = null;

  _mapPickerInitTimer = setTimeout(() => {
    _mapPickerInitTimer = null;
    const latInput = _mapPickerForm.querySelector('[name="lat"]');
    const lngInput = _mapPickerForm.querySelector('[name="lng"]');
    const hasCoords = latInput?.value && lngInput?.value && Number(latInput.value) && Number(lngInput.value);
    const initLat = hasCoords ? Number(latInput.value) : -4.760287;
    const initLng = hasCoords ? Number(lngInput.value) : -42.573777;

    const pinIcon = L.divIcon({
      html: "📍",
      className: "custom-pin",
      iconSize: [30, 30],
      iconAnchor: [15, 30]
    });

    _mapPicker = L.map("mapPickerContainer").setView([initLat, initLng], hasCoords ? 14 : 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>'
    }).addTo(_mapPicker);

    if (hasCoords) {
      _mapPickerCoords = { lat: initLat, lng: initLng };
      _mapPickerMarker = L.marker([initLat, initLng], { icon: pinIcon }).addTo(_mapPicker);
      document.getElementById("mapPickerInfo").textContent = "📍 Ponto atual marcado · Clique para mover";
    }

    _mapPicker.on("click", (e) => {
      const { lat, lng } = e.latlng;
      _mapPickerCoords = { lat, lng };
      if (_mapPickerMarker) {
        _mapPickerMarker.setLatLng(e.latlng);
      } else {
        _mapPickerMarker = L.marker(e.latlng, { icon: pinIcon }).addTo(_mapPicker);
      }
      document.getElementById("mapPickerInfo").textContent =
        `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)} — Clique em "Confirmar localização"`;
    });
  }, 80);
}

function closeMapPicker() {
  document.getElementById("mapPickerBackdrop").classList.remove("active");
  _destroyMapPicker();
}

async function confirmMapLocation() {
  if (!_mapPickerCoords) {
    toast("Clique no mapa para marcar uma localização antes de confirmar.");
    return;
  }
  const form = _mapPickerForm || document.getElementById("entityForm");
  if (!form) { closeMapPicker(); return; }

  const { lat, lng } = _mapPickerCoords;

  setCepField(form, "lat", lat);
  setCepField(form, "lng", lng);
  updateFreteEstimado(form, lat, lng);

  closeMapPicker();

  const msg = document.getElementById("cepMsg");
  if (msg) { msg.textContent = "Buscando endereço…"; msg.className = "cep-msg"; }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR`;
    const res = await fetch(url);
    const data = await res.json();

    if (data?.address) {
      const addr = data.address;
      const road = addr.road || addr.pedestrian || addr.footway || addr.street || "";
      const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
      const stateCode = addr.ISO3166_2_lvl4
        ? addr.ISO3166_2_lvl4.replace("BR-", "")
        : _getStateCode(addr.state || "");
      const postcode = (addr.postcode || "").replace(/\D/g, "");

      if (road) setCepField(form, "enderecoEntrega", road);
      if (stateCode) setCepField(form, "destinoEstado", stateCode);

      if (city) {
        const munInput = form.querySelector('[name="destinoMunicipio"]');
        if (munInput) munInput.value = city;
      }

      if (postcode.length >= 8) {
        const cepInput = form.querySelector('[name="cep"]');
        if (cepInput) cepInput.value = postcode.slice(0, 5) + "-" + postcode.slice(5, 8);
      }

      const display = [road, city, stateCode].filter(Boolean).join(", ");
      if (msg) { msg.textContent = `✓ ${display || "Local marcado"}`; msg.className = "cep-msg cep-ok"; }
    } else {
      if (msg) { msg.textContent = "✓ Local marcado."; msg.className = "cep-msg cep-ok"; }
    }
  } catch (e) {
    console.warn("Geocodificação reversa:", e);
    if (msg) { msg.textContent = "✓ Local marcado (endereço não encontrado)."; msg.className = "cep-msg cep-ok"; }
  }
}

function updateFreteEstimado(form, lat, lng) {
  const SEDE_LAT = -4.760287;
  const SEDE_LNG = -42.573777;
  const distKm = calculateDistanceKm(SEDE_LAT, SEDE_LNG, lat, lng);
  const frete = distKm * 0.50;
  const display = document.getElementById("freteDisplay");
  if (display) display.value = money.format(frete);
  setCepField(form, "valorFrete", frete.toFixed(2));
  setCepField(form, "distanciaKm", distKm.toFixed(1));
}

function _getStateCode(stateName) {
  const map = {
    "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amazonas": "AM",
    "Bahia": "BA", "Ceará": "CE", "Distrito Federal": "DF", "Espírito Santo": "ES",
    "Goiás": "GO", "Maranhão": "MA", "Mato Grosso": "MT", "Mato Grosso do Sul": "MS",
    "Minas Gerais": "MG", "Pará": "PA", "Paraíba": "PB", "Paraná": "PR",
    "Pernambuco": "PE", "Piauí": "PI", "Rio de Janeiro": "RJ", "Rio Grande do Norte": "RN",
    "Rio Grande do Sul": "RS", "Rondônia": "RO", "Roraima": "RR", "Santa Catarina": "SC",
    "São Paulo": "SP", "Sergipe": "SE", "Tocantins": "TO"
  };
  return map[stateName] || stateName.slice(0, 2).toUpperCase();
}

// ────────────────────────────────────────────────────────────────────────────

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

async function generateRoutesByMunicipality() {
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

  for (const group of Object.values(groups)) {
    if (group.pedidos.length < 2) continue;
    const sorted = [...group.pedidos].sort((a, b) => (priorityOrder[b.prioridade || "normal"] || 0) - (priorityOrder[a.prioridade || "normal"] || 0));
    const smallestWeight = Math.min(...sorted.map((item) => Number(item.peso || 0)));
    const driver = availableDrivers.find((d) => d.capacidade >= smallestWeight);
    if (!driver) {
      for (const pedido of group.pedidos) {
        await updateCarga(pedido.id, { status: "próximo dia" });
      }
      overflowCount += group.pedidos.length;
      continue;
    }

    let assigned = [];
    let usedWeight = 0;

    for (const pedido of sorted) {
      const weight = Number(pedido.peso || 0);
      if (assigned.length === 0 || usedWeight + weight <= driver.capacidade) {
        assigned.push(pedido);
        usedWeight += weight;
      } else {
        await updateCarga(pedido.id, { status: "próximo dia" });
        overflowCount += 1;
      }
    }

    if (!assigned.length) continue;
    const routeType = inferRouteType(assigned);
    await saveRota({
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

    for (const pedido of assigned) {
      await updateCarga(pedido.id, { status: "em rota" });
    }
    await updateMotorista(driver.id, { status: "em entrega" });
    availableDrivers.splice(availableDrivers.indexOf(driver), 1);
    created += 1;
  }

  renderAll();
  if (created === 0) {
    toast("Nenhuma rota gerada. Verifique motoristas disponíveis e pedidos agrupáveis.");
  } else {
    toast(`Rotas geradas: ${created}. Pedidos deslocados para próximo dia: ${overflowCount}.`);
  }
}

async function autoGenerateRouteForMunicipality(municipio, estado) {
  const rotaAtiva = getRotas().find((r) =>
    r.destinoMunicipio === municipio &&
    r.destinoEstado === estado &&
    ["planejada", "em andamento"].includes(r.status)
  );

  if (rotaAtiva) {
    const novos = getCargas().filter((c) =>
      c.status === "aguardando rota" &&
      c.destinoMunicipio === municipio &&
      c.destinoEstado === estado &&
      !(rotaAtiva.cargasIds || []).includes(c.id)
    );
    if (!novos.length) return;

    const novasCargasIds = [...(rotaAtiva.cargasIds || []), ...novos.map((p) => p.id)];
    const todosPedidos = getCargas().filter((c) => novasCargasIds.includes(c.id));
    const novoFrete = Number(todosPedidos.reduce((sum, c) => sum + Number(c.valorFrete || 0), 0).toFixed(2));
    const novaDistancia = Number(todosPedidos.reduce((sum, c) => sum + Number(c.distanciaKm || 0), 0).toFixed(1));

    await updateRota(rotaAtiva.id, { ...rotaAtiva, cargasIds: novasCargasIds, freteTotal: novoFrete, distancia: novaDistancia });
    for (const pedido of novos) {
      await updateCarga(pedido.id, { status: "em rota" });
    }
    toast(`${novos.length} pedido(s) associado(s) à rota ${rotaAtiva.codigo} (${municipio}).`);
    return;
  }

  const pending = getCargas().filter((c) =>
    ["aguardando rota", "próximo dia"].includes(c.status) &&
    c.destinoMunicipio === municipio &&
    c.destinoEstado === estado
  );
  if (pending.length < 2) return;

  const availableDrivers = getMotoristas().filter((d) => d.status === "disponível").sort((a, b) => b.capacidade - a.capacidade);
  const sorted = [...pending].sort((a, b) => (priorityOrder[b.prioridade || "normal"] || 0) - (priorityOrder[a.prioridade || "normal"] || 0));
  const smallestWeight = Math.min(...sorted.map((p) => Number(p.peso || 0)));
  const driver = availableDrivers.find((d) => d.capacidade >= smallestWeight);
  if (!driver) return;

  let assigned = [];
  let usedWeight = 0;
  for (const pedido of sorted) {
    const weight = Number(pedido.peso || 0);
    if (assigned.length === 0 || usedWeight + weight <= driver.capacidade) {
      assigned.push(pedido);
      usedWeight += weight;
    } else {
      await updateCarga(pedido.id, { status: "próximo dia" });
    }
  }
  if (!assigned.length) return;

  await saveRota({
    nome: `${municipio} · ${driver.nome}`,
    tipoRota: inferRouteType(assigned),
    destinoMunicipio: municipio,
    destinoEstado: estado,
    motoristaId: driver.id,
    cargasIds: assigned.map((p) => p.id),
    saida: `${assigned[0].coleta || ""}T08:00`,
    chegada: `${assigned[0].entrega || ""}T14:00`,
    distancia: Number(assigned.reduce((sum, p) => sum + Number(p.distanciaKm || 0), 0).toFixed(1)),
    freteTotal: Number(assigned.reduce((sum, p) => sum + Number(p.valorFrete || 0), 0).toFixed(2)),
    tempo: "3h00",
    status: "planejada",
    observacoes: "Rota gerada automaticamente por município."
  });

  for (const p of assigned) {
    await updateCarga(p.id, { status: "em rota" });
  }
  await updateMotorista(driver.id, { status: "em entrega" });
  toast(`Rota criada automaticamente para ${municipio}/${estado}.`);
}

async function syncRouteStatus(routeId) {
  const route = getRotas().find((item) => item.id === routeId);
  if (!route) return;
  const pedidos = getCargas().filter((carga) => (route.cargasIds || []).includes(carga.id));
  if (!pedidos.length) return;
  if (pedidos.every((pedido) => pedido.status === "entregue")) {
    await updateRota(routeId, { status: "concluída" });
    await syncDriverStatus(route.motoristaId);
    return;
  }
  if (pedidos.some((pedido) => pedido.status === "em rota")) {
    await updateRota(routeId, { status: "em andamento" });
    await updateMotorista(route.motoristaId, { status: "em entrega" });
    return;
  }
  await updateRota(routeId, { status: "planejada" });
  await updateMotorista(route.motoristaId, { status: "em entrega" });
}

async function syncDriverStatus(driverId) {
  const activeRoutes = getRotas().filter((rota) => rota.motoristaId === driverId && ["planejada", "em andamento"].includes(rota.status));
  if (!activeRoutes.length) {
    await updateMotorista(driverId, { status: "disponível" });
  } else {
    await updateMotorista(driverId, { status: "em entrega" });
  }
}

async function markAsDelivered(id) {
  const pedido = getCargas().find((item) => item.id === id);
  if (!pedido) return;
  await updateCarga(id, { status: "entregue" });
  const rota = getRotas().find((route) => (route.cargasIds || []).includes(id));
  if (rota) await syncRouteStatus(rota.id);
  renderAll();
  toast("Entrega marcada como feita.");
}

function confirmDelete(entity, id) {
  confirmAction("Excluir este registro?", async () => {
    if (entity === "cargas") await deleteCarga(id);
    if (entity === "motoristas") await deleteMotorista(id);
    if (entity === "rotas") {
      const route = getRotas().find((item) => item.id === id);
      if (route) await syncDriverStatus(route.motoristaId);
      await deleteRota(id);
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
  localStorage.setItem("madcenter_tema", data.tema);
  applyTheme(data.tema);
  toast("Configurações salvas.");
}

let _mapPanelListenersSetup = false;

function renderMapPanel() {
  const statusOptions = [["", "Todos os status"], ["planejada", "planejada"], ["em andamento", "em andamento"], ["concluída", "concluída"], ["cancelada", "cancelada"]];
  const drivers = getMotoristas();
  const cities = [...new Set(getRotas().map((route) => coordKey(route.destinoMunicipio, route.destinoEstado)))].sort();

  document.getElementById("mapStatusFilter").innerHTML = statusOptions.map(([val, label]) => `<option value="${val}">${label}</option>`).join("");
  document.getElementById("mapDriverFilter").innerHTML = `<option value="todos">Todos os motoristas</option>${drivers.map((driver) => `<option value="${driver.id}">${driver.nome}</option>`).join("")}`;
  document.getElementById("mapCityFilter").innerHTML = `<option value="todos">Todas as cidades</option>${cities.map((key) => {
    const city = MUNICIPIOS_COORDS[key];
    return `<option value="${key}">${city?.nome || key}</option>`;
  }).join("")}`;

  document.getElementById("mapStatusFilter").value = App.mapFilters.status;
  document.getElementById("mapDriverFilter").value = App.mapFilters.driver;
  document.getElementById("mapCityFilter").value = App.mapFilters.city;

  if (!_mapPanelListenersSetup) {
    _mapPanelListenersSetup = true;
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
  }

  renderLogisticsMap(App.mapFilters).catch(() => {
    toast("Não foi possível carregar o mapa. Verifique a conexão ou a API de rotas.");
  });
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  document.getElementById("themeToggle").textContent = `Tema: ${theme === "dark" ? "Escuro" : "Claro"}`;
}
