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
  if (!p.lat || !p.lng) return "Distância indisponível";
  return `${distLoja(p).toFixed(1)} km da loja`;
}

// ── Estado global ────────────────────────────────────────────────────────────

const state = {
  motorista:       null,   // { id, nome }
  rotas:           [],     // rotas em andamento do motorista
  pedidos:         [],     // pedidos dessas rotas
  map:             null,
  infoWindow:      null,
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

  // Limpa a rota do mapa imediatamente — feedback visual antes do API retornar
  if (state.map) {
    if (state.rotaAbortCtrl) { state.rotaAbortCtrl.abort(); state.rotaAbortCtrl = null; }
    if (state.rotaLayer)  { try { state.map.removeLayer(state.rotaLayer); } catch {} state.rotaLayer  = null; }
    if (state.routeLine)  { try { state.routeLine.remove(); }              catch {} state.routeLine   = null; }
  }

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

// ── Mapa (Google Maps) ─────────────────────────────────────────────────────────

function iniciarMapa() {
  // Aguarda a Maps JS API (carregada com loading=async)
  if (!window.google?.maps) { ensureGoogleMaps().then(iniciarMapa); return; }

  const container = document.getElementById("motoristaMap");
  if (!container) return;

  // Mapa já existe: apenas redesenha os layers (preserva zoom e posição)
  if (state.map) {
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
    ? { lat: Number(primeiroPendente.lat), lng: Number(primeiroPendente.lng) }
    : { lat: LOJA_LAT, lng: LOJA_LNG };

  state.map = new google.maps.Map(container, {
    center: centro,
    zoom: 12,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    clickableIcons: false,
    styles: MAP_STYLE_CLEAN,
  });
  state.infoWindow = new google.maps.InfoWindow();

  // Marcador fixo da loja
  const lojaMarker = new google.maps.Marker({
    position: { lat: LOJA_LAT, lng: LOJA_LNG },
    map: state.map,
    title: "Madcenter — Ponto de partida",
    icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: "#4caf50", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3, scale: 9 },
  });
  lojaMarker.addListener("click", () => {
    state.infoWindow.setContent(buildInfoWindowHtml({ titulo: "Madcenter", subtitulo: "Ponto de partida" }));
    state.infoWindow.open({ anchor: lojaMarker, map: state.map });
  });

  desenharRota();
  iniciarGeolocalizacao();
}

// Combina múltiplos AbortSignals num só (aborta quando qualquer um abortar).
// Usado para aplicar um timeout real mesmo quando um signal de cancelamento é passado.
function combineSignals(signals) {
  const ctrl = new AbortController();
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) { ctrl.abort(); break; }
    s.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  return ctrl.signal;
}

// Busca a geometria da rota via backend (proxy da Directions API). Retorna
// { path, distanciaMetros, duracaoSegundos } quando a Directions responde com
// traçado real, ou null quando falha genuinamente (erro/sem resultado) — só nesse
// caso o chamador deve cair no fallback de linha reta. Loga falhas para não serem
// silenciosas. Aplica timeout de 10s combinado com o signal de cancelamento.
async function buscarRotaPath(pontos, signal) {
  try {
    const coords = pontos.map(p => `${p.lng},${p.lat}`).join(";");
    const token = getToken();
    const res = await fetch(`${API_BASE}/api/rota-geometria?coords=${encodeURIComponent(coords)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: combineSignals([signal, AbortSignal.timeout(10000)]),
    });
    if (!res.ok) { console.warn(`[rota] /api/rota-geometria HTTP ${res.status}`); return null; }
    const data = await res.json();
    const arr = data?.geometry?.coordinates;
    if (Array.isArray(arr) && arr.length) {
      return {
        path: arr.map(([lng, lat]) => ({ lat, lng })),
        distanciaMetros: Number(data.distanciaMetros) || 0,
        duracaoSegundos: Number(data.duracaoSegundos) || 0,
      };
    }
    console.warn(`[rota] Directions sem geometria (status=${data?.status || "?"}) — usando fallback reto`);
    return null;
  } catch (e) {
    if (e?.name !== "AbortError") console.warn("[rota] Falha ao buscar geometria:", e?.message || e);
    return null;
  }
}

// Cap de zoom após fitBounds (evita zoom-out excessivo em rotas curtas).
function fitBoundsCappedMoto(bounds, paddingPx, maxZoom) {
  if (!bounds || bounds.isEmpty() || !state.map) return;
  state.map.fitBounds(bounds, paddingPx);
  google.maps.event.addListenerOnce(state.map, "idle", () => {
    if (state.map.getZoom() > maxZoom) state.map.setZoom(maxZoom);
  });
}

async function desenharRota() {
  // Cancela qualquer chamada de rota anterior ainda em andamento
  if (state.rotaAbortCtrl) {
    state.rotaAbortCtrl.abort();
    state.rotaAbortCtrl = null;
  }

  if (!state.map) return;

  // Remove marcadores e camada de rota anteriores
  Object.values(state.deliveryMarkers).forEach(m => { try { m.setMap(null); } catch {} });
  state.deliveryMarkers = {};
  if (state.rotaLayer) { try { state.rotaLayer.setMap(null); } catch {} state.rotaLayer = null; }

  const entregues = state.pedidos.filter(p => p.status === "entregue");
  const pendentes = state.pedidos.filter(p => p.status !== "entregue");
  if (!pendentes.length && !entregues.length) return;

  // Coord para exibir marcador (aceita fallback de município p/ não sumir do mapa).
  const getCoordsP = p => ({
    lat: p.lat ? Number(p.lat) : obterCoordsMunicipio(p.destino_municipio, p.destino_estado).lat,
    lng: p.lng ? Number(p.lng) : obterCoordsMunicipio(p.destino_municipio, p.destino_estado).lng
  });

  // Coord REAL do pedido (só quando há lat/lng válidos). Usada na Directions e no
  // bounds — nunca centroide de município, para não puxar o traçado nem o zoom.
  const coordRealP = p => {
    const lat = Number(p.lat), lng = Number(p.lng);
    return (p.lat && p.lng && Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0))
      ? { lat, lng } : null;
  };

  // Origem = último pedido entregue com coords, senão loja (mantém "partir do ponto atual")
  const entreguesComCoord = state.pedidos
    .filter(p => p.status === "entregue" && p.lat && p.lng)
    .sort((a, b) => (b.data_entrega || b.entrega || "").localeCompare(a.data_entrega || a.entrega || ""));
  const ultimoEntregue = entreguesComCoord[0];
  const pontoPartida = ultimoEntregue
    ? { lat: Number(ultimoEntregue.lat), lng: Number(ultimoEntregue.lng) }
    : { lat: state.lojaLat, lng: state.lojaLng };

  // Pontos REAIS da rota ativa: partida + pendentes que têm coordenada real.
  const pontosReais = [pontoPartida, ...pendentes.map(coordRealP).filter(Boolean)];

  state.rotaInfo = null; // { distanciaMetros, duracaoSegundos } quando a rota real vier

  if (pontosReais.length >= 2) {
    const ctrl = new AbortController();
    state.rotaAbortCtrl = ctrl;

    const resultado = await buscarRotaPath(pontosReais, ctrl.signal);

    // Se uma chamada mais recente já abortou esta, descarta o resultado
    if (ctrl.signal.aborted) return;
    state.rotaAbortCtrl = null;

    if (resultado?.path) {
      state.rotaLayer = new google.maps.Polyline({
        path: resultado.path, map: state.map, strokeColor: "#2196f3", strokeWeight: 5, strokeOpacity: 0.85,
      });
      state.rotaInfo = { distanciaMetros: resultado.distanciaMetros, duracaoSegundos: resultado.duracaoSegundos };
    } else {
      // Fallback (linha pontilhada) SÓ quando a Directions falha de verdade.
      state.rotaLayer = new google.maps.Polyline({
        path: pontosReais, map: state.map, strokeColor: "#2196f3", strokeWeight: 4, strokeOpacity: 0,
        icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeWeight: 4, scale: 3 }, offset: "0", repeat: "10px" }],
      });
    }
  }

  // Bounds SOMENTE com os pontos reais da rota ativa + cap de zoom.
  const bounds = new google.maps.LatLngBounds();
  pontosReais.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
  if (!bounds.isEmpty()) fitBoundsCappedMoto(bounds, 60, 15);

  // Marcadores dos pedidos
  const allPedidos = [...entregues, ...pendentes];
  allPedidos.forEach((p, i) => {
    const { lat, lng } = getCoordsP(p);
    const isEntregue = p.status === "entregue";
    const isProximo  = !isEntregue && i === entregues.length;
    const cor = isEntregue ? "#22c55e" : isProximo ? "#3b82f6" : p.status === "planejado" ? "#eab308" : "#6b7280";
    const marker = new google.maps.Marker({
      position: { lat, lng }, map: state.map,
      icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: cor, fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2, scale: 7 },
    });
    const html = buildInfoWindowHtml({
      titulo: p.codigo || "—",
      subtitulo: p.cliente || "—",
      status: p.status,
      badge: isProximo ? { label: "Próxima entrega", color: "#3b82f6" } : null,
      linhas: [p.lat && p.lng ? null : "Localização aproximada (sem geocode)"],
    });
    marker.addListener("click", () => { state.infoWindow.setContent(html); state.infoWindow.open({ anchor: marker, map: state.map }); });
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
        state.driverMarker.setPosition({ lat: latitude, lng: longitude });
      } else {
        state.driverMarker = new google.maps.Marker({
          position: { lat: latitude, lng: longitude },
          map: state.map,
          title: "Sua localização",
          icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: "#00bcd4", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 3, scale: 8 },
        });
        state.driverMarker.addListener("click", () => {
          state.infoWindow.setContent(buildInfoWindowHtml({ titulo: "Você está aqui", subtitulo: "Sua localização atual" }));
          state.infoWindow.open({ anchor: state.driverMarker, map: state.map });
        });
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
    // Google Maps redimensiona sozinho quando o container volta a ficar visível.
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

    console.log("[mural] Total rotas recebidas:", todasRotas?.length);
    if (todasRotas?.length) console.log("[mural] Rota[0] raw:", JSON.stringify(todasRotas[0]));
    console.log("[mural] Total pedidos recebidos:", todosPedidos?.length);

    const rotasFiltradas = (todasRotas || []).filter(r => r.status === "planejada" && !r.motorista_id);
    console.log("[mural] Rotas planejadas sem motorista:", rotasFiltradas.length);
    // Diagnóstico: mostrar status e motorista_id de cada rota recebida
    (todasRotas || []).forEach(r => {
      console.log(`[mural] Rota ${r.id}: status="${r.status}" motorista_id=${JSON.stringify(r.motorista_id)} → passa filtro: ${r.status === "planejada" && !r.motorista_id}`);
    });

    muralState.rotas   = rotasFiltradas;
    muralState.pedidos = todosPedidos || [];

    // Diagnóstico de cross-referência: verificar se cargas_ids existem em pedidos
    rotasFiltradas.forEach(rota => {
      const ids = rota.cargas_ids || [];
      const encontrados = ids.filter(id => (todosPedidos || []).some(p => p.id === id));
      console.log(`[mural] Rota ${rota.id}: cargas_ids=${JSON.stringify(ids)} → pedidos encontrados: ${encontrados.length}/${ids.length}`);
    });

    renderMural();
  } catch (e) {
    list.innerHTML = `<div class="moto-mural-loading">Erro ao carregar rotas. Tente novamente.</div>`;
    console.error("[mural] Erro em carregarMural:", e);
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
    const semCoords  = pedidos.filter(p => !p.lat || !p.lng).length;

    const pedidosHtml = isExpanded ? pedidos.map(p => {
      const dest = [p.destino_municipio, p.destino_estado].filter(Boolean).join("/");
      const prio = p.prioridade === "urgente" ? `<span class="moto-badge moto-badge-urgente">Urgente</span>` : "";
      return `
        <div class="moto-rota-pedido-item">
          <div class="moto-rota-pedido-info">
            <span><strong>${p.codigo || "—"}</strong> · ${p.cliente || "—"} ${prio}</span>
            <small>${dest || "—"} · ${p.descricao || "—"} · ${p.peso || 0} kg · ${distLojaLabel(p)}</small>
          </div>
          <button class="moto-btn-remover-pedido" title="Remover da rota"
                  onclick="removerPedidoDaRotaDisponivel('${rota.id}','${p.id}',event)">${Icons.x(14)}</button>
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
              <span class="moto-rota-paradas" style="display:inline-flex;align-items:center;gap:4px;font-weight:600">${Icons.mapPin(13)} ${pedidos.length} parada${pedidos.length !== 1 ? "s" : ""}</span>
              <span>·</span>
              <span>${rota.destino_municipio || "—"}/${rota.destino_estado || "—"}</span>
              <span>·</span>
              <span class="moto-rota-dist" id="rota-dist-${rota.id}" style="display:inline-flex;align-items:center;gap:4px">${Icons.navigation(13)} calculando…</span>
              ${semCoords ? `<span class="moto-rota-alerta" title="${semCoords} pedido(s) sem localização" style="color:#eab308">· ${semCoords} sem GPS</span>` : ""}
            </div>
          </div>
          <span class="moto-rota-chevron" style="display:inline-flex;transition:transform .15s ease;${isExpanded ? "transform:rotate(180deg)" : ""}">${Icons.chevronDown(18)}</span>
        </div>
        ${isExpanded ? `<div class="moto-rota-pedidos-list">${pedidosHtml}</div>` : ""}
        <div class="moto-rota-card-actions">
          <button class="moto-btn moto-btn-pegar" onclick="pegarRota('${rota.id}')">
            ${Icons.plus(16)} Pegar esta rota
          </button>
        </div>
      </div>`;
  }).join("");

  atualizarDistanciasMural();
}

// Cache de distância/tempo reais por rota do mural (evita re-chamar a Directions
// ao expandir/recolher cards). Invalidado quando a rota muda (pedido removido).
const muralRotaInfo = {};

// Calcula a distância/tempo reais da rota: loja → cada parada (soma dos trechos),
// via a mesma Directions já usada no mapa. Fallback para soma haversine se falhar.
async function carregarInfoRotaMural(rota) {
  const pedidos = (rota.cargas_ids || [])
    .map(id => muralState.pedidos.find(p => p.id === id))
    .filter(Boolean);
  const stops = pedidos
    .map(p => (p.lat && p.lng) ? { lat: Number(p.lat), lng: Number(p.lng) } : null)
    .filter(Boolean);
  if (!stops.length) return { semCoords: true };

  const pontos = [{ lat: state.lojaLat, lng: state.lojaLng }, ...stops];
  const parciais = stops.length < pedidos.length;
  const r = await buscarRotaPath(pontos);
  if (r) return { distanciaMetros: r.distanciaMetros, duracaoSegundos: r.duracaoSegundos, parciais };

  // Fallback: soma linha-reta loja → cada parada (aproximado)
  const somaKm = stops.reduce((s, c) => s + haversineKm(state.lojaLat, state.lojaLng, c.lat, c.lng), 0);
  return { distanciaMetros: somaKm * 1000, aproximado: true, parciais };
}

// Preenche (assincronamente) a distância/tempo em cada card já renderizado.
function atualizarDistanciasMural() {
  muralState.rotas.forEach(async (rota) => {
    if (!muralRotaInfo[rota.id]) muralRotaInfo[rota.id] = await carregarInfoRotaMural(rota);
    const info = muralRotaInfo[rota.id];
    const el = document.getElementById(`rota-dist-${rota.id}`);
    if (!el || !info) return;
    if (info.semCoords) { el.textContent = "distância indisponível"; return; }
    const partes = [fmtDistancia(info.distanciaMetros), fmtDuracao(info.duracaoSegundos)].filter(Boolean).join(" · ");
    el.innerHTML = `${Icons.navigation(13)} ${info.aproximado ? "~" : ""}${partes || "—"}${info.parciais ? " (parcial)" : ""}`;
  });
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
    delete muralRotaInfo[rotaId]; // força recálculo da distância da rota
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
  // Google Maps redimensiona sozinho; não é preciso recalcular o mapa após troca de tema.
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
