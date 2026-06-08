"use strict";

// ── Configuração ─────────────────────────────────────────────────────────────

const API_BASE = window.location.port === "3000" ? "" : "http://localhost:3000";

// Coordenadas fixas da loja (ponto de partida de todas as rotas)
const LOJA_LAT = -4.760287;
const LOJA_LNG = -42.573777;

// Coordenadas de municípios para fallback quando pedido não tem lat/lng
const MUNICIPIOS_COORDS_MOTO = {
  "timon-ma":           { lat: -4.760287, lng: -42.573777 },
  "jose de freitas-pi": { lat: -4.43028,  lng: -42.62778  },
  "teresina-pi":        { lat: -5.0892,   lng: -42.8016   },
  "caxias-ma":          { lat: -4.8589,   lng: -43.3561   },
  "codo-ma":            { lat: -4.4556,   lng: -43.8924   },
  "campo maior-pi":     { lat: -4.8278,   lng: -42.1686   },
  "sao luis-ma":        { lat: -2.5307,   lng: -44.3068   }
};

function obterCoordsMunicipio(municipio, estado) {
  const key = `${(municipio || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ").trim()}-${(estado || "").toLowerCase()}`;
  return MUNICIPIOS_COORDS_MOTO[key] || { lat: LOJA_LAT, lng: LOJA_LNG };
}

// ── Estado global ────────────────────────────────────────────────────────────

const state = {
  motorista:       null,   // { id, nome }
  rotas:           [],     // rotas em andamento do motorista
  pedidos:         [],     // pedidos dessas rotas
  map:             null,
  driverMarker:    null,
  deliveryMarkers: {},
  routeLine:       null,
  rotaLayer:       null,
  geoWatchId:      null,
  currentPos:      null    // { lat, lng }
};

// Estado do modal de seleção de veículo
let _modalVeiculoPedidoId  = null;
let _modalVeiculoSelecionado = null;

// ── Utilitários ──────────────────────────────────────────────────────────────

async function apiGet(url) {
  const res = await fetch(url);
  if (res.status === 401) { sair(); return; }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

async function apiPost(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (res.status === 401) { sair(); return; }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

async function apiPut(url, data) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (res.status === 401) { sair(); return; }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

const moneyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function show(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}

function hide(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}

function showEl(id, flex = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("hidden");
  if (flex) el.style.display = "flex";
}

function toast(msg, tipo = "ok") {
  const el = document.getElementById("motoToast");
  if (!el) return;
  el.textContent = msg;
  el.className = `moto-toast moto-toast-${tipo} moto-toast-show`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("moto-toast-show"), 3200);
}

// ── Auth ─────────────────────────────────────────────────────────────────────

function sair() {
  sessionStorage.removeItem("madcenter_token");
  sessionStorage.removeItem("madcenter_nome");
  sessionStorage.removeItem("madcenter_perfil");
  if (state.geoWatchId !== null) {
    navigator.geolocation.clearWatch(state.geoWatchId);
    state.geoWatchId = null;
  }
  window.location.href = "login.html";
}

// ── Tela principal ───────────────────────────────────────────────────────────

function mostrarTelaPrincipal() {
  document.getElementById("headerName").textContent = state.motorista.nome;
  show("mainScreen");
  carregarEntregasDoDia(state.motorista.id);
}


async function carregarEntregasDoDia(motoristaId, silencioso = false) {
  if (!silencioso) {
    document.getElementById("pedidosList").innerHTML =
      `<div class="moto-mural-loading">Carregando…</div>`;
  }

  try {
    const [todasRotas, todosPedidos] = await Promise.all([
      apiGet(`${API_BASE}/api/rotas`),
      apiGet(`${API_BASE}/api/pedidos`)
    ]);

    // Rotas em andamento do motorista
    state.rotas = todasRotas.filter(r =>
      r.motorista_id === motoristaId &&
      r.status === "em andamento"
    );

    // IDs dos pedidos nessas rotas
    const ids = new Set(
      state.rotas.flatMap(r => Array.isArray(r.cargas_ids) ? r.cargas_ids : [])
    );

    // Pedidos correspondentes
    state.pedidos = todosPedidos.filter(p => ids.has(p.id));

    renderPedidos();
    atualizarProgresso();
    iniciarMapa();

  } catch (e) {
    console.error(e);
    document.getElementById("pedidosList").innerHTML = "";
    toast("Erro ao carregar entregas. Verifique a conexão.", "erro");
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function getPedidosOrdenados() {
  const emRota   = state.pedidos.filter(p => p.status === "em rota");
  const pendente = state.pedidos.filter(p => p.status === "pendente");
  const entregue = state.pedidos.filter(p => p.status === "entregue");
  const outros   = state.pedidos.filter(p => !["em rota","pendente","entregue"].includes(p.status));
  return [...emRota, ...outros, ...pendente, ...entregue];
}

function getRotaDoPedido(pedidoId) {
  return state.rotas.find(r => (r.cargas_ids || []).includes(pedidoId));
}

function renderPedidos() {
  const list     = document.getElementById("pedidosList");
  const title    = document.getElementById("listTitle");
  const ordenados = getPedidosOrdenados();

  if (!state.rotas.length || !ordenados.length) {
    show("semRotaMsg");
    hide("mapaSection");
    hide("floatingBtn");
    if (title) title.style.display = "none";
    list.innerHTML = "";
    return;
  }

  hide("semRotaMsg");
  if (title) title.style.display = "block";

  const naoEntregues = ordenados.filter(p => p.status !== "entregue");
  const primeiroPendenteId = naoEntregues.find(p => p.status === "em rota")?.id
    || naoEntregues[0]?.id;

  list.innerHTML = ordenados.map(p => {
    const isEntregue = p.status === "entregue";
    const isPendente = p.status === "pendente";
    const isProximo  = p.id === primeiroPendenteId;
    const rota = getRotaDoPedido(p.id);

    const endereco = [p.endereco_entrega, p.numero, p.complemento]
      .filter(Boolean).join(", ");
    const destino = [p.destino_municipio, p.destino_estado]
      .filter(Boolean).join("/");

    const cardClass = [
      "moto-pedido-card",
      isEntregue ? "is-entregue" : isPendente ? "is-pendente" : isProximo ? "is-proximo" : ""
    ].join(" ").trim();

    const statusBadge = isEntregue
      ? `<span class="moto-badge moto-badge-green">Entregue</span>`
      : isPendente
        ? `<span class="moto-badge moto-badge-purple">Pendente</span>`
        : `<span class="moto-badge moto-badge-blue">Em rota</span>`;

    const botoes = !isEntregue ? `
      <div class="moto-card-actions">
        <button class="moto-btn moto-btn-entregue"
          onclick="marcarEntregue('${p.id}','${rota?.id || ""}')">
          ${Icons.checkCircle(16)} Entregue
        </button>
        ${!isPendente ? `
        <button class="moto-btn moto-btn-adiar"
          onclick="deixarParaDepois('${p.id}')">
          ${Icons.calendar(16)} Deixar para depois
        </button>` : ""}
        <button class="moto-btn moto-btn-cancelar"
          onclick="cancelarPedido('${p.id}','${rota?.id || ""}')">
          Cancelar pedido
        </button>
      </div>
    ` : "";

    return `
      <div class="${cardClass}" id="card-${p.id}">
        <div class="moto-card-header">
          <strong class="moto-card-codigo">${p.codigo || "—"}</strong>
          ${statusBadge}
        </div>
        <div class="moto-card-info">
          <div class="moto-card-row">
            <span class="moto-card-label">Cliente</span>
            <span class="moto-card-value">${p.cliente || "—"}</span>
          </div>
          <div class="moto-card-row">
            <span class="moto-card-label">Material</span>
            <span class="moto-card-value">${p.descricao || "—"}</span>
          </div>
          ${endereco ? `
          <div class="moto-card-row">
            <span class="moto-card-label">Endereço</span>
            <span class="moto-card-value">${endereco}</span>
          </div>` : ""}
          <div class="moto-card-row">
            <span class="moto-card-label">Destino</span>
            <span class="moto-card-value">${destino || "—"}</span>
          </div>
          <div class="moto-card-row">
            <div class="moto-card-chips">
              <span>${Icons.weight(14)} ${p.peso || 0} kg</span>
              <span>${Icons.money(14)} ${moneyFmt.format(Number(p.valor_frete || 0))}</span>
            </div>
          </div>
        </div>
        ${botoes}
      </div>
    `;
  }).join("");

  // Botão flutuante: visível se houver pedido ativo (em rota) com coords
  const proximoComCoord = naoEntregues.find(p => p.status === "em rota" && p.lat && p.lng)
    || naoEntregues.find(p => p.lat && p.lng);
  if (proximoComCoord) show("floatingBtn");
  else hide("floatingBtn");

  // Mapa
  if (state.rotas.length) show("mapaSection");
}

function atualizarProgresso() {
  const total    = state.pedidos.length;
  const feito    = state.pedidos.filter(p => p.status === "entregue").length;
  const pendente = state.pedidos.filter(p => p.status !== "entregue").length;
  const pct      = total > 0 ? Math.round((feito / total) * 100) : 0;

  document.getElementById("statTotal").textContent    = total;
  document.getElementById("statFeito").textContent    = feito;
  document.getElementById("statPendente").textContent = pendente;
  document.getElementById("progressBar").style.width  = `${pct}%`;
  document.getElementById("progressLabel").textContent =
    `${feito} de ${total} entrega${total !== 1 ? "s" : ""} concluída${total !== 1 ? "s" : ""}`;
}

// ── Ações do motorista ────────────────────────────────────────────────────────

async function marcarEntregue(pedidoId, rotaId) {
  const card = document.getElementById(`card-${pedidoId}`);
  if (card) card.style.opacity = "0.35";

  try {
    // 1. Marca pedido como entregue
    await apiPut(`${API_BASE}/api/pedidos/${pedidoId}`, { status: "entregue", data_entrega: new Date().toISOString() });

    // 2. Atualiza estado local
    const pedido = state.pedidos.find(p => p.id === pedidoId);
    if (pedido) pedido.status = "entregue";

    // 3. Verifica se todos da rota foram entregues
    if (rotaId) {
      const rota = state.rotas.find(r => r.id === rotaId);
      if (rota) {
        const pedidosDaRota = state.pedidos.filter(p =>
          (rota.cargas_ids || []).includes(p.id)
        );
        const todosEntregues = pedidosDaRota.every(p => p.status === "entregue");

        if (todosEntregues) {
          await apiPut(`${API_BASE}/api/rotas/${rotaId}`, { status: "concluída" });
          if (state.motorista?.id) {
            await apiPut(`${API_BASE}/api/motoristas/${state.motorista.id}`, { status: "disponível" });
          }
          rota.status = "concluída";
          // Remove rota das ativas
          state.rotas = state.rotas.filter(r => r.id !== rotaId);
          toast("Todas as entregas concluídas! Rota finalizada.");
        } else {
          toast("Pedido entregue com sucesso.");
        }
      }
    }

    renderPedidos();
    atualizarProgresso();
    desenharRota();

  } catch (e) {
    console.error(e);
    if (card) card.style.opacity = "";
    toast("Erro ao registrar entrega. Tente novamente.", "erro");
  }
}

async function deixarParaDepois(pedidoId) {
  if (!confirm("Deixar este pedido para depois? Ele ficará pendente na sua rota.")) return;

  const card = document.getElementById(`card-${pedidoId}`);
  if (card) card.style.opacity = "0.35";

  try {
    // Muda status para "pendente" mantendo o pedido vinculado à rota
    await apiPut(`${API_BASE}/api/pedidos/${pedidoId}/deixar-para-depois`, {});

    const pedido = state.pedidos.find(p => p.id === pedidoId);
    if (pedido) pedido.status = "pendente";

    toast("Pedido marcado como pendente.");
    renderPedidos();
    atualizarProgresso();
    desenharRota();

  } catch (e) {
    console.error(e);
    if (card) card.style.opacity = "";
    toast("Erro ao adiar pedido. Tente novamente.", "erro");
  }
}

async function cancelarPedido(pedidoId, rotaId) {
  if (!confirm("Devolver este pedido ao mural? Ele ficará disponível para outros motoristas.")) return;

  const card = document.getElementById(`card-${pedidoId}`);
  if (card) card.style.opacity = "0.35";

  try {
    await apiPut(`${API_BASE}/api/pedidos/${pedidoId}/cancelar-motorista`, {});

    // Atualiza estado local da rota (remove o pedido do array local)
    if (rotaId) {
      const rota = state.rotas.find(r => r.id === rotaId);
      if (rota) {
        rota.cargas_ids = (rota.cargas_ids || []).filter(id => id !== pedidoId);
        if (rota.cargas_ids.length === 0) {
          state.rotas = state.rotas.filter(r => r.id !== rotaId);
          if (state.motorista?.id) {
            await apiPut(`${API_BASE}/api/motoristas/${state.motorista.id}`, { status: "disponível" });
          }
        }
      }
    }

    state.pedidos = state.pedidos.filter(p => p.id !== pedidoId);

    toast("Pedido devolvido ao mural de pedidos.");
    renderPedidos();
    atualizarProgresso();
    desenharRota();

  } catch (e) {
    console.error(e);
    if (card) card.style.opacity = "";
    toast("Erro ao cancelar pedido. Tente novamente.", "erro");
  }
}

// ── Mapa Leaflet ──────────────────────────────────────────────────────────────

function iniciarMapa() {
  if (!window.L) return;

  const container = document.getElementById("motoristaMap");
  if (!container) return;

  // Mapa já existe: apenas atualiza os layers sem destruir a instância
  // (preserva zoom e posição entre refreshes)
  if (state.map) {
    setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 100);
    desenharRota();
    return;
  }

  // Retry enquanto o container ainda não tem altura real no DOM
  if (container.offsetHeight === 0) {
    setTimeout(iniciarMapa, 300);
    return;
  }

  const primeiroPendente = state.pedidos.find(
    p => p.status !== "entregue" && p.lat && p.lng
  );
  const centro = primeiroPendente
    ? [Number(primeiroPendente.lat), Number(primeiroPendente.lng)]
    : [LOJA_LAT, LOJA_LNG];

  state.map = L.map("motoristaMap", { zoomControl: true }).setView(centro, 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>'
  }).addTo(state.map);

  // Marcador fixo da loja
  L.marker([LOJA_LAT, LOJA_LNG], {
    icon: L.divIcon({
      className: "",
      html: `<div style="width:18px;height:18px;border-radius:50%;background:#4caf50;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    })
  }).bindPopup("🏪 Madcenter — Ponto de partida").addTo(state.map);

  setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 200);

  desenharRota();
  iniciarGeolocalizacao();
}

async function buscarRotaOSRM(pontos) {
  try {
    const coords = pontos.map(p => `${p.lng},${p.lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) return null;
    return data.routes[0].geometry;
  } catch {
    return null;
  }
}

async function desenharRota() {
  if (!state.map) return;

  // Remove marcadores e camada de rota anteriores
  Object.values(state.deliveryMarkers).forEach(m => { try { m.remove(); } catch {} });
  state.deliveryMarkers = {};
  if (state.routeLine) { try { state.routeLine.remove(); } catch {} state.routeLine = null; }
  if (state.rotaLayer) { try { state.map.removeLayer(state.rotaLayer); } catch {} state.rotaLayer = null; }

  const entregues = state.pedidos.filter(p => p.status === "entregue");
  const pendentes = state.pedidos.filter(p => p.status !== "entregue");
  if (!pendentes.length && !entregues.length) return;

  const getCoordsP = p => ({
    lat: p.lat ? Number(p.lat) : obterCoordsMunicipio(p.destino_municipio, p.destino_estado).lat,
    lng: p.lng ? Number(p.lng) : obterCoordsMunicipio(p.destino_municipio, p.destino_estado).lng
  });

  const ultimoEntregue = entregues.length ? entregues[entregues.length - 1] : null;
  const pontoPartida   = ultimoEntregue ? getCoordsP(ultimoEntregue) : { lat: LOJA_LAT, lng: LOJA_LNG };
  const pontos         = [pontoPartida, ...pendentes.map(getCoordsP)];

  if (pontos.length >= 2) {
    const geojson = await buscarRotaOSRM(pontos);
    if (geojson) {
      state.rotaLayer = L.geoJSON(geojson, {
        style: { color: "#2196f3", weight: 5, opacity: 0.85 }
      }).addTo(state.map);
    } else {
      // Fallback: linha pontilhada se OSRM não responder
      state.rotaLayer = L.polyline(
        pontos.map(p => [p.lat, p.lng]),
        { color: "#2196f3", weight: 4, dashArray: "8,6" }
      ).addTo(state.map);
    }
    try { state.map.fitBounds(state.rotaLayer.getBounds(), { padding: [30, 30] }); } catch {}
  }

  // Marcadores dos pedidos (circleMarker)
  const allPedidos = [...entregues, ...pendentes];
  allPedidos.forEach((p, i) => {
    const { lat, lng } = getCoordsP(p);
    const isEntregue = p.status === "entregue";
    const isProximo  = !isEntregue && i === entregues.length;
    const cor = isEntregue ? "#4caf50" : isProximo ? "#2196f3" : "#ff9800";
    const marker = L.circleMarker([lat, lng], {
      radius: 10, color: "#fff", weight: 2, fillColor: cor, fillOpacity: 1
    });
    const label = isEntregue ? "✅ Entregue" : isProximo ? "📍 Próxima entrega" : "⏳ Pendente";
    marker.bindPopup(`<b>${p.codigo || "—"}</b><br>${p.cliente || "—"}<br>${label}`);
    marker.addTo(state.map);
    state.deliveryMarkers[p.id] = marker;
  });
}

function iniciarGeolocalizacao() {
  if (!navigator.geolocation || !state.map) return;

  state.geoWatchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude, longitude } = pos.coords;
      state.currentPos = { lat: latitude, lng: longitude };

      if (state.driverMarker) {
        state.driverMarker.setLatLng([latitude, longitude]);
      } else {
        state.driverMarker = L.marker([latitude, longitude], {
          icon: L.divIcon({
            className: "marcador-motorista",
            html: `<div style="width:20px;height:20px;background:#00bcd4;border:3px solid white;border-radius:50%;box-shadow:0 0 8px rgba(0,188,212,0.8);"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          }),
          title: "Sua localização"
        }).addTo(state.map)
          .bindPopup("📍 Você está aqui");
      }
    },
    err => console.warn("Geolocalização indisponível:", err.message),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
}

// ── Abas ─────────────────────────────────────────────────────────────────────

function switchTab(tab) {
  const isEntregas = tab === "entregas";

  document.getElementById("tabEntregas").classList.toggle("hidden", !isEntregas);
  document.getElementById("tabMural").classList.toggle("hidden", isEntregas);

  document.getElementById("tabBtnEntregas").classList.toggle("active", isEntregas);
  document.getElementById("tabBtnMural").classList.toggle("active", !isEntregas);

  // Botões flutuantes
  if (isEntregas) {
    const proximoComCoord = state.pedidos.find(
      p => p.status !== "entregue" && p.lat && p.lng
    );
    if (proximoComCoord) show("floatingBtn"); else hide("floatingBtn");
    hide("floatingBtnMural");
    // O container do mapa ficou oculto enquanto a aba estava escondida;
    // força recálculo de tamanho para eliminar a área cinza do Leaflet
    setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 100);
  } else {
    hide("floatingBtn");
    atualizarBotaoMural();
    carregarMural();
  }
}

// ── Mural de Pedidos ──────────────────────────────────────────────────────────

const muralState = {
  pedidos:     [],
  selecionados: new Set()
};

const PRIORIDADE_ORDEM = { urgente: 3, alta: 2, normal: 1, baixa: 0 };

const moneyMural = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

async function carregarMural(silencioso = false) {
  const loading = document.getElementById("muralLoading");
  const vazio   = document.getElementById("muralVazio");
  const resumo  = document.getElementById("muralResumo");
  const list    = document.getElementById("muralList");

  if (!silencioso) {
    loading.style.display = "block";
    list.innerHTML        = "";
    vazio.classList.add("hidden");
    resumo.style.display = "none";
  }

  try {
    const todos = await apiGet(`${API_BASE}/api/pedidos`);
    muralState.pedidos     = todos.filter(p => p.status === "aguardando rota");
    muralState.selecionados.clear();
    atualizarBotaoMural();
    renderMural();
  } catch (e) {
    list.innerHTML = `<div class="moto-mural-loading">Erro ao carregar pedidos. Tente novamente.</div>`;
    console.error(e);
  } finally {
    loading.style.display = "none";
  }
}

function renderMural() {
  const vazio  = document.getElementById("muralVazio");
  const resumo = document.getElementById("muralResumo");
  const list   = document.getElementById("muralList");

  if (!muralState.pedidos.length) {
    vazio.classList.remove("hidden");
    resumo.style.display = "none";
    list.innerHTML       = "";
    return;
  }

  vazio.classList.add("hidden");
  resumo.style.display = "grid";

  const urgentes = muralState.pedidos.filter(p => p.prioridade === "urgente").length;
  document.getElementById("muralCount").textContent   = muralState.pedidos.length;
  document.getElementById("muralUrgente").textContent = urgentes;

  // Ordena: prioridade desc, depois data prevista de entrega asc
  const ordenados = [...muralState.pedidos].sort((a, b) => {
    const pa = PRIORIDADE_ORDEM[a.prioridade] ?? 1;
    const pb = PRIORIDADE_ORDEM[b.prioridade] ?? 1;
    if (pb !== pa) return pb - pa;
    return (a.entrega || "").localeCompare(b.entrega || "");
  });

  list.innerHTML = ordenados.map(p => {
    const endereco = [p.endereco_entrega, p.numero, p.complemento]
      .filter(Boolean).join(", ");
    const destino  = [p.destino_municipio, p.destino_estado]
      .filter(Boolean).join("/");
    const prio     = p.prioridade || "normal";
    const prioLabel = {
      urgente: "Urgente", alta: "Alta",
      normal:  "Normal",  baixa: "Baixa"
    }[prio] || prio;

    const dataEntrega = p.entrega
      ? new Date(p.entrega + "T00:00").toLocaleDateString("pt-BR")
      : "—";

    const selecionado = muralState.selecionados.has(p.id);

    return `
      <div class="moto-mural-card${selecionado ? " is-selected" : ""}"
           data-prioridade="${prio}" id="mural-card-${p.id}">
        <div class="moto-mural-header">
          <div class="moto-mural-header-left">
            <input type="checkbox" class="moto-mural-checkbox"
                   id="chk-${p.id}"
                   ${selecionado ? "checked" : ""}
                   onchange="toggleSelecionado('${p.id}', this.checked)">
            <span class="moto-mural-codigo">${p.codigo || "—"}</span>
            <span class="moto-badge moto-badge-${prio}">${prioLabel}</span>
          </div>
        </div>

        <div class="moto-mural-info">
          <div class="moto-mural-row">
            <span class="moto-mural-label">Cliente</span>
            <span class="moto-mural-value">${p.cliente || "—"}${p.telefone ? ` · ${p.telefone}` : ""}</span>
          </div>
          <div class="moto-mural-row">
            <span class="moto-mural-label">Material</span>
            <span class="moto-mural-value">${p.descricao || "—"}</span>
          </div>
          ${endereco ? `
          <div class="moto-mural-row">
            <span class="moto-mural-label">Endereço</span>
            <span class="moto-mural-value">${endereco}</span>
          </div>` : ""}
          <div class="moto-mural-row">
            <span class="moto-mural-label">Destino</span>
            <span class="moto-mural-value">${destino || "—"}</span>
          </div>
          <div class="moto-mural-chips">
            <span>${Icons.weight(14)} ${p.peso || 0} kg</span>
            <span>${Icons.money(14)} ${moneyMural.format(Number(p.valor_frete || 0))}</span>
            <span>${Icons.calendar(14)} ${dataEntrega}</span>
          </div>
        </div>

        <button class="moto-btn moto-btn-pegar"
                id="btn-pegar-${p.id}"
                onclick="pegarPedido('${p.id}')">
          ${Icons.plus(16)} Pegar este pedido
        </button>
      </div>
    `;
  }).join("");
}

function toggleSelecionado(pedidoId, checked) {
  const card = document.getElementById(`mural-card-${pedidoId}`);
  if (checked) {
    muralState.selecionados.add(pedidoId);
    card?.classList.add("is-selected");
  } else {
    muralState.selecionados.delete(pedidoId);
    card?.classList.remove("is-selected");
  }
  atualizarBotaoMural();
}

function atualizarBotaoMural() {
  const n   = muralState.selecionados.size;
  const btn = document.getElementById("floatingBtnMural");
  const cnt = document.getElementById("selCount");
  if (cnt) cnt.textContent = n;
  if (btn) btn.classList.toggle("hidden", n < 2);
}

// ── Modal de seleção de veículo ───────────────────────────────────────────────

async function abrirModalVeiculo(pedidoId) {
  _modalVeiculoPedidoId    = pedidoId;
  _modalVeiculoSelecionado = null;

  const list        = document.getElementById("veiculoList");
  const confirmarBtn = document.getElementById("veiculoModalConfirmar");
  confirmarBtn.disabled = true;
  list.innerHTML = '<div class="moto-veiculo-loading">Carregando veículos…</div>';

  document.getElementById("veiculoModalBackdrop").classList.remove("hidden");

  try {
    const [veiculos, pedidos] = await Promise.all([
      apiGet(`${API_BASE}/api/veiculos`),
      apiGet(`${API_BASE}/api/pedidos`)
    ]);

    const emUso = new Set(
      pedidos
        .filter(p => p.status === "em rota" && p.veiculo_tipo)
        .map(p => p.veiculo_tipo)
    );

    list.innerHTML = veiculos.map(v => {
      const usado = emUso.has(v.id);
      return `<div class="moto-veiculo-card${usado ? " is-disabled" : ""}"
                   data-id="${v.id}"
                   ${usado ? "" : `onclick="selecionarVeiculo('${v.id}')"`}>
        ${usado ? '<span class="moto-veiculo-badge-uso">Em uso</span>' : ""}
        <div class="moto-veiculo-nome">${v.nome}</div>
        <div class="moto-veiculo-specs">
          <span>${Number(v.capacidade || 0).toLocaleString("pt-BR")} kg</span>
          <span>R$ ${Number(v.custo_km || 0).toFixed(2)}/km</span>
        </div>
        ${v.uso ? `<div class="moto-veiculo-uso">${v.uso}</div>` : ""}
      </div>`;
    }).join("");
  } catch {
    list.innerHTML = '<div class="moto-veiculo-erro">Erro ao carregar veículos.</div>';
  }
}

function selecionarVeiculo(id) {
  _modalVeiculoSelecionado = id;
  document.querySelectorAll(".moto-veiculo-card").forEach(card => {
    card.classList.toggle("is-selected", card.dataset.id === id);
  });
  document.getElementById("veiculoModalConfirmar").disabled = false;
}

function fecharModalVeiculo() {
  document.getElementById("veiculoModalBackdrop").classList.add("hidden");
  _modalVeiculoPedidoId    = null;
  _modalVeiculoSelecionado = null;
}

async function confirmarVeiculo() {
  const pedidoId  = _modalVeiculoPedidoId;
  const veiculoId = _modalVeiculoSelecionado;
  if (!pedidoId || !veiculoId) return;
  fecharModalVeiculo();
  await _executarPegarPedido(pedidoId, veiculoId);
}

async function pegarPedido(pedidoId) {
  await abrirModalVeiculo(pedidoId);
}

async function _executarPegarPedido(pedidoId, veiculoId) {
  const btn = document.getElementById(`btn-pegar-${pedidoId}`);
  if (btn) { btn.disabled = true; btn.textContent = "Processando…"; }

  try {
    const pedido = muralState.pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    await apiPut(`${API_BASE}/api/pedidos/${pedidoId}`, { veiculo_tipo: veiculoId });
    pedido.veiculo_tipo = veiculoId;

    await _associarPedidosARota([pedido]);

    toast("Pedido adicionado à sua rota!");

    muralState.pedidos = muralState.pedidos.filter(p => p.id !== pedidoId);
    muralState.selecionados.delete(pedidoId);
    atualizarBotaoMural();
    renderMural();

    carregarEntregasDoDia(state.motorista.id).catch(() => {});
  } catch (e) {
    console.error(e);
    toast(e.message || "Erro ao pegar pedido. Tente novamente.", "erro");
    if (btn) { btn.disabled = false; btn.innerHTML = `${Icons.plus(16)} Pegar este pedido`; }
  }
}

async function pegarPedidosSelecionados() {
  const ids     = [...muralState.selecionados];
  const pedidos = muralState.pedidos.filter(p => ids.includes(p.id));
  if (!pedidos.length) return;

  const btn = document.getElementById("floatingBtnMural");
  if (btn) btn.style.opacity = ".5";

  try {
    await _associarPedidosARota(pedidos);

    toast(`${pedidos.length} pedidos adicionados à sua rota!`);

    muralState.pedidos     = muralState.pedidos.filter(p => !ids.includes(p.id));
    muralState.selecionados.clear();
    atualizarBotaoMural();
    renderMural();

    carregarEntregasDoDia(state.motorista.id).catch(() => {});
  } catch (e) {
    console.error(e);
    toast(e.message || "Erro ao criar rota. Tente novamente.", "erro");
  } finally {
    if (btn) btn.style.opacity = "";
  }
}

async function _associarPedidosARota(pedidos) {
  // Re-verifica status atual no servidor para prevenir race condition entre motoristas
  const todosPedidos = await apiGet(`${API_BASE}/api/pedidos`);
  const disponiveis  = pedidos.filter(p => {
    const atual = todosPedidos.find(s => s.id === p.id);
    return atual && atual.status === "aguardando rota";
  });

  if (disponiveis.length === 0) {
    throw new Error("Este pedido já foi atribuído a outro motorista.");
  }
  if (disponiveis.length < pedidos.length) {
    const n = pedidos.length - disponiveis.length;
    toast(`${n} pedido(s) já pego(s) por outro motorista foram ignorados.`, "erro");
  }

  // Busca rota ativa do motorista
  const todasRotas = await apiGet(`${API_BASE}/api/rotas`);
  const rotaAtiva  = todasRotas.find(r =>
    r.motorista_id === state.motorista.id &&
    r.status       === "em andamento"
  );

  const pedidoIds  = disponiveis.map(p => p.id);
  const freteExtra = disponiveis.reduce((s, p) => s + Number(p.valor_frete || 0), 0);
  const distExtra  = disponiveis.reduce((s, p) => s + Number(p.distancia_km || 0), 0);

  if (rotaAtiva) {
    // Dedup: separa os que já estão na rota dos que precisam ser inseridos
    const idsExistentes = new Set(rotaAtiva.cargas_ids || []);
    const idsFiltrados  = pedidoIds.filter(id => !idsExistentes.has(id));
    const idsJaExistem  = pedidoIds.filter(id => idsExistentes.has(id));

    // Pedidos já presentes na rota: apenas corrige o status (fix de duplicação)
    for (const id of idsJaExistem) {
      await apiPut(`${API_BASE}/api/pedidos/${id}`, { status: "em rota" });
    }

    if (idsFiltrados.length) {
      const ped       = disponiveis.filter(p => idsFiltrados.includes(p.id));
      const novasIds  = [...(rotaAtiva.cargas_ids || []), ...idsFiltrados];
      const novoFrete = Number((Number(rotaAtiva.frete_total || 0) + ped.reduce((s, p) => s + Number(p.valor_frete || 0), 0)).toFixed(2));
      const novaDist  = Number((Number(rotaAtiva.distancia  || 0) + ped.reduce((s, p) => s + Number(p.distancia_km || 0), 0)).toFixed(1));

      await apiPut(`${API_BASE}/api/rotas/${rotaAtiva.id}`, {
        cargas_ids:  novasIds,
        frete_total: novoFrete,
        distancia:   novaDist
      });
    } else {
      // Todos já estavam na rota — não precisa fazer mais nada além da correção de status
      await apiPut(`${API_BASE}/api/motoristas/${state.motorista.id}`, { status: "em entrega" });
      return;
    }
  } else {
    // Antes de criar nova rota, verifica se algum pedido já está em rota ativa
    const rotaComPedido = todasRotas.find(r =>
      !["cancelada", "concluida"].includes(r.status) &&
      pedidoIds.some(id => (r.cargas_ids || []).includes(id))
    );

    if (rotaComPedido) {
      // Reutiliza a rota existente, apenas atualiza motorista e status
      const idsExistentes = new Set(rotaComPedido.cargas_ids || []);
      const idsFaltando   = pedidoIds.filter(id => !idsExistentes.has(id));
      const updates = { motorista_id: state.motorista.id, status: "em andamento" };
      if (idsFaltando.length) {
        const ped = disponiveis.filter(p => idsFaltando.includes(p.id));
        updates.cargas_ids  = [...(rotaComPedido.cargas_ids || []), ...idsFaltando];
        updates.frete_total = Number((Number(rotaComPedido.frete_total || 0) + ped.reduce((s, p) => s + Number(p.valor_frete || 0), 0)).toFixed(2));
        updates.distancia   = Number((Number(rotaComPedido.distancia   || 0) + ped.reduce((s, p) => s + Number(p.distancia_km || 0), 0)).toFixed(1));
      }
      await apiPut(`${API_BASE}/api/rotas/${rotaComPedido.id}`, updates);
    } else {
      const primeiro = disponiveis[0];
      await apiPost(`${API_BASE}/api/rotas`, {
        nome:              `${primeiro.destino_municipio} · ${state.motorista.nome}`,
        tipo_rota:         "Rodoviária",
        destino_municipio: primeiro.destino_municipio,
        destino_estado:    primeiro.destino_estado,
        motorista_id:      state.motorista.id,
        status:            "em andamento",
        cargas_ids:        pedidoIds,
        frete_total:       Number(freteExtra.toFixed(2)),
        distancia:         Number(distExtra.toFixed(1)),
        saida:             null,
        chegada:           null,
        tempo:             null,
        observacoes:       "Rota criada pelo motorista via mural de pedidos."
      });
    }
  }

  for (const pedido of disponiveis) {
    await apiPut(`${API_BASE}/api/pedidos/${pedido.id}`, { status: "em rota" });
  }

  await apiPut(`${API_BASE}/api/motoristas/${state.motorista.id}`, { status: "em entrega" });
}

// ── Google Maps ───────────────────────────────────────────────────────────────

function abrirNoMaps() {
  const proximo = state.pedidos.find(p => p.status !== "entregue" && p.lat && p.lng);
  if (!proximo) {
    toast("Nenhum pedido pendente com localização disponível.", "erro");
    return;
  }
  const url = `https://www.google.com/maps/dir/?api=1&destination=${proximo.lat},${proximo.lng}`;
  window.open(url, "_blank");
}

// ── Tema claro/escuro ─────────────────────────────────────────────────────────

function aplicarTema(tema) {
  document.documentElement.setAttribute("data-theme", tema);
  const btn = document.getElementById("themeToggle");
  if (btn) btn.innerHTML = tema === "dark" ? Icons.sun(16) : Icons.moon(16);
}

function alternarTema() {
  const atual = document.documentElement.getAttribute("data-theme") || "dark";
  const novo  = atual === "dark" ? "light" : "dark";
  localStorage.setItem("madcenter_tema", novo);
  aplicarTema(novo);
  // Recalcula o mapa após troca de tema (caso layout mude)
  if (state.map) setTimeout(() => state.map.invalidateSize(), 60);
}

// ── Inicialização ────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  // Tema (já aplicado no <head>; aqui só sincroniza o ícone e o listener)
  aplicarTema(localStorage.getItem("madcenter_tema") || "dark");
  const themeBtn = document.getElementById("themeToggle");
  if (themeBtn) themeBtn.addEventListener("click", alternarTema);

  // Verificação de autenticação
  const token      = sessionStorage.getItem("madcenter_token");
  const perfil     = sessionStorage.getItem("madcenter_perfil");
  const nomeLogado = sessionStorage.getItem("madcenter_nome");
  if (!token || perfil !== "motorista") {
    window.location.replace("login.html");
    return;
  }

  // Busca o registro do motorista pelo nome na tabela motoristas
  try {
    const motoristas = await apiGet(`${API_BASE}/api/motoristas`);
    const moto = (motoristas || []).find(
      m => (m.nome || "").toLowerCase() === (nomeLogado || "").toLowerCase()
    );
    if (!moto) {
      toast("Motorista não encontrado. Entre em contato com o administrador.", "erro");
      setTimeout(sair, 3000);
      return;
    }
    state.motorista = { id: moto.id, nome: moto.nome };
  } catch (e) {
    console.error(e);
    toast("Erro ao carregar dados. Tente novamente.", "erro");
    return;
  }

  // Abas
  document.querySelectorAll(".moto-tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("logoutBtn").addEventListener("click", sair);

  document.getElementById("veiculoModalClose").addEventListener("click", fecharModalVeiculo);
  document.getElementById("veiculoModalCancelar").addEventListener("click", fecharModalVeiculo);
  document.getElementById("veiculoModalConfirmar").addEventListener("click", confirmarVeiculo);
  document.getElementById("veiculoModalBackdrop").addEventListener("click", e => {
    if (e.target === e.currentTarget) fecharModalVeiculo();
  });

  mostrarTelaPrincipal();
});
