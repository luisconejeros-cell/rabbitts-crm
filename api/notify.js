// ─── Rabbitts CRM — Email notifications ──────────────────────────────────────
// type: 'assignment' — lead asignado a agente
// type: 'comment'    — admin comentó en lead del agente

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })

  const RESEND_KEY = process.env.RESEND_API_KEY
  const FROM_EMAIL = process.env.CRM_FROM_EMAIL || 'crm@rabbittscapital.com'
  const CRM_URL    = process.env.CRM_URL || 'https://crm.rabbittscapital.com'

  if (!RESEND_KEY) {
    console.warn('RESEND_API_KEY no configurada')
    return res.status(200).json({ success: true, skipped: true })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { type = 'comment', to, agentName, adminName, leadName } = body
    if (!to || !agentName || !leadName) return res.status(400).json({ error: 'Faltan campos' })

    const header = `
      <div style="background:#1B4FC8;padding:20px 28px;">
        <div style="color:#fff;font-size:20px;font-weight:800;">Rabbitts Capital</div>
        <div style="color:#A8C0F0;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">CRM · ${type === 'assignment' ? 'Nuevo lead asignado' : 'Nuevo comentario'}</div>
      </div>`

    const footer = `<div style="padding:14px 28px;border-top:1px solid #f0f4ff;font-size:11px;color:#9ca3af;">Email automático — Rabbitts Capital CRM</div>`

    let subject, body_html

    if (type === 'assignment') {
      const { leadPhone, leadEmail, leadRenta } = body
      subject = `📋 Se te asignó un lead — ${leadName}`
      body_html = `
        <p style="margin:0 0 6px;font-size:14px;color:#6b7280;">Hola <strong style="color:#111827;">${agentName}</strong>,</p>
        <p style="margin:0 0 20px;font-size:14px;color:#6b7280;"><strong style="color:#1B4FC8;">${adminName}</strong> te asignó un nuevo lead:</p>
        <div style="background:#E8EFFE;border-radius:10px;padding:16px 20px;margin-bottom:20px;border-left:4px solid #1B4FC8;">
          <div style="font-size:18px;font-weight:800;color:#111827;margin-bottom:10px;">${leadName}</div>
          ${leadPhone && leadPhone !== '—' ? `<div style="font-size:13px;color:#374151;margin-bottom:4px;">📞 ${leadPhone}</div>` : ''}
          ${leadEmail && leadEmail !== '—' ? `<div style="font-size:13px;color:#374151;margin-bottom:4px;">✉️ ${leadEmail}</div>` : ''}
          ${leadRenta && leadRenta !== '—' ? `<div style="font-size:13px;color:#374151;">💰 ${leadRenta}</div>` : ''}
        </div>`
    } else {
      const { comment } = body
      subject = `💬 ${adminName} comentó en el lead de ${leadName}`
      body_html = `
        <p style="margin:0 0 6px;font-size:14px;color:#6b7280;">Hola <strong style="color:#111827;">${agentName}</strong>,</p>
        <p style="margin:0 0 20px;font-size:14px;color:#6b7280;"><strong style="color:#1B4FC8;">${adminName}</strong> comentó en el lead de <strong>${leadName}</strong>:</p>
        <div style="background:#E8EFFE;border-radius:10px;padding:16px 20px;margin-bottom:20px;border-left:4px solid #1B4FC8;">
          <div style="font-size:14px;color:#374151;line-height:1.6;">${comment}</div>
        </div>`
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,sans-serif;background:#f0f4ff;margin:0;padding:20px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #dce8ff;">
    ${header}
    <div style="padding:28px;">
      ${body_html}
      <a href="${CRM_URL}" style="display:inline-block;background:#1B4FC8;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:13px;font-weight:600;">Ver en el CRM →</a>
    </div>
    ${footer}
  </div>
</body></html>`

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `Rabbitts CRM <${FROM_EMAIL}>`, to: [to], subject, html })
    })
    const result = await r.json()
    if (!r.ok) throw new Error(result.message || 'Resend error')
    return res.status(200).json({ success: true, id: result.id })
  } catch (err) {
    console.error('Notify error:', err)
    return res.status(200).json({ success: true, warning: err.message })
  }
}
