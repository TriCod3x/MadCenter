"use strict";

// ── Configuração ─────────────────────────────────────────────────────────────

const API_BASE = window.location.hostname === "localhost" ? "http://localhost:3001" : "";

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

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distLoja(p) {
  if (!p.lat || !p.lng) return Infinity;
  return haversineKm(state.lojaLat, state.lojaLng, Number(p.lat), Number(p.lng));
}

function distLojaLabel(p) {
  if (!p.lat || !p.lng) return "📍 Distância não disponível";
  return `📍 ${distLoja(p).toFixed(1)} km da loja`;
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
  rotaAbortCtrl:   null,
  geoWatchId:      null,
  currentPos:      null,   // { lat, lng }
  lojaLat:         LOJA_LAT,
  lojaLng:         LOJA_LNG
};

// ── Utilitários ──────────────────────────────────────────────────────────────

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
    showToast("Erro ao carregar entregas. Verifique a conexão.", "erro");
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function getPedidosOrdenados() {
  const byDist = (a, b) => distLoja(a) - distLoja(b);
  const emRota   = state.pedidos.filter(p => p.status === "em rota").sort(byDist);
  const pendente = state.pedidos.filter(p => p.status === "planejado").sort(byDist);
  const entregue = state.pedidos.filter(p => p.status === "entregue").sort(byDist);
  const outros   = state.pedidos.filter(p => !["em rota","planejado","entregue"].includes(p.status)).sort(byDist);
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
    const isPlanejado = p.status === "planejado";
    const isProximo  = p.id === primeiroPendenteId;
    const rota = getRotaDoPedido(p.id);

    const endereco = [p.endereco_entrega, p.numero, p.complemento]
      .filter(Boolean).join(", ");
    const destino = [p.destino_municipio, p.destino_estado]
      .filter(Boolean).join("/");

    const cardClass = [
      "moto-pedido-card",
      isEntregue ? "is-entregue" : isPlanejado ? "is-pendente" : isProximo ? "is-proximo" : ""
    ].join(" ").trim();

    const statusBadge = isEntregue
      ? `<span class="moto-badge moto-badge-green">Entregue</span>`
      : isPlanejado
        ? `<span class="moto-badge moto-badge-orange">Planejado</span>`
        : `<span class="moto-badge moto-badge-blue">Em rota</span>`;

    const botoes = !isEntregue ? `
      <div class="moto-card-actions">
        <button class="moto-btn moto-btn-entregue"
          onclick="marcarEntregue('${p.id}','${rota?.id || ""}')">
          ${Icons.checkCircle(16)} Entregue
        </button>
        ${!isPlanejado ? `
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
          <div class="moto-card-row">
            <span class="moto-card-label">Distância</span>
            <span class="moto-card-value">${distLojaLabel(p)}</span>
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
          await apiPut(`${API_BASE}/api/rotas/${rotaId}`, { status: "concluida" });
          if (state.motorista?.id) {
            await apiPut(`${API_BASE}/api/motoristas/${state.motorista.id}`, { status: "disponível" });
          }
          rota.status = "concluida";
          // Remove rota das ativas
          state.rotas = state.rotas.filter(r => r.id !== rotaId);
          showToast("Todas as entregas concluídas! Rota finalizada.");
        } else {
          showToast("Pedido entregue com sucesso.");
        }
      }
    }

    renderPedidos();
    atualizarProgresso();
    desenharRota();

  } catch (e) {
    console.error(e);
    if (card) card.style.opacity = "";
    showToast("Erro ao registrar entrega. Tente novamente.", "erro");
  }
}

async function deixarParaDepois(pedidoId) {
  if (!confirm("Deixar este pedido para depois? Ele ficará pendente na sua rota.")) return;

  const card = document.getElementById(`card-${pedidoId}`);
  if (card) card.style.opacity = "0.35";

  try {
    // Muda status para "planejado" mantendo o pedido vinculado à rota
    await apiPut(`${API_BASE}/api/pedidos/${pedidoId}/deixar-para-depois`, {});

    const pedido = state.pedidos.find(p => p.id === pedidoId);
    if (pedido) pedido.status = "planejado";

    showToast("Pedido marcado como planejado.");
    renderPedidos();
    atualizarProgresso();
    desenharRota();

  } catch (e) {
    console.error(e);
    if (card) card.style.opacity = "";
    showToast("Erro ao adiar pedido. Tente novamente.", "erro");
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

    showToast("Pedido devolvido ao mural de pedidos.");
    renderPedidos();
    atualizarProgresso();
    desenharRota();

  } catch (e) {
    console.error(e);
    if (card) card.style.opacity = "";
    showToast("Erro ao cancelar pedido. Tente novamente.", "erro");
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

async function buscarRotaOSRM(pontos, signal) {
  try {
    const coords = pontos.map(p => `${p.lng},${p.lat}`).join(";");
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) return null;
    return data.routes[0].geometry;
  } catch {
    return null;
  }
}

async function desenharRota() {
  // Cancela qualquer chamada OSRM anterior ainda em andamento
  if (state.rotaAbortCtrl) {
    state.rotaAbortCtrl.abort();
    state.rotaAbortCtrl = null;
  }

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

  // Origem = último pedido entregue com coords, senão loja
  const entreguesComCoord = state.pedidos
    .filter(p => p.status === "entregue" && p.lat && p.lng)
    .sort((a, b) => (b.data_entrega || b.entrega || "").localeCompare(a.data_entrega || a.entrega || ""));
  const ultimoEntregue = entreguesComCoord[0];
  const pontoPartida = ultimoEntregue
    ? { lat: Number(ultimoEntregue.lat), lng: Number(ultimoEntregue.lng) }
    : { lat: state.lojaLat, lng: state.lojaLng };
  const pontos = [pontoPartida, ...pendentes.map(getCoordsP)];

  if (pontos.length >= 2) {
    const ctrl = new AbortController();
    state.rotaAbortCtrl = ctrl;

    const geojson = await buscarRotaOSRM(pontos, ctrl.signal);

    // Se uma chamada mais recente já abortou esta, descarta o resultado
    if (ctrl.signal.aborted) return;
    state.rotaAbortCtrl = null;

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
    const cor = isEntregue ? "#22c55e" : isProximo ? "#3b82f6" : p.status === "planejado" ? "#eab308" : "#6b7280";
    const marker = L.circleMarker([lat, lng], {
      radius: 10, color: "#fff", weight: 2, fillColor: cor, fillOpacity: 1
    });
    const label = isEntregue ? "✅ Entregue" : isProximo ? "📍 Próxima entrega" : p.status === "planejado" ? "🗓 Planejado" : "⏳ Aguardando";
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

  if (isEntregas) {
    const proximoComCoord = state.pedidos.find(p => p.status !== "entregue" && p.lat && p.lng);
    if (proximoComCoord) show("floatingBtn"); else hide("floatingBtn");
    setTimeout(() => { if (state.map) state.map.invalidateSize(); }, 100);
  } else {
    hide("floatingBtn");
    carregarMural();
  }
}

// ── Mural de Pedidos ──────────────────────────────────────────────────────────

const muralState = {
  rotas:    [],
  pedidos:  [],
  expanded: new Set()
};

const moneyMural = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

async function carregarMural(silencioso = false) {
  const loading = document.getElementById("muralLoading");
  const list    = document.getElementById("muralList");
  if (!silencioso) {
    if (loading) loading.style.display = "block";
    list.innerHTML = "";
    document.getElementById("muralVazio").classList.add("hidden");
    document.getElementById("muralResumo").style.display = "none";
  }
  try {
    const [todasRotas, todosPedidos] = await Promise.all([
      apiGet(`${API_BASE}/api/rotas`),
      apiGet(`${API_BASE}/api/pedidos`)
    ]);
    muralState.rotas   = todasRotas.filter(r => r.status === "planejada" && !r.motorista_id);
    muralState.pedidos = todosPedidos;
    renderMural();
  } catch (e) {
    list.innerHTML = `<div class="moto-mural-loading">Erro ao carregar rotas. Tente novamente.</div>`;
    console.error(e);
  } finally {
    if (loading) loading.style.display = "none";
  }
}

function renderMural() {
  const vazio  = document.getElementById("muralVazio");
  const resumo = document.getElementById("muralResumo");
  const list   = document.getElementById("muralList");

  if (!muralState.rotas.length) {
    vazio.classList.remove("hidden");
    resumo.style.display = "none";
    list.innerHTML = "";
    return;
  }

  vazio.classList.add("hidden");
  resumo.style.display = "grid";

  document.getElementById("muralCount").textContent = muralState.rotas.length;
  const urgentes = muralState.rotas.filter(r =>
    (r.cargas_ids || []).some(id => {
      const p = muralState.pedidos.find(p => p.id === id);
      return p?.prioridade === "urgente";
    })
  ).length;
  document.getElementById("muralUrgente").textContent = urgentes;

  list.innerHTML = muralState.rotas.map(rota => {
    const pedidos = (rota.cargas_ids || [])
      .map(id => muralState.pedidos.find(p => p.id === id))
      .filter(Boolean);
    const isExpanded = muralState.expanded.has(rota.id);
    const temUrgente = pedidos.some(p => p.prioridade === "urgente");
    const distTotal  = pedidos.reduce((s, p) => {
      if (!p.lat || !p.lng) return s;
      return s + haversineKm(state.lojaLat, state.lojaLng, Number(p.lat), Number(p.lng));
    }, 0);

    const pedidosHtml = isExpanded ? pedidos.map(p => {
      const dest = [p.destino_municipio, p.destino_estado].filter(Boolean).join("/");
      const prio = p.prioridade === "urgente" ? `<span class="moto-badge moto-badge-urgente">Urgente</span>` : "";
      return `
        <div class="moto-rota-pedido-item">
          <div class="moto-rota-pedido-info">
            <span><strong>${p.codigo || "—"}</strong> · ${p.cliente || "—"} ${prio}</span>
            <small>${dest || "—"} · ${p.descricao || "—"} · ${p.peso || 0} kg</small>
          </div>
          <button class="moto-btn-remover-pedido" title="Remover da rota"
                  onclick="removerPedidoDaRotaDisponivel('${rota.id}','${p.id}',event)">✕</button>
        </div>`;
    }).join("") : "";

    return `
      <div class="moto-rota-card${temUrgente ? " has-urgente" : ""}" id="rota-mural-${rota.id}">
        <div class="moto-rota-card-header" onclick="toggleRotaExpand('${rota.id}')">
          <div class="moto-rota-card-info">
            <div class="moto-rota-card-titulo">
              <strong>${rota.codigo || rota.nome || "—"}</strong>
              <span class="moto-badge moto-badge-yellow">Planejada</span>
            </div>
            <div class="moto-rota-card-meta">
              <span>${pedidos.length} pedido${pedidos.length !== 1 ? "s" : ""}</span>
              <span>·</span>
              <span>${rota.destino_municipio || "—"}/${rota.destino_estado || "—"}</span>
              ${distTotal > 0 ? `<span>· ~${distTotal.toFixed(1)} km</span>` : ""}
            </div>
          </div>
          <span class="moto-rota-chevron">${isExpanded ? "▲" : "▼"}</span>
        </div>
        ${isExpanded ? `<div class="moto-rota-pedidos-list">${pedidosHtml}</div>` : ""}
        <div class="moto-rota-card-actions">
          <button class="moto-btn moto-btn-pegar" onclick="pegarRota('${rota.id}')">
            ${Icons.plus(16)} Pegar esta rota
          </button>
        </div>
      </div>`;
  }).join("");
}

function toggleRotaExpand(rotaId) {
  if (muralState.expanded.has(rotaId)) muralState.expanded.delete(rotaId);
  else muralState.expanded.add(rotaId);
  renderMural();
}

async function pegarRota(rotaId) {
  const card = document.getElementById(`rota-mural-${rotaId}`);
  const btn  = card?.querySelector(".moto-btn-pegar");
  if (btn) { btn.disabled = true; btn.textContent = "Processando…"; }

  try {
    await apiPost(`${API_BASE}/api/rotas/${rotaId}/pegar`, { motorista_id: state.motorista.id });
    showToast("Rota adicionada às suas entregas!");
    muralState.rotas = muralState.rotas.filter(r => r.id !== rotaId);
    renderMural();
    carregarEntregasDoDia(state.motorista.id).catch(() => {});
  } catch (e) {
    console.error(e);
    showToast(e.message || "Erro ao pegar rota.", "erro");
    if (btn) { btn.disabled = false; btn.innerHTML = `${Icons.plus(16)} Pegar esta rota`; }
  }
}

async function removerPedidoDaRotaDisponivel(rotaId, pedidoId, event) {
  event?.stopPropagation();
  if (!confirm("Remover este pedido da rota?")) return;
  try {
    await apiDelete(`${API_BASE}/api/rotas/${rotaId}/pedidos/${pedidoId}`);
    const rota = muralState.rotas.find(r => r.id === rotaId);
    if (rota) {
      rota.cargas_ids = (rota.cargas_ids || []).filter(id => id !== pedidoId);
      if (rota.cargas_ids.length === 0) muralState.rotas = muralState.rotas.filter(r => r.id !== rotaId);
    }
    showToast("Pedido removido da rota.");
    renderMural();
  } catch (e) {
    console.error(e);
    showToast("Erro ao remover pedido.", "erro");
  }
}

// ── Google Maps ───────────────────────────────────────────────────────────────

function abrirNoMaps() {
  const proximo = state.pedidos.find(p => p.status !== "entregue" && p.lat && p.lng);
  if (!proximo) {
    showToast("Nenhum pedido pendente com localização disponível.", "erro");
    return;
  }
  const url = `https://www.google.com/maps/dir/?api=1&destination=${proximo.lat},${proximo.lng}`;
  window.open(url, "_blank");
}

// ── Tema claro/escuro ─────────────────────────────────────────────────────────

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

  // Carrega coordenadas reais da loja (latitude_loja / longitude_loja)
  try {
    const cfg = await apiGet(`${API_BASE}/api/configuracoes`);
    if (cfg?.latitude_loja)  state.lojaLat = Number(cfg.latitude_loja);
    if (cfg?.longitude_loja) state.lojaLng = Number(cfg.longitude_loja);
  } catch {}

  // Busca o registro do motorista pelo nome na tabela motoristas
  try {
    const motoristas = await apiGet(`${API_BASE}/api/motoristas`);
    const moto = (motoristas || []).find(
      m => (m.nome || "").toLowerCase() === (nomeLogado || "").toLowerCase()
    );
    if (!moto) {
      showToast("Motorista não encontrado. Entre em contato com o administrador.", "erro");
      setTimeout(sair, 3000);
      return;
    }
    state.motorista = { id: moto.id, nome: moto.nome };
  } catch (e) {
    console.error(e);
    showToast("Erro ao carregar dados. Tente novamente.", "erro");
    return;
  }

  // Abas
  document.querySelectorAll(".moto-tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("logoutBtn").addEventListener("click", sair);

  mostrarTelaPrincipal();
});
