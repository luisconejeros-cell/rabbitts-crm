// api/drive.js — Sincroniza documentos de Google Drive al CRM
// Soporta Google Docs y Google Sheets públicos/compartidos
// NO requiere API key — usa URLs de exportación directa de Google

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usar POST' })

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

  const { fileUrls = [] } = req.body
  if (!Array.isArray(fileUrls) || fileUrls.length === 0) {
    return res.status(400).json({ error: 'fileUrls vacío' })
  }

  const sbHeaders = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates,return=minimal'
  }

  const results = []

  for (const rawUrl of fileUrls) {
    const url = rawUrl.trim()
    if (!url) continue

    let fileId = null
    let type = null
    let exportUrl = null

    // Detectar tipo de documento
    const docMatch  = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
    const sheetMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
    const pdfMatch  = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
    const openMatch = url.match(/id=([a-zA-Z0-9_-]+)/)

    if (docMatch)   { fileId = docMatch[1];   type = 'doc';   exportUrl = `https://docs.google.com/document/d/${fileId}/export?format=txt` }
    else if (sheetMatch) { fileId = sheetMatch[1]; type = 'sheet'; exportUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv&gid=0` }
    else if (pdfMatch)   { fileId = pdfMatch[1];  type = 'pdf';   exportUrl = null } // PDFs no soportados aún
    else if (openMatch)  { fileId = openMatch[1]; type = 'doc';   exportUrl = `https://docs.google.com/document/d/${fileId}/export?format=txt` }

    if (!fileId) {
      results.push({ url, ok: false, error: 'URL no reconocida. Usa Google Docs o Google Sheets.' })
      continue
    }

    if (type === 'pdf') {
      results.push({ url, ok: false, error: 'PDFs no soportados aún. Convierte a Google Doc.' })
      continue
    }

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)

      const r = await fetch(exportUrl, { signal: controller.signal })
      clearTimeout(timeout)

      if (!r.ok) {
        // Error más específico
        if (r.status === 403) throw new Error('Acceso denegado — asegúrate de que el documento esté compartido con "cualquiera con el link puede ver"')
        if (r.status === 404) throw new Error('Documento no encontrado')
        throw new Error(`HTTP ${r.status}`)
      }

      let content = await r.text()

      // Limpiar contenido
      content = content
        .replace(/\r\n/g, '\n')
        .replace(/\n{4,}/g, '\n\n\n')  // máx 3 líneas en blanco
        .trim()

      // Intentar extraer nombre del header Content-Disposition
      const cdHeader = r.headers.get('content-disposition') || ''
      let name = cdHeader.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)/i)?.[1] || ''
      name = decodeURIComponent(name).replace(/\.(txt|csv)$/i, '').trim()
      if (!name) name = type === 'sheet' ? `Planilla ${fileId.slice(0,6)}` : `Documento ${fileId.slice(0,6)}`

      const MAX_CHARS = 8000  // límite por documento
      const truncated = content.length > MAX_CHARS
      const finalContent = truncated ? content.slice(0, MAX_CHARS) + '\n[... contenido truncado]' : content

      results.push({
        fileId, url, name, type,
        content: finalContent,
        chars: content.length,
        truncated,
        ok: true,
        synced_at: new Date().toISOString()
      })

    } catch (e) {
      results.push({ url, ok: false, error: e.message })
    }
  }

  // Guardar en Supabase crm_settings clave 'drive_content'
  const okFiles = results.filter(r => r.ok)
  if (SUPABASE_URL && SUPABASE_KEY && okFiles.length > 0) {
    await fetch(`${SUPABASE_URL}/rest/v1/crm_settings`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify({
        key: 'drive_content',
        value: {
          files: okFiles,
          synced_at: new Date().toISOString(),
          fileUrls
        }
      })
    }).catch(e => console.warn('Supabase save error:', e.message))
  }

  return res.status(200).json({
    ok: true,
    synced: okFiles.length,
    total: results.length,
    results
  })
}
