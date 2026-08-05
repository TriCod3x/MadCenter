-- Migração: campos do pedido que o formulário do atendente trata como opcionais
-- passam a aceitar NULL de verdade no banco.
--
-- Contexto: o formulário de balcão foi feito para cadastro rápido — nenhum campo é
-- obrigatório, e o que fica em branco é enviado como NULL. Mas estas quatro colunas
-- continuaram NOT NULL no schema, então salvar um pedido sem qualquer uma delas falha:
--   23502 — null value in column "descricao"/"destino_municipio"/"cliente"/"telefone"
--
-- NULL aqui significa "não informado". Não usar string vazia: '' mascara a diferença
-- entre "o atendente deixou em branco" e "o atendente informou um valor vazio", e
-- atrapalha relatórios e exportação CSV depois.
--
-- Rode no SQL Editor do Supabase. É idempotente.

ALTER TABLE pedidos ALTER COLUMN descricao         DROP NOT NULL;
ALTER TABLE pedidos ALTER COLUMN destino_municipio DROP NOT NULL;
ALTER TABLE pedidos ALTER COLUMN cliente           DROP NOT NULL;
ALTER TABLE pedidos ALTER COLUMN telefone          DROP NOT NULL;

-- Verificação (deve retornar 0 linhas — nenhuma das quatro ainda NOT NULL):
-- SELECT column_name, is_nullable
--   FROM information_schema.columns
--  WHERE table_name = 'pedidos'
--    AND column_name IN ('descricao', 'destino_municipio', 'cliente', 'telefone')
--    AND is_nullable = 'NO';
