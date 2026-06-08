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
  configuracoes: "Configurações",
  usuarios: "Usuários",
  veiculos: "Veículos"
};

const API_BASE = window.location.port === "3000" ? "" : "http://localhost:3000";

const statusColors = {
  "aguardando rota": "yellow",
  "em rota": "blue",
  "entregue": "green",
  "próximo dia": "purple",
  "cancelado": "red",
  "disponível": "green",
  "em entrega": "blue",
  "inativo": "gray",
  "planejada": "sky",
  "em andamento": "blue",
  "concluída": "green",
  "cancelada": "red"
};

const priorityOrder = { urgente: 3, alta: 2, normal: 1, baixa: 0 };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const fields = {
  cargas: [
    ["codigo", "Código do pedido", "text", false],
    ["descricao", "Produto/material", "text", true],
    ["tipo", "Categoria do material", "select:Tintas,Elétrica,Hidráulica,Ferramentas,Pisos e revestimentos,Cimento e argamassa,Outros", true],
    ["peso", "Peso (kg)", "number", true],
    ["volume", "Volume", "text", false],
    ["cep", "CEP", "cep", true],
    ["destinoMunicipio", "Município de destino", "city", true],
    ["destinoEstado", "Estado de destino", "text", true],
    ["enderecoEntrega", "Endereço de entrega", "text", true],
    ["numero", "Número", "text", false],
    ["complemento", "Complemento", "text", false],
    ["cliente", "Cliente", "text", true],
    ["telefone", "Telefone/WhatsApp", "phone", true],
    ["prioridade", "Prioridade", "select:baixa,normal,alta,urgente", true],
    ["veiculoTipo", "Tipo de veículo", "vehicle", true],
    ["status", "Status", "select:aguardando rota,em rota,próximo dia,entregue,cancelado", true],
    ["observacoes", "Observações", "textarea", false]
  ],
  motoristas: [
    ["nome", "Nome", "text", true],
    ["telefone", "WhatsApp", "phone", true],
    ["categoria", "Categoria CNH", "select:B,C,D,E", true],
    ["cidade", "Cidade", "text", false],
    ["estado", "Estado (UF)", "text", false],
    ["observacoes", "Observações", "textarea", false]
  ],
  rotas: [
    ["nome", "Nome da rota", "text", true],
    ["tipoRota", "Tipo de rota", "select:Rodoviária,Urbana,Mista", true],
    ["destinoMunicipio", "Município de destino", "city", true],
    ["destinoEstado", "Estado de destino", "text", true],
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
  const _token  = sessionStorage.getItem("madcenter_token");
  const _perfil = sessionStorage.getItem("madcenter_perfil");
  if (!_token || _perfil !== "admin") {
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

function bindUsuariosEvents() {
  document.getElementById("newUserBtn")?.addEventListener("click", () => openUserForm());
  document.getElementById("usuariosSearch")?.addEventListener("input", renderUsuarios);
  document.getElementById("newVeiculoBtn")?.addEventListener("click", () => openVeiculoForm());
  document.getElementById("veiculosSearch")?.addEventListener("input", renderVeiculos);
}

function bindLayoutEvents() {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => {
      showPage(button.dataset.page);
      document.getElementById("sidebar").classList.remove("open");
      document.getElementById("sidebarOverlay")?.classList.remove("active");
    });
  });
  document.getElementById("menuToggle").addEventListener("click", () => {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");
    sidebar.classList.toggle("open");
    if (overlay) overlay.classList.toggle("active", sidebar.classList.contains("open"));
  });
  document.getElementById("sidebarOverlay")?.addEventListener("click", () => {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebarOverlay").classList.remove("active");
  });
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
    renderEntregasChart(_chartPeriodo);
  });
  document.getElementById("logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem("madcenter_token");
    sessionStorage.removeItem("madcenter_nome");
    sessionStorage.removeItem("madcenter_perfil");
    window.location.replace("login.html");
  });
  document.getElementById("quickSearch").addEventListener("input", (event) => {
    App.filters.text = event.target.value;
    renderAll();
  });
  document.getElementById("motoristasSearch").addEventListener("input", renderTables);
  document.getElementById("rotasSearch").addEventListener("input", renderTables);
  document.getElementById("generateRoutesBtn").addEventListener("click", generateRoutesByMunicipality);
  bindUsuariosEvents();
  bindChartEvents();
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
  updateFab(page);
  if (page === "mapa") renderMapPanel();
  if (page === "usuarios") renderUsuarios();
  else if (page === "veiculos") renderVeiculos();
  else renderAll();
}

function updateFab(page) {
  const fab = document.getElementById("fabNewBtn");
  if (!fab) return;
  const entityMap = { pedidos: "cargas", motoristas: "motoristas", rotas: "rotas" };
  const entity = entityMap[page];
  if (entity) {
    fab.style.display = "";
    fab.onclick = () => openForm(entity);
  } else {
    fab.style.display = "none";
  }
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
    ["Pedidos cadastrados",    cargas.length,        Icons.package(20),    "mc-neutral"],
    ["Aguardando rota",        pending,              Icons.clock(20),      "mc-yellow"],
    ["Em rota",                progress,             Icons.truck(20),      "mc-blue"],
    ["Próximo dia",            nextDay,              Icons.calendar(20),   "mc-orange"],
    ["Entregues",              completed,            Icons.checkCircle(20),"mc-green"],
    ["Motoristas disponíveis", availableDrivers,     Icons.users(20),      "mc-teal"],
    ["Rotas planejadas",       plannedRoutes,        Icons.map(20),        "mc-yellow"],
    ["Rotas em andamento",     activeRoutes,         Icons.route(20),      "mc-blue"]
  ];

  document.getElementById("dashboardMetrics").innerHTML = metrics.map(([label, value, icon, cls]) => `
    <div class="metric-card ${cls}">
      <div class="metric-icon">${icon}</div>
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join("");

  const statusBorder = { "aguardando rota": "#f2c94c", "em rota": "#2374c6", "entregue": "#0fa958", "próximo dia": "#a855f7", "cancelado": "#d93025" };
  document.getElementById("latestCargas").innerHTML = cargas.slice(-5).reverse().map((c) => `
    <div class="list-item" style="border-left-color:${statusBorder[c.status] || "var(--line)"}">
      <div class="list-item-body">
        <strong>${c.codigo} — ${c.descricao}</strong>
        <span>${c.cliente} · ${c.destinoMunicipio}/${c.destinoEstado} · ${vehicleName(c.veiculoTipo)}</span>
      </div>
      ${badge(c.status)}
    </div>
  `).join("") || emptyText("Nenhum pedido cadastrado.");

  const rotaBorder = { "planejada": "#f2c94c", "em andamento": "#2374c6", "concluída": "#0fa958", "cancelada": "#d93025" };
  document.getElementById("nextRotas").innerHTML = rotas.filter((r) => r.status !== "concluída").slice(0, 5).map((r) => `
    <div class="list-item" style="border-left-color:${rotaBorder[r.status] || "var(--line)"}">
      <div class="list-item-body">
        <strong>${r.codigo} — ${r.nome}</strong>
        <span>${r.destinoMunicipio}/${r.destinoEstado} · ${driverName(r.motoristaId)}</span>
      </div>
      ${badge(r.status)}
    </div>
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

  renderEntregasChart("semana");
}

// ── Gráfico de Entregas ────────────────────────────────────────────────────

let _entregasChart = null;
let _chartPeriodo = "semana";

// Resolve a melhor data disponível para um pedido entregue.
// Prioridade: dataEntrega → entrega → criadoEm → criado_em (fallback para pedidos sem data de entrega).
function _resolverDataEntrega(c) {
  const raw = c.dataEntrega || c.entrega || c.criadoEm || c.criado_em;
  if (!raw) return null;
  const str = String(raw);
  const dt = new Date(str.length === 10 ? str + "T00:00Z" : str);
  return isNaN(dt.getTime()) ? null : dt;
}

function getEntregasFiltradas(periodo) {
  // Datas salvas como "fake-UTC" (horário de Brasília embutido com sufixo Z).
  // Para comparar corretamente, deslocamos "agora" em -3h e usamos métodos getUTC*,
  // que passam a retornar os valores em horário de Brasília — independente do timezone do browser.
  const BRASILIA_MS = 3 * 60 * 60 * 1000;
  const agora = new Date();
  const agoraBrasilia = new Date(agora.getTime() - BRASILIA_MS);

  return getCargas().filter((c) => {
    if (c.status !== "entregue") return false;
    const dt = _resolverDataEntrega(c);
    if (!dt) return false;

    if (periodo === "hoje") {
      return dt.getUTCDate()     === agoraBrasilia.getUTCDate()     &&
             dt.getUTCMonth()    === agoraBrasilia.getUTCMonth()    &&
             dt.getUTCFullYear() === agoraBrasilia.getUTCFullYear();
    }
    if (periodo === "semana") {
      const inicioSemana = new Date(agoraBrasilia);
      inicioSemana.setUTCDate(agoraBrasilia.getUTCDate() - agoraBrasilia.getUTCDay());
      inicioSemana.setUTCHours(0, 0, 0, 0);
      const fimSemana = new Date(inicioSemana);
      fimSemana.setUTCDate(inicioSemana.getUTCDate() + 6);
      fimSemana.setUTCHours(23, 59, 59, 999);
      return dt >= inicioSemana && dt <= fimSemana;
    }
    if (periodo === "mes") {
      return dt.getUTCMonth()    === agoraBrasilia.getUTCMonth()    &&
             dt.getUTCFullYear() === agoraBrasilia.getUTCFullYear();
    }
    return false;
  });
}

function agruparEntregas(pedidos, periodo) {
  const BRASILIA_MS = 3 * 60 * 60 * 1000;
  const agora = new Date();
  const agoraBrasilia = new Date(agora.getTime() - BRASILIA_MS);

  if (periodo === "hoje") {
    const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}h`);
    const data = new Array(24).fill(0);
    pedidos.forEach((c) => {
      const dt = _resolverDataEntrega(c);
      if (dt) data[dt.getUTCHours()]++;
    });
    return { labels, data };
  }

  if (periodo === "semana") {
    const diasNomes = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const inicioSemana = new Date(agoraBrasilia);
    inicioSemana.setUTCDate(agoraBrasilia.getUTCDate() - agoraBrasilia.getUTCDay());
    inicioSemana.setUTCHours(0, 0, 0, 0);
    const labels = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(inicioSemana);
      d.setUTCDate(inicioSemana.getUTCDate() + i);
      return diasNomes[d.getUTCDay()];
    });
    const data = new Array(7).fill(0);
    pedidos.forEach((c) => {
      const dt = _resolverDataEntrega(c);
      if (!dt) return;
      const diff = Math.floor((dt - inicioSemana) / 86400000);
      if (diff >= 0 && diff < 7) data[diff]++;
    });
    return { labels, data };
  }

  if (periodo === "mes") {
    const diasNoMes = new Date(agoraBrasilia.getUTCFullYear(), agoraBrasilia.getUTCMonth() + 1, 0).getUTCDate();
    const labels = Array.from({ length: diasNoMes }, (_, i) => String(i + 1));
    const data = new Array(diasNoMes).fill(0);
    pedidos.forEach((c) => {
      const dt = _resolverDataEntrega(c);
      if (!dt) return;
      const d = dt.getUTCDate();
      if (d >= 1 && d <= diasNoMes) data[d - 1]++;
    });
    return { labels, data };
  }

  return { labels: [], data: [] };
}

function renderEntregasChart(periodo) {
  _chartPeriodo = periodo;

  document.querySelectorAll(".chart-period-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.period === periodo);
  });

  const pedidos = getEntregasFiltradas(periodo);
  const { labels, data } = agruparEntregas(pedidos, periodo);

  const isDark = document.body.dataset.theme === "dark";
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const textColor = isDark ? "#a7b7ad" : "#6b7280";

  if (_entregasChart) {
    _entregasChart.destroy();
    _entregasChart = null;
  }

  const ctx = document.getElementById("entregasChart");
  if (!ctx) return;

  _entregasChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Entregas",
        data,
        backgroundColor: "rgba(28, 107, 48, 0.85)",
        borderColor: "#1c6b30",
        borderWidth: 1.5,
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.parsed.y} entrega${ctx.parsed.y !== 1 ? "s" : ""}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { size: 12 } }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: textColor,
            font: { size: 12 },
            stepSize: 1,
            precision: 0
          },
          grid: { color: gridColor },
          title: {
            display: true,
            text: "Entregas",
            color: textColor,
            font: { size: 12 }
          }
        }
      }
    }
  });
}

function bindChartEvents() {
  document.querySelectorAll(".chart-period-btn").forEach((btn) => {
    btn.addEventListener("click", () => renderEntregasChart(btn.dataset.period));
  });

  document.getElementById("exportRelatorio")?.addEventListener("click", () => {
    const pedidos = getEntregasFiltradas(_chartPeriodo);
    const rotas = getRotas();
    const motoristas = getMotoristas();

    const hoje = new Date();
    const dd = String(hoje.getDate()).padStart(2, "0");
    const mm = String(hoje.getMonth() + 1).padStart(2, "0");
    const aaaa = hoje.getFullYear();

    const nomes = { hoje: "hoje", semana: "semana", mes: "mes" };
    const sufixos = {
      hoje: `${dd}-${mm}-${aaaa}`,
      semana: `${dd}-${mm}-${aaaa}`,
      mes: `${mm}-${aaaa}`
    };
    const filename = `relatorio-entregas-${nomes[_chartPeriodo]}-${sufixos[_chartPeriodo]}.csv`;

    const header = ["Código", "Cliente", "Material", "Destino", "Motorista", "Data de Entrega", "Peso (kg)", "Frete (R$)", "Status"];
    const rows = pedidos.map((p) => {
      const rota = rotas.find((r) => (r.cargasIds || []).includes(p.id));
      const motorista = rota ? (motoristas.find((m) => m.id === rota.motoristaId)?.nome || "") : "";
      const destino = [p.destinoMunicipio, p.destinoEstado].filter(Boolean).join("/");
      const dataEntrega = p.entrega ? new Date(p.entrega).toLocaleDateString("pt-BR") : "";
      return [
        p.codigo || "",
        p.cliente || "",
        p.descricao || "",
        destino,
        motorista,
        dataEntrega,
        p.peso || 0,
        (Number(p.valorFrete || 0)).toFixed(2).replace(".", ","),
        p.status || ""
      ];
    });

    downloadCSV(filename, [header, ...rows]);
  });
}

function downloadCSV(filename, rows) {
  const BOM = "﻿";
  const content = BOM + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
  table("motoristasTable", ["Nome", "WhatsApp", "Categoria", "Cidade", "Status", "Ações"], rows.map((m) => [
    m.nome,
    m.telefone,
    m.categoria,
    `${m.cidade}/${m.estado}`,
    `<select class="table-status-select" onchange="changeMotoristaStatus('${m.id}', this.value)">${["disponível", "em entrega", "inativo"].map((s) => `<option value="${s}" ${m.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>`,
    `<div class="actions-cell">
      <button class="table-action" onclick="openForm('motoristas','${m.id}')">${Icons.edit(14)} Editar</button>
      <button class="table-action" onclick="copiarLinkMotorista()" title="Copiar link da área do motorista">${Icons.link(14)} Link</button>
    </div>`
  ]));
}

function copiarLinkMotorista() {
  const url = window.location.origin + "/motorista.html";
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url)
      .then(() => toast("Link copiado! Envie para o motorista."))
      .catch(() => toast("Link: " + url));
  } else {
    toast("Link: " + url);
  }
}
async function changeMotoristaStatus(id, status) {
  try {
    await updateMotorista(id, { status });
    renderTables();
  } catch (e) {
    toast("Erro ao atualizar status do motorista.");
  }
}

function buildRotaMotoristaSelect(rotaId, currentId) {
  const available = getMotoristas().filter((d) => d.status === "disponível");
  const current = currentId ? getMotoristas().find((d) => d.id === currentId) : null;
  const drivers = current && current.status !== "disponível" ? [current, ...available] : available;
  const opts = [
    `<option value="">— Sem motorista —</option>`,
    ...drivers.map((d) => {
      const nota = d.status !== "disponível" ? ` (${d.status})` : "";
      return `<option value="${d.id}" ${d.id === currentId ? "selected" : ""}>${d.nome}${nota}</option>`;
    })
  ].join("");
  return `<select class="table-status-select" onchange="changeRotaMotorista('${rotaId}', this.value)">${opts}</select>`;
}

async function changeRotaMotorista(rotaId, motoristaId) {
  try {
    const rota = getRotas().find((r) => r.id === rotaId);
    if (!rota) return;
    const oldDriverId = rota.motoristaId;

    if (motoristaId) {
      // Etapa 2: vincula motorista → rota "em andamento"
      await updateRota(rotaId, { motoristaId, status: "em andamento" });
      await updateMotorista(motoristaId, { status: "em entrega" });

      // Garante que todos os pedidos da rota estejam "em rota"
      for (const pedidoId of (rota.cargasIds || [])) {
        const pedido = getCargas().find((c) => c.id === pedidoId);
        if (pedido && pedido.status !== "entregue") {
          await updateCarga(pedidoId, { status: "em rota" });
        }
      }

      // Libera o motorista anterior se for diferente
      if (oldDriverId && oldDriverId !== motoristaId) {
        await syncDriverStatus(oldDriverId);
      }

      toast("Motorista vinculado. Rota em andamento.");
    } else {
      // Remove motorista → rota volta para "planejada"
      await updateRota(rotaId, { motoristaId: null, status: "planejada" });
      if (oldDriverId) await syncDriverStatus(oldDriverId);
      toast("Motorista removido da rota.");
    }

    renderAll();
    if (App.page === "mapa") renderLogisticsMap(App.mapFilters);
  } catch (e) {
    console.error(e);
    toast("Erro ao atualizar motorista da rota.");
  }
}

function renderRotasTable() {
  const search = valueOf("rotasSearch").toLowerCase();
  const rows = getRotas().filter((r) => `${r.codigo} ${r.nome} ${r.destinoMunicipio} ${r.destinoEstado}`.toLowerCase().includes(search));
  table("rotasTable", ["Código", "Nome", "Destino", "Motorista", "Pedidos", "Distância", "Frete", "Status", "Ações"], rows.map((r) => {
    const total = (r.cargasIds || []).length;
    return [
      r.codigo,
      r.nome,
      `${r.destinoMunicipio}/${r.destinoEstado}`,
      buildRotaMotoristaSelect(r.id, r.motoristaId),
      `<button class="table-action table-action-pedidos" onclick="openRotaPedidos('${r.id}')" title="Ver pedidos desta rota">${Icons.package(12)} ${total} pedido${total !== 1 ? "s" : ""}</button>`,
      `${Number(r.distancia || 0).toFixed(1)} km`,
      money.format(Number(r.freteTotal || 0)),
      badge(r.status),
      actionsRota(r.id)
    ];
  }));
}

function actionsRota(id) {
  return `
    <div class="actions-cell">
      <button class="table-action" onclick="openRotaPedidos('${id}')">${Icons.eye(14)} Ver pedidos</button>
      <button class="table-action" onclick="openForm('rotas','${id}')">${Icons.edit(14)} Editar</button>
      <button class="table-action" onclick="confirmDelete('rotas','${id}')">${Icons.trash(14)}</button>
    </div>
  `;
}

function table(id, headers, rows) {
  const element = document.getElementById(id);
  if (!element) return;
  element.innerHTML = `
    <thead><tr>${headers.map((label) => `<th>${label}</th>`).join("")}</tr></thead>
    <tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell, i) => `<td data-label="${headers[i] || ""}">${cell}</td>`).join("")}</tr>`).join("") : `<tr><td class="empty-table-cell" colspan="${headers.length}">Nenhum registro encontrado.</td></tr>`}</tbody>
  `;
}

function actions(entity, id) {
  return `
    <div class="actions-cell">
      <button class="table-action" onclick="openForm('${entity}','${id}')">${Icons.edit(14)} Editar</button>
      <button class="table-action" onclick="confirmDelete('${entity}','${id}')">${Icons.trash(14)}</button>
    </div>
  `;
}

function actionsPedido(id) {
  const pedido = getCargas().find((item) => item.id === id) || {};
  return `
    <div class="actions-cell">
      <button class="table-action" onclick="openForm('cargas','${id}')">${Icons.edit(14)} Editar</button>
      ${pedido.status === 'em rota' ? `<button class="table-action" onclick="markAsDelivered('${id}')">${Icons.checkCircle(14)} Entrega feita</button>` : ''}
      <button class="table-action" onclick="confirmDelete('cargas','${id}')">${Icons.trash(14)}</button>
    </div>
  `;
}

function _entityIcon(entity, size = 18) {
  if (entity === "cargas") return Icons.package(size);
  if (entity === "motoristas") return Icons.user(size);
  if (entity === "rotas") return Icons.route(size);
  return "";
}

function openForm(entity, id = null) {
  App.modal = { entity, mode: id ? "edit" : "new", id };
  const item = id ? getCollection(entity).find((record) => record.id === id) : defaultItem(entity);
  document.getElementById("modalTitle").innerHTML = `${_entityIcon(entity, 18)} ${id ? "Editar" : "Cadastrar"} ${singular(entity)}`;

  const mapaHtml = (entity === "motoristas" && id) ? `
    <div class="form-field full" style="display:flex;flex-direction:column;gap:.5rem">
      <span style="font-weight:600;font-size:.875rem;color:var(--text)">📍 Últimas entregas realizadas</span>
      <div id="mapaHistoricoMotorista" style="height:260px;border-radius:12px;background:var(--surface-soft);overflow:hidden"></div>
      <p id="semEntregasMsg" style="display:none;color:var(--muted);font-size:.8rem;text-align:center;padding:8px 0;margin:0">
        Nenhuma entrega registrada para este motorista.
      </p>
    </div>
  ` : "";

  document.getElementById("modalBody").innerHTML = `
    <form id="entityForm" class="form-grid">
      ${fields[entity].map((field) => fieldHtml(field, item)).join("")}
      ${mapaHtml}
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

  if (entity === "motoristas" && id) {
    carregarMapaHistoricoMotorista(id);
  }
}

function defaultItem(entity) {
  if (entity === "cargas") {
    return { descricao: "", tipo: "Tintas", peso: 0, volume: "", cep: "", destinoMunicipio: "Timon", destinoEstado: "MA", enderecoEntrega: "", numero: "", complemento: "", cliente: "", telefone: "", coleta: "", entrega: "", prioridade: "normal", veiculoTipo: "caminhonete", status: "aguardando rota", observacoes: "", lat: null, lng: null };
  }
  if (entity === "motoristas") {
    return { nome: "", telefone: "", categoria: "D", capacidade: 0, cidade: "Timon", estado: "MA", status: "disponível", observacoes: "" };
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
    const available = getMotoristas().filter((d) => d.status === "disponível");
    // Em edição, mantém o motorista atual mesmo que não esteja disponível (evita perder o vínculo)
    const current = value ? getMotoristas().find((d) => d.id === value) : null;
    const drivers = current && current.status !== "disponível" ? [current, ...available] : available;
    const selectOptions = drivers.map((d) => {
      const nota = d.status !== "disponível" ? ` — ${d.status}` : "";
      return `<option value="${d.id}" ${d.id === value ? "selected" : ""}>${d.nome} (${d.cidade}/${d.estado})${nota}</option>`;
    }).join("");
    const hint = available.length === 0 ? `<small class="driver-hint">Nenhum motorista disponível no momento.</small>` : "";
    return `
      <label class="form-field">
        <span>${label}</span>
        <select name="${name}" ${requiredAttr}>
          <option value="">— Sem motorista —</option>
          ${selectOptions}
        </select>
        ${hint}
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
    const freteAtual = item?.valorFrete ? Number(item.valorFrete).toFixed(2) : "";
    return `
      <label class="form-field">
        <span>${label}</span>
        <div class="cep-wrap">
          <div class="cep-input-row">
            <input type="text" name="${name}" value="${value || ""}" placeholder="00000-000" maxlength="9" autocomplete="postal-code" oninput="applyCepMask(this)" onblur="lookupCep(this)" ${requiredAttr}>
            <button type="button" class="btn-map-picker" onclick="openMapPicker()">${Icons.mapPin(16)} Selecionar no mapa</button>
          </div>
          <span class="cep-msg" id="cepMsg"></span>
        </div>
      </label>
      <label class="form-field">
        <span>Frete (R$)</span>
        <input type="number" id="freteManual" name="valorFrete" value="${freteAtual}" placeholder="0.00" min="0" step="0.01">
      </label>
      <input type="hidden" name="lat" value="${item?.lat || ""}">
      <input type="hidden" name="lng" value="${item?.lng || ""}">
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
      const cepDigits = (data.cep || "").replace(/\D/g, "");
      if (cepDigits.length !== 8) {
        toast("CEP obrigatório: preencha um CEP válido (8 dígitos) antes de salvar.");
        return;
      }
      data.peso = Number(data.peso || 0);
      data.distanciaKm = Number(data.distanciaKm || 0);
      data.valorFrete = Number(data.valorFrete || 0);
      data.lat = data.lat ? Number(data.lat) : null;
      data.lng = data.lng ? Number(data.lng) : null;
    }

    if (entity === "motoristas") {
      data.capacidade = 0;
      if (App.modal.mode === "new") data.status = "disponível";
    }

    if (entity === "rotas") {
      // motoristaId é gerenciado pelo select inline na tabela; não sobrescrever em edição
      if (App.modal.mode === "new") {
        data.motoristaId = null;
      } else {
        delete data.motoristaId;
      }
      data.cargasIds = data.cargasIds ? data.cargasIds.split(",").map((id) => id.trim()).filter(Boolean) : [];
      data.distancia = Number(data.distancia || 0);
      data.freteTotal = Number(data.freteTotal || 0);
    }

    let savedPedido = null;
    if (App.modal.mode === "new") {
      if (entity === "cargas") savedPedido = await saveCarga(data);
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
      if (App.modal.mode === "new" && savedPedido) {
        await autoAssignPedidoToRoute(savedPedido);
      } else {
        const route = getRotas().find((rota) => rota.cargasIds?.includes(App.modal.id));
        if (route) await syncRouteStatus(route.id);
      }
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
          `${lat.toFixed(5)}, ${lng.toFixed(5)} — Ponto atualizado pelo CEP`;
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
  if (window._mapaHistorico) {
    try { window._mapaHistorico.remove(); } catch {}
    window._mapaHistorico = null;
  }
  document.getElementById("modalBackdrop").classList.remove("active");
}

// ── Mapa de histórico de entregas (modal motorista) ────────────────────────

function carregarMapaHistoricoMotorista(motoristaId) {
  // Destrói instância anterior se existir
  if (window._mapaHistorico) {
    try { window._mapaHistorico.remove(); } catch {}
    window._mapaHistorico = null;
  }

  const container = document.getElementById("mapaHistoricoMotorista");
  const semMsg    = document.getElementById("semEntregasMsg");
  if (!container) return;

  // Rotas concluídas deste motorista
  const rotas = getRotas().filter(r =>
    r.status === "concluída" && r.motoristaId === motoristaId
  );

  // IDs de pedidos dessas rotas
  const pedidosIds = new Set(rotas.flatMap(r => r.cargasIds || []));

  // Pedidos entregues com coordenadas
  const pedidos = getCargas().filter(p =>
    pedidosIds.has(p.id) && p.status === "entregue" && p.lat && p.lng
  );

  if (!pedidos.length) {
    container.style.display = "none";
    if (semMsg) semMsg.style.display = "block";
    return;
  }

  container.style.display = "block";
  if (semMsg) semMsg.style.display = "none";

  // Inicializa o mapa com delay para garantir que o container está visível
  setTimeout(() => {
    if (!document.getElementById("mapaHistoricoMotorista")) return;

    const map = L.map("mapaHistoricoMotorista", { zoomControl: true });
    window._mapaHistorico = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "© OpenStreetMap"
    }).addTo(map);

    const bounds = pedidos.map(p => [p.lat, p.lng]);

    pedidos.forEach(p => {
      L.circleMarker([p.lat, p.lng], {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: "#22c55e",
        fillOpacity: 1
      }).bindPopup(`
        <b>${p.codigo || "—"}</b><br>
        ${p.cliente || "—"}<br>
        ${p.enderecoEntrega ? p.enderecoEntrega + "<br>" : ""}
        <small style="color:#666">${p.destinoMunicipio || ""}/${p.destinoEstado || ""}</small>
      `).addTo(map);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 13);
    } else {
      map.fitBounds(bounds, { padding: [20, 20] });
    }

    map.invalidateSize();
  }, 300);
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
      document.getElementById("mapPickerInfo").textContent = "Ponto atual marcado · Clique para mover";
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
        `${lat.toFixed(5)}, ${lng.toFixed(5)} — Clique em "Confirmar localização"`;
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
  setCepField(form, "distanciaKm", distKm.toFixed(1));
  const calcDist = document.getElementById("calcDistancia");
  if (calcDist) calcDist.value = distKm.toFixed(1);
}

function toggleFreteCalc() {
  const panel = document.getElementById("freteCalcPanel");
  if (!panel) return;
  const isHidden = panel.style.display === "none";
  panel.style.display = isHidden ? "block" : "none";
  if (isHidden) calcularFreteLive();
}

function calcularFreteLive() {
  const distancia = parseFloat(document.getElementById("calcDistancia")?.value || 0);
  const consumo = parseFloat(document.getElementById("calcConsumo")?.value || 0);
  const gasolina = parseFloat(document.getElementById("calcGasolina")?.value || 0);
  const result = document.getElementById("freteCalcResult");
  if (!result) return null;

  if (!distancia || !consumo || !gasolina) {
    result.textContent = "";
    return null;
  }

  const litros = distancia / consumo;
  const valor = litros * gasolina;
  result.textContent = `${litros.toFixed(2)} L × R$ ${gasolina.toFixed(2)} = R$ ${valor.toFixed(2)}`;
  return valor;
}

function aplicarFreteCombustivel() {
  const valor = calcularFreteLive();
  if (valor === null) {
    const result = document.getElementById("freteCalcResult");
    if (result) result.textContent = "Preencha todos os campos.";
    return;
  }
  const freteInput = document.getElementById("freteManual");
  if (freteInput) freteInput.value = valor.toFixed(2);
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

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR") + " " + date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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

async function autoAssignPedidoToRoute(pedido) {
  const { id, lat, lng, destinoMunicipio, destinoEstado, cliente, valorFrete, distanciaKm } = pedido;
  const hasCoords = lat && lng && Number(lat) !== 0 && Number(lng) !== 0;
  const rotasAtivas = getRotas().filter((r) => r.status === "planejada");
  let rotaEncontrada = null;

  // Busca rota próxima por Haversine (<3 km) quando o pedido tem coordenadas
  if (hasCoords) {
    for (const rota of rotasAtivas) {
      const pedidosRota = getCargas().filter((c) => (rota.cargasIds || []).includes(c.id) && c.lat && c.lng);
      const isClose = pedidosRota.some((c) =>
        calculateDistanceKm(Number(lat), Number(lng), Number(c.lat), Number(c.lng)) < 3
      );
      if (isClose) { rotaEncontrada = rota; break; }
    }
  }

  // Fallback: mesmo município/estado
  if (!rotaEncontrada) {
    rotaEncontrada = rotasAtivas.find((r) =>
      r.destinoMunicipio === destinoMunicipio && r.destinoEstado === destinoEstado
    );
  }

  if (rotaEncontrada) {
    const novasCargasIds = [...(rotaEncontrada.cargasIds || []), id];
    const novoFrete = Number((Number(rotaEncontrada.freteTotal || 0) + Number(valorFrete || 0)).toFixed(2));
    await updateRota(rotaEncontrada.id, { cargasIds: novasCargasIds, freteTotal: novoFrete });
    await updateCarga(id, { status: "em rota" });
    if (App.page === "mapa") renderMapPanel();
    return;
  }

  // Nenhuma rota próxima — cria nova rota planejada
  await saveRota({
    nome: `${destinoMunicipio} · ${cliente}`,
    tipoRota: "Rodoviária",
    destinoMunicipio,
    destinoEstado,
    motoristaId: null,
    saida: "",
    chegada: "",
    status: "planejada",
    cargasIds: [id],
    freteTotal: Number(valorFrete || 0),
    distancia: Number(distanciaKm || 0),
    tempo: null,
    observacoes: "Rota criada automaticamente."
  });
  await updateCarga(id, { status: "em rota" });
  if (App.page === "mapa") renderMapPanel();
}

// ── Modal: pedidos de uma rota ────────────────────────────────────────────────

function openRotaPedidos(rotaId) {
  const rota = getRotas().find((r) => r.id === rotaId);
  if (!rota) return;
  document.getElementById("modalTitle").textContent = `${rota.codigo || "Rota"} — Pedidos vinculados`;
  document.getElementById("modalBody").innerHTML = buildRotaPedidosHtml(rotaId);
  openModal();
}

function buildRotaPedidosHtml(rotaId) {
  const rota = getRotas().find((r) => r.id === rotaId);
  if (!rota) return "";
  const pedidos = getCargas().filter((c) => (rota.cargasIds || []).includes(c.id));
  const motorista = driverName(rota.motoristaId);

  const header = `
    <div class="rota-pedidos-header">
      <div class="rota-pedidos-meta">
        <strong>${rota.nome}</strong>
        <span>${rota.destinoMunicipio}/${rota.destinoEstado} · ${motorista} · ${money.format(Number(rota.freteTotal || 0))}</span>
      </div>
      ${badge(rota.status)}
    </div>
  `;

  if (!pedidos.length) {
    return header + `<div class="empty-state" style="margin:24px 0">Nenhum pedido vinculado a esta rota.</div>`;
  }

  const cards = pedidos.map((c) => {
    const endereco = [c.enderecoEntrega, c.numero, c.complemento].filter(Boolean).join(", ");
    const local = [endereco, `${c.destinoMunicipio}/${c.destinoEstado}`].filter(Boolean).join(" · ");
    const entregue = c.status === "entregue";
    const pendente = c.status === "próximo dia";
    return `
      <div class="pedido-detail-card${entregue ? " pedido-entregue" : ""}">
        <div class="pedido-detail-info">
          <div class="pedido-detail-title">
            <strong>${c.codigo} — ${c.descricao}</strong>
            ${badge(c.status)}
          </div>
          <div class="pedido-detail-row">
            <span>${Icons.user(14)} <strong>${c.cliente}</strong></span>
            ${c.telefone ? `<span>${Icons.phone(14)} ${c.telefone}</span>` : ""}
          </div>
          <div class="pedido-detail-row">
            <span>${Icons.mapPin(14)} ${local || "Endereço não informado"}</span>
          </div>
          <div class="pedido-detail-row">
            <span>${Icons.package(14)} ${c.tipo} · ${c.peso} kg${c.volume ? " · " + c.volume : ""}</span>
            <span>${Icons.tag(14)} ${money.format(Number(c.valorFrete || 0))}</span>
            <span>Prioridade: ${c.prioridade || "normal"}</span>
          </div>
          ${entregue && c.dataEntrega ? `<div class="pedido-detail-row"><span>${Icons.checkCircle(14)} Entregue em: <strong>${formatDateTime(c.dataEntrega)}</strong></span></div>` : ""}
          ${c.observacoes ? `<div class="pedido-detail-obs">${Icons.file(14)} ${c.observacoes}</div>` : ""}
        </div>
        <div class="pedido-detail-actions">
          ${!entregue ? `<button class="primary-button" onclick="markPedidoEntregue('${c.id}','${rotaId}')">${Icons.checkCircle(14)} Entregue</button>` : ""}
          ${!entregue && !pendente ? `<button class="secondary-button" onclick="marcarPedidoPendente('${c.id}','${rotaId}')">${Icons.calendar(14)} Pendente para outro dia</button>` : ""}
        </div>
      </div>
    `;
  }).join("");

  return header + `<div class="rota-pedidos-list">${cards}</div>`;
}

async function markPedidoEntregue(pedidoId, rotaId) {
  try {
    await updateCarga(pedidoId, { status: "entregue", dataEntrega: new Date().toISOString() });
    await syncRouteStatus(rotaId);
    renderAll();
    if (App.page === "mapa") renderLogisticsMap(App.mapFilters);
    document.getElementById("modalBody").innerHTML = buildRotaPedidosHtml(rotaId);
    toast("Pedido marcado como entregue.");
  } catch (e) {
    console.error(e);
    toast("Erro ao marcar entrega.");
  }
}

async function marcarPedidoPendente(pedidoId, rotaId) {
  try {
    const rota = getRotas().find((r) => r.id === rotaId);
    const pedido = getCargas().find((c) => c.id === pedidoId);
    if (!rota || !pedido) return;

    // Remove o pedido da rota e volta para "aguardando rota"
    const novasCargasIds = (rota.cargasIds || []).filter((id) => id !== pedidoId);
    const novoFrete = Number(Math.max(0, Number(rota.freteTotal || 0) - Number(pedido.valorFrete || 0)).toFixed(2));

    await updateCarga(pedidoId, { status: "aguardando rota" });

    if (novasCargasIds.length === 0) {
      // Etapa 4: sem pedidos restantes → cancela rota e libera motorista
      await updateRota(rotaId, { cargasIds: [], freteTotal: 0, status: "cancelada" });
      await syncDriverStatus(rota.motoristaId);
      toast("Pedido removido. Rota cancelada (sem pedidos restantes).");
    } else {
      // Ainda há pedidos: mantém rota ativa
      await updateRota(rotaId, { cargasIds: novasCargasIds, freteTotal: novoFrete });
      toast("Pedido adiado e removido da rota.");
    }

    renderAll();
    if (App.page === "mapa") renderLogisticsMap(App.mapFilters);
    document.getElementById("modalBody").innerHTML = buildRotaPedidosHtml(rotaId);
  } catch (e) {
    console.error(e);
    toast("Erro ao adiar pedido.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function syncRouteStatus(routeId) {
  const route = getRotas().find((item) => item.id === routeId);
  if (!route) return;

  const pedidos = getCargas().filter((carga) => (route.cargasIds || []).includes(carga.id) && carga.status !== "cancelado");

  if (!pedidos.length) {
    // Sem pedidos restantes: cancela rota e libera motorista
    await updateRota(routeId, { status: "cancelada" });
    await syncDriverStatus(route.motoristaId);
    return;
  }

  if (pedidos.every((pedido) => pedido.status === "entregue")) {
    // Todos entregues: conclui rota e libera motorista
    await updateRota(routeId, { status: "concluída" });
    await syncDriverStatus(route.motoristaId);
    return;
  }

  if (pedidos.some((pedido) => pedido.status === "em rota")) {
    // Ainda há pedidos em trânsito
    await updateRota(routeId, { status: "em andamento" });
    if (route.motoristaId) await updateMotorista(route.motoristaId, { status: "em entrega" });
    return;
  }

  // Pedidos existem mas nenhum "em rota" (ex: todos aguardando) → planejada
  await updateRota(routeId, { status: "planejada" });
  if (route.motoristaId) await updateMotorista(route.motoristaId, { status: "em entrega" });
}

async function syncDriverStatus(driverId) {
  if (!driverId || driverId === "null") return;
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
  await updateCarga(id, { status: "entregue", dataEntrega: new Date().toISOString() });
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
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.innerHTML = theme === "dark" ? Icons.sun(16) : Icons.moon(16);
    btn.title = theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro";
  }
}

// ── Usuários ──────────────────────────────────────────────────────────────────

let _usuarios = [];

async function fetchUsuarios() {
  const res = await fetch(`${API_BASE}/api/usuarios`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  _usuarios = await res.json();
  return _usuarios;
}

async function renderUsuarios() {
  const tbl = document.getElementById("usuariosTable");
  if (!tbl) return;

  try {
    await fetchUsuarios();
  } catch (e) {
    tbl.innerHTML = `<tbody><tr><td colspan="4" class="empty-table-cell">Erro ao carregar usuários. Verifique a conexão.</td></tr></tbody>`;
    return;
  }

  const search = (document.getElementById("usuariosSearch")?.value || "").toLowerCase();
  const filtered = _usuarios.filter((u) =>
    `${u.nome} ${u.perfil}`.toLowerCase().includes(search)
  );

  const perfilBadge = {
    admin:     "purple",
    atendente: "blue",
    motorista: "green"
  };

  const headers = ["Nome", "Perfil", "Status", "Ações"];
  const rows = filtered.map((u) => {
    const pb = perfilBadge[u.perfil] || "gray";
    const atvBadge = u.ativo !== false
      ? `<span class="badge badge-green">ativo</span>`
      : `<span class="badge badge-gray">inativo</span>`;
    const toggleLabel = u.ativo !== false ? "Desativar" : "Reativar";
    const toggleIcon = u.ativo !== false ? Icons.eye(14) : Icons.checkCircle(14);

    return [
      u.nome,
      `<span class="badge badge-${pb}">${u.perfil}</span>`,
      atvBadge,
      `<div class="actions-cell">
        <button class="table-action" onclick="openUserForm('${u.id}')">${Icons.edit(14)} Editar</button>
        <button class="table-action" onclick="toggleUsuario('${u.id}')">${toggleIcon} ${toggleLabel}</button>
        <button class="table-action" style="color:var(--danger)" onclick="excluirUsuario('${u.id}','${u.nome.replace(/'/g, "\\'")}')">${Icons.trash(14)} Excluir</button>
      </div>`
    ];
  });

  table("usuariosTable", headers, rows);
}

function openUserForm(id = null) {
  const user = id ? _usuarios.find((u) => u.id === id) : null;
  const isEdit = Boolean(user);

  document.getElementById("modalTitle").innerHTML =
    `${Icons.users(18)} ${isEdit ? "Editar" : "Novo"} Usuário`;

  document.getElementById("modalBody").innerHTML = `
    <form id="userForm" class="form-grid">
      <label class="form-field">
        <span>Nome *</span>
        <input type="text" name="nome" value="${user?.nome || ""}" required autocomplete="name">
      </label>
      <label class="form-field">
        <span>Perfil *</span>
        <select name="perfil" required
          onchange="document.getElementById('motoristaNote').style.display=this.value==='motorista'?'flex':'none'">
          <option value="atendente" ${user?.perfil === "atendente" ? "selected" : ""}>Atendente</option>
          <option value="motorista" ${user?.perfil === "motorista" ? "selected" : ""}>Motorista</option>
        </select>
      </label>
      <div id="motoristaNote" class="form-field full" style="display:${user?.perfil === "motorista" ? "flex" : "none"};align-items:flex-start;gap:.5rem;padding:.6rem .85rem;background:var(--surface-soft);border-radius:var(--radius);border:1px solid var(--line);font-size:.82rem;color:var(--muted);line-height:1.45">
        <span style="flex-shrink:0">ℹ️</span>
        <span>Motoristas cadastrados aqui também aparecem na aba <strong>Motoristas</strong> para gerenciamento de rotas.</span>
      </div>
      <label class="form-field">
        <span>${isEdit ? "Nova senha (deixe vazio para manter)" : "Senha *"}</span>
        <input type="password" name="senha" ${isEdit ? "" : "required"} autocomplete="new-password"
               placeholder="${isEdit ? "Deixe vazio para não alterar" : "Mínimo 6 caracteres"}">
      </label>
      <label class="form-field">
        <span>${isEdit ? "Confirmar nova senha" : "Confirmar senha *"}</span>
        <input type="password" name="confirmarSenha" autocomplete="new-password"
               placeholder="Repita a senha">
      </label>
      <input type="hidden" name="userId" value="${user?.id || ""}">
      <div class="modal-actions form-field full">
        <button class="secondary-button" type="button" onclick="closeModal()">Cancelar</button>
        <button class="primary-button" type="submit">${Icons.checkCircle(16)} Salvar</button>
      </div>
    </form>
  `;

  document.getElementById("userForm").addEventListener("submit", submitUserForm);
  openModal();
}

async function submitUserForm(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form).entries());

  if (!data.nome?.trim()) { toast("Preencha o nome."); return; }
  if (!data.perfil)        { toast("Selecione o perfil."); return; }

  const isEdit = Boolean(data.userId);

  if (!isEdit && !data.senha) {
    toast("A senha é obrigatória para novos usuários.");
    return;
  }

  if (data.senha && data.senha !== data.confirmarSenha) {
    toast("As senhas não coincidem.");
    return;
  }

  if (data.senha && data.senha.length < 6) {
    toast("A senha deve ter pelo menos 6 caracteres.");
    return;
  }

  const payload = { nome: data.nome.trim(), perfil: data.perfil };
  if (data.senha) payload.senha = data.senha;

  const submitBtn = form.querySelector("[type='submit']");
  submitBtn.disabled = true;

  try {
    let res;
    if (isEdit) {
      res = await fetch(`${API_BASE}/api/usuarios/${data.userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch(`${API_BASE}/api/usuarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);

    closeModal();
    toast(`Usuário ${isEdit ? "atualizado" : "criado"} com sucesso.`);
    await renderUsuarios();
  } catch (e) {
    console.error(e);
    toast(`Erro ao salvar usuário: ${e.message}`);
  } finally {
    submitBtn.disabled = false;
  }
}

async function toggleUsuario(id) {
  try {
    const res = await fetch(`${API_BASE}/api/usuarios/${id}/toggle`, { method: "PATCH" });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const updated = await res.json();
    toast(`Usuário ${updated.ativo ? "reativado" : "desativado"}.`);
    await renderUsuarios();
  } catch (e) {
    console.error(e);
    toast(`Erro ao alterar status: ${e.message}`);
  }
}

async function excluirUsuario(id, nome) {
  if (!confirm(`Tem certeza que deseja excluir o usuário "${nome}"?\nEsta ação é permanente e não pode ser desfeita.`)) return;
  try {
    const res = await fetch(`${API_BASE}/api/usuarios/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    _usuarios = _usuarios.filter((u) => u.id !== id);
    toast(`Usuário "${nome}" excluído.`);
    await renderUsuarios();
  } catch (e) {
    console.error(e);
    toast(`Erro ao excluir: ${e.message}`);
  }
}

// ── Veículos ──────────────────────────────────────────────────────────────────

let _veiculos = [];

async function fetchVeiculos() {
  const res = await fetch(`${API_BASE}/api/veiculos`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  _veiculos = await res.json();
  return _veiculos;
}

async function renderVeiculos() {
  const tbl = document.getElementById("veiculosTable");
  if (!tbl) return;

  try {
    await fetchVeiculos();
  } catch (e) {
    tbl.innerHTML = `<tbody><tr><td colspan="6" class="empty-table-cell">Erro ao carregar veículos. Verifique a conexão.</td></tr></tbody>`;
    return;
  }

  const search = (document.getElementById("veiculosSearch")?.value || "").toLowerCase();
  const filtered = _veiculos.filter((v) =>
    `${v.id} ${v.nome} ${v.uso || ""}`.toLowerCase().includes(search)
  );

  const moneyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  const headers = ["ID", "Nome", "Capacidade (kg)", "Custo base", "Custo/km", "Uso", "Ações"];
  const rows = filtered.map((v) => [
    v.id,
    v.nome,
    `${Number(v.capacidade || 0).toLocaleString("pt-BR")} kg`,
    moneyFmt.format(Number(v.custo_base || 0)),
    `R$ ${Number(v.custo_km || 0).toFixed(2)}/km`,
    v.uso || "—",
    `<div class="actions-cell">
      <button class="table-action" onclick="openVeiculoForm('${v.id}')">${Icons.edit(14)} Editar</button>
      <button class="table-action" onclick="excluirVeiculo('${v.id}','${(v.nome || "").replace(/'/g, "\\'")}')">${Icons.trash(14)}</button>
    </div>`
  ]);

  table("veiculosTable", headers, rows);
}

function openVeiculoForm(id = null) {
  const veiculo = id ? _veiculos.find((v) => v.id === id) : null;
  const isEdit  = Boolean(veiculo);

  document.getElementById("modalTitle").innerHTML =
    `${Icons.truck(18)} ${isEdit ? "Editar" : "Novo"} Veículo`;

  document.getElementById("modalBody").innerHTML = `
    <form id="veiculoForm" class="form-grid">
      <label class="form-field">
        <span>ID *</span>
        <input type="text" name="id" value="${veiculo?.id || ""}" ${isEdit ? "readonly style=\"opacity:.6\"" : "required"} placeholder="ex: caminhonete">
      </label>
      <label class="form-field">
        <span>Nome *</span>
        <input type="text" name="nome" value="${veiculo?.nome || ""}" required placeholder="ex: Caminhonete">
      </label>
      <label class="form-field">
        <span>Capacidade (kg) *</span>
        <input type="number" name="capacidade" value="${veiculo?.capacidade ?? ""}" required min="0" step="0.1" placeholder="ex: 1200">
      </label>
      <label class="form-field">
        <span>Custo base (R$) *</span>
        <input type="number" name="custo_base" value="${veiculo?.custo_base ?? ""}" required min="0" step="0.01" placeholder="ex: 50.00">
      </label>
      <label class="form-field">
        <span>Custo por km (R$/km) *</span>
        <input type="number" name="custo_km" value="${veiculo?.custo_km ?? ""}" required min="0" step="0.01" placeholder="ex: 1.80">
      </label>
      <label class="form-field full">
        <span>Uso ideal</span>
        <input type="text" name="uso" value="${veiculo?.uso || ""}" placeholder="ex: Entregas urbanas até 1200 kg">
      </label>
      <div class="modal-actions form-field full">
        <button class="secondary-button" type="button" onclick="closeModal()">Cancelar</button>
        <button class="primary-button" type="submit">${Icons.checkCircle(16)} Salvar</button>
      </div>
    </form>
  `;

  document.getElementById("veiculoForm").addEventListener("submit", (e) => submitVeiculoForm(e, isEdit, veiculo?.id));
  openModal();
}

async function submitVeiculoForm(event, isEdit, veiculoId) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form).entries());

  data.capacidade = Number(data.capacidade);
  data.custo_base = Number(data.custo_base);
  data.custo_km   = Number(data.custo_km);

  const submitBtn = form.querySelector("[type='submit']");
  submitBtn.disabled = true;

  try {
    let res;
    if (isEdit) {
      res = await fetch(`${API_BASE}/api/veiculos/${veiculoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
    } else {
      res = await fetch(`${API_BASE}/api/veiculos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
    }

    const result = await res.json();
    if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);

    closeModal();
    toast(`Veículo ${isEdit ? "atualizado" : "criado"} com sucesso.`);
    await renderVeiculos();
  } catch (e) {
    console.error(e);
    toast(`Erro ao salvar veículo: ${e.message}`);
  } finally {
    submitBtn.disabled = false;
  }
}

async function excluirVeiculo(id, nome) {
  if (!confirm(`Excluir o veículo "${nome}"? Esta ação não pode ser desfeita.`)) return;
  try {
    const res = await fetch(`${API_BASE}/api/veiculos/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    toast(`Veículo "${nome}" excluído.`);
    await renderVeiculos();
  } catch (e) {
    console.error(e);
    toast(`Erro ao excluir veículo: ${e.message}`);
  }
}
