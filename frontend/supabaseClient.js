const SUPABASE_URL = "https://keqxbxqtxwibdhjpvnwt.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WnBZQPTptyvXRSq7ak_-vQ_rPxtvWq0";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

async function testarSupabase() {
  const { data, error } = await db
    .from("pedidos")
    .select("*");

  if (error) {
    console.error("Erro Supabase:", error);
    return;
  }

  console.log("Supabase conectado:", data);
}

testarSupabase();