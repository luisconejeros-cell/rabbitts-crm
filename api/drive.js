// api/drive.js — Sincroniza Google Drive via Apps Script proxy o URLs individuales

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usar POST' })

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
  const sbHeaders = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal'
  }

  const { fileUrls = [], scriptUrl = '', folderIds = [] } = req.body
  const results = []

  // ── MODO 1: Google Apps Script (carpetas completas) ─────────────────────────
  if (scriptUrl && folderIds.length > 0) {
    for (const folderId of folderIds) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15000)
        const r = await fetch(`${scriptUrl}?folderId=${encodeURIComponent(folderId)}`, {
          signal: controller.signal
        })
        clearTimeout(timeout)

        if (!r.ok) throw new Error(`HTTP ${r.status} desde Apps Script`)
        const data = await r.json()

        if (!data.ok) throw new Error(data.error || 'Error en Apps Script')

        for (const f of (data.files || [])) {
          results.push({
            fileId: f.id,
            url: `https://docs.google.com/document/d/${f.id}`,
            name: f.name,
            type: f.type?.includes('spreadsheet') ? 'sheet' : 'doc',
            content: (f.content || '').slice(0, 8000),
            chars: (f.content || '').length,
            truncated: (f.content || '').length > 8000,
            folder: data.folder || folderId,
            ok: true,
            synced_at: new Date().toISOString()
          })
        }
      } catch (e) {
        results.push({ folderId, ok: false, error: e.message })
      }
    }
  }

  // ── MODO 2: URLs individuales de Google Docs / Sheets ──────────────────────
  for (const rawUrl of fileUrls) {
    const url = rawUrl.trim()
    if (!url) continue

    let fileId = null, type = null, exportUrl = null

    const docMatch   = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
    const sheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)

    if (docMatch)   { fileId = docMatch[1];   type = 'doc';   exportUrl = `https://docs.google.com/document/d/${fileId}/export?format=txt` }
    else if (sheetMatch) { fileId = sheetMatch[1]; type = 'sheet'; exportUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv&gid=0` }
    else { results.push({ url, ok: false, error: 'URL no reconocida. Usa Google Docs o Google Sheets.' }); continue }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      const r = await fetch(exportUrl, { signal: controller.signal })
      clearTimeout(timeout)

      if (!r.ok) {
        if (r.status === 403) throw new Error('Acceso denegado — comparte el doc como "Cualquiera con el link puede ver"')
        if (r.status === 404) throw new Error('Documento no encontrado')
        throw new Error(`HTTP ${r.status}`)
      }

      let content = (await r.text()).replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim()
      const cdHeader = r.headers.get('content-disposition') || ''
      let name = cdHeader.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)/i)?.[1] || ''
      name = decodeURIComponent(name).replace(/\.(txt|csv)$/i, '').trim() || (type === 'sheet' ? `Planilla ${fileId.slice(0,6)}` : `Documento ${fileId.slice(0,6)}`)

      const truncated = content.length > 8000
      results.push({
        fileId, url, name, type,
        content: truncated ? content.slice(0, 8000) + '\n[...truncado]' : content,
        chars: content.length, truncated, ok: true,
        synced_at: new Date().toISOString()
      })
    } catch (e) {
      results.push({ url, ok: false, error: e.message })
    }
  }

  // ── Guardar en Supabase ─────────────────────────────────────────────────────
  const okFiles = results.filter(r => r.ok)
  if (SUPABASE_URL && SUPABASE_KEY) {
    await fetch(`${SUPABASE_URL}/rest/v1/crm_settings`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify({
        key: 'drive_content',
        value: { files: okFiles, synced_at: new Date().toISOString(), fileUrls, folderIds, scriptUrl }
      })
    }).catch(e => console.warn('Supabase save error:', e.message))
  }

  return res.status(200).json({ ok: true, synced: okFiles.length, total: results.length, results })
}
