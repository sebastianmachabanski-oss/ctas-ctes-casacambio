import type { Config } from "@netlify/functions"

// Cron cada 15 min. Solo dispara (de forma asíncrona) la función background en modo
// incremental. Termina en milisegundos, así que entra holgado en el límite de 30s
// de las funciones programadas. El trabajo pesado lo hace sync-background (hasta 15 min).
export default async function handler() {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL
  if (!base) { console.error('No hay URL del sitio para invocar el background'); return }
  const res = await fetch(`${base}/.netlify/functions/sync-background?mode=incremental`, {
    method: 'POST',
    headers: { 'x-sync-secret': process.env.SYNC_SECRET || '' },
  })
  console.log(`Disparo incremental → ${res.status}`)
}

export const config: Config = {
  schedule: "*/15 * * * *",
}
