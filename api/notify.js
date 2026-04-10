// ─── Rabbitts CRM — Email notifications ──────────────────────────────────────
// type: 'welcome'    — nuevo usuario creado, envía credenciales
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
    if (!to || !agentName) return res.status(400).json({ error: 'Faltan campos' })

    const ROLE_LABELS = {
      agent: 'Asesor / Vendedor',
      operaciones: 'Operaciones',
      finanzas: 'Finanzas',
      partner: 'Socio Comercial',
      admin: 'Administrador'
    }

    let subject, body_html

    if (type === 'welcome') {
      const { username, pin, role } = body
      const roleLabel = ROLE_LABELS[role] || role
      subject = `👋 Bienvenido/a a Rabbitts Capital CRM — tus credenciales de acceso`
      body_html = `
        <p style="margin:0 0 6px;font-size:14px;color:#6b7280;">Hola <strong style="color:#111827;">${agentName}</strong>,</p>
        <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">
          <strong style="color:#1B4FC8;">${adminName}</strong> te ha creado una cuenta en el CRM de Rabbitts Capital. 
          Ya puedes ingresar con tus credenciales:
        </p>
        <div style="background:#E8EFFE;border-radius:10px;padding:20px 24px;margin-bottom:16px;border-left:4px solid #1B4FC8;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="color:#6b7280;padding:5px 0;width:100px;">🌐 URL</td><td style="font-weight:700;color:#1B4FC8;"><a href="${CRM_URL}" style="color:#1B4FC8;">${CRM_URL}</a></td></tr>
            <tr><td style="color:#6b7280;padding:5px 0;">👤 Usuario</td><td style="font-weight:700;color:#111827;font-size:16px;">${username}</td></tr>
            <tr><td style="color:#6b7280;padding:5px 0;">🔑 PIN</td><td style="font-weight:700;color:#111827;font-size:20px;letter-spacing:4px;">${pin}</td></tr>
            <tr><td style="color:#6b7280;padding:5px 0;">🏷️ Rol</td><td style="font-weight:600;color:#374151;">${roleLabel}</td></tr>
          </table>
        </div>
        <div style="background:#FFFBEB;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
          <p style="margin:0;font-size:13px;color:#92400e;">
            ⚠️ <strong>PIN temporal</strong> — una vez que ingreses, puedes cambiarlo desde 
            <strong>"Mi perfil"</strong> en la barra superior del CRM.
          </p>
        </div>`

    } else if (type === 'assignment') {
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
      // comment
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
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4ff;margin:0;padding:20px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #dce8ff;">
    <div style="background:#1B4FC8;padding:20px 28px;">
      <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.5px;">Rabbitts Capital</div>
      <div style="color:#A8C0F0;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">CRM Inmobiliario</div>
    </div>
    <div style="padding:28px;">
      ${body_html}
      <a href="${CRM_URL}" style="display:inline-block;background:#1B4FC8;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:13px;font-weight:600;">
        Ingresar al CRM →
      </a>
    </div>
    <div style="padding:14px 28px;border-top:1px solid #f0f4ff;font-size:11px;color:#9ca3af;">
      Este email fue enviado automáticamente por Rabbitts Capital CRM
    </div>
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
