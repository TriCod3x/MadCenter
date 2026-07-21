"use strict";

// ── Configuração ─────────────────────────────────────────────────────────────

const API_BASE = window.location.hostname === "localhost" ? "http://localhost:3001" : "";

// Coordenadas da loja (José de Freitas/PI)
const STORE_LAT = -4.760287;
const STORE_LNG = -42.573777;
const moneyFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Estado do formulário: coordenadas obtidas via CEP/geocodificação
let formState = { lat: null, lng: null, geoPreciso: null };

// Estado do map picker
let _mapPicker = null;
let _mapPickerMarker = null;
let _mapPickerCoords = null;
let _mapPickerInitTimer = null;
// Evita reabrir o picker a cada blur quando o endereço é aproximado — abre só uma vez;
// o destaque no botão e o toast continuam sinalizando nas vezes seguintes.
let _pickerAutoAbertoAprox = false;

// Data de hoje para filtrar pedidos
let todayStr = new Date().toISOString().slice(0, 10);

// Cache dos pedidos exibidos (para edição)
let _pedidosCache = [];

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

// Geocode forward a partir do CEP (via ViaCEP).
async function geocodificarEndereco(viaCepData) {
  const parts = [viaCepData.logradouro, viaCepData.bairro, viaCepData.localidade, viaCepData.uf, "Brasil"].filter(Boolean);
  // Estimativa inicial pelo CEP (sem número) — preenche lat/lng, mas não avisa nem abre o
  // picker, pois rua-sem-número cai em GEOMETRIC_CENTER até em cidades mapeadas (falso alarme).
  await aplicarGeocodeForward(parts.join(", "), { origem: "cep", avisar: false });
}

// Geocode forward a partir do endereço digitado no formulário (disparado no blur do campo).
// Concatena o número ao logradouro para dar precisão à consulta em cidades que o Google
// tem mapeadas (José de Freitas cai no centroide de qualquer forma — ver aplicarGeocodeForward).
// Só aciona aviso/auto-open do picker quando o endereço está completo (rua + número); sem
// número o resultado é sempre aproximado e dispararia o alerta à toa.
async function geocodificarEnderecoDigitado() {
  const road   = document.getElementById("fEndereco").value.trim();
  const numero = document.getElementById("fNumero").value.trim();
  const city   = document.getElementById("fMunicipio").value.trim();
  const uf     = document.getElementById("fEstado").value.trim();
  if (!road && !city) return;
  const logradouro = [road, numero].filter(Boolean).join(", ");
  const parts = [logradouro, city, uf, "Brasil"].filter(Boolean);
  await aplicarGeocodeForward(parts.join(", "), { origem: "endereco", avisar: numero !== "" });
}

// Chama /api/geocode?q= e aplica lat/lng em formState, preenche campos vazios com os
// componentes retornados (CEP/município/estado) e sincroniza o marcador do picker se aberto.
async function aplicarGeocodeForward(query, { origem, avisar = true } = {}) {
  const msg = document.getElementById("cepMsg");
  try {
    const geo = await apiGet(`${API_BASE}/api/geocode?q=${encodeURIComponent(query)}`);
    if (!geo || geo.lat == null || geo.lng == null) return;
    const lat = Number(geo.lat);
    const lng = Number(geo.lng);
    formState.lat = lat;
    formState.lng = lng;
    // geo.preciso: true = endereço exato (ROOFTOP/RANGE_INTERPOLATED); false = centroide
    // aproximado (ruas sem geometria no Google, ex.: José de Freitas).
    const preciso = geo.preciso === true;
    formState.geoPreciso = preciso;

    // Preenche apenas campos vazios para não sobrescrever o que o usuário digitou.
    const setIfEmpty = (id, val) => {
      const el = document.getElementById(id);
      if (el && val && !el.value.trim()) el.value = val;
    };
    setIfEmpty("fMunicipio", geo.city);
    setIfEmpty("fEstado", geo.stateCode);
    if (geo.postcode && geo.postcode.length >= 8) {
      const cepEl = document.getElementById("fCep");
      if (cepEl && !cepEl.value.trim()) cepEl.value = geo.postcode.slice(0, 5) + "-" + geo.postcode.slice(5, 8);
    }

    const display = [document.getElementById("fEndereco").value.trim(), document.getElementById("fMunicipio").value.trim(), document.getElementById("fEstado").value.trim()].filter(Boolean).join(", ");

    const preview = document.getElementById("atendLocationPreview");
    if (preview) {
      preview.textContent = `📍 ${display || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}`;
      preview.classList.remove("hidden");
    }
    atualizarFretePreview();

    // Sincroniza o marcador do picker se estiver aberto.
    if (_mapPicker) {
      const pos = { lat, lng };
      if (_mapPickerMarker) _mapPickerMarker.setPosition(pos);
      else _mapPickerMarker = new google.maps.Marker({ position: pos, map: _mapPicker });
      _mapPicker.setCenter(pos);
      _mapPicker.setZoom(15);
      _mapPickerCoords = { lat, lng };
      const info = document.getElementById("atendMapPickerInfo");
      if (info) info.textContent = "📍 Ponto atualizado pelo endereço · Clique para mover";
    }

    // Aviso/auto-open só quando o endereço está completo (avisar=true). Geocodes parciais
    // (CEP ou endereço sem número) só preenchem lat/lng como estimativa, sem alarme falso.
    if (avisar) {
      if (preciso) {
        destacarBotaoMapPickerAtend(false);
        _pickerAutoAbertoAprox = false;
        if (origem === "endereco" && msg) { msg.textContent = `✓ ${display || "Endereço localizado"}`; msg.className = "atend-cep-msg ok"; }
      } else {
        // Ponto aproximado: o centroide não representa a entrega. Avisa e força ajuste manual.
        if (msg) { msg.textContent = `⚠️ Endereço aproximado — ajuste o ponto exato clicando no mapa`; msg.className = "atend-cep-msg warn"; }
        showToast("⚠️ Endereço aproximado — ajuste o ponto exato clicando no mapa");
        destacarBotaoMapPickerAtend(true);
        // Abre o picker automaticamente só na primeira vez, para não reabrir a cada blur.
        if (!_mapPicker && !_pickerAutoAbertoAprox) { _pickerAutoAbertoAprox = true; openMapPickerAtendente(); }
      }
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

// Config de frete (custo_km/adicional/mínimo) — carregada uma vez para o preview.
// O valor DEFINITIVO é calculado no backend ao salvar; aqui é só estimativa read-only.
let _freteConfig = null;
async function getFreteConfig() {
  if (_freteConfig) return _freteConfig;
  try {
    const cfg = await apiGet(`${API_BASE}/api/configuracoes`);
    _freteConfig = {
      custoKm:            Number(cfg?.custo_km || 0),
      custoAdicionalFixo: Number(cfg?.custo_adicional_fixo || 0),
      freteMinimo:        Number(cfg?.frete_minimo || 0),
    };
  } catch {
    _freteConfig = { custoKm: 0, custoAdicionalFixo: 0, freteMinimo: 0 };
  }
  return _freteConfig;
}

// Mostra a SUGESTÃO de frete (referência) assim que há coordenada. O campo de frete
// é editável — o atendente decide o valor final; se deixar em branco, o backend calcula
// por esta mesma fórmula: max(dist*custo_km + fixo, minimo). Some quando não há lat/lng.
async function atualizarFretePreview() {
  const el = document.getElementById("atendFretePreview");
  if (!el) return;
  if (!formState.lat || !formState.lng) { el.classList.add("hidden"); return; }
  const distKm = calcularDistanciaKm(STORE_LAT, STORE_LNG, formState.lat, formState.lng);
  const cfg = await getFreteConfig();
  const frete = Math.max(distKm * cfg.custoKm + cfg.custoAdicionalFixo, cfg.freteMinimo);
  el.innerHTML = `Sugestão: <strong>${moneyFmt.format(frete)}</strong> · ${distKm.toFixed(1)} km`;
  el.classList.remove("hidden");
}

// ── Carregar / Renderizar ─────────────────────────────────────────────────────

async function carregarPedidos(silencioso = false) {
  try {
    const todos = await apiGet(`${API_BASE}/api/pedidos`);
    const hoje  = filtrarHoje(todos);
    const mes   = filtrarMes(todos);
    atualizarResumo(hoje, mes);
    renderLista(hoje);
    renderPedidosMes(mes);
  } catch {
    if (!silencioso) {
      document.getElementById("pedidosList").innerHTML =
        `<div class="atend-empty">Erro ao carregar pedidos. Verifique a conexão.</div>`;
      const sec = document.getElementById("pedidosMesSection");
      if (sec) sec.innerHTML = `<div class="atend-empty">Erro ao carregar pedidos do mês.</div>`;
    }
  }
}

function filtrarHoje(pedidos) {
  const agora  = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const fim    = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
  return pedidos.filter(p => {
    const dtStr = p.criado_em || "";
    if (!dtStr) return false;
    const d = new Date(dtStr);
    return d >= inicio && d < fim;
  });
}

function filtrarMes(pedidos) {
  const agora  = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fim    = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
  return pedidos.filter(p => {
    const dtStr = p.criado_em || "";
    if (!dtStr) return false;
    const d = new Date(dtStr);
    return d >= inicio && d < fim;
  });
}

function atualizarResumo(hoje, mes) {
  const total        = hoje.length;
  const aguardando   = hoje.filter(p => p.status === "aguardando motorista").length;
  const emRota       = hoje.filter(p => p.status === "em rota").length;
  const entregueHoje = hoje.filter(p => p.status === "entregue").length;
  const totalMes     = (mes || []).length;
  document.getElementById("resumoCards").innerHTML = `
    <div class="atend-resumo-card">
      <div class="atend-resumo-icon">${Icons.package(22)}</div>
      <strong>${total}</strong><span>Pedidos hoje</span>
    </div>
    <div class="atend-resumo-card yellow">
      <div class="atend-resumo-icon">${Icons.clock(22)}</div>
      <strong>${aguardando}</strong><span>Aguardando motorista</span>
    </div>
    <div class="atend-resumo-card blue">
      <div class="atend-resumo-icon">${Icons.truck(22)}</div>
      <strong>${emRota}</strong><span>Em rota</span>
    </div>
    <div class="atend-resumo-card green">
      <div class="atend-resumo-icon">${Icons.checkCircle(22)}</div>
      <strong>${entregueHoje}</strong><span>Entregues hoje</span>
    </div>
    <div class="atend-resumo-card teal">
      <div class="atend-resumo-icon">${Icons.calendar(22)}</div>
      <strong>${totalMes}</strong><span>Total do mês</span>
    </div>
  `;
}

const STATUS_MAP = {
  "aguardando motorista": { cls: "gray",   label: "Aguardando motorista" },
  "planejado":            { cls: "orange", label: "Planejado" },
  "em rota":              { cls: "blue",   label: "Em rota" },
  "entregue":             { cls: "green",  label: "Entregue" },
  "próximo dia":          { cls: "purple", label: "Próximo dia" },
  "cancelado":            { cls: "red",    label: "Cancelado" }
};

function renderLista(pedidos) {
  _pedidosCache = pedidos;
  const list = document.getElementById("pedidosList");
  if (!pedidos.length) {
    list.innerHTML = `<div class="atend-empty">Nenhum pedido cadastrado hoje.</div>`;
    return;
  }
  const sorted = [...pedidos].sort((a, b) =>
    (b.criado_em || "").localeCompare(a.criado_em || "")
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

let _mesPedidosCache = [];

function renderPedidosMes(mes) {
  const sec = document.getElementById("pedidosMesSection");
  if (!sec) return;

  const totalMes   = mes.length;
  const entregues  = mes.filter(p => p.status === "entregue").length;
  const aguardando = mes.filter(p => ["aguardando motorista", "próximo dia"].includes(p.status)).length;
  const frete      = mes.reduce((s, p) => s + Number(p.valor_frete || 0), 0);

  _mesPedidosCache = [...mes].sort((a, b) =>
    (b.criado_em || "").localeCompare(a.criado_em || "")
  ).slice(0, 50);

  sec.innerHTML = `
    <div class="atend-mes-stats">
      <span>Este mês: <strong>${totalMes}</strong> pedidos</span>
      <span class="atend-dot">·</span>
      <span><strong>${entregues}</strong> entregues</span>
      <span class="atend-dot">·</span>
      <span><strong>${aguardando}</strong> aguardando</span>
      <span class="atend-dot">·</span>
      <span><strong>${moneyFmt.format(frete)}</strong> em fretes</span>
    </div>
    <div class="atend-mes-filtros">
      <input
        id="mesBusca"
        class="atend-mes-busca"
        type="search"
        placeholder="Buscar por código, cliente, material ou destino…"
      >
      <select id="mesStatus" class="atend-mes-select">
        <option value="">Todos os status</option>
        <option value="aguardando motorista">Aguardando motorista</option>
        <option value="em rota">Em rota</option>
        <option value="entregue">Entregue</option>
        <option value="planejado">Planejado</option>
        <option value="cancelado">Cancelado</option>
      </select>
    </div>
    <p class="atend-mes-counter" id="mesCounter"></p>
    <div class="atend-table-wrap">
      <table class="atend-mes-table">
        <thead><tr>
          <th>Código</th><th>Cliente</th><th>Material</th>
          <th>Destino</th><th>Peso</th><th>Status</th><th>Data</th>
        </tr></thead>
        <tbody id="mesTbody"></tbody>
      </table>
    </div>
  `;

  _aplicarFiltrosMes();

  document.getElementById("mesBusca").addEventListener("input", _aplicarFiltrosMes);
  document.getElementById("mesStatus").addEventListener("change", _aplicarFiltrosMes);
}

function _aplicarFiltrosMes() {
  const busca  = (document.getElementById("mesBusca")?.value  || "").toLowerCase();
  const status = (document.getElementById("mesStatus")?.value || "");
  const tbody  = document.getElementById("mesTbody");
  const counter = document.getElementById("mesCounter");
  if (!tbody) return;

  const filtrados = _mesPedidosCache.filter(p => {
    if (status && p.status !== status) return false;
    if (!busca) return true;
    const dest = [p.destino_municipio, p.destino_estado].filter(Boolean).join("/");
    return (
      (p.codigo      || "").toLowerCase().includes(busca) ||
      (p.cliente     || "").toLowerCase().includes(busca) ||
      (p.descricao   || "").toLowerCase().includes(busca) ||
      dest.toLowerCase().includes(busca)
    );
  });

  if (counter) {
    counter.textContent = `Exibindo ${filtrados.length} de ${_mesPedidosCache.length} pedidos`;
  }

  if (!filtrados.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="atend-mes-vazio">Nenhum pedido encontrado com os filtros aplicados.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtrados.map(p => {
    const st    = STATUS_MAP[p.status] || { cls: "gray", label: p.status || "—" };
    const dest  = [p.destino_municipio, p.destino_estado].filter(Boolean).join("/");
    const dtStr = p.criado_em || "";
    const data  = dtStr ? new Date(dtStr).toLocaleDateString("pt-BR") : "—";
    return `<tr>
      <td><strong class="atend-code-cell">${p.codigo || "—"}</strong></td>
      <td>${p.cliente || "—"}</td>
      <td>${p.descricao || "—"}</td>
      <td>${dest || "—"}</td>
      <td>${p.peso || 0} kg</td>
      <td><span class="atend-badge atend-badge-${st.cls}">${st.label}</span></td>
      <td>${data}</td>
    </tr>`;
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
  // Frete digitado pelo atendente. Em branco/0 → null, para o backend calcular pela
  // fórmula (config global) como fallback e ninguém ficar sem frete por esquecimento.
  const freteRaw         = document.getElementById("fFrete").value.trim();
  const freteNum         = Number(freteRaw);
  const valorFrete       = (freteRaw !== "" && Number.isFinite(freteNum) && freteNum > 0) ? freteNum : null;

  // Validações
  if (!cliente)                { showToast("Preencha o nome do cliente."); return; }
  if (!telefone)               { showToast("Preencha o telefone / WhatsApp."); return; }
  if (!descricao)              { showToast("Preencha o produto / material."); return; }
  if (!peso || peso <= 0)      { showToast("Preencha o peso em kg."); return; }
  if (cepDigits.length !== 8)  { showToast("CEP inválido. Use 8 dígitos."); return; }
  if (!destinoMunicipio)       { showToast("Preencha o município de destino."); return; }

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
    valor_frete:       valorFrete,
    status:            "aguardando motorista",
    observacoes:       observacoes      || null,
    lat:               formState.lat    || null,
    lng:               formState.lng    || null,
    geo_preciso:       typeof formState.geoPreciso === "boolean" ? formState.geoPreciso : null
  };

  btn.disabled   = true;
  btn.innerHTML  = "Salvando…";

  try {
    await apiPost(`${API_BASE}/api/pedidos`, payload);
    showToast("Pedido cadastrado com sucesso!");
    limparFormulario();
    fecharFormulario();
    await carregarPedidos();
  } catch (e) {
    showToast(`Erro ao salvar: ${e.message}`);
  } finally {
    btn.disabled  = false;
    btn.innerHTML = `${Icons.checkCircle(16)} Salvar Pedido`;
  }
}

function limparFormulario() {
  const ids = ["fCodigo", "fCliente", "fTelefone", "fProduto", "fVolume", "fCep",
               "fEndereco", "fNumero", "fComplemento", "fMunicipio",
               "fEstado", "fObs", "fPeso", "fFrete"];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  document.getElementById("fCategoria").value  = "Tintas";
  document.getElementById("fPrioridade").value = "normal";
  const cepMsg = document.getElementById("cepMsg");
  if (cepMsg) { cepMsg.textContent = ""; cepMsg.className = "atend-cep-msg"; }
  destacarBotaoMapPickerAtend(false);
  _pickerAutoAbertoAprox = false;
  formState = { lat: null, lng: null, geoPreciso: null };
  _destroyMapPickerAtend();
  _mapPickerCoords = null;
  const preview = document.getElementById("atendLocationPreview");
  if (preview) { preview.textContent = ""; preview.classList.add("hidden"); }
  const fretePreview = document.getElementById("atendFretePreview");
  if (fretePreview) { fretePreview.textContent = ""; fretePreview.classList.add("hidden"); }
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
  if (_mapPickerMarker) {
    try { _mapPickerMarker.setMap(null); } catch (e) { /* ignore */ }
    _mapPickerMarker = null;
  }
  if (_mapPicker) {
    try { google.maps.event.clearInstanceListeners(_mapPicker); } catch (e) { /* ignore */ }
    _mapPicker = null;
  }
}

function openMapPickerAtendente() {
  const backdrop = document.getElementById("atendMapPickerBackdrop");
  backdrop.classList.add("active");
  document.getElementById("atendMapPickerInfo").textContent = "Clique no mapa para marcar o destino";

  _destroyMapPickerAtend();
  _mapPickerCoords = null;

  _mapPickerInitTimer = setTimeout(async () => {
    _mapPickerInitTimer = null;
    await ensureGoogleMaps();
    const hasCoords = formState.lat && formState.lng;
    const initLat = hasCoords ? formState.lat : STORE_LAT;
    const initLng = hasCoords ? formState.lng : STORE_LNG;

    _mapPicker = new google.maps.Map(document.getElementById("atendMapPickerContainer"), {
      center: { lat: initLat, lng: initLng },
      zoom: hasCoords ? 14 : 11,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      styles: MAP_STYLE_CLEAN,
    });

    if (hasCoords) {
      _mapPickerCoords = { lat: initLat, lng: initLng };
      _mapPickerMarker = new google.maps.Marker({ position: { lat: initLat, lng: initLng }, map: _mapPicker });
      document.getElementById("atendMapPickerInfo").textContent = "📍 Ponto atual marcado · Clique para mover";
    }

    _mapPicker.addListener("click", (e) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      _mapPickerCoords = { lat, lng };
      if (_mapPickerMarker) {
        _mapPickerMarker.setPosition({ lat, lng });
      } else {
        _mapPickerMarker = new google.maps.Marker({ position: { lat, lng }, map: _mapPicker });
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

// Realça (ou apaga o realce d)o botão "Selecionar no mapa" quando o endereço veio aproximado,
// chamando a atenção do atendente para o ajuste manual — único jeito confiável nessas cidades.
function destacarBotaoMapPickerAtend(ativo) {
  const btn = document.getElementById("btnMapPickerAtend");
  if (btn) btn.classList.toggle("needs-attention", !!ativo);
}

async function confirmMapLocationAtendente() {
  if (!_mapPickerCoords) {
    showToast("Clique no mapa para marcar uma localização antes de confirmar.");
    return;
  }

  const { lat, lng } = _mapPickerCoords;
  formState.lat = lat;
  formState.lng = lng;
  atualizarFretePreview();
  // Ponto escolhido a dedo no mapa é considerado exato — some o alerta de "aproximado".
  formState.geoPreciso = true;
  destacarBotaoMapPickerAtend(false);
  _pickerAutoAbertoAprox = false;

  closeMapPickerAtendente();

  const msg = document.getElementById("cepMsg");
  if (msg) { msg.textContent = "Buscando endereço…"; msg.className = "atend-cep-msg"; }

  try {
    const data = await apiGet(`${API_BASE}/api/geocode?lat=${lat}&lng=${lng}`);

    if (data && (data.road || data.city || data.stateCode)) {
      const { road, city, stateCode, postcode } = data;

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
    showToast("Pedido em andamento, não pode ser editado.");
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
          <div class="atend-field">
            <label for="eFrete">Frete (R$)</label>
            <input id="eFrete" type="number" value="${p.valor_frete != null ? Number(p.valor_frete).toFixed(2) : ""}" min="0" step="0.01" inputmode="decimal" placeholder="0.00">
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

  if (!cliente)   { showToast("Preencha o nome do cliente.");        return; }
  if (!descricao) { showToast("Preencha o produto / material.");     return; }
  if (!peso || peso <= 0) { showToast("Preencha o peso em kg.");    return; }
  if (!municipio) { showToast("Preencha o município de destino."); return; }

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
    // Frete: valor positivo → grava; em branco → undefined (preserva o valor atual,
    // não zera). O admin/atendente pode ajustar aqui a qualquer momento.
    valor_frete:       (() => { const v = Number(document.getElementById("eFrete").value.trim()); return Number.isFinite(v) && v > 0 ? v : undefined; })(),
    observacoes:       document.getElementById("eObs").value.trim()           || null
  };

  // Remove chaves undefined para não sobrescrever com null
  Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

  const btn = document.querySelector("#editForm [type='submit']");
  if (btn) { btn.disabled = true; btn.innerHTML = "Salvando…"; }

  try {
    await apiPut(`${API_BASE}/api/pedidos/${id}`, payload);
    showToast("Pedido atualizado com sucesso!");
    fecharModalEdicao();
    await carregarPedidos();
  } catch (e) {
    showToast(`Erro ao salvar: ${e.message}`);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `${Icons.checkCircle(16)} Salvar alterações`; }
  }
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

  // Endereço digitado → geocode forward (sem depender do CEP). O número entra na consulta,
  // então o blur do próprio campo Número também re-dispara o geocode.
  const endInput = document.getElementById("fEndereco");
  if (endInput) endInput.addEventListener("blur", () => geocodificarEnderecoDigitado());
  const numInput = document.getElementById("fNumero");
  if (numInput) numInput.addEventListener("blur", () => geocodificarEnderecoDigitado());

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
