const DB_KEYS = {
  cargas: "madcenter:cargas",
  motoristas: "madcenter:motoristas",
  caminhoes: "madcenter:caminhoes",
  rotas: "madcenter:rotas",
  settings: "madcenter:settings",
  seeded: "madcenter:seeded",
  version: "madcenter:version",
  routeGeometryCache: "madcenter:routeGeometryCache"
};

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function readCollection(name) {
  return JSON.parse(localStorage.getItem(DB_KEYS[name]) || "[]");
}

function writeCollection(name, value) {
  localStorage.setItem(DB_KEYS[name], JSON.stringify(value));
}

function initStorage(force = false) {
  if (!localStorage.getItem(DB_KEYS.seeded) || force || localStorage.getItem(DB_KEYS.version) !== "map-osrm-v1") {
    writeCollection("cargas", cloneData(SEED_DATA.cargas));
    writeCollection("motoristas", cloneData(SEED_DATA.motoristas));
    writeCollection("caminhoes", cloneData(SEED_DATA.caminhoes));
    writeCollection("rotas", cloneData(SEED_DATA.rotas));
    localStorage.setItem(DB_KEYS.settings, JSON.stringify(cloneData(DEFAULT_SETTINGS)));
    localStorage.setItem(DB_KEYS.seeded, "true");
    localStorage.setItem(DB_KEYS.version, "map-osrm-v1");
    localStorage.setItem(DB_KEYS.routeGeometryCache, JSON.stringify({}));
  } else {
    migrateFreightFields();
  }
}

function migrateFreightFields() {
  const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(DB_KEYS.settings) || "{}") };
  localStorage.setItem(DB_KEYS.settings, JSON.stringify(settings));

  const cargas = getCargas().map((carga) => ({
    ...carga,
    origemEmpresa: carga.origemEmpresa || STORE_LOCATION.name,
    origemMunicipio: STORE_LOCATION.city,
    origemEstado: STORE_LOCATION.state,
    origemLat: Number(settings.latitudeLoja || STORE_LOCATION.lat),
    origemLng: Number(settings.longitudeLoja || STORE_LOCATION.lng),
    veiculoTipo: carga.veiculoTipo || suggestVehicleByWeight(Number(carga.peso || 0))?.id || "caminhonete",
    distanciaKm: Number(carga.distanciaKm || 0),
    valorFrete: Number(carga.valorFrete || 0)
  }));
  writeCollection("cargas", cargas);

  const rotas = getRotas().map((rota) => ({
    ...rota,
    origemMunicipio: STORE_LOCATION.city,
    origemEstado: STORE_LOCATION.state,
    veiculoTipo: rota.veiculoTipo || "caminhonete",
    freteTotal: Number(rota.freteTotal || rota.custo || 0)
  }));
  writeCollection("rotas", rotas);
  localStorage.setItem(DB_KEYS.version, "map-osrm-v1");
  if (!localStorage.getItem(DB_KEYS.routeGeometryCache)) {
    localStorage.setItem(DB_KEYS.routeGeometryCache, JSON.stringify({}));
  }
}

function clearAllData() {
  Object.values(DB_KEYS).forEach((key) => localStorage.removeItem(key));
}

function resetToEmptyData() {
  writeCollection("cargas", []);
  writeCollection("motoristas", []);
  writeCollection("caminhoes", []);
  writeCollection("rotas", []);
  localStorage.setItem(DB_KEYS.settings, JSON.stringify(cloneData(DEFAULT_SETTINGS)));
  localStorage.setItem(DB_KEYS.seeded, "true");
  localStorage.setItem(DB_KEYS.version, "map-osrm-v1");
  localStorage.setItem(DB_KEYS.routeGeometryCache, JSON.stringify({}));
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`;
}

function nextCode(prefix, items, field) {
  const max = items.reduce((acc, item) => {
    const num = Number(String(item[field] || "").replace(/\D/g, ""));
    return Number.isFinite(num) ? Math.max(acc, num) : acc;
  }, 1000);
  return `${prefix}-${max + 1}`;
}

function createItem(name, item) {
  const items = readCollection(name);
  items.push(item);
  writeCollection(name, items);
  return item;
}

function updateItem(name, id, patch) {
  const items = readCollection(name).map((item) => item.id === id ? { ...item, ...patch } : item);
  writeCollection(name, items);
  return items.find((item) => item.id === id);
}

function deleteItem(name, id) {
  writeCollection(name, readCollection(name).filter((item) => item.id !== id));
}

function getCargas() { return readCollection("cargas"); }
function saveCarga(data) {
  const cargas = getCargas();
  return createItem("cargas", { ...data, id: makeId("car"), codigo: nextCode("PD", cargas, "codigo") });
}
function updateCarga(id, data) { return updateItem("cargas", id, data); }
function deleteCarga(id) { deleteItem("cargas", id); }

function getMotoristas() { return readCollection("motoristas"); }
function saveMotorista(data) { return createItem("motoristas", { ...data, id: makeId("mot") }); }
function updateMotorista(id, data) { return updateItem("motoristas", id, data); }
function deleteMotorista(id) { deleteItem("motoristas", id); }

function getCaminhoes() { return readCollection("caminhoes"); }
function saveCaminhao(data) { return createItem("caminhoes", { ...data, id: makeId("cam") }); }
function updateCaminhao(id, data) { return updateItem("caminhoes", id, data); }
function deleteCaminhao(id) { deleteItem("caminhoes", id); }

function getRotas() { return readCollection("rotas"); }
function saveRota(data) {
  const rotas = getRotas();
  return createItem("rotas", { ...data, id: makeId("rot"), codigo: nextCode("RT", rotas, "codigo") });
}
function updateRota(id, data) { return updateItem("rotas", id, data); }
function deleteRota(id) { deleteItem("rotas", id); }

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(DB_KEYS.settings) || "{}") };
}

function saveSettings(data) {
  localStorage.setItem(DB_KEYS.settings, JSON.stringify({ ...getSettings(), ...data }));
}

function getRouteGeometryCache() {
  return JSON.parse(localStorage.getItem(DB_KEYS.routeGeometryCache) || "{}");
}

function getCachedRouteGeometry(key) {
  return getRouteGeometryCache()[key] || null;
}

function setCachedRouteGeometry(key, value) {
  const cache = getRouteGeometryCache();
  cache[key] = value;
  localStorage.setItem(DB_KEYS.routeGeometryCache, JSON.stringify(cache));
}

function clearRouteGeometryCache() {
  localStorage.setItem(DB_KEYS.routeGeometryCache, JSON.stringify({}));
}
