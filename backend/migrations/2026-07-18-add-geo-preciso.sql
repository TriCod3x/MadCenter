-- Migração: marcador de precisão do geocode nos pedidos.
--
-- geo_preciso indica se a coordenada do pedido é um endereço exato (ROOFTOP/
-- RANGE_INTERPOLATED do Google) ou apenas um ponto aproximado — o centroide do
-- bairro/cidade, que é o que o Google devolve para ruas sem geometria mapeada
-- (ex.: José de Freitas e loteamentos novos). Serve para identificar depois quais
-- pedidos precisam de atenção / ajuste manual do ponto no mapa.
--
--   true  = endereço exato
--   false = ponto aproximado (centroide) — foi/deve ser ajustado manualmente no mapa
--   null  = sem informação (pedidos anteriores a esta migração)
--
-- Rode uma vez no SQL Editor do Supabase. O backend já é tolerante: enquanto a
-- coluna não existir, os pedidos continuam salvando (só sem gravar a flag).

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS geo_preciso BOOLEAN;
