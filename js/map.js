let logisticsMap;
let mapLayers = [];
let routeLayerIndex = {};
let mapRouteData = [];
let selectedRouteId = null;
let lastMapFilters = {};
let lastMapLayers = {};
let mapBounds;

const DRIVER_ROUTE_COLORS = ["#008c45", "#2374c6", "#f28c28", "#7c3aed", "#8b1e1e", "#0f766e", "#b45309"];

function normalizeCityName(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// BUG FIX: toUpperCase() foi alterado para toLowerCase() para que a chave gerada
// corresponda às chaves em MUNICIPIOS_COORDS (ex: "timon-ma", "teresina-pi").
function coordKey(city, state) {
  return `${normalizeCityName(city)}-${String(state || "").trim().toLowerCase()}`;
}

function getCityCoordinates(city, state) {
  return MUNICIPIOS_COORDS[coordKey(city, state)] || null;
}

function getCityCoord(city, state) {
  return getCityCoordinates(city, state);
}

function localDistanceKm(originLat, originLng, destLat, destLng) {
  if (typeof calculateDistanceKm === "function") return calculateDistanceKm(originLat, originLng, destLat, destLng);
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(destLat - originLat);
  const dLng = toRad(destLng - originLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(originLat)) * Math.cos(toRad(destLat)) * Math.sin(dLng / 2) ** 2;
  return Number((6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
}

function formatDistance(value) {
  const km = Number(value || 0) > 1000 ? Number(value) / 1000 : Number(value || 0);
  return `${km.toFixed(1).replace(".", ",")} km`;
}

function formatDuration(seconds) {
  const totalMinutes = Math.max(1, Math.round(Number(seconds || 0) / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes} min`;
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

function getDriverRouteColor(driverId) {
  const drivers = getMotoristas();
  const index = Math.max(0, drivers.findIndex((driver) => driver.id === driverId));
  return DRIVER_ROUTE_COLORS[index % DRIVER_ROUTE_COLORS.length];
}

function initMap() {
  if (!window.L) return null;
  const settings = getSettings();
  const lat = Number(settings.latitudeLoja || STORE_LOCATION.lat);
  const lng = Number(settings.longitudeLoja || STORE_LOCATION.lng);
  if (!logisticsMap) {
    logisticsMap = L.map("logisticsMap").setView([lat, lng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a>"
    }).addTo(logisticsMap);
  } else {
    logisticsMap.setView([lat, lng], 14);
  }
  setTimeout(() => logisticsMap.invalidateSize(), 120);
  return logisticsMap;
}

function clearMapLayers() {
  if (!logisticsMap) return;
  mapLayers.forEach((layer) => logisticsMap.removeLayer(layer));
  mapLayers = [];
  routeLayerIndex = {};
  mapBounds = L.latLngBounds([]);
}

function addLayer(layer) {
  mapLayers.push(layer);
  layer.addTo(logisticsMap);
  return layer;
}

function extendBounds(point) {
  if (point) mapBounds.extend(point);
}

function getMapLayerOptions() {
  return {
    showStore: true,
    showPending: true,
    showInProgress: true,
    showCompleted: true,
    showPlannedRoutes: true,
    showActiveRoutes: true,
    showCompletedRoutes: true,
    showDrivers: true,
    showLegend: true,
    ...lastMapLayers
  };
}

function routeVisibleByFilters(route, filters = {}) {
  if (filters.status && filters.status !== "todos" && route.status !== filters.status) return false;
  if (filters.driver && filters.driver !== "todos" && route.motoristaId !== filters.driver) return false;
  if (filters.truck && filters.truck !== "todos" && route.caminhaoId !== filters.truck) return false;
  if (filters.city && filters.city !== "todos" && coordKey(route.destinoMunicipio, route.destinoEstado) !== filters.city) return false;
  if (filters.vehicleType && filters.vehicleType !== "todos" && route.veiculoTipo !== filters.vehicleType) return false;
  return true;
}

function routeVisibleByLayers(route, layers = {}) {
  if (route.status === "planejada" && !layers.showPlannedRoutes) return false;
  if (route.status === "em andamento" && !layers.showActiveRoutes) return false;
  if (route.status === "concluída" && !layers.showCompletedRoutes) return false;
  if (route.status === "cancelada") return true;
  return true;
}

async function loadMapRoutes(filters = {}, layers = {}) {
  const map = initMap();
  const warningsBox = document.getElementById("mapWarnings");
  if (!map) {
    if (warningsBox) warningsBox.innerHTML = '<div class="warning-line">Leaflet não carregou. Verifique a conexão com a CDN.</div>';
    return [];
  }

  lastMapFilters = filters;
  lastMapLayers = layers;
  clearMapLayers();
  const layerOptions = getMapLayerOptions();
  const warnings = [];

  if (layerOptions.showStore) drawStoreMarker();

  const routes = getRotas().filter((route) => routeVisibleByFilters(route, filters) && routeVisibleByLayers(route, layerOptions));
  mapRouteData = [];

  for (const route of routes) {
    const routeInfo = await drawRoute(route, layerOptions, warnings);
    if (routeInfo) mapRouteData.push(routeInfo);
  }

  drawDeliveryMarkers(routes, layerOptions, warnings);
  renderMapLegend(mapRouteData, layerOptions);

  if (warningsBox) {
    if (warnings.length) {
      warningsBox.innerHTML = warnings.map((warning) => `<div class="warning-line">${warning}</div>`).join("");
    } else {
      warningsBox.innerHTML = '<div class="badge badge-green">Rotas carregadas com sucesso.</div>';
    }
  }

  if (mapBounds.isValid()) logisticsMap.fitBounds(mapBounds, { padding: [32, 32], maxZoom: 14 });
  return mapRouteData;
}

function renderLogisticsMap(filters = {}, layers = {}) {
  return loadMapRoutes(filters, layers);
}

function drawStoreMarker() {
  const settings = getSettings();
  const lat = Number(settings.latitudeLoja || STORE_LOCATION.lat);
  const lng = Number(settings.longitudeLoja || STORE_LOCATION.lng);
  const marker = L.marker([lat, lng], { icon: storeMarkerIcon(), zIndexOffset: 1000 });
  marker.bindPopup(
    "<b>Madcenter Construção</b><br>" +
    "<strong>Sede da loja</strong><br>" +
    "Ponto de saída de todas as entregas<br>" +
    "<em>Timon / MA</em>"
  );
  addLayer(marker);
  extendBounds([lat, lng]);
}

function storeMarkerIcon() {
  return L.divIcon({
    className: "store-div-icon",
    html: '<div class="store-pin"></div>',
    iconSize: [42, 42],
    iconAnchor: [21, 21]
  });
}

function deliveryMarkerIcon(status) {
  const classMap = {
    entregue: "delivery-pin completed",
    "em rota": "delivery-pin active",
    cancelado: "delivery-pin cancelled"
  };
  const className = classMap[status] || "delivery-pin pending";
  return L.divIcon({
    className: "delivery-div-icon",
    html: `<div class="${className}"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
}

function stopMarkerIcon() {
  return L.divIcon({
    className: "delivery-div-icon",
    html: '<div class="delivery-pin stop"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

function drawDeliveryMarkers(routes, layers, warnings) {
  const routeIds = new Set(routes.flatMap((route) => route.cargasIds || []));
  getCargas().filter((load) => routeIds.has(load.id)).forEach((load) => {
    if (load.status === "entregue" && !layers.showCompleted) return;
    if (load.status === "em rota" && !layers.showInProgress) return;
    if (["aguardando rota", "aguardando separação"].includes(load.status) && !layers.showPending) return;
    const coord = getCityCoordinates(load.destinoMunicipio, load.destinoEstado);
    if (!coord) {
      warnings.push(`Município sem coordenada cadastrada: ${load.destinoMunicipio}/${load.destinoEstado}.`);
      return;
    }
    const route = routes.find((item) => (item.cargasIds || []).includes(load.id));
    const driver = getMotoristas().find((item) => item.id === route?.motoristaId);
    const truck = getCaminhoes().find((item) => item.id === route?.caminhaoId);
    const marker = L.marker([coord.lat, coord.lng], { icon: deliveryMarkerIcon(load.status) });
    marker.bindPopup(`
      <b>${load.codigo} · ${load.descricao}</b>
      ${popupLine("Cliente", load.cliente)}
      ${popupLine("Material/produto", load.tipo)}
      ${popupLine("Cidade de destino", `${load.destinoMunicipio}/${load.destinoEstado}`)}
      ${popupLine("Endereço", load.enderecoEntrega)}
      ${popupLine("Motorista", driver?.nome)}
      ${popupLine("Veículo", vehicleName(load.veiculoTipo || route?.veiculoTipo))}
      ${truck?.placa ? popupLine("Placa", truck.placa) : ""}
      ${popupLine("Peso", `${load.peso} kg`)}
      ${popupLine("Distância estimada", formatDistance(load.distanciaKm))}
      ${route?.tempo ? popupLine("Tempo estimado", route.tempo) : ""}
      ${popupLine("Frete", money.format(Number(load.valorFrete || 0)))}
      ${popupLine("Status", load.status)}
      ${popupLine("Previsão de entrega", load.entrega)}
    `);
    addLayer(marker);
    extendBounds([coord.lat, coord.lng]);
  });
}

async function drawRoute(route, layers, warnings) {
  const points = buildRoutePoints(route, warnings);
  if (points.length < 2) return null;

  const osrm = await fetchRoadRoute(points);
  let layer;
  let distanceKm;
  let durationText;
  let fallback = false;

  if (osrm?.geometry) {
    layer = drawRoadRoute(route, osrm.geometry, osrm.distance, osrm.duration);
    distanceKm = Number((osrm.distance / 1000).toFixed(1));
    durationText = formatDuration(osrm.duration);
  } else {
    layer = drawFallbackRoute(route, points);
    distanceKm = estimateRouteFallbackDistance(points);
    durationText = route.tempo || "Indisponível";
    fallback = true;
    warnings.push(`Rota por estrada indisponível no momento. Exibindo distância aproximada em linha reta para ${route.nome}.`);
  }

  routeLayerIndex[route.id] = layer;
  const routeInfo = buildRouteInfo(route, points, distanceKm, durationText, fallback);
  bindRouteInteractions(layer, routeInfo);
  return routeInfo;
}

function buildRoutePoints(route, warnings) {
  const settings = getSettings();
  const points = [{
    label: "Madcenter Construção",
    lat: Number(settings.latitudeLoja || STORE_LOCATION.lat),
    lng: Number(settings.longitudeLoja || STORE_LOCATION.lng),
    type: "store"
  }];

  String(route.paradas || "").split(";").map((item) => item.trim()).filter(Boolean).forEach((stop) => {
    const coord = Object.values(MUNICIPIOS_COORDS).find((city) => normalizeCityName(city.nome) === normalizeCityName(stop));
    if (coord) {
      points.push({ label: `${coord.nome}/${coord.estado}`, lat: coord.lat, lng: coord.lng, type: "stop" });
      const marker = L.marker([coord.lat, coord.lng], { icon: stopMarkerIcon() });
      marker.bindPopup(`<b>Parada intermediária</b><br>${coord.nome}/${coord.estado}<br><em>${route.nome}</em>`);
      addLayer(marker);
      extendBounds([coord.lat, coord.lng]);
    } else {
      if (warnings) warnings.push(`Parada sem coordenada cadastrada: ${stop}.`);
    }
  });

  const destination = getCityCoordinates(route.destinoMunicipio, route.destinoEstado);
  if (destination) {
    points.push({ label: `${destination.nome}/${destination.estado}`, lat: destination.lat, lng: destination.lng, type: "destination" });
  } else {
    if (warnings) warnings.push(`Município sem coordenada cadastrada: ${route.destinoMunicipio}/${route.destinoEstado}.`);
  }
  return points;
}

async function fetchRoadRoute(points) {
  const cacheKey = points.map((point) => `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`).join(";");
  const cached = getCachedRouteGeometry(cacheKey);
  if (cached) return cached;

  const coordinates = points.map((point) => `${point.lng},${point.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error("OSRM indisponível");
    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) throw new Error("Rota não encontrada");
    const result = { geometry: route.geometry, distance: route.distance, duration: route.duration };
    setCachedRouteGeometry(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

// Rotas planejadas: cor do motorista com linha tracejada (diferencia de "em andamento").
// Rotas em andamento: cor do motorista sólida e mais grossa.
// Rotas concluídas: cinza esverdeado com opacidade menor.
// Rotas canceladas: vermelho com linha tracejada.
function routeStyle(route, selected = false) {
  const color = getDriverRouteColor(route.motoristaId);
  const statusStyle = {
    planejada: { color, opacity: .72, dashArray: "9 6" },
    "em andamento": { color, opacity: .94, dashArray: null },
    "concluída": { color: "#557166", opacity: .44, dashArray: null },
    cancelada: { color: "#d93025", opacity: .75, dashArray: "10 8" }
  };
  const base = statusStyle[route.status] || { color, opacity: .82, dashArray: null };
  return { ...base, weight: selected ? 9 : route.status === "em andamento" ? 7 : 5 };
}

function drawRoadRoute(route, geometry) {
  const layer = L.geoJSON(geometry, { style: routeStyle(route, selectedRouteId === route.id) });
  addLayer(layer);
  geometry.coordinates.forEach(([lng, lat]) => extendBounds([lat, lng]));
  return layer;
}

function drawFallbackRoute(route, points) {
  const layer = L.polyline(points.map((point) => [point.lat, point.lng]), routeStyle(route, selectedRouteId === route.id));
  addLayer(layer);
  points.forEach((point) => extendBounds([point.lat, point.lng]));
  return layer;
}

function bindRouteInteractions(layer, routeInfo) {
  const popup = routePopupHtml(routeInfo);
  layer.bindPopup(popup);
  layer.on("mouseover", () => layer.setStyle?.({ weight: 9, opacity: 1 }));
  layer.on("mouseout", () => {
    if (selectedRouteId !== routeInfo.id) layer.setStyle?.(routeStyle(routeInfo.raw));
  });
  layer.on("click", () => {
    selectedRouteId = routeInfo.id;
    focusRoute(routeInfo.id);
  });
}

function routePopupHtml(info) {
  return `
    <b>${info.codigo} · ${info.nome}</b>
    ${popupLine("Motorista", info.motorista)}
    ${popupLine("Veículo", info.veiculo)}
    ${popupLine("Status", info.status)}
    ${popupLine("Pedidos", info.pedidos.length)}
    ${popupLine("Distância", formatDistance(info.distanciaKm))}
    ${popupLine("Tempo", info.tempo)}
    ${popupLine("Frete total", money.format(Number(info.freteTotal || 0)))}
    ${popupLine("Cidades atendidas", info.cidades.join(", "))}
    ${popupLine("Previsão de saída", formatDate(info.saida))}
    ${popupLine("Previsão de chegada", formatDate(info.chegada))}
    ${info.fallback ? "<em style='font-size:11px;color:#6d5200'>Rota por estrada indisponível. Exibindo linha reta.</em>" : ""}
  `;
}

function popupLine(label, value) {
  return `<strong>${label}:</strong> ${value ?? "Não informado"}<br>`;
}

function buildRouteInfo(route, points, distanceKm, durationText, fallback) {
  const driver = getMotoristas().find((item) => item.id === route.motoristaId);
  const truck = getCaminhoes().find((item) => item.id === route.caminhaoId);
  const loads = getCargas().filter((load) => (route.cargasIds || []).includes(load.id));
  return {
    id: route.id,
    codigo: route.codigo,
    nome: route.nome,
    motorista: driver?.nome || "Não vinculado",
    motoristaId: route.motoristaId,
    caminhao: truck ? `${truck.placa} - ${truck.modelo}` : "Não vinculado",
    placa: truck?.placa || "",
    veiculo: vehicleName(route.veiculoTipo),
    veiculoTipo: route.veiculoTipo,
    status: route.status,
    origem: `${STORE_LOCATION.city}/${STORE_LOCATION.state}`,
    destino: `${route.destinoMunicipio}/${route.destinoEstado}`,
    paradas: route.paradas || "Sem paradas",
    distanciaKm: distanceKm,
    tempo: durationText,
    freteTotal: Number(route.freteTotal || route.custo || 0),
    pedidos: loads,
    cidades: [...new Set(points.slice(1).map((point) => point.label))],
    saida: route.saida,
    chegada: route.chegada,
    color: getDriverRouteColor(route.motoristaId),
    fallback,
    raw: route
  };
}

function estimateRouteFallbackDistance(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += localDistanceKm(points[index - 1].lat, points[index - 1].lng, points[index].lat, points[index].lng);
  }
  return Number(total.toFixed(1));
}

function focusRoute(routeId) {
  selectedRouteId = routeId;

  // Atualiza estilo das linhas no mapa
  Object.entries(routeLayerIndex).forEach(([id, layer]) => {
    const info = mapRouteData.find((route) => route.id === id);
    if (info) layer.setStyle?.(routeStyle(info.raw, id === routeId));
  });

  const layer = routeLayerIndex[routeId];
  if (!layer) return;
  const bounds = layer.getBounds ? layer.getBounds() : null;
  if (bounds?.isValid()) logisticsMap.fitBounds(bounds, { padding: [42, 42], maxZoom: 15 });
  layer.openPopup?.();

  // Destaca o card da rota no painel lateral
  document.querySelectorAll(".map-route-card").forEach((el) => el.classList.remove("focused"));
  const card = document.querySelector(`.map-route-card[data-route-id="${routeId}"]`);
  if (card) {
    card.classList.add("focused");
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function fitAllMapRoutes() {
  if (mapBounds?.isValid()) logisticsMap.fitBounds(mapBounds, { padding: [34, 34], maxZoom: 14 });
}

function renderMapLegend(routes, layers) {
  const legend = document.getElementById("mapLegend");
  if (!legend) return;
  if (!layers.showLegend || !layers.showDrivers) {
    legend.innerHTML = "";
    legend.style.display = "none";
    return;
  }
  legend.style.display = "block";
  const byDriver = {};
  routes.forEach((route) => {
    if (!byDriver[route.motoristaId]) {
      byDriver[route.motoristaId] = { ...route, count: 0, loads: 0 };
    }
    byDriver[route.motoristaId].count += 1;
    byDriver[route.motoristaId].loads += route.pedidos.length;
  });
  if (!Object.keys(byDriver).length) {
    legend.innerHTML = "<strong>Legenda</strong><small style='color:var(--muted);display:block;margin-top:6px'>Nenhuma rota visível</small>";
    return;
  }
  legend.innerHTML = `<strong>Legenda</strong>${Object.values(byDriver).map((item) => `
    <div class="legend-row">
      <span class="legend-color" style="background:${item.color}"></span>
      <div>
        <b>${item.motorista}</b>
        <small>${item.status} · ${item.veiculo} · ${item.loads} pedido(s)</small>
      </div>
    </div>
  `).join("")}`;
}

function getMapRouteViewData() {
  return mapRouteData;
}
