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

    // ── Alerta ranking subida ─────────────────────────────────────────────────
    if (type === 'ranking_subida') {
      const { prevPos, currPos, medal, total } = body
      subject = `${medal} ¡Subiste al puesto #${currPos} en el ranking!`
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <div style="text-align:center;margin-bottom:20px">
          <div style="font-size:64px">${medal}</div>
          <h2 style="color:#1B4FC8;margin:8px 0">¡Felicitaciones ${agentName}!</h2>
          <p style="color:#64748B;font-size:16px">Subiste del puesto #${prevPos} al puesto <strong>#${currPos}</strong> en el ranking.</p>
          <p style="color:#64748B;font-size:14px">${currPos === 1 ? '¡Eres el #1 del equipo!' : 'Sigue así, vas excelente.'}</p>
        </div>
        <div style="text-align:center;background:#EEF2FF;border-radius:12px;padding:20px">
          <div style="font-size:36px;font-weight:900;color:#4F46E5">#${currPos} / ${total}</div>
          <div style="color:#6b7280;font-size:13px">Tu posición actual en el ranking de Rabbitts Capital</div>
        </div>
        <p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:20px">Rabbitts Capital CRM</p>
      </div>`
      return res.status(200).json({ success: true, preview: { to, subject } })
    }

    // ── Alerta ranking subida WhatsApp ────────────────────────────────────────
    if (type === 'ranking_subida_wa') {
      const { phone, prevPos, currPos, medal, total } = body
      if (!phone) return res.status(200).json({ success: true, skipped: 'no_phone' })
      const EVO_URL = process.env.EVO_URL || 'https://wa.rabbittscapital.com'
      const EVO_KEY = process.env.EVO_KEY || 'rabbitts2024'
      const cleanPhone = String(phone).replace(/[^0-9]/g, '')
      const text = `${medal} ¡Hola ${agentName}! Subiste del puesto #${prevPos} al puesto #${currPos} en el ranking de Rabbitts Capital. ${currPos === 1 ? '¡Eres el #1 del equipo! 🎉' : 'Sigue así, vas muy bien 💪'}`
      // Get first active WA instance
      let instanceName = ''
      try {
        const sbUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
        const sbKey = (process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()
        if (sbUrl && sbKey) {
          const r = await fetch(`${sbUrl}/rest/v1/crm_settings?key=eq.wa_numeros&select=value`, { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } })
          const d = await r.json()
          instanceName = (d?.[0]?.value || []).find(n => n.activo)?.instanceName || ''
        }
      } catch(_) {}
      if (!instanceName) return res.status(200).json({ success: true, skipped: 'no_wa_instance' })
      await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
        body: JSON.stringify({ number: cleanPhone, text, delay: 500 })
      })
      return res.status(200).json({ success: true, type: 'wa_sent' })
    }
    if (!to || !agentName) return res.status(400).json({ error: 'Faltan campos' })

    const ROLE_LABELS = {
      agent: 'Asesor / Vendedor',
      operaciones: 'Operaciones',
      finanzas: 'Finanzas',
      partner: 'Socio Comercial',
      admin: 'Administrador'
    }

    let subject, body_html

    if (type === 'masivo_equipo') {
      subject = `Rabbitts Capital — Mensaje de Luis Conejeros`
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#1B4FC8">Hola ${body.nombre||''},</h2>
        <div style="background:#f9fbff;border:1px solid #dce8ff;border-radius:8px;padding:16px;margin:16px 0;font-size:14px;line-height:1.6">
          ${body.mensaje}
        </div>
        <p style="color:#9ca3af;font-size:12px">Este mensaje fue enviado desde el CRM de Rabbitts Capital</p>
      </div>`
      to = body.to
    }
    if (type === 'nueva_reunion') {
      subject = `Nueva reunión agendada — ${body.lead?.nombre}`
      html = `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <img src="https://crm.rabbittscapital.com/icon-72.png" style="width:48px;border-radius:10px;margin-bottom:16px"/>
        <h2 style="color:#0F172A;margin:0 0 4px">Nueva reunión agendada</h2>
        <p style="color:#64748B;margin:0 0 24px">Hola ${body.broker}, tienes una nueva reunión confirmada.</p>
        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin-bottom:20px">
          <p style="margin:0 0 8px"><strong>👤 Cliente:</strong> ${body.lead?.nombre}</p>
          <p style="margin:0 0 8px"><strong>📱 Teléfono:</strong> ${body.lead?.telefono}</p>
          <p style="margin:0 0 8px"><strong>💰 Renta:</strong> ${body.lead?.renta}</p>
          <p style="margin:0 0 8px"><strong>📅 Fecha:</strong> ${body.lead?.fecha}</p>
          <p style="margin:0"><strong>🕐 Hora:</strong> ${body.lead?.hora}</p>
        </div>
        ${body.meetLink ? `<a href="${body.meetLink}" style="display:inline-block;padding:12px 24px;background:#1a73e8;color:#fff;border-radius:10px;text-decoration:none;font-weight:700">🎥 Unirse a Google Meet</a>` : ''}
        <p style="color:#9ca3af;font-size:12px;margin-top:24px">El lead ya fue creado en tu CRM de Rabbitts Capital.</p>
      </div>`
      to = body.to
    }
    if (type === 'escalation') {
      subject = `Rabito escaló a humano — ${body.lead?.nombre||'Lead'}`
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#1B4FC8">Lead escalado a humano</h2>
        <p><strong>Nombre:</strong> ${body.lead?.nombre||'—'}</p>
        <p><strong>Teléfono:</strong> ${body.lead?.telefono||'—'}</p>
        <p><strong>Renta declarada:</strong> ${body.lead?.renta||'No indicada'}</p>
        <p><strong>Notas:</strong> ${body.lead?.notes||'—'}</p>
        <p style="color:#9ca3af;font-size:12px">Revisa la conversación en el CRM</p>
      </div>`
      to = body.to
    }
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
