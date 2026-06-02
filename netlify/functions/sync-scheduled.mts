import type { Config } from "@netlify/functions"
import { createClient } from "@supabase/supabase-js"
import * as XLSX from "xlsx"

const ONEDRIVE_URL = process.env.ONEDRIVE_EXCEL_URL!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function mapMoneda(moneda: string | null): string {
  if (!moneda) return "DOLARES"
  const m = String(moneda).trim().toUpperCase()
  if (m.includes("DOLAR") || m === "USD") return "DOLARES"
  if (m.includes("PESO") || m === "ARS") return "PESOS"
  if (m.includes("EURO") || m === "EUR") return "EUROS"
  if (m.includes("REAL") || m === "BRL") return "REALES"
  return m
}

function parseFecha(val: any): string | null {
  if (!val) return null
  if (typeof val === "number") {
    const date = XLSX.SSF.parse_date_code(val)
    if (!date) return null
    return `${date.y}-${String(date.m).padStart(2,"0")}-${String(date.d).padStart(2,"0")}`
  }
  if (val instanceof Date) return val.toISOString().slice(0, 10)
  const s = String(val).trim()
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0, 10)
  if (s.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
    const [d, m, y] = s.split("/")
    return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`
  }
  return null
}

function toNum(val: any): number {
  if (!val) return 0
  const n = parseFloat(String(val).replace(/[^0-9.-]/g, ""))
  return isNaN(n) ? 0 : n
}

export default async function handler() {
  console.log("🔄 Iniciando sync automático...")

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const res = await fetch(ONEDRIVE_URL, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    })
    if (!res.ok) throw new Error(`Error descargando Excel: ${res.status}`)

    const buffer = await res.arrayBuffer()
    const wb = XLSX.read(buffer, { type: "array", cellDates: false })

    const sheetName = wb.SheetNames.find(n => n.toUpperCase() === "DIARIO")
    if (!sheetName) throw new Error("No se encontró la solapa DIARIO")

    const ws = wb.Sheets[sheetName]
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

    let headerRow = -1
    let headers: string[] = []
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i]
      if (row && row.some((c: any) => String(c || "").toUpperCase().includes("FECHA"))) {
        headerRow = i
        headers = row.map((c: any) => String(c || "").trim().toUpperCase())
        break
      }
    }
    if (headerRow < 0) throw new Error("No se encontró fila de encabezados")

    const col = (name: string) => headers.findIndex(h => h.includes(name))
    const iDate   = col("FECHA")
    const iTipo   = col("TIPO")
    const iCtaCte = col("CTA CTE")
    const iOp     = col("OPERACI")
    const iConc   = col("CONCEPTO")
    const iEvento = col("EVENTO")
    const iMoneda = col("PROPIO")
    const iMonto  = col("MONTO")
    const iCCPesos  = headers.findIndex(h => h === "CC PESOS")
    const iCCDolar  = headers.findIndex(h => h === "CC DOLARES")
    const iCCEuro   = headers.findIndex(h => h === "CC EUROS")
    const iCCReal   = headers.findIndex(h => h === "CC REALES")

    const movimientos = []
    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || !row[iTipo]) continue
      const tipo = String(row[iTipo] || "").trim().toUpperCase()
      if (tipo !== "CTA CTE") continue
      const fecha = parseFecha(row[iDate])
      if (!fecha) continue
      const ctaCte = String(row[iCtaCte] || "").trim()
      if (!ctaCte) continue

      movimientos.push({
        fecha,
        tipo: "CTA CTE",
        cuenta_cte: ctaCte,
        operacion: String(row[iOp] || "").trim().toUpperCase(),
        concepto: row[iConc] ? String(row[iConc]).trim() : null,
        evento: row[iEvento] ? String(row[iEvento]).trim() : null,
        moneda: mapMoneda(row[iMoneda]),
        monto: toNum(row[iMonto]),
        cc_pesos:   iCCPesos  >= 0 ? toNum(row[iCCPesos])  : 0,
        cc_dolares: iCCDolar  >= 0 ? toNum(row[iCCDolar])  : 0,
        cc_euros:   iCCEuro   >= 0 ? toNum(row[iCCEuro])   : 0,
        cc_reales:  iCCReal   >= 0 ? toNum(row[iCCReal])   : 0,
        anulado: false,
      })
    }

    if (movimientos.length === 0) throw new Error("Sin movimientos CTA CTE")

    await supabase.from("diario").delete().eq("tipo", "CTA CTE").eq("anulado", false)

    for (let i = 0; i < movimientos.length; i += 500) {
      const lote = movimientos.slice(i, i + 500)
      const { error } = await supabase.from("diario").insert(lote)
      if (error) throw new Error("Error insertando: " + error.message)
    }

    const cuentasSet = new Set(movimientos.map(m => m.cuenta_cte))
    for (const nombre of Array.from(cuentasSet)) {
      await supabase.from("cuentas_corrientes")
        .upsert({ nombre, activo: true }, { onConflict: "nombre", ignoreDuplicates: true })
    }

    console.log(`✅ Sync OK: ${movimientos.length} movimientos, ${cuentasSet.size} cuentas`)
  } catch (err: any) {
    console.error("❌ Sync error:", err.message)
  }
}

export const config: Config = {
  schedule: "*/15 * * * *"
}
