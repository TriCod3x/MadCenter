-- Migração: permite a rota especial "Não encontrados" na tabela `rotas`.
--
-- Contexto: a rota de revisão manual agrupa pedidos sem localização confiável.
-- Ela não tem destino (não é um trajeto real) e usa `tipo_rota = 'Não encontrados'`
-- como marcador em todo o sistema (backend, mural do motorista, tabela e mapa do admin).
--
-- Sem esta migração o INSERT da rota falha com dois erros e o pedido fica órfão,
-- sem rota nenhuma e sem aparecer para ninguém:
--   23502 — null value in column "destino_municipio"/"destino_estado"
--   23514 — new row violates check constraint "rotas_tipo_rota_check"
--
-- Rode no SQL Editor do Supabase. É idempotente.

-- 1. Rota de revisão manual não tem destino: as duas colunas passam a aceitar NULL.
ALTER TABLE rotas ALTER COLUMN destino_municipio DROP NOT NULL;
ALTER TABLE rotas ALTER COLUMN destino_estado    DROP NOT NULL;

-- 2. O CHECK de tipo_rota só aceitava os três tipos de trajeto. Amplia para o marcador.
ALTER TABLE rotas DROP CONSTRAINT IF EXISTS rotas_tipo_rota_check;
ALTER TABLE rotas ADD  CONSTRAINT rotas_tipo_rota_check
  CHECK (tipo_rota IN ('Rodoviária', 'Urbana', 'Mista', 'Não encontrados'));

-- Verificação (deve retornar 0 linhas):
-- SELECT id, codigo, tipo_rota FROM rotas
--  WHERE tipo_rota NOT IN ('Rodoviária', 'Urbana', 'Mista', 'Não encontrados');
