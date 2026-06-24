const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

dotenv.config();

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      "http://localhost:5500",
      "http://localhost:5501",
      "http://127.0.0.1:5500",
      "http://127.0.0.1:5501",
      "http://localhost:3000",
    ];
    // Permite origens sem origin (ex: chamadas server-side) e domínios Vercel
    if (!origin || allowed.includes(origin) || /\.vercel\.app$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS bloqueado"));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET não foi configurado. Defina JWT_SECRET no arquivo .env.");
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function ordenarVizinhoMaisProximo(pedidos, lojaLat, lojaLng) {
  const restantes = [...pedidos];
  const ordenados = [];
  let lat = lojaLat, lng = lojaLng;
  while (restantes.length) {
    let iMin = 0, dMin = Infinity;
    restantes.forEach((p, i) => {
      const d = haversineKm(lat, lng, Number(p.lat||0), Number(p.lng||0));
      if (d < dMin) { dMin = d; iMin = i; }
    });
    const proximo = restantes.splice(iMin, 1)[0];
    ordenados.push(proximo);
    lat = Number(proximo.lat||0);
    lng = Number(proximo.lng||0);
  }
  return ordenados;
}

async function agruparPedidosEmRotas(novoPedido) {
  try {
    console.log(`[agrupar] === INÍCIO para pedido ${novoPedido?.id} ===`);

    const { data: cfg, error: errCfg } = await supabaseAdmin.from("configuracoes").select("latitude_loja,longitude_loja").limit(1).single();
    if (errCfg) console.warn("[agrupar] Erro ao buscar configuracoes:", errCfg.message);
    const lojaLat = Number(cfg?.latitude_loja || -4.760287);
    const lojaLng = Number(cfg?.longitude_loja || -42.573777);

    // Busca pedidos aguardando motorista
    const { data: pedidosAguardando, error: errPed } = await supabaseAdmin
      .from("pedidos")
      .select("id,lat,lng,destino_municipio,destino_estado,valor_frete,distancia_km")
      .eq("status", "aguardando motorista");
    if (errPed) { console.error("[agrupar] Erro ao buscar pedidos:", errPed.message); return; }
    console.log(`[agrupar] Pedidos aguardando motorista: ${pedidosAguardando?.length || 0}`);
    if (!pedidosAguardando?.length) return;

    const comCoords = pedidosAguardando.filter(p => p.lat && p.lng);
    const semCoords = pedidosAguardando.filter(p => !p.lat || !p.lng);
    console.log(`[agrupar] Com coords: ${comCoords.length} | Sem coords: ${semCoords.length}`);
    if (comCoords.length) console.log(`[agrupar] IDs com coords:`, comCoords.map(p => p.id));
    if (semCoords.length) console.log(`[agrupar] IDs sem coords:`, semCoords.map(p => p.id));

    // Pedidos já vinculados a alguma rota
    const { data: vinculos, error: errVinc } = await supabaseAdmin.from("rota_pedidos").select("pedido_id,rota_id");
    if (errVinc) console.warn("[agrupar] Erro ao buscar vinculos:", errVinc.message);
    const pedidosComRota = new Set((vinculos||[]).map(v => v.pedido_id));
    console.log(`[agrupar] Pedidos já vinculados a rota: ${pedidosComRota.size}`);

    // Pedidos sem nenhuma rota
    const semRota = pedidosAguardando.filter(p => !pedidosComRota.has(p.id));
    console.log(`[agrupar] Pedidos sem rota: ${semRota.length}`, semRota.map(p => p.id));
    if (!semRota.length) { console.log("[agrupar] Nenhum pedido sem rota — saindo."); return; }

    // Helper para criar rota e vincular pedidos
    async function criarRota(pedidosList, prefixo) {
      const primeiro = pedidosList[0];
      const ids = pedidosList.map(p => p.id);
      const payload = {
        nome: `Auto - ${primeiro.destino_municipio || "Sem destino"}/${primeiro.destino_estado || ""}`,
        tipo_rota: "entrega",
        destino_municipio: primeiro.destino_municipio || null,
        destino_estado: primeiro.destino_estado || null,
        status: "planejada",
        cargas_ids: ids,
        frete_total: pedidosList.reduce((s,p) => s + Number(p.valor_frete||0), 0),
        distancia: pedidosList.reduce((s,p) => s + Number(p.distancia_km||0), 0),
      };
      console.log(`[agrupar] ${prefixo} insert payload:`, JSON.stringify(payload));
      const { data: rota, error: errRota } = await supabaseAdmin
        .from("rotas")
        .insert(payload)
        .select("id").single();
      if (errRota || !rota?.id) {
        console.error(`[agrupar] ${prefixo} ERRO ao criar rota:`, JSON.stringify(errRota));
        return null;
      }
      console.log(`[agrupar] ${prefixo} Rota ${rota.id} criada com pedidos`, ids);
      for (const id of ids) {
        const { error: errVinc } = await supabaseAdmin.from("rota_pedidos").insert({ rota_id: rota.id, pedido_id: id });
        if (errVinc) console.error(`[agrupar] Erro ao vincular pedido ${id} à rota ${rota.id}:`, errVinc.message);
      }
      return rota.id;
    }

    // Se o novo pedido tem coords, tenta adicioná-lo a rota existente com < 5 pedidos
    if (novoPedido?.lat && novoPedido?.lng && pedidosComRota.has(novoPedido.id) === false) {
      console.log(`[agrupar] Buscando rota existente próxima para pedido ${novoPedido.id}...`);
      const { data: rotasPlanejadas } = await supabaseAdmin
        .from("rotas")
        .select("id,cargas_ids")
        .eq("status", "planejada")
        .is("motorista_id", null);

      for (const rota of rotasPlanejadas || []) {
        const idsRota = rota.cargas_ids || [];
        if (idsRota.length >= 5) continue;
        const pedDaRota = idsRota
          .map(id => pedidosAguardando.find(p => p.id === id))
          .filter(p => p?.lat && p?.lng);
        if (!pedDaRota.length) continue;
        const centroLat = pedDaRota.reduce((s,p) => s + Number(p.lat), 0) / pedDaRota.length;
        const centroLng = pedDaRota.reduce((s,p) => s + Number(p.lng), 0) / pedDaRota.length;
        const dist = haversineKm(Number(novoPedido.lat), Number(novoPedido.lng), centroLat, centroLng);
        console.log(`[agrupar] Rota ${rota.id}: dist ao centro = ${dist.toFixed(2)} km`);
        if (dist <= 2.5) {
          const novasIds = [...idsRota, novoPedido.id];
          await supabaseAdmin.from("rotas").update({ cargas_ids: novasIds }).eq("id", rota.id);
          const jaVinculado = (vinculos||[]).some(v => v.pedido_id === novoPedido.id);
          if (!jaVinculado) {
            await supabaseAdmin.from("rota_pedidos").insert({ rota_id: rota.id, pedido_id: novoPedido.id });
          }
          console.log(`[agrupar] Pedido ${novoPedido.id} adicionado à rota existente ${rota.id}`);
          return;
        }
      }
      console.log(`[agrupar] Nenhuma rota existente próxima encontrada — criando nova.`);
    }

    // Agrupa pedidos sem rota por proximidade (raio 2.5km, máx 5 por grupo)
    const alocados = new Set();
    const grupos = [];
    for (const pedido of semRota) {
      if (alocados.has(pedido.id) || !pedido.lat || !pedido.lng) continue;
      const grupo = [pedido];
      alocados.add(pedido.id);
      for (const outro of semRota) {
        if (alocados.has(outro.id) || !outro.lat || !outro.lng || grupo.length >= 5) continue;
        if (haversineKm(Number(pedido.lat), Number(pedido.lng), Number(outro.lat), Number(outro.lng)) <= 2.5) {
          grupo.push(outro);
          alocados.add(outro.id);
        }
      }
      grupos.push(grupo);
    }
    console.log(`[agrupar] Grupos com coords formados: ${grupos.length}`);

    for (const grupo of grupos) {
      const ordenados = ordenarVizinhoMaisProximo(grupo, lojaLat, lojaLng);
      await criarRota(ordenados, `[grupo ${ordenados.map(p=>p.id)}]`);
    }

    // Pedidos sem coords: cada um vira uma rota solo
    const naoAlocados = semRota.filter(p => !alocados.has(p.id));
    console.log(`[agrupar] Pedidos sem coords para rotas solo: ${naoAlocados.length}`, naoAlocados.map(p => p.id));
    for (const pedido of naoAlocados) {
      await criarRota([pedido], `[solo ${pedido.id}]`);
    }

    console.log(`[agrupar] === FIM para pedido ${novoPedido?.id} ===`);
  } catch (err) {
    console.error("[agruparPedidosEmRotas] Exceção não tratada:", err?.message, err?.stack);
  }
}

function autenticar(req, res, next) {
  const auth  = req.headers.authorization;
  const token = (auth && auth.startsWith("Bearer ")) ? auth.split(" ")[1] : req.query.token;
  if (!token) return res.status(401).json({ error: "Token não fornecido" });
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

// Protege todas as rotas /api/* exceto login e utilitários temporários abertos
app.use("/api", (req, res, next) => {
  if (req.path === "/auth/login") return next();
  if (req.path === "/admin/reagrupar-todos") return next();
  autenticar(req, res, next);
});

const PEDIDOS_COLS    = "id,codigo,descricao,tipo,peso,volume,cep,destino_municipio,destino_estado,endereco_entrega,numero,complemento,cliente,telefone,coleta,entrega,prioridade,veiculo_tipo,distancia_km,valor_frete,status,observacoes,lat,lng,data_entrega,criado_em";
const MOTORISTAS_COLS = "id,nome,telefone,categoria,capacidade,cidade,estado,status,observacoes";
const ROTAS_COLS      = "id,codigo,nome,tipo_rota,destino_municipio,destino_estado,motorista_id,saida,chegada,distancia,frete_total,tempo,status,observacoes,cargas_ids";

async function listar(req, res, tabela, colunas = "*") {
  const { data, error } = await supabaseAdmin.from(tabela).select(colunas);

  if (error) return res.status(400).json({ error: error.message });

  res.json(data);
}

async function criar(req, res, tabela) {
  const { data, error } = await supabase
    .from(tabela)
    .insert(req.body)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  res.json(data);
}

async function atualizar(req, res, tabela) {
  const { data, error } = await supabase
    .from(tabela)
    .update(req.body)
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  res.json(data);
}

async function deletar(req, res, tabela) {
  const { error } = await supabase
    .from(tabela)
    .delete()
    .eq("id", req.params.id);

  if (error) return res.status(400).json({ error: error.message });

  res.json({ success: true });
}

// ── Pedidos ───────────────────────────────────────────────────────────────────
app.get("/api/pedidos", (req, res) => listar(req, res, "pedidos", PEDIDOS_COLS));
app.post("/api/pedidos", async (req, res) => {
  try {
    // Converte strings vazias em null para campos opcionais
    const body = { ...req.body };
    const camposOpcionais = ["endereco_entrega", "numero", "complemento", "cep", "observacoes", "telefone", "lat", "lng"];
    camposOpcionais.forEach(campo => {
      if (body[campo] === "" || body[campo] === undefined) body[campo] = null;
    });

    const { data: pedido, error: errIns } = await supabase
      .from("pedidos")
      .insert(body)
      .select()
      .single();
    if (errIns) return res.status(400).json({ error: errIns.message });

    // Agrupamento automático em background — não bloqueia o retorno
    setImmediate(() => agruparPedidosEmRotas(pedido));

    res.json(pedido);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put("/api/pedidos/:id", async (req, res) => {
  const { id } = req.params;

  // Auto-preenche datas com base na mudança de status (horário de Brasília UTC-3)
  const body = { ...req.body };
  if (body.status === "em rota" || body.status === "entregue") {
    const agora = new Date();
    const brasiliaOffset = -3 * 60; // minutos
    const brasiliaTime = new Date(agora.getTime() + brasiliaOffset * 60000);
    const isoUTC3 = brasiliaTime.toISOString();
    if (body.status === "em rota"  && !body.coleta)  body.coleta  = isoUTC3;
    if (body.status === "entregue" && !body.entrega) body.entrega = isoUTC3;
  }

  const { data, error } = await supabase
    .from("pedidos")
    .update(body)
    .eq("id", id)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });

  // Quando pedido é cancelado, limpa a rota vinculada
  if (body.status === "cancelado") {
    try {
      const { data: rotas } = await supabase
        .from("rotas")
        .select("id, cargas_ids")
        .not("status", "in", '("cancelada","concluida")');

      const idStr = String(id);
      for (const rota of rotas || []) {
        const ids = Array.isArray(rota.cargas_ids) ? rota.cargas_ids : [];
        if (!ids.some((i) => String(i) === idStr)) continue;
        const novasIds = ids.filter((i) => String(i) !== idStr);
        const updates = novasIds.length === 0
          ? { cargas_ids: [], status: "cancelada" }
          : { cargas_ids: novasIds };
        await supabase.from("rotas").update(updates).eq("id", rota.id);
      }

      await supabase.from("rota_pedidos").delete().eq("pedido_id", id);
    } catch (_) {
      // limpeza de rota não bloqueia a resposta
    }
  }

  res.json(data);
});
app.delete("/api/pedidos/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Exclui o pedido
    const { error: errDel } = await supabase
      .from("pedidos")
      .delete()
      .eq("id", id);
    if (errDel) return res.status(400).json({ error: errDel.message });

    // 2. Remove o pedido de cargas_ids em todas as rotas que o contêm
    const { data: rotas } = await supabase
      .from("rotas")
      .select("id, cargas_ids")
      .not("status", "in", '("cancelada","concluida")');

    for (const rota of rotas || []) {
      const ids = Array.isArray(rota.cargas_ids) ? rota.cargas_ids : [];
      const idStr = String(id);
      if (!ids.some((i) => String(i) === idStr)) continue;
      const novasIds = ids.filter((i) => String(i) !== idStr);
      const updates = novasIds.length === 0
        ? { cargas_ids: [], status: "cancelada" }
        : { cargas_ids: novasIds };
      await supabase.from("rotas").update(updates).eq("id", rota.id);
    }

    // 3. Remove de rota_pedidos se existir
    await supabase.from("rota_pedidos").delete().eq("pedido_id", id);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Motoristas ────────────────────────────────────────────────────────────────
app.get("/api/motoristas", (req, res) => listar(req, res, "motoristas", MOTORISTAS_COLS));
app.post("/api/motoristas", (req, res) => criar(req, res, "motoristas"));
app.put("/api/motoristas/:id", (req, res) => atualizar(req, res, "motoristas"));
app.delete("/api/motoristas/:id", (req, res) => deletar(req, res, "motoristas"));

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.get("/api/rotas", (req, res) => listar(req, res, "rotas", ROTAS_COLS));
app.post("/api/rotas", (req, res) => criar(req, res, "rotas"));
app.put("/api/rotas/:id", (req, res) => atualizar(req, res, "rotas"));
app.delete("/api/rotas/:id", (req, res) => deletar(req, res, "rotas"));

app.post("/api/rotas/:id/pegar", autenticar, async (req, res) => {
  const { id } = req.params;
  const motoristaId = req.body.motorista_id || req.usuario.id;
  try {
    // Busca a rota
    const { data: rota, error: errRota } = await supabaseAdmin
      .from("rotas").select("id,status,cargas_ids,motorista_id").eq("id", id).single();
    if (errRota || !rota) return res.status(404).json({ error: "Rota não encontrada." });
    if (rota.status !== "planejada") return res.status(400).json({ error: "Rota não está disponível." });
    if (rota.motorista_id) return res.status(409).json({ error: "Rota já foi pega por outro motorista." });

    // Atualiza rota: em andamento + motorista
    const { error: errUpRota } = await supabaseAdmin
      .from("rotas")
      .update({ status: "em andamento", motorista_id: motoristaId, saida: new Date().toISOString() })
      .eq("id", id);
    if (errUpRota) return res.status(400).json({ error: errUpRota.message });

    // Atualiza pedidos: em rota
    const ids = rota.cargas_ids || [];
    if (ids.length) {
      const { error: errPed } = await supabaseAdmin
        .from("pedidos")
        .update({ status: "em rota" })
        .in("id", ids);
      if (errPed) console.error("[pegar rota] Erro ao atualizar pedidos:", errPed);
    }

    res.json({ ok: true, rota_id: id, pedidos_atualizados: ids.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/rotas/:rotaId/pedidos/:pedidoId", autenticar, async (req, res) => {
  const { rotaId, pedidoId } = req.params;
  try {
    // Remove vínculo
    await supabaseAdmin.from("rota_pedidos").delete().eq("rota_id", rotaId).eq("pedido_id", pedidoId);

    // Remove de cargas_ids da rota
    const { data: rota } = await supabaseAdmin.from("rotas").select("cargas_ids").eq("id", rotaId).single();
    if (rota) {
      const novasIds = (rota.cargas_ids || []).filter(id => String(id) !== String(pedidoId));
      await supabaseAdmin.from("rotas").update({
        cargas_ids: novasIds,
        ...(novasIds.length === 0 ? { status: "cancelada" } : {})
      }).eq("id", rotaId);
    }

    // Volta pedido para aguardando motorista
    const { data: pedido } = await supabaseAdmin
      .from("pedidos")
      .update({ status: "aguardando motorista" })
      .eq("id", pedidoId)
      .select("id,lat,lng,destino_municipio,destino_estado,valor_frete,distancia_km")
      .single();

    // Tenta reagrupar em background
    if (pedido) setImmediate(() => agruparPedidosEmRotas(pedido));

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Configurações ─────────────────────────────────────────────────────────────
app.get("/api/configuracoes", async (req, res) => {
  const { data, error } = await supabase
    .from("configuracoes")
    .select("*")
    .limit(1)
    .single();

  if (error) return res.status(400).json({ error: error.message });

  res.json(data);
});

app.put("/api/configuracoes", async (req, res) => {
  try {
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("configuracoes")
      .select("id")
      .limit(1)
      .single();
    if (fetchError) throw fetchError;

    const { data, error } = await supabaseAdmin
      .from("configuracoes")
      .update(req.body)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Usuários ──────────────────────────────────────────────────────────────────

// GET /api/usuarios — lista todos sem senha_hash
// Suporta ?perfil=motorista e ?ativo=true
app.get("/api/usuarios", async (req, res) => {
  let query = supabase
    .from("usuarios")
    .select("id, nome, perfil, ativo, criado_em")
    .order("perfil");

  if (req.query.perfil) {
    query = query.eq("perfil", req.query.perfil);
  }
  if (req.query.ativo !== undefined) {
    query = query.eq("ativo", req.query.ativo === "true");
  }

  const { data, error } = await query;
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// POST /api/usuarios — cria novo usuário (hash da senha)
app.post("/api/usuarios", async (req, res) => {
  const { nome, perfil, senha } = req.body;
  if (!nome || !perfil || !senha) {
    return res.status(400).json({ error: "Nome, perfil e senha são obrigatórios." });
  }
  try {
    const senha_hash = await bcrypt.hash(senha, 10);
    const { data, error } = await supabase
      .from("usuarios")
      .insert({ nome, perfil, senha_hash, ativo: true })
      .select("id, nome, perfil, ativo")
      .single();
    if (error) return res.status(400).json({ error: error.message });

    // Cria registro espelho na tabela motoristas (se ainda não existir)
    if (perfil === "motorista") {
      const { data: existente } = await supabase
        .from("motoristas")
        .select("id")
        .ilike("nome", nome)
        .maybeSingle();
      if (!existente) {
        await supabase.from("motoristas").insert({
          nome,
          telefone:    "",
          categoria:   "D",
          capacidade:  0,
          cidade:      "",
          estado:      "MA",
          status:      "disponível",
          observacoes: ""
        });
      }
    }

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/usuarios/:id — edita (refaz hash só se senha informada)
app.put("/api/usuarios/:id", async (req, res) => {
  const { nome, perfil, senha } = req.body;

  // Busca estado atual para sincronizar com motoristas se necessário
  const { data: atual } = await supabase
    .from("usuarios")
    .select("nome, perfil")
    .eq("id", req.params.id)
    .single();

  const updates = {};
  if (nome !== undefined) updates.nome = nome;
  if (perfil !== undefined) updates.perfil = perfil;
  if (senha) updates.senha_hash = await bcrypt.hash(senha, 10);

  const { data, error } = await supabase
    .from("usuarios")
    .update(updates)
    .eq("id", req.params.id)
    .select("id, nome, perfil, ativo")
    .single();
  if (error) return res.status(400).json({ error: error.message });

  // Se é motorista e o nome foi alterado, sincroniza na tabela motoristas
  const ehMotorista = (perfil ?? atual?.perfil) === "motorista";
  if (ehMotorista && nome && atual?.nome && nome !== atual.nome) {
    await supabase
      .from("motoristas")
      .update({ nome })
      .eq("nome", atual.nome);
  }

  res.json(data);
});

// DELETE /api/usuarios/:id — exclui permanentemente (cascata para motoristas)
app.delete("/api/usuarios/:id", async (req, res) => {
  const { data: usuario } = await supabase
    .from("usuarios")
    .select("nome, perfil")
    .eq("id", req.params.id)
    .single();

  const { error } = await supabase
    .from("usuarios")
    .delete()
    .eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });

  if (usuario?.perfil === "motorista") {
    await supabase.from("motoristas").delete().eq("nome", usuario.nome);
  }

  res.json({ success: true });
});

// PATCH /api/usuarios/:id/toggle — ativa ou desativa
app.patch("/api/usuarios/:id/toggle", async (req, res) => {
  const { data: atual, error: errAtual } = await supabase
    .from("usuarios")
    .select("ativo")
    .eq("id", req.params.id)
    .single();
  if (errAtual) return res.status(400).json({ error: errAtual.message });

  const { data, error } = await supabase
    .from("usuarios")
    .update({ ativo: !atual.ativo })
    .eq("id", req.params.id)
    .select("id, nome, perfil, ativo")
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── Auth ──────────────────────────────────────────────────────────────────────

// POST /api/auth/login — tenta admin_auth primeiro, depois usuarios
app.post("/api/auth/login", async (req, res) => {
  const { nome, senha } = req.body;
  if (!nome || !senha) {
    return res.status(400).json({ error: "Dados incompletos." });
  }
  try {
    // 1. Tenta autenticar como admin (usa service_role para contornar RLS)
    const { data: admin } = await supabaseAdmin
      .from("admin_auth")
      .select("*")
      .eq("usuario", nome.trim())
      .eq("ativo", true)
      .single();

    if (admin) {
      const ok = await bcrypt.compare(senha, admin.senha_hash);
      if (!ok) return res.status(401).json({ error: "Senha incorreta." });
      const token = jwt.sign(
        { id: admin.id, nome: admin.usuario, perfil: "admin" },
        JWT_SECRET,
        { expiresIn: "8h" }
      );
      return res.json({ token, nome: admin.usuario, perfil: "admin" });
    }

    // 2. Tenta autenticar como motorista ou atendente
    const { data: usuario } = await supabase
      .from("usuarios")
      .select("*")
      .eq("nome", nome.trim())
      .eq("ativo", true)
      .single();

    if (!usuario) {
      return res.status(401).json({ error: "Usuário não encontrado." });
    }

    const ok = await bcrypt.compare(senha, usuario.senha_hash);
    if (!ok) return res.status(401).json({ error: "Senha incorreta." });

    const token = jwt.sign(
      { id: usuario.id, nome: usuario.nome, perfil: usuario.perfil },
      JWT_SECRET,
      { expiresIn: "8h" }
    );
    return res.json({ token, nome: usuario.nome, perfil: usuario.perfil });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Veículos ──────────────────────────────────────────────────────────────────
app.get("/api/veiculos",        (req, res) => listar(req, res, "veiculos"));
app.post("/api/veiculos",       (req, res) => criar(req, res, "veiculos"));
app.put("/api/veiculos/:id",    (req, res) => atualizar(req, res, "veiculos"));
app.delete("/api/veiculos/:id", async (req, res) => {
  const { id } = req.params;
  const { count, error: errCount } = await supabase
    .from("pedidos")
    .select("id", { count: "exact", head: true })
    .eq("veiculo_tipo", id);
  if (errCount) return res.status(400).json({ error: errCount.message });
  if (count > 0) {
    return res.status(400).json({
      error: "Não é possível excluir: existem pedidos vinculados a este veículo."
    });
  }
  return deletar(req, res, "veiculos");
});

// PUT /api/pedidos/:id/cancelar-motorista — motorista devolve pedido ao mural
app.put("/api/pedidos/:id/cancelar-motorista", async (req, res) => {
  const { id } = req.params;
  try {
    const { data: pedido, error: errPed } = await supabase
      .from("pedidos")
      .update({ status: "aguardando motorista" })
      .eq("id", id)
      .select("id,lat,lng,destino_municipio,destino_estado,valor_frete,distancia_km")
      .single();
    if (errPed) return res.status(400).json({ error: errPed.message });

    // Encontra e reseta rota vinculada para planejada sem motorista
    const { data: todasRotas } = await supabase
      .from("rotas").select("id,cargas_ids").not("status","in",'("cancelada","concluida")');
    for (const rota of todasRotas || []) {
      const ids = Array.isArray(rota.cargas_ids) ? rota.cargas_ids : [];
      if (ids.some(i => String(i) === String(id))) {
        await supabase.from("rotas").update({ status: "planejada", motorista_id: null }).eq("id", rota.id);
        break;
      }
    }

    // Tenta reagrupar em background
    if (pedido) setImmediate(() => agruparPedidosEmRotas(pedido));

    res.json({ success: true, pedido });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/pedidos/:id/deixar-para-depois — mantém na rota, muda status p/ planejado
app.put("/api/pedidos/:id/deixar-para-depois", async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("pedidos")
    .update({ status: "planejado" })
    .eq("id", id)
    .select("id, status")
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── Relatórios ────────────────────────────────────────────────────────────────
app.get("/api/relatorios", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("relatorios")
    .select("*")
    .order("gerado_em", { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.post("/api/relatorios", async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from("relatorios")
    .insert(req.body)
    .select()
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

app.delete("/api/relatorios/:id", async (req, res) => {
  const { error } = await supabaseAdmin.from("relatorios").delete().eq("id", req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

app.get("/api/relatorios/:id/csv", async (req, res) => {
  const { id } = req.params;
  try {
    const { data: rel, error: errRel } = await supabaseAdmin
      .from("relatorios")
      .select("*")
      .eq("id", id)
      .single();
    if (errRel || !rel) return res.status(404).json({ error: "Relatório não encontrado." });

    const { data: pedidos, error: errPed } = await supabaseAdmin
      .from("pedidos")
      .select("*")
      .gte("entrega", rel.periodo_inicio)
      .lte("entrega", rel.periodo_fim + "T23:59:59");
    if (errPed) return res.status(400).json({ error: errPed.message });

    const { data: rotas } = await supabaseAdmin.from("rotas").select("id, cargas_ids, motorista_id");
    const { data: motoristas } = await supabaseAdmin.from("motoristas").select("id, nome");

    const motMap = {};
    (motoristas || []).forEach((m) => { motMap[m.id] = m.nome; });

    const toBrasilia = (isoStr) => {
      if (!isoStr) return "";
      const d = new Date(isoStr);
      const b = new Date(d.getTime() + (-3 * 60) * 60000);
      const p = (n) => String(n).padStart(2, "0");
      return `${p(b.getUTCDate())}/${p(b.getUTCMonth() + 1)}/${b.getUTCFullYear()} ${p(b.getUTCHours())}:${p(b.getUTCMinutes())}`;
    };

    const header = ["Código", "Cliente", "Material", "Destino", "Motorista", "Coleta", "Entrega", "Peso (kg)", "Frete (R$)", "Status"];
    const rows = (pedidos || []).map((p) => {
      const rota = (rotas || []).find((r) => Array.isArray(r.cargas_ids) && r.cargas_ids.some((i) => String(i) === String(p.id)));
      const motorista = rota ? (motMap[rota.motorista_id] || "") : "";
      const destino = [p.destino_municipio, p.destino_estado].filter(Boolean).join("/");
      return [
        p.codigo || "",
        p.cliente || "",
        p.descricao || "",
        destino,
        motorista,
        toBrasilia(p.coleta),
        toBrasilia(p.entrega),
        p.peso || 0,
        Number(p.valor_frete || 0).toFixed(2).replace(".", ","),
        p.status || ""
      ];
    });

    const BOM = "﻿";
    const csv = BOM + [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");

    res.setHeader("Content-Type", "text/csv;charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio-${rel.periodo_inicio}-${rel.periodo_fim}.csv"`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin utilitários ─────────────────────────────────────────────────────────

// POST /api/admin/reagrupar-todos — força reagrupamento de todos pedidos sem rota
app.post("/api/admin/reagrupar-todos", async (req, res) => {
  try {
    // Pedidos aguardando motorista
    const { data: pedidosAguardando, error: errPed } = await supabaseAdmin
      .from("pedidos")
      .select("id,lat,lng,destino_municipio,destino_estado,valor_frete,distancia_km")
      .eq("status", "aguardando motorista");
    if (errPed) return res.status(400).json({ error: errPed.message });

    // IDs já vinculados a alguma rota
    const { data: vinculos } = await supabaseAdmin.from("rota_pedidos").select("pedido_id");
    const comRota = new Set((vinculos || []).map(v => v.pedido_id));

    const semRota = (pedidosAguardando || []).filter(p => !comRota.has(p.id));
    if (!semRota.length) {
      return res.json({ ok: true, reagrupados: 0, mensagem: "Nenhum pedido sem rota encontrado." });
    }

    // Chama agrupar para cada pedido sem rota (background, não paralelo para evitar duplicatas)
    for (const pedido of semRota) {
      await agruparPedidosEmRotas(pedido);
    }

    res.json({ ok: true, reagrupados: semRota.length, ids: semRota.map(p => p.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

module.exports = app;
