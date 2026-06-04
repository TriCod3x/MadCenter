"use strict";

// ── Configuração ─────────────────────────────────────────────────────────────

const API_BASE = window.location.port === "3000" ? "" : "http://localhost:3000";
const MOTO_SESSION_KEY = "madcenter_motorista";

// ── Estado global ────────────────────────────────────────────────────────────

const state = {
  motorista:       null,   // { id, nome }
  rotas:           [],     // rotas em andamento do motorista
  pedidos:         [],     // pedidos dessas rotas
  map:             null,
  driverMarker:    null,
  deliveryMarkers: {},
  routeLine:       null,
  geoWatchId:      null,
  currentPos:      null    // { lat, lng }
};

// ── Utilitários ──────────────────────────────────────────────────────────────

async function apiGet(url) {
  const res = await fetch(url);
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

// ── Login / Auth ─────────────────────────────────────────────────────────────

async function carregarMotoristas() {
  const select = document.getElementById("motoristaSelect");
  try {
    const lista = await apiGet(`${API_BASE}/api/motoristas`);
    if (!lista.length) {
      select.innerHTML = `<option value="">Nenhum motorista cadastrado</option>`;
      return;
    }
    // Ordena alfabeticamente
    lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    select.innerHTML =
      `<option value="">— Selecione seu nome —</option>` +
      lista.map(m =>
        `<option value="${m.id}" data-nome="${m.nome}">${m.nome}</option>`
      ).join("");
  } catch (e) {
    console.error(e);
    select.innerHTML = `<option value="">Erro ao carregar — tente recarregar</option>`;
    toast("Erro ao conectar ao servidor.", "erro");
  }
}

function fazerLogin() {
  const select = document.getElementById("motoristaSelect");
  const id   = select.value;
  const nome = select.options[select.selectedIndex]?.dataset.nome;

  if (!id) {
    document.getElementById("loginError").style.display = "block";
    return;
  }
  document.getElementById("loginError").style.display = "none";

  state.motorista = { id, nome };
  sessionStorage.setItem(MOTO_SESSION_KEY, JSON.stringify({ id, nome }));
  mostrarTelaPrincipal();
}

function fazerLogout() {
  sessionStorage.removeItem(MOTO_SESSION_KEY);
  state.motorista = null;

  if (state.geoWatchId !== null) {
    navigator.geolocation.clearWatch(state.geoWatchId);
    state.geoWatchId = null;
  }

  hide("mainScreen");
  show("loginScreen");
  carregarMotoristas();
}

// ── Tela principal ───────────────────────────────────────────────────────────

function mostrarTelaPrincipal() {
  document.getElementById("headerName").textContent = state.motorista.nome;
  hide("loginScreen");
  show("mainScreen");
  carregarEntregasDoDia(state.motorista.id);
}

async function carregarEntregasDoDia(motoristaId) {
  document.getElementById("pedidosList").innerHTML =
    `<div style="text-align:center;padding:24px;color:var(--moto-muted)">Carregando…</div>`;

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
  const pendentes = state.pedidos.filter(p => p.status !== "entregue");
  const entregues = state.pedidos.filter(p => p.status === "entregue");
  return [...pendentes, ...entregues];
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

  const pendentes = ordenados.filter(p => p.status !== "entregue");
  const primeiroPendenteId = pendentes[0]?.id;

  list.innerHTML = ordenados.map(p => {
    const isEntregue = p.status === "entregue";
    const isProximo  = p.id === primeiroPendenteId;
    const rota = getRotaDoPedido(p.id);

    const endereco = [p.endereco_entrega, p.numero, p.complemento]
      .filter(Boolean).join(", ");
    const destino = [p.destino_municipio, p.destino_estado]
      .filter(Boolean).join("/");

    const cardClass = [
      "moto-pedido-card",
      isEntregue ? "is-entregue" : isProximo ? "is-proximo" : ""
    ].join(" ").trim();

    const statusBadge = isEntregue
      ? `<span class="moto-badge moto-badge-green">✓ Entregue</span>`
      : `<span class="moto-badge moto-badge-orange">🚚 Em rota</span>`;

    const botoes = !isEntregue ? `
      <div class="moto-card-actions">
        <button class="moto-btn moto-btn-entregue"
          onclick="marcarEntregue('${p.id}','${rota?.id || ""}')">
          ✅ Entregue
        </button>
        <button class="moto-btn moto-btn-adiar"
          onclick="deixarParaDepois('${p.id}','${rota?.id || ""}')">
          📅 Deixar para depois
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
              <span>⚖️ ${p.peso || 0} kg</span>
              <span>💰 ${moneyFmt.format(Number(p.valor_frete || 0))}</span>
            </div>
          </div>
        </div>
        ${botoes}
      </div>
    `;
  }).join("");

  // Botão flutuante: visível se houver pendente com coords
  const proximoComCoord = pendentes.find(p => p.lat && p.lng);
  if (proximoComCoord) show("floatingBtn");
  else hide("floatingBtn");

  // Mapa
  if (state.rotas.length) show("mapaSection");
}

function atualizarProgresso() {
  const total    = state.pedidos.length;
  const feito    = state.pedidos.filter(p => p.status === "entregue").length;
  const pendente = total - feito;
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
    await apiPut(`${API_BASE}/api/pedidos/${pedidoId}`, { status: "entregue" });

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
          toast("🎉 Todas as entregas concluídas! Rota finalizada.");
        } else {
          toast("✅ Pedido entregue com sucesso.");
        }
      }
    }

    renderPedidos();
    atualizarProgresso();
    atualizarMarcadoresMapa();

  } catch (e) {
    console.error(e);
    if (card) card.style.opacity = "";
    toast("Erro ao registrar entrega. Tente novamente.", "erro");
  }
}

async function deixarParaDepois(pedidoId, rotaId) {
  if (!confirm("Deixar este pedido para outro dia?")) return;

  const card = document.getElementById(`card-${pedidoId}`);
  if (card) card.style.opacity = "0.35";

  try {
    // 1. Muda status do pedido
    await apiPut(`${API_BASE}/api/pedidos/${pedidoId}`, { status: "aguardando rota" });

    // 2. Remove da rota
    if (rotaId) {
      const rota = state.rotas.find(r => r.id === rotaId);
      if (rota) {
        const novasIds = (rota.cargas_ids || []).filter(id => id !== pedidoId);
        await apiPut(`${API_BASE}/api/rotas/${rotaId}`, { cargas_ids: novasIds });
        rota.cargas_ids = novasIds;

        // Se ficou vazia, cancela a rota e libera o motorista
        if (novasIds.length === 0) {
          await apiPut(`${API_BASE}/api/rotas/${rotaId}`, { status: "cancelada" });
          if (state.motorista?.id) {
            await apiPut(`${API_BASE}/api/motoristas/${state.motorista.id}`, { status: "disponível" });
          }
          state.rotas = state.rotas.filter(r => r.id !== rotaId);
        }
      }
    }

    // 3. Remove do estado local
    state.pedidos = state.pedidos.filter(p => p.id !== pedidoId);

    toast("📅 Pedido adiado para outro dia.");
    renderPedidos();
    atualizarProgresso();
    atualizarMarcadoresMapa();

  } catch (e) {
    console.error(e);
    if (card) card.style.opacity = "";
    toast("Erro ao adiar pedido. Tente novamente.", "erro");
  }
}

// ── Mapa Leaflet ──────────────────────────────────────────────────────────────

function iniciarMapa() {
  const container = document.getElementById("motoristaMap");
  if (!container || !window.L) return;

  // Remove mapa anterior
  if (state.map) {
    if (state.geoWatchId !== null) {
      navigator.geolocation.clearWatch(state.geoWatchId);
      state.geoWatchId = null;
    }
    state.map.remove();
    state.map = null;
    state.driverMarker = null;
    state.deliveryMarkers = {};
    state.routeLine = null;
  }

  // Centro inicial: primeiro pedido pendente com coords ou coordenada padrão
  const primeiroPendente = state.pedidos.find(
    p => p.status !== "entregue" && p.lat && p.lng
  );
  const centro = primeiroPendente
    ? [Number(primeiroPendente.lat), Number(primeiroPendente.lng)]
    : [-5.0892, -42.8016]; // Teresina/PI

  state.map = L.map("motoristaMap", { zoomControl: true }).setView(centro, 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>'
  }).addTo(state.map);

  atualizarMarcadoresMapa();
  iniciarGeolocalizacao();

  setTimeout(() => state.map?.invalidateSize(), 180);
}

function atualizarMarcadoresMapa() {
  if (!state.map) return;

  // Remove marcadores anteriores
  Object.values(state.deliveryMarkers).forEach(m => { try { m.remove(); } catch {} });
  state.deliveryMarkers = {};
  if (state.routeLine) { try { state.routeLine.remove(); } catch {} state.routeLine = null; }

  const pendentes = state.pedidos.filter(p => p.status !== "entregue" && p.lat && p.lng);
  const entregues = state.pedidos.filter(p => p.status === "entregue" && p.lat && p.lng);
  const proximo   = pendentes[0];

  // Marcadores verdes (entregues)
  entregues.forEach(p => {
    const icon = divIcon("#4caf50", 14, false);
    const m = L.marker([Number(p.lat), Number(p.lng)], { icon });
    m.bindPopup(`<b>${p.codigo}</b><br>${p.cliente}<br>✅ Entregue`);
    m.addTo(state.map);
    state.deliveryMarkers[p.id] = m;
  });

  // Marcadores pendentes (azul pulsante = próximo, laranja = demais)
  pendentes.forEach((p, idx) => {
    const isNext = idx === 0;
    const color  = isNext ? "#2196f3" : "#ff9800";
    const size   = isNext ? 20 : 14;
    const icon   = divIcon(color, size, isNext);
    const m = L.marker([Number(p.lat), Number(p.lng)], { icon });
    const label = isNext ? "📍 Próxima entrega" : "⏳ Pendente";
    m.bindPopup(`<b>${p.codigo}</b><br>${p.cliente}<br>${label}`);
    m.addTo(state.map);
    state.deliveryMarkers[p.id] = m;
  });

  // Polyline: posição atual (ou última entrega) → próximo pedido
  const partida = state.currentPos ||
    (entregues.length
      ? { lat: Number(entregues[entregues.length - 1].lat), lng: Number(entregues[entregues.length - 1].lng) }
      : null);

  if (proximo && partida) {
    state.routeLine = L.polyline(
      [[partida.lat, partida.lng], [Number(proximo.lat), Number(proximo.lng)]],
      { color: "#2196f3", weight: 3, opacity: .85, dashArray: "8 5" }
    ).addTo(state.map);
  }
}

function divIcon(color, size, pulse = false) {
  const animation = pulse
    ? `animation:moto-pulse 1.6s ease-out infinite;`
    : "";
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;
      border-radius:50%;
      background:${color};
      border:2px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,.35);
      ${animation}
    "></div>`,
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

function iniciarGeolocalizacao() {
  if (!navigator.geolocation || !state.map) return;

  const driverIcon = L.divIcon({
    className: "",
    html: `<div style="
      width:22px;height:22px;border-radius:50%;
      background:#2374c6;border:3px solid #fff;
      box-shadow:0 0 0 5px rgba(33,116,198,.25);
    "></div>`,
    iconSize:   [22, 22],
    iconAnchor: [11, 11]
  });

  state.geoWatchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      state.currentPos = { lat, lng };

      if (!state.driverMarker) {
        state.driverMarker = L.marker([lat, lng], { icon: driverIcon });
        state.driverMarker.bindPopup("📍 Sua posição atual");
        state.driverMarker.addTo(state.map);
      } else {
        state.driverMarker.setLatLng([lat, lng]);
      }

      // Atualiza polyline com posição real
      atualizarMarcadoresMapa();
    },
    err => console.warn("Geolocalização indisponível:", err.message),
    { enableHighAccuracy: true, maximumAge: 8000, timeout: 12000 }
  );
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

// ── Inicialização ────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Verifica sessão existente
  const saved = sessionStorage.getItem(MOTO_SESSION_KEY);
  if (saved) {
    try {
      state.motorista = JSON.parse(saved);
      mostrarTelaPrincipal();
    } catch {
      sessionStorage.removeItem(MOTO_SESSION_KEY);
      carregarMotoristas();
    }
  } else {
    carregarMotoristas();
  }

  // Eventos
  document.getElementById("loginBtn").addEventListener("click", fazerLogin);
  document.getElementById("logoutBtn").addEventListener("click", fazerLogout);

  // Enter no select faz login
  document.getElementById("motoristaSelect").addEventListener("keydown", e => {
    if (e.key === "Enter") fazerLogin();
  });

  // Esconde erro ao mudar seleção
  document.getElementById("motoristaSelect").addEventListener("change", () => {
    document.getElementById("loginError").style.display = "none";
  });
});
