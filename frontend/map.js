let logisticsMap;
let mapBounds;
const ROUTE_CACHE = {};

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
  const settings = getSettings();
  const lat = Number(settings.latitudeLoja || STORE_LOCATION.lat);
  const lng = Number(settings.longitudeLoja || STORE_LOCATION.lng);
  if (!logisticsMap) {
    logisticsMap = L.map("logisticsMap", { zoomControl: true }).setView([lat, lng], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>"
    }).addTo(logisticsMap);
  } else {
    logisticsMap.setView([lat, lng], 12);
  }
  setTimeout(() => logisticsMap.invalidateSize(), 120);
  return logisticsMap;
}

function clearMapLayers() {
  if (!logisticsMap) return;
  logisticsMap.eachLayer((layer) => {
    if (layer instanceof L.Marker || layer instanceof L.Polyline) {
      try { logisticsMap.removeLayer(layer); } catch (error) { /**/ }
    }
  });
  mapBounds = L.latLngBounds([]);
}

function extendBounds(point) {
  if (point) mapBounds.extend(point);
}

async function renderLogisticsMap(filters = {}) {
  const map = initMap();
  if (!map) return [];
  clearMapLayers();
  const store = { lat: Number(getSettings().latitudeLoja || STORE_LOCATION.lat), lng: Number(getSettings().longitudeLoja || STORE_LOCATION.lng) };
  const routeCards = [];
  drawStoreMarker(store);
  const routes = getRotas().filter((route) => routeVisibleByFilters(route, filters));
  await Promise.all(routes.map(async (route) => {
    const destination = getCityCoordinates(route.destinoMunicipio, route.destinoEstado);
    if (!destination) return;
    await drawRouteLine(store, destination, route);
    drawDestinationMarker(destination, route);
    routeCards.push(route);
  }));
  renderMapSummary(routeCards);
  renderRouteCards(routeCards);
  if (mapBounds.isValid()) logisticsMap.fitBounds(mapBounds, { padding: [22, 22], maxZoom: 13 });
  return routeCards;
}

function routeVisibleByFilters(route, filters = {}) {
  if (filters.status && filters.status !== "todos" && route.status !== filters.status) return false;
  if (filters.driver && filters.driver !== "todos" && route.motoristaId !== filters.driver) return false;
  if (filters.city && filters.city !== "todos" && coordKey(route.destinoMunicipio, route.destinoEstado) !== filters.city) return false;
  return true;
}

function drawStoreMarker(store) {
  const marker = L.marker([store.lat, store.lng], { icon: storeMarkerIcon() });
  marker.bindPopup(`<b>Madcenter Construção</b><br>${STORE_LOCATION.city}/${STORE_LOCATION.state}`);
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
      <div class="map-route-card" data-route-id="${route.id}">
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
}

function fitAllMapRoutes() {
  if (mapBounds?.isValid()) logisticsMap.fitBounds(mapBounds, { padding: [24, 24], maxZoom: 13 });
}
