import type { Config } from "@netlify/functions"

// Cron diario 03:00 (UTC) fuera de horario laboral. Dispara la función background en
// modo full: reconciliación total de la planilla contra la base, para garantizar que
// queden iguales al menos una vez al día (cubre ediciones a filas viejas que el
// incremental de los últimos 30 días no alcanza a ver).
export default async function handler() {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL
  if (!base) { console.error('No hay URL del sitio para invocar el background'); return }
  const res = await fetch(`${base}/.netlify/functions/sync-background?mode=full`, {
    method: 'POST',
    headers: { 'x-sync-secret': process.env.SYNC_SECRET || '' },
  })
  console.log(`Disparo full → ${res.status}`)
}

export const config: Config = {
  schedule: "0 3 * * *",
}
