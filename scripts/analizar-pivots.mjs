/**
 * Extrae las definiciones REALES de tablas dinámicas del .xlsx (campos de
 * filtro / fila / columna / valor), parseando el XML interno del paquete.
 *
 * Uso:
 *   GOOGLE_SERVICE_ACCOUNT_JSON="$(cat sa.json)" node scripts/analizar-pivots.mjs
 */
import JSZip from 'jszip'
import { writeFileSync } from 'fs'

const FILE_ID = '1tuURACcfs09rRkynmVLqLD90Je5r-u58'

async function getGoogleToken() {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  const now = Math.floor(Date.now() / 1000)
  const enc = s => Buffer.from(JSON.stringify(s)).toString('base64url')
  const signingInput = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  })}`
  const pem = creds.private_key.replace(/-----[^-]+-----/g, '').replace(/\n/g, '')
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))).toString('base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${signingInput}.${sig}`,
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Token: ' + JSON.stringify(data))
  return data.access_token
}

// Mini-parser: saca atributos de un tag y listas de hijos por nombre.
function attrs(tag) {
  const o = {}
  for (const m of tag.matchAll(/(\w+)="([^"]*)"/g)) o[m[1]] = m[2]
  return o
}
function findAll(xml, tag) {
  const out = []
  const re = new RegExp(`<${tag}\\b[^>]*?/?>`, 'g')
  let m
  while ((m = re.exec(xml))) out.push(m[0])
  return out
}
// Extrae el bloque <parent ...>...</parent> (primer match)
function block(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`))
  return m ? m[1] : ''
}

async function main() {
  const token = await getGoogleToken()
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${FILE_ID}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const buf = Buffer.from(await res.arrayBuffer())
  const zip = await JSZip.loadAsync(buf)

  // 1) Cache definitions: dan los nombres de campo de cada pivot cache.
  const caches = {} // cacheId archivo -> [fieldNames]
  for (const path of Object.keys(zip.files)) {
    if (/xl\/pivotCache\/pivotCacheDefinition\d+\.xml$/.test(path)) {
      const xml = await zip.files[path].async('string')
      const fieldsBlock = block(xml, 'cacheFields')
      const names = findAll(fieldsBlock, 'cacheField').map(t => attrs(t).name)
      caches[path] = names
    }
  }

  // 2) Pivot table definitions
  const pivots = []
  for (const path of Object.keys(zip.files)) {
    if (!/xl\/pivotTables\/pivotTable\d+\.xml$/.test(path)) continue
    const xml = await zip.files[path].async('string')
    const root = attrs(xml.match(/<pivotTableDefinition\b[^>]*>/)[0])

    // Relación con su cacheDefinition (para obtener nombres de campo)
    const relPath = path.replace(/pivotTables\/(pivotTable\d+)\.xml/, 'pivotTables/_rels/$1.xml.rels')
    let fieldNames = []
    if (zip.files[relPath]) {
      const rels = await zip.files[relPath].async('string')
      const rel = findAll(rels, 'Relationship').map(attrs).find(r => /pivotCacheDefinition/.test(r.Target))
      if (rel) {
        const cacheFile = 'xl/pivotCache/' + rel.Target.replace(/^.*pivotCache\//, '').replace(/^\.\.\//, '')
        fieldNames = caches[cacheFile] || caches[Object.keys(caches)[0]] || []
      }
    }
    if (!fieldNames.length) fieldNames = caches[Object.keys(caches)[0]] || []

    const idxName = i => fieldNames[Number(i)] ?? `#${i}`

    // pivotFields (para saber el axis de cada uno) — opcional
    // pageFields = filtros
    const pageFields = findAll(block(xml, 'pageFields'), 'pageField')
      .map(attrs).map(a => idxName(a.fld))
    // rowFields
    const rowFields = findAll(block(xml, 'rowFields'), 'field')
      .map(attrs).map(a => a.x === '-2' ? '(Σ Valores)' : idxName(a.x))
    // colFields
    const colFields = findAll(block(xml, 'colFields'), 'field')
      .map(attrs).map(a => a.x === '-2' ? '(Σ Valores)' : idxName(a.x))
    // dataFields = valores
    const dataFields = findAll(block(xml, 'dataFields'), 'dataField')
      .map(attrs).map(a => `${a.name || idxName(a.fld)} [${a.subtotal || 'sum'}]`)

    pivots.push({
      archivo: path,
      nombre: root.name,
      destino: root.location ? undefined : undefined,
      ubicacion: (xml.match(/<location ref="([^"]+)"/) || [])[1],
      filtros_pagina: pageFields,
      filas: rowFields,
      columnas: colFields,
      valores: dataFields,
      todos_los_campos: fieldNames,
    })
  }

  console.log(JSON.stringify(pivots, null, 2))
  writeFileSync('./scripts/pivots.json', JSON.stringify(pivots, null, 2))
  console.error(`\n✅ ${pivots.length} tablas dinámicas → scripts/pivots.json`)
}
main().catch(e => { console.error('❌', e.stack); process.exit(1) })
