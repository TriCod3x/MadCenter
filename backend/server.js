const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

dotenv.config();

const app = express();

app.use(cors());
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

async function listar(req, res, tabela) {
  const { data, error } = await supabase.from(tabela).select("*");

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
app.get("/api/pedidos", (req, res) => listar(req, res, "pedidos"));
app.post("/api/pedidos", async (req, res) => {
  try {
    const { data: pedido, error: errIns } = await supabase
      .from("pedidos")
      .insert(req.body)
      .select()
      .single();
    if (errIns) return res.status(400).json({ error: errIns.message });

    // Se existe rota planejada com pedidos no mesmo município → status disponivel
    const municipio = req.body.municipio;
    if (municipio) {
      const { data: rotasPlanejadas } = await supabase
        .from("rotas")
        .select("cargas_ids")
        .eq("status", "planejada");

      const idsNasRotas = (rotasPlanejadas || [])
        .flatMap((r) => Array.isArray(r.cargas_ids) ? r.cargas_ids : []);

      if (idsNasRotas.length > 0) {
        const { data: match } = await supabase
          .from("pedidos")
          .select("id")
          .in("id", idsNasRotas)
          .eq("municipio", municipio)
          .limit(1);

        if (match?.length > 0) {
          await supabase.from("pedidos")
            .update({ status: "disponivel" })
            .eq("id", pedido.id);
          pedido.status = "disponivel";
        }
      }
    }

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
app.get("/api/motoristas", (req, res) => listar(req, res, "motoristas"));
app.post("/api/motoristas", (req, res) => criar(req, res, "motoristas"));
app.put("/api/motoristas/:id", (req, res) => atualizar(req, res, "motoristas"));
app.delete("/api/motoristas/:id", (req, res) => deletar(req, res, "motoristas"));

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.get("/api/rotas", (req, res) => listar(req, res, "rotas"));
app.post("/api/rotas", (req, res) => criar(req, res, "rotas"));
app.put("/api/rotas/:id", (req, res) => atualizar(req, res, "rotas"));
app.delete("/api/rotas/:id", (req, res) => deletar(req, res, "rotas"));

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
    // 1. Encontra rota ativa que contém este pedido
    const { data: todasRotas } = await supabase
      .from("rotas")
      .select("id, cargas_ids")
      .not("status", "in", '("cancelada","concluida")');

    const idStr = String(id);
    let rotaVinculada = null;
    for (const rota of todasRotas || []) {
      const ids = Array.isArray(rota.cargas_ids) ? rota.cargas_ids : [];
      if (ids.some((i) => String(i) === idStr)) {
        rotaVinculada = rota;
        break;
      }
    }

    // 2. Status do pedido depende de existir rota planejada vinculada
    //    'disponivel'    → pedido está em rota planejada, sem motorista
    //    'aguardando rota' → pedido sem nenhuma rota
    const novoPedidoStatus = rotaVinculada ? "disponivel" : "aguardando rota";
    const { data: pedido, error: errPed } = await supabase
      .from("pedidos")
      .update({ status: novoPedidoStatus })
      .eq("id", id)
      .select("id")
      .single();
    if (errPed) return res.status(400).json({ error: errPed.message });

    // 3. Rota volta para "planejada" sem motorista (pedido permanece em cargas_ids)
    if (rotaVinculada) {
      await supabase.from("rotas")
        .update({ status: "planejada", motorista_id: null })
        .eq("id", rotaVinculada.id);
    }

    res.json({ success: true, pedido });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/pedidos/:id/deixar-para-depois — mantém na rota, muda status p/ pendente
app.put("/api/pedidos/:id/deixar-para-depois", async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("pedidos")
    .update({ status: "pendente" })
    .eq("id", id)
    .select("id, status")
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
