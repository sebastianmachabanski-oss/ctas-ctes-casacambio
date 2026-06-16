-- Agrega columna cotizacion a la tabla diario
ALTER TABLE public.diario ADD COLUMN IF NOT EXISTS cotizacion numeric(18,4);
