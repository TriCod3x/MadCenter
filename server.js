const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { db: { schema: "public" }, auth: { persistSession: false } }
);

async function listar(req, res, tabela) {
  const { data, error } = await supabase.from(tabela).select("*");

  if (error) return res.status(400).json({ error: error.message });

  res.json(data);
}

async function criar(req, res, tabela) {
  console.log(`[POST] /${tabela}`, JSON.stringify(req.body));
  const { data, error } = await supabase
    .from(tabela)
    .insert(req.body)
    .select()
    .single();

  if (error) {
    console.error(`[POST] /${tabela} erro:`, error.message);
    return res.status(400).json({ error: error.message });
  }

  console.log(`[POST] /${tabela} ok → id:`, data?.id);
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

// Campos adicionados via ALTER TABLE — podem estar ausentes do cache de schema
const PEDIDO_EXTRA_FIELDS = ["cep", "numero", "complemento", "lat", "lng"];
const ROTA_EXTRA_FIELDS = ["motorista_id", "cargas_ids"];

function isSchemaCacheError(msg = "") {
  return msg.includes("schema cache") || msg.includes("Could not find");
}

app.get("/api/pedidos", (req, res) => listar(req, res, "pedidos"));

app.post("/api/pedidos", async (req, res) => {
  console.log("[POST] /pedidos", JSON.stringify(req.body));

  // 1ª tentativa: insert completo (funciona após NOTIFY pgrst, 'reload schema')
  let { data, error } = await supabase.from("pedidos").insert(req.body).select().single();

  if (!error) {
    console.log("[POST] /pedidos ok → id:", data?.id);
    return res.json(data);
  }

  // Fallback: se o erro é de cache de schema, separa os campos extras
  if (isSchemaCacheError(error.message)) {
    console.warn("[POST] /pedidos schema cache desatualizado — usando fallback");
    const body = { ...req.body };
    PEDIDO_EXTRA_FIELDS.forEach((f) => delete body[f]);

    ({ data, error } = await supabase.from("pedidos").insert(body).select().single());
    if (error) {
      console.error("[POST] /pedidos erro no fallback:", error.message);
      return res.status(400).json({ error: error.message });
    }

    // Tenta salvar campos extras num update separado
    const extras = Object.fromEntries(
      PEDIDO_EXTRA_FIELDS.filter((f) => req.body[f] != null).map((f) => [f, req.body[f]])
    );
    if (Object.keys(extras).length) {
      const { error: errExtra } = await supabase.from("pedidos").update(extras).eq("id", data.id);
      if (errExtra) console.warn("[POST] /pedidos campos extras não salvos (schema pendente):", errExtra.message);
    }

    console.log("[POST] /pedidos ok (fallback) → id:", data?.id);
    return res.json({ ...data, ...extras });
  }

  console.error("[POST] /pedidos erro:", error.message);
  return res.status(400).json({ error: error.message });
});

app.put("/api/pedidos/:id", async (req, res) => {
  // 1ª tentativa: update completo
  let { data, error } = await supabase.from("pedidos").update(req.body).eq("id", req.params.id).select().single();

  if (!error) return res.json(data);

  // Fallback para schema cache desatualizado
  if (isSchemaCacheError(error.message)) {
    console.warn("[PUT] /pedidos schema cache desatualizado — usando fallback");
    const body = { ...req.body };
    PEDIDO_EXTRA_FIELDS.forEach((f) => delete body[f]);

    ({ data, error } = await supabase.from("pedidos").update(body).eq("id", req.params.id).select().single());
    if (error) return res.status(400).json({ error: error.message });

    const extras = Object.fromEntries(
      PEDIDO_EXTRA_FIELDS.filter((f) => req.body[f] != null).map((f) => [f, req.body[f]])
    );
    if (Object.keys(extras).length) {
      await supabase.from("pedidos").update(extras).eq("id", req.params.id);
    }

    return res.json({ ...data, ...extras });
  }

  return res.status(400).json({ error: error.message });
});

app.delete("/api/pedidos/:id", (req, res) => deletar(req, res, "pedidos"));

app.get("/api/motoristas", (req, res) => listar(req, res, "motoristas"));
app.post("/api/motoristas", (req, res) => criar(req, res, "motoristas"));
app.put("/api/motoristas/:id", (req, res) => atualizar(req, res, "motoristas"));
app.delete("/api/motoristas/:id", (req, res) => deletar(req, res, "motoristas"));

app.get("/api/rotas", (req, res) => listar(req, res, "rotas"));

app.post("/api/rotas", async (req, res) => {
  let { data, error } = await supabase.from("rotas").insert(req.body).select().single();
  if (!error) return res.json(data);

  if (isSchemaCacheError(error.message)) {
    console.warn("[POST] /rotas schema cache desatualizado — usando fallback");
    const body = { ...req.body };
    ROTA_EXTRA_FIELDS.forEach((f) => delete body[f]);
    ({ data, error } = await supabase.from("rotas").insert(body).select().single());
    if (error) return res.status(400).json({ error: error.message });

    const extras = Object.fromEntries(
      ROTA_EXTRA_FIELDS.filter((f) => req.body[f] != null).map((f) => [f, req.body[f]])
    );
    if (Object.keys(extras).length) {
      await supabase.from("rotas").update(extras).eq("id", data.id);
    }
    return res.json({ ...data, ...extras });
  }

  return res.status(400).json({ error: error.message });
});

app.put("/api/rotas/:id", async (req, res) => {
  let { data, error } = await supabase.from("rotas").update(req.body).eq("id", req.params.id).select().single();
  if (!error) return res.json(data);

  if (isSchemaCacheError(error.message)) {
    console.warn("[PUT] /rotas schema cache desatualizado — usando fallback");
    const body = { ...req.body };
    ROTA_EXTRA_FIELDS.forEach((f) => delete body[f]);
    ({ data, error } = await supabase.from("rotas").update(body).eq("id", req.params.id).select().single());
    if (error) return res.status(400).json({ error: error.message });

    const extras = Object.fromEntries(
      ROTA_EXTRA_FIELDS.filter((f) => req.body[f] != null).map((f) => [f, req.body[f]])
    );
    if (Object.keys(extras).length) {
      await supabase.from("rotas").update(extras).eq("id", req.params.id);
    }
    return res.json({ ...data, ...extras });
  }

  return res.status(400).json({ error: error.message });
});

app.delete("/api/rotas/:id", (req, res) => deletar(req, res, "rotas"));

app.get("/api/configuracoes", async (req, res) => {
  const { data, error } = await supabase
    .from("configuracoes")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) return res.status(400).json({ error: error.message });

  res.json(data || {});
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
