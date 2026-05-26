let logisticsMap;
let mapBounds;
const ROUTE_CACHE = {};
const ROUTE_LAYERS = {};
let selectedRouteId = null;

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

  if (route.status === "concluída") {
    dashArray = null;
    opacity = 0.95;
  }

  return { color, weight, opacity, dashArray };
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
  selectedRouteId = null;
}

function extendBounds(point) {
  if (point) mapBounds.extend(point);
}

async function renderLogisticsMap(filters = {}) {
  const map = initMap();
  if (!map) return [];
  clearMapLayers();
  const store = { lat: STORE_LOCATION.lat, lng: STORE_LOCATION.lng };
  const routeCards = [];
  drawStoreMarker(store);
  const routes = getRotas().filter((route) => routeVisibleByFilters(route, filters));
  await Promise.all(routes.map(async (route) => {
    const destination = getCityCoordinates(route.destinoMunicipio, route.destinoEstado);
    if (!destination) return;
    const line = await drawRouteLine(store, destination, route);
    const marker = drawDestinationMarker(destination, route);
    ROUTE_LAYERS[route.id] = { line, marker, destination, route };
    routeCards.push(route);
  }));
  renderMapSummary(routeCards);
  renderRouteCards(routeCards);
  renderDeliveryMarkers();
  if (mapBounds.isValid()) logisticsMap.fitBounds(mapBounds, { padding: [22, 22], maxZoom: 13 });
  return routeCards;
}

function renderDeliveryMarkers() {
  getCargas()
    .filter((c) => c.lat && c.lng)
    .forEach((carga) => {
      const lat = Number(carga.lat);
      const lng = Number(carga.lng);
      if (!lat || !lng) return;
      const icon = L.divIcon({
        className: "delivery-div-icon",
        html: '<div class="delivery-dot"></div>',
        iconSize: [10, 10],
        iconAnchor: [5, 5]
      });
      const enderecoCompleto = [carga.enderecoEntrega, carga.numero, carga.complemento].filter(Boolean).join(", ");
      const marker = L.marker([lat, lng], { icon });
      marker.bindPopup(`
        <strong>${carga.codigo}</strong><br>
        ${carga.descricao}<br>
        ${enderecoCompleto ? enderecoCompleto + "<br>" : ""}
        ${carga.cliente}<br>
        <em>${carga.status}</em>
      `);
      marker.addTo(logisticsMap);
    });
}

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

function routeStatusColor(status) {
  return {
    planejada: "#f2c94c",
    "em andamento": "#2374c6",
    concluída: "#0fa958",
    cancelada: "#d93025"
  }[status] || "#6b7280";
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
  return L.divIcon({ className: "delivery-div-icon", html: `<div class="delivery-pin ${status === 'concluída' ? 'completed' : status === 'em andamento' ? 'active' : 'pending'}"></div>`, iconSize: [20, 20], iconAnchor: [10, 10] });
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
    concluida: routes.filter((route) => route.status === "concluída").length
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
          <span class="badge badge-${route.status === 'concluída' ? 'green' : route.status === 'em andamento' ? 'blue' : route.status === 'planejada' ? 'yellow' : 'red'}">${route.status}</span>
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

  // Destaca a linha selecionada e esmaece as demais
  Object.entries(ROUTE_LAYERS).forEach(([id, layer]) => {
    if (id === routeId) {
      layer.line.setStyle({ color: "#F59E0B", weight: 5, opacity: 1, dashArray: null });
    } else {
      layer.line.setStyle({ color: "#9ca3af", weight: 2, opacity: 0.35, dashArray: null });
    }
  });

  // Centraliza o mapa na rota selecionada
  const store = { lat: STORE_LOCATION.lat, lng: STORE_LOCATION.lng };
  const bounds = L.latLngBounds(
    [store.lat, store.lng],
    [entry.destination.lat, entry.destination.lng]
  );
  logisticsMap.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });

  // Abre o popup no marcador de destino
  entry.marker.openPopup();

  // Destaca o card na lista
  document.querySelectorAll(".map-route-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.routeId === routeId);
  });
}

function deselectRoute() {
  selectedRouteId = null;

  // Restaura o estilo original de cada linha
  Object.entries(ROUTE_LAYERS).forEach(([, entry]) => {
    const style = routeStyle(entry.route);
    entry.line.setStyle(style);
  });

  // Remove destaque dos cards
  document.querySelectorAll(".map-route-card").forEach((card) => {
    card.classList.remove("selected");
  });
}

function fitAllMapRoutes() {
  if (mapBounds?.isValid()) logisticsMap.fitBounds(mapBounds, { padding: [24, 24], maxZoom: 13 });
}
