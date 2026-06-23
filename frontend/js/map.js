let logisticsMap;
let mapBounds;
const ROUTE_CACHE = {};
const ROUTE_LAYERS = {};
let selectedRouteId = null;
const DELIVERY_MARKERS = {};
let mapLegendCollapsed = false;

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

function routeStyle(route) {
  const color = routeStatusColor(route.status);
  const weight = route.tipoRota === "Urbana" ? 4 : route.tipoRota === "Mista" ? 5 : 6;
  let dashArray = null;
  let opacity = 0.92;

  if (route.status === "planejada") {
    dashArray = "6 6";
    opacity = 0.82;
  }

  if (route.status === "cancelada") {
    dashArray = "4 6";
    opacity = 0.7;
  }

  if (route.status === "em andamento") {
    dashArray = null;
    opacity = 1;
  }

  if (route.status === "concluida") {
    dashArray = null;
    opacity = 0.95;
  }

  return { color, weight, opacity, dashArray };
}

async function getMultiWaypointGeometry(waypoints) {
  if (waypoints.length < 2) return null;
  const coords = waypoints.map((w) => `${w.lng},${w.lat}`).join(";");
  const key = `multi:${coords}`;
  if (ROUTE_CACHE[key]) return ROUTE_CACHE[key];
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = await response.json();
    if (data?.routes?.[0]?.geometry) {
      ROUTE_CACHE[key] = data.routes[0].geometry;
      return data.routes[0].geometry;
    }
  } catch (error) {
    console.warn("OSRM multi-waypoint falhou", error);
  }
  return null;
}

async function getRouteGeometry(origin, destination) {
  const key = `${origin.lat},${origin.lng}:${destination.lat},${destination.lng}`;
  if (ROUTE_CACHE[key]) return ROUTE_CACHE[key];
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const data = await response.json();
    if (data?.routes?.[0]?.geometry) {
      ROUTE_CACHE[key] = data.routes[0].geometry;
      return data.routes[0].geometry;
    }
  } catch (error) {
    console.warn("OSRM route fetch falhou", error);
  }
  return null;
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

async function drawSequentialRoute(route) {
  const LOJA = { lat: STORE_LOCATION.lat, lng: STORE_LOCATION.lng };

  const todosPedidos = (route.cargasIds || [])
    .map((id) => getCargas().find((c) => c.id === id))
    .filter(Boolean);

  const entregues = todosPedidos.filter((c) => c.status === "entregue");
  const pendentes  = todosPedidos.filter((c) => c.status !== "entregue" && c.status !== "cancelado");

  if (!pendentes.length) return null;

  // Ponto de partida: último pedido entregue (na ordem de cargas_ids) ou loja
  let pontoPartida = LOJA;
  if (entregues.length > 0) {
    const ultimoEntregue = entregues[entregues.length - 1];
    const coord = getCoordForPedido(ultimoEntregue);
    if (coord) pontoPartida = coord;
  }

  // Waypoints: partida → pendente1 → pendente2 → ...
  const waypoints = [pontoPartida];
  for (const pedido of pendentes) {
    const coord = getCoordForPedido(pedido);
    if (coord) waypoints.push(coord);
  }

  if (waypoints.length < 2) return null;

  const style = routeStyle(route);
  let line;

  const geometry = await getMultiWaypointGeometry(waypoints);
  if (geometry) {
    line = L.geoJSON(geometry, { style });
  } else {
    line = L.polyline(waypoints.map((w) => [w.lat, w.lng]), style);
  }

  line.addTo(logisticsMap);
  waypoints.forEach((w) => extendBounds([w.lat, w.lng]));

  // Marcador cinza no ponto de partida quando for uma entrega (não a loja)
  if (entregues.length > 0) {
    const deptIcon = L.divIcon({
      className: "delivery-div-icon",
      html: '<div class="delivery-pin departure-point"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
    const deptMarker = L.marker([pontoPartida.lat, pontoPartida.lng], { icon: deptIcon });
    deptMarker.bindPopup("📍 Última entrega — ponto de partida atual");
    deptMarker.addTo(logisticsMap);
  }

  return line;
}

function initMap() {
  if (!window.L) return null;
  if (!logisticsMap) {
    logisticsMap = L.map("logisticsMap", { zoomControl: true }).setView([STORE_LOCATION.lat, STORE_LOCATION.lng], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>"
    }).addTo(logisticsMap);
  } else {
    logisticsMap.setView([STORE_LOCATION.lat, STORE_LOCATION.lng], 13);
  }
  setTimeout(() => logisticsMap.invalidateSize(), 120);
  return logisticsMap;
}

function clearMapLayers() {
  if (!logisticsMap) return;
  logisticsMap.eachLayer((layer) => {
    if (layer instanceof L.Marker || layer instanceof L.Polyline || layer instanceof L.GeoJSON) {
      try { logisticsMap.removeLayer(layer); } catch (error) { /**/ }
    }
  });
  mapBounds = L.latLngBounds([]);
  Object.keys(ROUTE_LAYERS).forEach((k) => delete ROUTE_LAYERS[k]);
  Object.keys(DELIVERY_MARKERS).forEach((k) => delete DELIVERY_MARKERS[k]);
  selectedRouteId = null;
}

function extendBounds(point) {
  if (point) mapBounds.extend(point);
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

      const popup = `<strong>${pedido.codigo}</strong>${pedido.descricao ? ` — ${pedido.descricao}` : ""}<br>👤 ${pedido.cliente}`;

      if (pedido.status === "em rota") {
        const geometry = await getRouteGeometry(store, coord);
        let line;
        const style = { color: "#3b82f6", weight: 4, opacity: 1 };
        if (geometry) {
          line = L.geoJSON(geometry, { style });
        } else {
          line = L.polyline([[store.lat, store.lng], [coord.lat, coord.lng]], style);
        }
        line.addTo(logisticsMap);
        extendBounds([coord.lat, coord.lng]);
        lineEntries.push({ line, pedidoStatus: pedido.status });

        const m = L.marker([coord.lat, coord.lng], { icon: makeSimplePin("#3b82f6") });
        m.bindPopup(`${popup}<br>🚚 Em rota · ${route.codigo}`);
        m.addTo(logisticsMap);
        DELIVERY_MARKERS[pedido.id] = m;
        markers.push(m);

      } else if (pedido.status === "planejado") {
        const line = L.polyline([[store.lat, store.lng], [coord.lat, coord.lng]], {
          color: "#eab308", weight: 3, opacity: 0.85, dashArray: "8, 8"
        });
        line.addTo(logisticsMap);
        extendBounds([store.lat, store.lng]);
        extendBounds([coord.lat, coord.lng]);
        lineEntries.push({ line, pedidoStatus: pedido.status });

        const m = L.marker([coord.lat, coord.lng], { icon: makeSimplePin("#eab308") });
        m.bindPopup(`${popup}<br>🗓 Planejado · ${route.codigo}`);
        m.addTo(logisticsMap);
        DELIVERY_MARKERS[pedido.id] = m;
        markers.push(m);

      } else if (pedido.status === "entregue") {
        const m = L.marker([coord.lat, coord.lng], { icon: makeSimplePin("#22c55e") });
        m.bindPopup(`${popup}<br>✅ Entregue · ${route.codigo}`);
        m.addTo(logisticsMap);
        extendBounds([coord.lat, coord.lng]);
        DELIVERY_MARKERS[pedido.id] = m;
        markers.push(m);

      } else if (pedido.status === "cancelado") {
        const m = L.marker([coord.lat, coord.lng], { icon: makeSimplePin("#ef4444") });
        m.bindPopup(`${popup}<br>❌ Cancelado · ${route.codigo}`);
        m.addTo(logisticsMap);
        extendBounds([coord.lat, coord.lng]);
        DELIVERY_MARKERS[pedido.id] = m;
        markers.push(m);

      } else if (pedido.status === "aguardando motorista") {
        const m = L.marker([coord.lat, coord.lng], { icon: makeSimplePin("#6b7280") });
        m.bindPopup(`${popup}<br>⏳ Aguardando motorista · ${route.codigo}`);
        m.addTo(logisticsMap);
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
  if (mapBounds.isValid()) logisticsMap.fitBounds(mapBounds, { padding: [22, 22], maxZoom: 13 });
  return routeCards;
}

// Marcadores de entrega são adicionados diretamente em renderLogisticsMap por pedido.status.
// Esta função é mantida para compatibilidade mas não é mais chamada.

function routeVisibleByFilters(route, filters = {}) {
  if (filters.status && filters.status !== "todos" && route.status !== filters.status) return false;
  if (filters.driver && filters.driver !== "todos" && route.motoristaId !== filters.driver) return false;
  if (filters.city && filters.city !== "todos" && coordKey(route.destinoMunicipio, route.destinoEstado) !== filters.city) return false;
  return true;
}

function drawStoreMarker(store) {
  const marker = L.marker([store.lat, store.lng], { icon: storeMarkerIcon() });
  marker.bindPopup(`<b>${STORE_LOCATION.name}</b><br>${STORE_LOCATION.address}`);
  marker.addTo(logisticsMap);
  extendBounds([store.lat, store.lng]);
}

function storeMarkerIcon() {
  return L.divIcon({ className: "store-div-icon", html: '<div class="store-pin"></div>', iconSize: [40, 40], iconAnchor: [20, 20] });
}

function makeSimplePin(color, size = 16) {
  return L.divIcon({
    className: "delivery-div-icon",
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
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
  if (status === "em rota")   return { color: "#3b82f6", weight: 4, opacity: 1,    dashArray: null };
  if (status === "planejado") return { color: "#eab308", weight: 3, opacity: 0.85, dashArray: "8, 8" };
  return null;
}

async function drawRouteLine(origin, destination, route) {
  const geometry = await getRouteGeometry(origin, destination);
  let line;
  const style = routeStyle(route);
  if (geometry) {
    line = L.geoJSON(geometry, { style });
  } else {
    line = L.polyline([[origin.lat, origin.lng], [destination.lat, destination.lng]], style);
  }
  line.addTo(logisticsMap);
  extendBounds([origin.lat, origin.lng]);
  extendBounds([destination.lat, destination.lng]);
  return line;
}

function destinationMarkerIcon(status) {
  return L.divIcon({ className: "delivery-div-icon", html: `<div class="delivery-pin ${status === 'concluida' ? 'completed' : status === 'em andamento' ? 'active' : 'pending'}"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] });
}

function drawDestinationMarker(destination, route) {
  const marker = L.marker([destination.lat, destination.lng], { icon: destinationMarkerIcon(route.status) });
  const driver = driverName(route.motoristaId);
  marker.bindPopup(`
    <strong>${route.codigo} · ${route.nome}</strong><br>
    ${route.destinoMunicipio}/${route.destinoEstado} · ${route.tipoRota || "Rodoviária"}<br>
    <strong>Motorista:</strong> ${driver}<br>
    ${route.cargasIds?.length || 0} pedido(s)<br>
    ${route.status}<br>
    ${route.tempo ? `Tempo: ${route.tempo}<br>` : ""}
    ${route.freteTotal ? `Frete total: ${money.format(Number(route.freteTotal || 0))}` : ""}
  `);
  marker.addTo(logisticsMap);
  extendBounds([destination.lat, destination.lng]);
  return marker;
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
        line.setStyle({ color: "#F59E0B", weight: 5, opacity: 1, dashArray: null });
      } else {
        line.setStyle({ color: "#9ca3af", weight: 2, opacity: 0.35, dashArray: null });
      }
    });
  });

  // Centraliza o mapa na rota selecionada
  if (entry.destination) {
    const settings = getSettings();
    const storeLat = Number(settings?.latitudeLoja) || STORE_LOCATION.lat;
    const storeLng = Number(settings?.longitudeLoja) || STORE_LOCATION.lng;
    const bounds = L.latLngBounds([storeLat, storeLng], [entry.destination.lat, entry.destination.lng]);
    logisticsMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
  }

  // Abre popup no primeiro marcador da rota
  const firstMarker = entry.markers?.[0];
  if (firstMarker) firstMarker.openPopup();

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
      if (style) line.setStyle(style);
    });
  });

  // Remove destaque dos cards
  document.querySelectorAll(".map-route-card").forEach((card) => {
    card.classList.remove("selected");
  });
}

function fitAllMapRoutes() {
  if (mapBounds?.isValid()) logisticsMap.fitBounds(mapBounds, { padding: [24, 24], maxZoom: 13 });
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
