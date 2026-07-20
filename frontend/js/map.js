let logisticsMap;
let mapBounds;
const ROUTE_CACHE = {};        // coords-string → path [{lat,lng}] — persiste entre renders/filtros (evita re-chamar a Directions API)
const ROUTE_LAYERS = {};
let selectedRouteId = null;
const DELIVERY_MARKERS = {};
let mapLegendCollapsed = false;
let mapInfoWindow = null;      // InfoWindow compartilhado
const MAP_OVERLAYS = [];       // todos os markers/polylines ativos, para limpeza

function normalizeCityName(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function coordKey(city, state) {
  return `${normalizeCityName(city)}-${String(state || "").trim().toLowerCase()}`;
}

// ── Geometria de rota (via backend /api/rota-geometria — proxy da Directions API) ──

// Chama o proxy do backend e converte o GeoJSON ([lng,lat]) em path do Google ([{lat,lng}]).
async function fetchRotaPath(coords) {
  try {
    const data = await apiGet(`${API_BASE}/api/rota-geometria?coords=${encodeURIComponent(coords)}`);
    const arr = data?.geometry?.coordinates;
    if (Array.isArray(arr) && arr.length) {
      return arr.map(([lng, lat]) => ({ lat, lng }));
    }
  } catch (error) {
    console.warn("rota-geometria falhou", error);
  }
  return null;
}

async function getMultiWaypointGeometry(waypoints) {
  if (waypoints.length < 2) return null;
  const coords = waypoints.map((w) => `${w.lng},${w.lat}`).join(";");
  const key = `multi:${coords}`;
  if (ROUTE_CACHE[key]) return ROUTE_CACHE[key];
  const path = await fetchRotaPath(coords);
  if (path) ROUTE_CACHE[key] = path;
  return path;
}

async function getRouteGeometry(origin, destination) {
  const key = `${origin.lat},${origin.lng}:${destination.lat},${destination.lng}`;
  if (ROUTE_CACHE[key]) return ROUTE_CACHE[key];
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const path = await fetchRotaPath(coords);
  if (path) ROUTE_CACHE[key] = path;
  return path;
}

function getCityCoordinates(city, state) {
  return MUNICIPIOS_COORDS[coordKey(city, state)] || null;
}

function getCoordForPedido(pedido) {
  if (pedido.lat && pedido.lng && Number(pedido.lat) !== 0 && Number(pedido.lng) !== 0) {
    return { lat: Number(pedido.lat), lng: Number(pedido.lng) };
  }
  return getCityCoordinates(pedido.destinoMunicipio, pedido.destinoEstado);
}

// ── Helpers de mapa (Google Maps) ───────────────────────────────────────────────

// Símbolo circular colorido usado como ícone de marcador.
function makeSimplePin(color, size = 16) {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#fff",
    strokeWeight: 2,
    scale: size / 2,
  };
}

function storeMarkerIcon() {
  // Pin dedicado da sede/loja (grafite + dourado da marca), distinto dos
  // marcadores circulares de pedido. Definido em icons.js (fonte única).
  return Icons.storeMapMarker();
}

// Aplica estilo a uma polyline. Tracejado é feito com ícone repetido (Google não tem dashArray).
function applyLineStyle(line, { color, weight, opacity, dashed }) {
  if (dashed) {
    line.setOptions({
      strokeColor: color,
      strokeWeight: weight,
      strokeOpacity: 0,
      icons: [{
        icon: { path: "M 0,-1 0,1", strokeOpacity: opacity, strokeWeight: weight, scale: 3 },
        offset: "0",
        repeat: "12px",
      }],
    });
  } else {
    line.setOptions({ strokeColor: color, strokeWeight: weight, strokeOpacity: opacity, icons: [] });
  }
}

function makePolyline(path, style) {
  const line = new google.maps.Polyline({ path, map: logisticsMap });
  applyLineStyle(line, style);
  MAP_OVERLAYS.push(line);
  return line;
}

function openMarkerPopup(marker) {
  if (!mapInfoWindow || !marker._popupHtml) return;
  mapInfoWindow.setContent(marker._popupHtml);
  mapInfoWindow.open({ anchor: marker, map: logisticsMap });
}

function addMarker(coord, icon, popupHtml) {
  const marker = new google.maps.Marker({ position: { lat: coord.lat, lng: coord.lng }, icon, map: logisticsMap });
  if (popupHtml) {
    marker._popupHtml = popupHtml;
    marker.addListener("click", () => openMarkerPopup(marker));
  }
  MAP_OVERLAYS.push(marker);
  return marker;
}

function fitBoundsCapped(bounds, padding, maxZoom) {
  if (!bounds || bounds.isEmpty()) return;
  logisticsMap.fitBounds(bounds, padding);
  google.maps.event.addListenerOnce(logisticsMap, "idle", () => {
    if (logisticsMap.getZoom() > maxZoom) logisticsMap.setZoom(maxZoom);
  });
}

function initMap() {
  if (!window.google?.maps) return null;
  const center = { lat: STORE_LOCATION.lat, lng: STORE_LOCATION.lng };
  if (!logisticsMap) {
    const el = document.getElementById("logisticsMap");
    if (!el) return null;
    logisticsMap = new google.maps.Map(el, {
      center,
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
      clickableIcons: false,
      styles: MAP_STYLE_CLEAN,
    });
    mapInfoWindow = new google.maps.InfoWindow();
  } else {
    logisticsMap.setCenter(center);
    logisticsMap.setZoom(13);
  }
  return logisticsMap;
}

function clearMapLayers() {
  if (!logisticsMap) return;
  MAP_OVERLAYS.forEach((overlay) => { try { overlay.setMap(null); } catch (error) { /**/ } });
  MAP_OVERLAYS.length = 0;
  mapBounds = new google.maps.LatLngBounds();
  Object.keys(ROUTE_LAYERS).forEach((k) => delete ROUTE_LAYERS[k]);
  Object.keys(DELIVERY_MARKERS).forEach((k) => delete DELIVERY_MARKERS[k]);
  selectedRouteId = null;
  if (mapInfoWindow) mapInfoWindow.close();
}

// Aceita [lat, lng] (formato usado nas chamadas existentes).
function extendBounds(point) {
  if (point) mapBounds.extend({ lat: point[0], lng: point[1] });
}

async function renderLogisticsMap(filters = {}) {
  const map = initMap();
  if (!map) return [];
  renderMapLegend();
  clearMapLayers();

  const settings = getSettings();
  const store = {
    lat: Number(settings?.latitudeLoja) || STORE_LOCATION.lat,
    lng: Number(settings?.longitudeLoja) || STORE_LOCATION.lng
  };

  const routeCards = [];
  drawStoreMarker(store);
  const routes = getRotas().filter((route) => routeVisibleByFilters(route, filters));

  await Promise.all(routes.map(async (route) => {
    const pedidos = (route.cargasIds || [])
      .map((id) => getCargas().find((c) => c.id === id))
      .filter(Boolean);

    if (!pedidos.length) return;

    const lineEntries = [];
    const markers = [];
    let firstCoord = null;

    await Promise.all(pedidos.map(async (pedido) => {
      const coord = getCoordForPedido(pedido);
      if (!coord) return;
      if (!firstCoord) firstCoord = coord;

      const popup = buildInfoWindowHtml({
        titulo: pedido.codigo,
        subtitulo: pedido.cliente,
        status: pedido.status,
        linhas: [pedido.descricao || null, `Rota ${route.codigo}`],
      });
      const cor = pedidoStatusMeta(pedido.status).color;

      if (pedido.status === "em rota") {
        const path = await getRouteGeometry(store, coord);
        const style = { color: "#3b82f6", weight: 4, opacity: 1, dashed: false };
        const line = makePolyline(path || [store, coord], style);
        extendBounds([coord.lat, coord.lng]);
        lineEntries.push({ line, pedidoStatus: pedido.status });

        const m = addMarker(coord, makeSimplePin(cor), popup);
        DELIVERY_MARKERS[pedido.id] = m;
        markers.push(m);

      } else if (pedido.status === "planejado") {
        const line = makePolyline([store, coord], { color: "#eab308", weight: 3, opacity: 0.85, dashed: true });
        extendBounds([store.lat, store.lng]);
        extendBounds([coord.lat, coord.lng]);
        lineEntries.push({ line, pedidoStatus: pedido.status });

        const m = addMarker(coord, makeSimplePin(cor), popup);
        DELIVERY_MARKERS[pedido.id] = m;
        markers.push(m);

      } else if (pedido.status === "entregue" || pedido.status === "cancelado" || pedido.status === "aguardando motorista") {
        const m = addMarker(coord, makeSimplePin(cor), popup);
        extendBounds([coord.lat, coord.lng]);
        DELIVERY_MARKERS[pedido.id] = m;
        markers.push(m);
      }
    }));

    if (!firstCoord) firstCoord = getCityCoordinates(route.destinoMunicipio, route.destinoEstado);
    if (!firstCoord && !markers.length) return;

    ROUTE_LAYERS[route.id] = { lineEntries, markers, destination: firstCoord, route };
    routeCards.push(route);
  }));

  renderMapSummary(routeCards);
  renderRouteCards(routeCards);
  fitBoundsCapped(mapBounds, 22, 13);
  return routeCards;
}

function routeVisibleByFilters(route, filters = {}) {
  if (filters.status && filters.status !== "todos" && route.status !== filters.status) return false;
  if (filters.driver && filters.driver !== "todos" && route.motoristaId !== filters.driver) return false;
  if (filters.city && filters.city !== "todos" && coordKey(route.destinoMunicipio, route.destinoEstado) !== filters.city) return false;
  return true;
}

function drawStoreMarker(store) {
  const popup = buildInfoWindowHtml({
    titulo: STORE_LOCATION.name,
    subtitulo: "Ponto de partida",
    linhas: [STORE_LOCATION.address || null],
  });
  addMarker(store, storeMarkerIcon(), popup);
  extendBounds([store.lat, store.lng]);
}

function routeStatusColor(status) {
  return {
    planejada:      "#eab308",
    "em andamento": "#3b82f6",
    concluida:      "#22c55e",
    cancelada:      "#ef4444"
  }[status] || "#6b7280";
}

function pedidoLineStyle(status) {
  if (status === "em rota")   return { color: "#3b82f6", weight: 4, opacity: 1,    dashed: false };
  if (status === "planejado") return { color: "#eab308", weight: 3, opacity: 0.85, dashed: true };
  return null;
}

function renderMapSummary(routes) {
  const summary = document.getElementById("mapSummary");
  if (!summary) return;
  const totals = {
    todas: routes.length,
    planejadas: routes.filter((route) => route.status === "planejada").length,
    andamento: routes.filter((route) => route.status === "em andamento").length,
    concluida: routes.filter((route) => route.status === "concluida").length
  };
  summary.innerHTML = `
    <div class="map-summary-card"><strong>${totals.todas}</strong><span>Rotas visíveis</span></div>
    <div class="map-summary-card"><strong>${totals.planejadas}</strong><span>Planejadas</span></div>
    <div class="map-summary-card"><strong>${totals.andamento}</strong><span>Em andamento</span></div>
    <div class="map-summary-card"><strong>${totals.concluida}</strong><span>Concluídas</span></div>
  `;
}

function renderRouteCards(routes) {
  const list = document.getElementById("mapRouteCards");
  if (!list) return;
  if (!routes.length) {
    list.innerHTML = '<div class="empty-state">Nenhuma rota encontrada com os filtros selecionados.</div>';
    return;
  }
  list.innerHTML = routes.map((route) => {
    const driver = getMotoristas().find((m) => m.id === route.motoristaId);
    return `
      <div class="map-route-card" data-route-id="${route.id}" style="cursor:pointer">
        <div>
          <strong>${route.codigo}</strong>
          <span>${route.nome}</span>
          <small>${route.destinoMunicipio}/${route.destinoEstado} · ${route.tipoRota || "Rodoviária"}</small>
        </div>
        <div>
          <span>${driver?.nome || "Sem motorista"}</span>
          <small>${route.cargasIds?.length || 0} pedido(s)</small>
          <span class="badge badge-${route.status === 'concluida' ? 'green' : route.status === 'em andamento' ? 'sky' : route.status === 'planejada' ? 'yellow' : 'red'}">${route.status}</span>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll(".map-route-card").forEach((card) => {
    card.addEventListener("click", () => onRouteCardClick(card.dataset.routeId));
  });
}

function onRouteCardClick(routeId) {
  if (selectedRouteId === routeId) {
    deselectRoute();
    return;
  }
  selectRoute(routeId);
}

function selectRoute(routeId) {
  deselectRoute();
  selectedRouteId = routeId;
  const entry = ROUTE_LAYERS[routeId];
  if (!entry || !logisticsMap) return;

  // Destaca linhas da rota selecionada e esmaece as demais
  Object.entries(ROUTE_LAYERS).forEach(([id, layer]) => {
    (layer.lineEntries || []).forEach(({ line }) => {
      if (id === routeId) {
        applyLineStyle(line, { color: "#F59E0B", weight: 5, opacity: 1, dashed: false });
      } else {
        applyLineStyle(line, { color: "#9ca3af", weight: 2, opacity: 0.35, dashed: false });
      }
    });
  });

  // Centraliza o mapa na rota selecionada (loja ↔ destino)
  if (entry.destination) {
    const settings = getSettings();
    const storeLat = Number(settings?.latitudeLoja) || STORE_LOCATION.lat;
    const storeLng = Number(settings?.longitudeLoja) || STORE_LOCATION.lng;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: storeLat, lng: storeLng });
    bounds.extend({ lat: entry.destination.lat, lng: entry.destination.lng });
    fitBoundsCapped(bounds, 50, 13);
  }

  // Abre popup no primeiro marcador da rota
  const firstMarker = entry.markers?.[0];
  if (firstMarker) openMarkerPopup(firstMarker);

  // Destaca marcadores dos pedidos da rota; esmaece os demais
  const rotaCargoIds = new Set(entry.route.cargasIds || []);
  Object.entries(DELIVERY_MARKERS).forEach(([cargaId, m]) => {
    m.setOpacity(rotaCargoIds.has(cargaId) ? 1 : 0.2);
  });

  // Destaca o card na lista
  document.querySelectorAll(".map-route-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.routeId === routeId);
  });
}

function deselectRoute() {
  selectedRouteId = null;

  // Restaura opacidade dos marcadores de pedidos
  Object.values(DELIVERY_MARKERS).forEach((m) => m.setOpacity(1));

  // Restaura o estilo original de cada linha por pedido.status
  Object.entries(ROUTE_LAYERS).forEach(([, entry]) => {
    (entry.lineEntries || []).forEach(({ line, pedidoStatus }) => {
      const style = pedidoLineStyle(pedidoStatus);
      if (style) applyLineStyle(line, style);
    });
  });

  // Remove destaque dos cards
  document.querySelectorAll(".map-route-card").forEach((card) => {
    card.classList.remove("selected");
  });

  if (mapInfoWindow) mapInfoWindow.close();
}

function fitAllMapRoutes() {
  fitBoundsCapped(mapBounds, 24, 13);
}

function renderMapLegend() {
  const legend = document.getElementById("mapLegend");
  if (!legend) return;
  const items = [
    { status: "planejada",     label: "Planejada",      desc: "Entrega agendada" },
    { status: "em andamento",  label: "Em andamento",   desc: "Em trânsito" },
    { status: "concluida",     label: "Concluída",      desc: "Entrega realizada" },
    { status: "cancelada",     label: "Cancelada",      desc: "Cancelada ou bloqueada" }
  ];
  legend.classList.toggle("is-collapsed", mapLegendCollapsed);
  legend.innerHTML = `
    <div class="legend-header">
      <strong>Legenda</strong>
      <button class="legend-toggle" type="button" aria-expanded="${!mapLegendCollapsed}" aria-label="${mapLegendCollapsed ? "Expandir legenda" : "Minimizar legenda"}" title="${mapLegendCollapsed ? "Expandir legenda" : "Minimizar legenda"}">
        ${mapLegendCollapsed ? "+" : "-"}
      </button>
    </div>
    <div class="legend-content">
      ${items.map(({ status, label, desc }) => `
        <div class="legend-row">
          <span class="legend-color" style="background:${routeStatusColor(status)}"></span>
          <div><b>${label}</b><small>${desc}</small></div>
        </div>
      `).join("")}
    </div>
  `;
  legend.querySelector(".legend-toggle")?.addEventListener("click", () => {
    mapLegendCollapsed = !mapLegendCollapsed;
    renderMapLegend();
  });
}
