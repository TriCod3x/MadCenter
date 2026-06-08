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
app.post("/api/pedidos", (req, res) => criar(req, res, "pedidos"));
app.put("/api/pedidos/:id", (req, res) => atualizar(req, res, "pedidos"));
app.delete("/api/pedidos/:id", (req, res) => deletar(req, res, "pedidos"));

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

// GET /api/auth/gerar-hash?senha=... — rota temporária para gerar hash bcrypt
app.get("/api/auth/gerar-hash", async (req, res) => {
  const senha = req.query.senha;
  if (!senha) {
    return res.status(400).json({ error: "Parâmetro senha é obrigatório." });
  }
  const hash = await bcrypt.hash(senha, 10);
  res.json({ senha, hash });
});

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

// ── Setup utilitário ──────────────────────────────────────────────────────────

// GET /api/auth/setup-motoristas — DESATIVADO
// O fluxo correto é: criar usuário em /api/usuarios (perfil=motorista) → cria automaticamente em motoristas.
app.get("/api/auth/setup-motoristas", async (req, res) => {
  return res.status(410).json({
    erro: "Rota desativada. Use a tela de Usuários para cadastrar motoristas.",
    fluxo: "POST /api/usuarios com perfil='motorista' cria automaticamente na tabela motoristas."
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
