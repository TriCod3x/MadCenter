const DB_KEYS = {
  cargas: "madcenter:cargas",
  motoristas: "madcenter:motoristas",
  rotas: "madcenter:rotas",
  settings: "madcenter:settings",
  seeded: "madcenter:seeded",
  version: "madcenter:version"
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
  if (!localStorage.getItem(DB_KEYS.seeded) || force || localStorage.getItem(DB_KEYS.version) !== "madcenter-v1") {
    writeCollection("cargas", cloneData(SEED_DATA.cargas));
    writeCollection("motoristas", cloneData(SEED_DATA.motoristas));
    writeCollection("rotas", cloneData(SEED_DATA.rotas));
    localStorage.setItem(DB_KEYS.settings, JSON.stringify(cloneData(DEFAULT_SETTINGS)));
    localStorage.setItem(DB_KEYS.seeded, "true");
    localStorage.setItem(DB_KEYS.version, "madcenter-v1");
  }
}

function clearAllData() {
  Object.values(DB_KEYS).forEach((key) => localStorage.removeItem(key));
}

function resetToEmptyData() {
  writeCollection("cargas", []);
  writeCollection("motoristas", []);
  writeCollection("rotas", []);
  localStorage.setItem(DB_KEYS.settings, JSON.stringify(cloneData(DEFAULT_SETTINGS)));
  localStorage.setItem(DB_KEYS.seeded, "true");
  localStorage.setItem(DB_KEYS.version, "madcenter-v1");
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
function saveCarga(data) { return createItem("cargas", { ...data, id: makeId("car"), codigo: nextCode("PD", getCargas(), "codigo") }); }
function updateCarga(id, data) { return updateItem("cargas", id, data); }
function deleteCarga(id) { deleteItem("cargas", id); }

function getMotoristas() { return readCollection("motoristas"); }
function saveMotorista(data) { return createItem("motoristas", { ...data, id: makeId("mot") }); }
function updateMotorista(id, data) { return updateItem("motoristas", id, data); }
function deleteMotorista(id) { deleteItem("motoristas", id); }

function getRotas() { return readCollection("rotas"); }
function saveRota(data) { return createItem("rotas", { ...data, id: makeId("rot"), codigo: nextCode("RT", getRotas(), "codigo") }); }
function updateRota(id, data) { return updateItem("rotas", id, data); }
function deleteRota(id) { deleteItem("rotas", id); }

function getSettings() {
  return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(DB_KEYS.settings) || "{}") };
}

function saveSettings(data) {
  localStorage.setItem(DB_KEYS.settings, JSON.stringify({ ...getSettings(), ...data }));
}
