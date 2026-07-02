"use strict";

// ── Token ─────────────────────────────────────────────────────────────────────

function getToken() {
  return sessionStorage.getItem("madcenter_token");
}

// ── Google Maps (carregamento async) ───────────────────────────────────────────
// A Maps JS API é carregada com loading=async; o callback global (definido inline
// no HTML, antes do script) resolve a promise abaixo. Use `await ensureGoogleMaps()`
// antes de tocar em `google.maps.*`.
function ensureGoogleMaps() {
  if (window.google && window.google.maps) return Promise.resolve();
  return window._googleMapsReady || Promise.resolve();
}

// ── Estilo de mapa ──────────────────────────────────────────────────────────────
// Estilo limpo compartilhado por todos os google.maps.Map do app: esconde POIs
// comerciais e ícones de trânsito que poluem o mapa e sobrepõem os marcadores de
// entrega, mantendo ruas, bairros e labels de localização legíveis.
const MAP_STYLE_CLEAN = [
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.attraction", stylers: [{ visibility: "off" }] },
  { featureType: "poi.medical", stylers: [{ visibility: "off" }] },
  { featureType: "poi.place_of_worship", stylers: [{ visibility: "off" }] },
  { featureType: "poi.sports_complex", stylers: [{ visibility: "off" }] },
  // Parques mantidos como referência visual, mas sem ícone de negócio.
  { featureType: "poi.park", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  // Remove ícones/labels de transporte público (estações, pontos, etc.).
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

// ── Status de pedido (paleta compartilhada) ────────────────────────────────────
// Fonte única para cor + rótulo por status de pedido, reusada nos InfoWindows e badges.
const PEDIDO_STATUS_META = {
  "em rota":              { label: "Em rota",              color: "#3b82f6" },
  "planejado":            { label: "Planejado",            color: "#eab308" },
  "entregue":             { label: "Entregue",             color: "#22c55e" },
  "cancelado":            { label: "Cancelado",            color: "#ef4444" },
  "aguardando motorista": { label: "Aguardando motorista", color: "#6b7280" },
};

function pedidoStatusMeta(status) {
  return PEDIDO_STATUS_META[status] || { label: status || "—", color: "#6b7280" };
}

// ── InfoWindow (conteúdo padronizado) ──────────────────────────────────────────
// Gera o HTML de um InfoWindow do Google Maps com hierarquia clara: título em
// destaque, subtítulo, badge de status colorido e linhas extras. Estilos inline
// porque o balão do InfoWindow é sempre branco (independe do tema) e fica fora do
// escopo do CSS das páginas.
function buildInfoWindowHtml({ titulo, subtitulo, status, badge, linhas = [] } = {}) {
  const meta = badge || (status ? pedidoStatusMeta(status) : null);
  const badgeHtml = meta
    ? `<span style="display:inline-block;margin-top:6px;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;color:#fff;background:${meta.color}">${meta.label}</span>`
    : "";
  const linhasHtml = linhas
    .filter(Boolean)
    .map((l) => `<div style="font-size:11.5px;color:#6b7280;margin-top:4px">${l}</div>`)
    .join("");
  return `
    <div style="min-width:150px;max-width:240px;font-family:inherit;line-height:1.35;padding:2px 2px 4px">
      <div style="font-weight:700;font-size:14px;color:#111827">${titulo ?? "—"}</div>
      ${subtitulo ? `<div style="font-size:12.5px;color:#374151;margin-top:2px">${subtitulo}</div>` : ""}
      ${badgeHtml}
      ${linhasHtml}
    </div>
  `.trim();
}

// ── Formatação de distância / duração ──────────────────────────────────────────
function fmtDistancia(metros) {
  if (!metros || metros < 0) return null;
  return metros < 1000 ? `${Math.round(metros)} m` : `${(metros / 1000).toFixed(1)} km`;
}

function fmtDuracao(segundos) {
  if (!segundos || segundos < 0) return null;
  const min = Math.round(segundos / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function sair() {
  sessionStorage.removeItem("madcenter_token");
  sessionStorage.removeItem("madcenter_nome");
  sessionStorage.removeItem("madcenter_perfil");
  window.location.href = "login.html";
}

function verificarSessao(perfilEsperado) {
  const token = getToken();
  if (!token) { window.location.replace("login.html"); return false; }
  if (perfilEsperado) {
    const perfil = sessionStorage.getItem("madcenter_perfil");
    if (perfil !== perfilEsperado) { window.location.replace("login.html"); return false; }
  }
  return true;
}

// ── API helpers (com JWT) ─────────────────────────────────────────────────────

async function apiGet(url) {
  const token = getToken();
  const headers = token ? { "Authorization": `Bearer ${token}` } : {};
  const res = await fetch(url, { headers });
  if (res.status === 401) { sair(); return; }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

async function apiPost(url, data) {
  const token = getToken();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {})
    },
    body: JSON.stringify(data)
  });
  if (res.status === 401) { sair(); return; }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

async function apiPut(url, data) {
  const token = getToken();
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {})
    },
    body: JSON.stringify(data)
  });
  if (res.status === 401) { sair(); return; }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

async function apiDelete(url) {
  const token = getToken();
  const headers = token ? { "Authorization": `Bearer ${token}` } : {};
  const res = await fetch(url, { method: "DELETE", headers });
  if (res.status === 401) { sair(); return; }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

async function apiPatch(url, data) {
  const token = getToken();
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {})
    },
    body: data !== undefined ? JSON.stringify(data) : undefined
  });
  if (res.status === 401) { sair(); return; }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg, tipo = "ok") {
  const el = document.querySelector("#toast, #atendToast, #motoToast");
  if (!el) return;
  if (el.id === "motoToast") {
    el.textContent = msg;
    el.className = `moto-toast moto-toast-${tipo} moto-toast-show`;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("moto-toast-show"), 3200);
  } else {
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 3400);
  }
}

// ── Tema ──────────────────────────────────────────────────────────────────────

function aplicarTema(tema) {
  document.documentElement.setAttribute("data-theme", tema);
  const btn = document.getElementById("themeToggle");
  if (btn) btn.innerHTML = tema === "dark" ? Icons.sun(16) : Icons.moon(16);
}

function alternarTema() {
  const atual = document.documentElement.getAttribute("data-theme") || "dark";
  const novo  = atual === "dark" ? "light" : "dark";
  localStorage.setItem("madcenter_tema", novo);
  aplicarTema(novo);
}

// ── Máscaras ──────────────────────────────────────────────────────────────────

function mascararTelefone(input) {
  const d = input.value.replace(/\D/g, "").slice(0, 11);
  if (!d) { input.value = ""; return; }
  let v;
  if (d.length <= 2)       v = `(${d}`;
  else if (d.length <= 6)  v = `(${d.slice(0, 2)}) ${d.slice(2)}`;
  else if (d.length <= 10) v = `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  else                     v = `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
  input.value = v;
}

// ── CEP ───────────────────────────────────────────────────────────────────────

async function buscarCEP(cep) {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const res  = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  const data = await res.json();
  return data.erro ? null : data;
}
