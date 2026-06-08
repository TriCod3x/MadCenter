"use strict";

// ── Configuração ─────────────────────────────────────────────────────────────

const API_BASE = window.location.port === "3000" ? "" : "http://localhost:3000";

// Coordenadas da loja (Timon/MA)
const STORE_LAT = -4.760287;
const STORE_LNG = -42.573777;
const moneyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Estado do formulário: coordenadas obtidas via CEP/geocodificação
let formState = { lat: null, lng: null };

// Estado do map picker
let _mapPicker = null;
let _mapPickerMarker = null;
let _mapPickerCoords = null;
let _mapPickerInitTimer = null;

// Data de hoje para filtrar pedidos
let todayStr = new Date().toISOString().slice(0, 10);

// Cache dos pedidos exibidos (para edição)
let _pedidosCache = [];

// ── API ───────────────────────────────────────────────────────────────────────

async function apiGet(url) {
  const res = await fetch(url);
  if (res.status === 401) { sair(); return; }
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
  if (res.status === 401) { sair(); return; }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

async function apiPost(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (res.status === 401) { sair(); return; }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function toast(msg) {
  const el = document.getElementById("atendToast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 3400);
}

// ── Máscaras ──────────────────────────────────────────────────────────────────

function applyCepMask(input) {
  let v = input.value.replace(/\D/g, "");
  if (v.length > 5) v = v.slice(0, 5) + "-" + v.slice(5, 8);
  input.value = v;
}

function applyPhoneMask(input) {
  const d = input.value.replace(/\D/g, "").slice(0, 11);
  if (!d) { input.value = ""; return; }
  let v;
  if (d.length <= 2)       v = `(${d}`;
  else if (d.length <= 6)  v = `(${d.slice(0, 2)}) ${d.slice(2)}`;
  else if (d.length <= 10) v = `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  else                     v = `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
  input.value = v;
}

// ── CEP / Geocodificação ──────────────────────────────────────────────────────

async function lookupCep(input) {
  const cep = input.value.replace(/\D/g, "");
  const msg = document.getElementById("cepMsg");
  if (cep.length !== 8) {
    if (cep.length > 0 && msg) { msg.textContent = "CEP incompleto."; msg.className = "atend-cep-msg err"; }
    return;
  }
  if (msg) { msg.textContent = "Buscando…"; msg.className = "atend-cep-msg"; }
  try {
    const res  = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();
    if (data.erro) {
      if (msg) { msg.textContent = "CEP não encontrado."; msg.className = "atend-cep-msg err"; }
      return;
    }
    if (data.logradouro) document.getElementById("fEndereco").value  = data.logradouro;
    if (data.uf)         document.getElementById("fEstado").value    = data.uf;
    if (data.localidade) document.getElementById("fMunicipio").value = data.localidade;
    if (msg) { msg.textContent = `✓ ${data.localidade}/${data.uf}`; msg.className = "atend-cep-msg ok"; }
    geocodificarEndereco(data);
  } catch {
    if (msg) { msg.textContent = "Erro ao buscar CEP."; msg.className = "atend-cep-msg err"; }
  }
}

async function geocodificarEndereco(viaCepData) {
  try {
    const parts = [viaCepData.logradouro, viaCepData.bairro, viaCepData.localidade, viaCepData.uf, "Brasil"].filter(Boolean);
    const url   = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(parts.join(", "))}&format=json&limit=1&countrycodes=br`;
    const res   = await fetch(url);
    const list  = await res.json();
    if (list.length) {
      formState.lat = Number(list[0].lat);
      formState.lng = Number(list[0].lon);
    }
  } catch { /* geocodificação falhou — frete não exibido */ }
}

// ── Cálculo de Frete (Haversine) ──────────────────────────────────────────────

function calcularDistanciaKm(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Carregar / Renderizar ─────────────────────────────────────────────────────

async function carregarPedidos(silencioso = false) {
  try {
    const todos = await apiGet(`${API_BASE}/api/pedidos`);
    const hoje  = filtrarHoje(todos);
    atualizarResumo(hoje);
    renderLista(hoje);
  } catch {
    if (!silencioso) {
      document.getElementById("pedidosList").innerHTML =
        `<div class="atend-empty">Erro ao carregar pedidos. Verifique a conexão.</div>`;
    }
  }
}

function filtrarHoje(pedidos) {
  const agora  = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const fim    = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
  return pedidos.filter(p => {
    const dtStr = p.created_at || p.criado_em || "";
    if (!dtStr) return false;
    const d = new Date(dtStr);
    return d >= inicio && d < fim;
  });
}

function atualizarResumo(hoje) {
  const total      = hoje.length;
  const aguardando = hoje.filter(p => p.status === "aguardando rota").length;
  const emRota     = hoje.filter(p => p.status === "em rota").length;
  document.getElementById("resumoCards").innerHTML = `
    <div class="atend-resumo-card">
      <div class="atend-resumo-icon">${Icons.package(22)}</div>
      <strong>${total}</strong><span>Pedidos hoje</span>
    </div>
    <div class="atend-resumo-card yellow">
      <div class="atend-resumo-icon">${Icons.clock(22)}</div>
      <strong>${aguardando}</strong><span>Aguardando rota</span>
    </div>
    <div class="atend-resumo-card blue">
      <div class="atend-resumo-icon">${Icons.truck(22)}</div>
      <strong>${emRota}</strong><span>Em rota</span>
    </div>
  `;
}

const STATUS_MAP = {
  "aguardando rota": { cls: "yellow", label: "Aguardando rota" },
  "em rota":         { cls: "blue",   label: "Em rota" },
  "entregue":        { cls: "green",  label: "Entregue" },
  "próximo dia":     { cls: "orange", label: "Próximo dia" },
  "cancelado":       { cls: "red",    label: "Cancelado" }
};

function renderLista(pedidos) {
  _pedidosCache = pedidos;
  const list = document.getElementById("pedidosList");
  if (!pedidos.length) {
    list.innerHTML = `<div class="atend-empty">Nenhum pedido cadastrado hoje.</div>`;
    return;
  }
  const sorted = [...pedidos].sort((a, b) =>
    (b.created_at || "").localeCompare(a.created_at || "")
  );
  const editavel = s => s !== "entregue" && s !== "em rota";
  list.innerHTML = sorted.map(p => {
    const st      = STATUS_MAP[p.status] || { cls: "yellow", label: p.status || "—" };
    const destino = [p.destino_municipio, p.destino_estado].filter(Boolean).join("/");
    return `
      <div class="atend-pedido-card" data-status="${p.status || ""}">
        <div class="atend-pedido-header">
          <span class="atend-pedido-code">${p.codigo || "—"}</span>
          <span class="atend-badge atend-badge-${st.cls}">${st.label}</span>
        </div>
        <div class="atend-pedido-row">
          <span class="atend-pedido-label">Cliente</span>
          <span class="atend-pedido-value">${p.cliente || "—"}${p.telefone ? ` · ${p.telefone}` : ""}</span>
        </div>
        <div class="atend-pedido-row">
          <span class="atend-pedido-label">Material</span>
          <span class="atend-pedido-value">${p.descricao || "—"} · ${p.peso || 0} kg</span>
        </div>
        <div class="atend-pedido-row">
          <span class="atend-pedido-label">Destino</span>
          <span class="atend-pedido-value">${destino || "—"}</span>
        </div>
        <div class="atend-pedido-actions">
          <button class="atend-btn atend-btn-edit"
            onclick="editarPedido('${p.id}')">
            ${Icons.edit(14)} Editar
          </button>
        </div>
      </div>
    `;
  }).join("");
}

// ── Salvar Pedido ─────────────────────────────────────────────────────────────

async function salvarPedido() {
  const btn = document.getElementById("salvarBtn");

  // Leitura dos campos
  const codigoInput      = document.getElementById("fCodigo").value.trim();
  const cliente          = document.getElementById("fCliente").value.trim();
  const telefone         = document.getElementById("fTelefone").value.trim();
  const descricao        = document.getElementById("fProduto").value.trim();
  const tipo             = document.getElementById("fCategoria").value;
  const pesoRaw          = document.getElementById("fPeso").value;
  const peso             = Number(pesoRaw || 0);
  const volume           = document.getElementById("fVolume").value.trim();
  const prioridade       = document.getElementById("fPrioridade").value;
  const cepDigits        = document.getElementById("fCep").value.replace(/\D/g, "");
  const enderecoEntrega  = document.getElementById("fEndereco").value.trim();
  const numero           = document.getElementById("fNumero").value.trim();
  const complemento      = document.getElementById("fComplemento").value.trim();
  const destinoMunicipio = document.getElementById("fMunicipio").value.trim();
  const destinoEstado    = document.getElementById("fEstado").value.trim().toUpperCase();
  const observacoes      = document.getElementById("fObs").value.trim();

  // Validações
  if (!cliente)                { toast("Preencha o nome do cliente."); return; }
  if (!telefone)               { toast("Preencha o telefone / WhatsApp."); return; }
  if (!descricao)              { toast("Preencha o produto / material."); return; }
  if (!peso || peso <= 0)      { toast("Preencha o peso em kg."); return; }
  if (cepDigits.length !== 8)  { toast("CEP inválido. Use 8 dígitos."); return; }
  if (!destinoMunicipio)       { toast("Preencha o município de destino."); return; }

  const distKm = (formState.lat && formState.lng)
    ? calcularDistanciaKm(STORE_LAT, STORE_LNG, formState.lat, formState.lng)
    : 0;

  const cepFormatado = `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}`;

  const payload = {
    ...(codigoInput ? { codigo: codigoInput } : {}),
    descricao,
    tipo,
    peso,
    volume:            volume           || null,
    cep:               cepFormatado,
    destino_municipio: destinoMunicipio,
    destino_estado:    destinoEstado    || "",
    endereco_entrega:  enderecoEntrega  || null,
    numero:            numero           || null,
    complemento:       complemento      || null,
    cliente,
    telefone,
    coleta:            null,
    entrega:           null,
    prioridade,
    veiculo_tipo:      null,
    distancia_km:      Number(distKm.toFixed(1)),
    valor_frete:       null,
    status:            "aguardando rota",
    observacoes:       observacoes      || null,
    lat:               formState.lat    || null,
    lng:               formState.lng    || null
  };

  btn.disabled   = true;
  btn.innerHTML  = "Salvando…";

  try {
    await apiPost(`${API_BASE}/api/pedidos`, payload);
    toast("Pedido cadastrado com sucesso!");
    limparFormulario();
    fecharFormulario();
    await carregarPedidos();
  } catch (e) {
    toast(`Erro ao salvar: ${e.message}`);
  } finally {
    btn.disabled  = false;
    btn.innerHTML = `${Icons.checkCircle(16)} Salvar Pedido`;
  }
}

function limparFormulario() {
  const ids = ["fCodigo", "fCliente", "fTelefone", "fProduto", "fVolume", "fCep",
               "fEndereco", "fNumero", "fComplemento", "fMunicipio",
               "fEstado", "fObs", "fPeso"];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  document.getElementById("fCategoria").value  = "Tintas";
  document.getElementById("fPrioridade").value = "normal";
  const cepMsg = document.getElementById("cepMsg");
  if (cepMsg) { cepMsg.textContent = ""; cepMsg.className = "atend-cep-msg"; }
  formState = { lat: null, lng: null };
  _destroyMapPickerAtend();
  _mapPickerCoords = null;
  const preview = document.getElementById("atendLocationPreview");
  if (preview) { preview.textContent = ""; preview.classList.add("hidden"); }
}

// ── Formulário show/hide ──────────────────────────────────────────────────────

function abrirFormulario() {
  document.getElementById("formSection").classList.remove("hidden");
  document.getElementById("toggleFormBtn").classList.add("hidden");
  // Scroll suave até o formulário
  setTimeout(() => {
    document.getElementById("formSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }, 50);
}

function fecharFormulario() {
  document.getElementById("formSection").classList.add("hidden");
  document.getElementById("toggleFormBtn").classList.remove("hidden");
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function sair() {
  sessionStorage.removeItem("madcenter_token");
  sessionStorage.removeItem("madcenter_nome");
  sessionStorage.removeItem("madcenter_perfil");
  window.location.href = "login.html";
}

function mostrarTelaPrincipal() {
  const nome = sessionStorage.getItem("madcenter_nome");
  const titulo = document.getElementById("atendHeaderTitle");
  if (titulo && nome) titulo.textContent = `${nome} — Madcenter`;
  todayStr = new Date().toISOString().slice(0, 10);
  carregarPedidos();
}

// ── Map Picker ─────────────────────────────────────────────────────────────────

function _destroyMapPickerAtend() {
  if (_mapPickerInitTimer) { clearTimeout(_mapPickerInitTimer); _mapPickerInitTimer = null; }
  if (_mapPicker) {
    if (_mapPickerMarker) {
      try { _mapPickerMarker.remove(); } catch (e) { /* ignore */ }
      _mapPickerMarker = null;
    }
    _mapPicker.off();
    try { _mapPicker.remove(); } catch (e) { /* ignore */ }
    _mapPicker = null;
  }
}

function openMapPickerAtendente() {
  const backdrop = document.getElementById("atendMapPickerBackdrop");
  backdrop.classList.add("active");
  document.getElementById("atendMapPickerInfo").textContent = "Clique no mapa para marcar o destino";

  _destroyMapPickerAtend();
  _mapPickerCoords = null;

  _mapPickerInitTimer = setTimeout(() => {
    _mapPickerInitTimer = null;
    const hasCoords = formState.lat && formState.lng;
    const initLat = hasCoords ? formState.lat : STORE_LAT;
    const initLng = hasCoords ? formState.lng : STORE_LNG;

    const pinIcon = L.divIcon({ html: "📍", className: "custom-pin", iconSize: [30, 30], iconAnchor: [15, 30] });

    _mapPicker = L.map("atendMapPickerContainer").setView([initLat, initLng], hasCoords ? 14 : 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>'
    }).addTo(_mapPicker);

    if (hasCoords) {
      _mapPickerCoords = { lat: initLat, lng: initLng };
      _mapPickerMarker = L.marker([initLat, initLng], { icon: pinIcon }).addTo(_mapPicker);
      document.getElementById("atendMapPickerInfo").textContent = "📍 Ponto atual marcado · Clique para mover";
    }

    _mapPicker.on("click", (e) => {
      const { lat, lng } = e.latlng;
      _mapPickerCoords = { lat, lng };
      if (_mapPickerMarker) {
        _mapPickerMarker.setLatLng(e.latlng);
      } else {
        _mapPickerMarker = L.marker(e.latlng, { icon: pinIcon }).addTo(_mapPicker);
      }
      document.getElementById("atendMapPickerInfo").textContent =
        `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)} — Clique em "Confirmar localização"`;
    });
  }, 80);
}

function closeMapPickerAtendente() {
  document.getElementById("atendMapPickerBackdrop").classList.remove("active");
  _destroyMapPickerAtend();
}

async function confirmMapLocationAtendente() {
  if (!_mapPickerCoords) {
    toast("Clique no mapa para marcar uma localização antes de confirmar.");
    return;
  }

  const { lat, lng } = _mapPickerCoords;
  formState.lat = lat;
  formState.lng = lng;

  closeMapPickerAtendente();

  const msg = document.getElementById("cepMsg");
  if (msg) { msg.textContent = "Buscando endereço…"; msg.className = "atend-cep-msg"; }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR`;
    const res = await fetch(url);
    const data = await res.json();

    if (data?.address) {
      const addr = data.address;
      const road = addr.road || addr.pedestrian || addr.footway || addr.street || "";
      const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
      const stateCode = addr.ISO3166_2_lvl4
        ? addr.ISO3166_2_lvl4.replace("BR-", "")
        : _getStateCodeAtend(addr.state || "");
      const postcode = (addr.postcode || "").replace(/\D/g, "");

      if (road)      document.getElementById("fEndereco").value  = road;
      if (stateCode) document.getElementById("fEstado").value    = stateCode;
      if (city)      document.getElementById("fMunicipio").value = city;
      if (postcode.length >= 8)
        document.getElementById("fCep").value = postcode.slice(0, 5) + "-" + postcode.slice(5, 8);

      const display = [road, city, stateCode].filter(Boolean).join(", ");
      if (msg) { msg.textContent = `✓ ${display || "Local marcado"}`; msg.className = "atend-cep-msg ok"; }

      const preview = document.getElementById("atendLocationPreview");
      if (preview) {
        preview.textContent = `📍 ${display || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}`;
        preview.classList.remove("hidden");
      }
    } else {
      if (msg) { msg.textContent = "✓ Local marcado."; msg.className = "atend-cep-msg ok"; }
      const preview = document.getElementById("atendLocationPreview");
      if (preview) {
        preview.textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        preview.classList.remove("hidden");
      }
    }
  } catch (e) {
    console.warn("Geocodificação reversa:", e);
    if (msg) { msg.textContent = "✓ Local marcado (endereço não encontrado)."; msg.className = "atend-cep-msg ok"; }
    const preview = document.getElementById("atendLocationPreview");
    if (preview) {
      preview.textContent = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      preview.classList.remove("hidden");
    }
  }
}

function _getStateCodeAtend(stateName) {
  const map = {
    "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amazonas": "AM",
    "Bahia": "BA", "Ceará": "CE", "Distrito Federal": "DF", "Espírito Santo": "ES",
    "Goiás": "GO", "Maranhão": "MA", "Mato Grosso": "MT", "Mato Grosso do Sul": "MS",
    "Minas Gerais": "MG", "Pará": "PA", "Paraíba": "PB", "Paraná": "PR",
    "Pernambuco": "PE", "Piauí": "PI", "Rio de Janeiro": "RJ", "Rio Grande do Norte": "RN",
    "Rio Grande do Sul": "RS", "Rondônia": "RO", "Roraima": "RR", "Santa Catarina": "SC",
    "São Paulo": "SP", "Sergipe": "SE", "Tocantins": "TO"
  };
  return map[stateName] || stateName.slice(0, 2).toUpperCase();
}

// ── Edição de pedido ─────────────────────────────────────────────────────────

function fecharModalEdicao() {
  document.getElementById("editModalBackdrop").classList.remove("active");
}

function editarPedido(id) {
  const p = _pedidosCache.find(x => x.id === id);
  if (!p) return;

  if (p.status === "entregue" || p.status === "em rota") {
    toast("Pedido em andamento, não pode ser editado.");
    return;
  }

  const cepFmt = (p.cep || "").replace(/\D/g, "");
  const cepDisplay = cepFmt.length === 8 ? `${cepFmt.slice(0, 5)}-${cepFmt.slice(5)}` : (p.cep || "");

  document.getElementById("editModalBody").innerHTML = `
    <form id="editForm" class="atend-edit-form">

      <div class="atend-section-card" style="margin-bottom:0;box-shadow:none;border:none;padding:0 0 16px">
        <h4 class="atend-edit-section-title">Cliente</h4>
        <div class="atend-form-grid">
          <div class="atend-field">
            <label for="eCodigo">Código do pedido</label>
            <input id="eCodigo" type="text" value="${p.codigo || ""}">
          </div>
          <div class="atend-field">
            <label for="eCliente">Nome do cliente *</label>
            <input id="eCliente" type="text" value="${p.cliente || ""}" required autocomplete="name">
          </div>
          <div class="atend-field">
            <label for="eTelefone">Telefone / WhatsApp</label>
            <input id="eTelefone" type="tel" value="${p.telefone || ""}" maxlength="16" autocomplete="tel">
          </div>
        </div>
      </div>

      <div class="atend-section-card" style="margin-bottom:0;box-shadow:none;border:none;padding:0 0 16px">
        <h4 class="atend-edit-section-title">Produto</h4>
        <div class="atend-form-grid">
          <div class="atend-field">
            <label for="eProduto">Produto / material *</label>
            <input id="eProduto" type="text" value="${p.descricao || ""}" required>
          </div>
          <div class="atend-field">
            <label for="eCategoria">Categoria</label>
            <select id="eCategoria">
              ${["Tintas","Elétrica","Hidráulica","Ferramentas","Pisos e revestimentos","Cimento e argamassa","Outros"]
                .map(o => `<option${p.tipo === o ? " selected" : ""}>${o}</option>`).join("")}
            </select>
          </div>
          <div class="atend-field">
            <label for="ePeso">Peso (kg) *</label>
            <input id="ePeso" type="number" value="${p.peso || ""}" min="0" step="0.1" required>
          </div>
          <div class="atend-field">
            <label for="ePrioridade">Prioridade</label>
            <select id="ePrioridade">
              ${["normal","alta","urgente"]
                .map(o => `<option value="${o}"${p.prioridade === o ? " selected" : ""}>${o.charAt(0).toUpperCase()+o.slice(1)}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>

      <div class="atend-section-card" style="margin-bottom:0;box-shadow:none;border:none;padding:0 0 16px">
        <h4 class="atend-edit-section-title">Entrega</h4>
        <div class="atend-form-grid">
          <div class="atend-field">
            <label for="eCep">CEP</label>
            <input id="eCep" type="text" value="${cepDisplay}" maxlength="9" inputmode="numeric">
          </div>
          <div class="atend-field">
            <label for="eEndereco">Endereço</label>
            <input id="eEndereco" type="text" value="${p.endereco_entrega || ""}">
          </div>
          <div class="atend-field">
            <label for="eNumero">Número</label>
            <input id="eNumero" type="text" value="${p.numero || ""}">
          </div>
          <div class="atend-field">
            <label for="eComplemento">Complemento</label>
            <input id="eComplemento" type="text" value="${p.complemento || ""}">
          </div>
          <div class="atend-field">
            <label for="eMunicipio">Município de destino *</label>
            <input id="eMunicipio" type="text" value="${p.destino_municipio || ""}" required>
          </div>
          <div class="atend-field">
            <label for="eEstado">Estado</label>
            <input id="eEstado" type="text" value="${p.destino_estado || ""}" maxlength="2">
          </div>
          <div class="atend-field">
            <label for="eDataEntrega">Data prevista de entrega</label>
            <input id="eDataEntrega" type="date" value="${p.entrega || ""}">
          </div>
          <div class="atend-field">
            <label for="eVeiculo">Tipo de veículo</label>
            <select id="eVeiculo">
              ${[["moto","Moto"],["caminhonete","Caminhonete"],["bau-leve","Caminhão baú leve"],["tres-quartos","Caminhão 3/4"],["carroceria-aberta","Caminhão carroceria aberta"]]
                .map(([v,l]) => `<option value="${v}"${p.veiculo_tipo === v ? " selected" : ""}>${l}</option>`).join("")}
            </select>
          </div>
          <div class="atend-field atend-field-full">
            <label for="eObs">Observações</label>
            <textarea id="eObs" rows="3">${p.observacoes || ""}</textarea>
          </div>
        </div>
      </div>

      <div class="atend-form-actions" style="margin-top:8px">
        <button type="button" class="atend-btn atend-btn-secondary" onclick="fecharModalEdicao()">Cancelar</button>
        <button type="submit" class="atend-btn atend-btn-primary">
          ${Icons.checkCircle(16)} Salvar alterações
        </button>
      </div>
    </form>
  `;

  document.getElementById("editForm").addEventListener("submit", e => {
    e.preventDefault();
    salvarEdicaoPedido(id);
  });

  const telEdit = document.getElementById("eTelefone");
  if (telEdit) telEdit.addEventListener("input", () => applyPhoneMask(telEdit));
  const cepEdit = document.getElementById("eCep");
  if (cepEdit) cepEdit.addEventListener("input", () => applyCepMask(cepEdit));

  document.getElementById("editModalBackdrop").classList.add("active");
}

async function salvarEdicaoPedido(id) {
  const cliente   = document.getElementById("eCliente").value.trim();
  const municipio = document.getElementById("eMunicipio").value.trim();
  const descricao = document.getElementById("eProduto").value.trim();
  const peso      = Number(document.getElementById("ePeso").value || 0);

  if (!cliente)   { toast("Preencha o nome do cliente.");        return; }
  if (!descricao) { toast("Preencha o produto / material.");     return; }
  if (!peso || peso <= 0) { toast("Preencha o peso em kg.");    return; }
  if (!municipio) { toast("Preencha o município de destino."); return; }

  const cepDigits = document.getElementById("eCep").value.replace(/\D/g, "");
  const payload = {
    codigo:            document.getElementById("eCodigo").value.trim() || undefined,
    cliente,
    telefone:          document.getElementById("eTelefone").value.trim() || null,
    descricao,
    tipo:              document.getElementById("eCategoria").value,
    peso,
    prioridade:        document.getElementById("ePrioridade").value,
    cep:               cepDigits.length === 8 ? `${cepDigits.slice(0,5)}-${cepDigits.slice(5)}` : undefined,
    endereco_entrega:  document.getElementById("eEndereco").value.trim()     || null,
    numero:            document.getElementById("eNumero").value.trim()        || null,
    complemento:       document.getElementById("eComplemento").value.trim()   || null,
    destino_municipio: municipio,
    destino_estado:    document.getElementById("eEstado").value.trim().toUpperCase() || null,
    entrega:           document.getElementById("eDataEntrega").value          || null,
    veiculo_tipo:      document.getElementById("eVeiculo").value,
    observacoes:       document.getElementById("eObs").value.trim()           || null
  };

  // Remove chaves undefined para não sobrescrever com null
  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

  const btn = document.querySelector("#editForm [type='submit']");
  if (btn) { btn.disabled = true; btn.innerHTML = "Salvando…"; }

  try {
    await apiPut(`${API_BASE}/api/pedidos/${id}`, payload);
    toast("Pedido atualizado com sucesso!");
    fecharModalEdicao();
    await carregarPedidos();
  } catch (e) {
    toast(`Erro ao salvar: ${e.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `${Icons.checkCircle(16)} Salvar alterações`; }
  }
}

// ── Tema claro/escuro ─────────────────────────────────────────────────────────

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


// ── Inicialização ─────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Tema (já aplicado no <head>; aqui só sincroniza o ícone e o listener)
  aplicarTema(localStorage.getItem("madcenter_tema") || "dark");
  const themeBtn = document.getElementById("themeToggle");
  if (themeBtn) themeBtn.addEventListener("click", alternarTema);

  // Verificação de autenticação
  const token  = sessionStorage.getItem("madcenter_token");
  const perfil = sessionStorage.getItem("madcenter_perfil");
  if (!token || perfil !== "atendente") {
    window.location.replace("login.html");
    return;
  }

  mostrarTelaPrincipal();

  document.getElementById("logoutBtn").addEventListener("click", sair);

  // Formulário
  document.getElementById("toggleFormBtn").addEventListener("click", abrirFormulario);
  document.getElementById("cancelFormBtn").addEventListener("click", () => {
    limparFormulario();
    fecharFormulario();
  });
  document.getElementById("salvarBtn").addEventListener("click", salvarPedido);

  // CEP
  const cepInput = document.getElementById("fCep");
  cepInput.addEventListener("input",  () => applyCepMask(cepInput));
  cepInput.addEventListener("blur",   () => lookupCep(cepInput));

  // Telefone
  const telInput = document.getElementById("fTelefone");
  telInput.addEventListener("input", () => applyPhoneMask(telInput));

  // Modal de edição
  document.getElementById("editModalClose").addEventListener("click", fecharModalEdicao);
  document.getElementById("editModalBackdrop").addEventListener("click", e => {
    if (e.target === e.currentTarget) fecharModalEdicao();
  });

  // Map picker
  document.getElementById("btnMapPickerAtend").addEventListener("click", openMapPickerAtendente);
  document.getElementById("atendMapPickerClose").addEventListener("click", closeMapPickerAtendente);
  document.getElementById("atendMapPickerCancel").addEventListener("click", closeMapPickerAtendente);
  document.getElementById("atendMapPickerConfirm").addEventListener("click", confirmMapLocationAtendente);
  document.getElementById("atendMapPickerBackdrop").addEventListener("click", e => {
    if (e.target === e.currentTarget) closeMapPickerAtendente();
  });
});
