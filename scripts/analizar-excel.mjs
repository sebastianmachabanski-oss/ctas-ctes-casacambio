/**
 * Analiza todas las solapas del Excel (excepto CAJA) y detecta tablas dinámicas.
 *
 * Uso:
 *   export GOOGLE_SERVICE_ACCOUNT_JSON='{ ...contenido del JSON... }'
 *   node scripts/analizar-excel.mjs
 *
 * O bien, poné el JSON en un archivo y pasalo así:
 *   GOOGLE_SERVICE_ACCOUNT_JSON="$(cat ruta/a/service-account.json)" node scripts/analizar-excel.mjs
 */

import * as XLSX from 'xlsx'
import { createRequire } from 'module'
import { writeFileSync } from 'fs'

const FILE_ID   = '1tuURACcfs09rRkynmVLqLD90Je5r-u58'
const SKIP_TABS = new Set(['CAJA'])

// ── Auth Google ─────────────────────────────────────────────────────────────

async function getGoogleToken() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('Falta GOOGLE_SERVICE_ACCOUNT_JSON en el entorno')
  const creds = JSON.parse(raw)

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const enc = s => Buffer.from(JSON.stringify(s)).toString('base64url')
  const signingInput = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc(payload)}`

  const pemContents = creds.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')

  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryDer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput))
  const sig = Buffer.from(signature).toString('base64url')

  const jwt = `${signingInput}.${sig}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Token error: ' + JSON.stringify(data))
  return data.access_token
}

// ── Descarga ─────────────────────────────────────────────────────────────────

async function downloadFile(token) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${FILE_ID}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Drive error ${res.status}: ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}

// ── Análisis ──────────────────────────────────────────────────────────────────

function analizarSolapa(sheetName, sheet) {
  const ref = sheet['!ref']
  if (!ref) return { sheetName, vacia: true }

  const range = XLSX.utils.decode_range(ref)
  const nRows = range.e.r - range.s.r + 1
  const nCols = range.e.c - range.s.c + 1

  // Leer todas las filas como arrays crudos
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })

  // Primeras 15 filas para ver encabezados
  const preview = rows.slice(0, 15)

  // Detectar fórmulas y GETPIVOTDATA
  const formulas = []
  const getpivot = []
  for (const addr in sheet) {
    if (addr.startsWith('!')) continue
    const cell = sheet[addr]
    if (cell?.f) {
      formulas.push({ addr, formula: cell.f })
      if (cell.f.toUpperCase().includes('GETPIVOTDATA')) {
        getpivot.push({ addr, formula: cell.f })
      }
    }
  }

  // Detectar si la solapa ES una tabla dinámica (tiene datos de pivot cache)
  // xlsx expone esto en sheet['!type'] o en la metadata del workbook
  const esPivot = !!sheet['!type'] && sheet['!type'] === 'pivot'

  // Heurística: buscar filas/columnas con patrones típicos de TD
  // (etiquetas en primera fila y primera columna, valores numéricos en el interior)
  const primeraFila = rows[0] ?? []
  const totalCeldasConValor = rows.flat().filter(v => v !== '').length

  return {
    sheetName,
    rango: ref,
    filas: nRows,
    columnas: nCols,
    totalCeldasConValor,
    esPivot,
    tieneGetPivotData: getpivot.length > 0,
    muestraGetPivotData: getpivot.slice(0, 3),
    totalFormulas: formulas.length,
    primeraFila,
    preview,
  }
}

function analizarPivotCaches(wb) {
  // xlsx puede exponer pivot caches en wb.Workbook o en las relaciones internas
  const resultado = []

  // Intentar acceder a la info de pivot desde el workbook
  if (wb.Workbook?.PivotCaches) {
    resultado.push('PivotCaches en wb.Workbook:', JSON.stringify(wb.Workbook.PivotCaches, null, 2))
  }

  // Las tablas dinámicas en xlsx están en xl/pivotTables/*.xml
  // Si xlsx las expone como Sheets con tipo especial, lo detectamos arriba.
  // Acá listamos todos los sheet types que xlsx nos da:
  if (wb.Workbook?.Sheets) {
    wb.Workbook.Sheets.forEach((s, i) => {
      if (s.Hidden !== undefined || s.CodeName || s.type) {
        resultado.push(`Sheet[${i}] (${wb.SheetNames[i]}): ${JSON.stringify(s)}`)
      }
    })
  }

  return resultado
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔑 Obteniendo token de Google...')
  const token = await getGoogleToken()

  console.log('⬇️  Descargando archivo...')
  const buffer = await downloadFile(token)
  console.log(`   Tamaño: ${(buffer.length / 1024 / 1024).toFixed(2)} MB\n`)

  const wb = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    cellFormula: true,
    cellNF: true,
    raw: false,
  })

  console.log(`📋 Solapas encontradas: ${wb.SheetNames.join(', ')}\n`)
  console.log('='.repeat(80))

  const pivotInfo = analizarPivotCaches(wb)
  if (pivotInfo.length) {
    console.log('\n📌 PIVOT CACHE (metadata global):')
    pivotInfo.forEach(l => console.log(l))
    console.log()
  }

  const resultados = []

  for (const sheetName of wb.SheetNames) {
    if (SKIP_TABS.has(sheetName)) {
      console.log(`⏭️  ${sheetName} — omitida (es la CAJA)\n`)
      continue
    }

    const info = analizarSolapa(sheetName, wb.Sheets[sheetName])
    resultados.push(info)

    console.log(`\n${'─'.repeat(80)}`)
    console.log(`📄 SOLAPA: "${sheetName}"`)
    console.log(`   Rango: ${info.rango}  |  Filas: ${info.filas}  |  Columnas: ${info.columnas}`)
    console.log(`   Celdas con valor: ${info.totalCeldasConValor}`)
    console.log(`   ¿Es tabla dinámica (xlsx type)?: ${info.esPivot ? 'SÍ' : 'No detectado directamente'}`)
    console.log(`   ¿Tiene GETPIVOTDATA?: ${info.tieneGetPivotData ? 'SÍ' : 'No'}`)
    console.log(`   Total fórmulas: ${info.totalFormulas}`)

    if (info.muestraGetPivotData?.length) {
      console.log(`\n   GETPIVOTDATA encontrados:`)
      info.muestraGetPivotData.forEach(g => console.log(`     ${g.addr}: ${g.formula}`))
    }

    console.log(`\n   Primera fila (encabezados):`)
    console.log('   ' + info.primeraFila.map((v, i) => `[${i}] ${v}`).join('  |  '))

    console.log(`\n   Vista previa (primeras 15 filas):`)
    info.preview.forEach((row, i) => {
      const line = row.slice(0, 12).join('\t')
      console.log(`   ${String(i).padStart(2)}│ ${line}`)
    })
  }

  // Guardar resultado completo en JSON para análisis posterior
  const outPath = './scripts/analisis-excel.json'
  writeFileSync(outPath, JSON.stringify(resultados, null, 2))
  console.log(`\n\n✅ Análisis completo guardado en ${outPath}`)
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
