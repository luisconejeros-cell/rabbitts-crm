// ─── Rabbitts CRM — Email notification cuando admin comenta ─────────────────
// Usa Resend.com (gratis hasta 100 emails/día)
// 
// Setup (1 vez):
//   1. Ve a resend.com → Sign up gratis
//   2. API Keys → Create API Key → copia la clave (empieza con re_...)
//   3. En Vercel → Settings → Environment Variables → agrega:
//      RESEND_API_KEY = re_xxxxxxxxxx
//      CRM_FROM_EMAIL = crm@rabbitts.com  (o el email que quieras usar como remitente)
//      CRM_URL = https://rabbitts-crm.vercel.app  (tu URL del CRM)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })

  const RESEND_KEY = process.env.RESEND_API_KEY
  const FROM_EMAIL = process.env.CRM_FROM_EMAIL || 'crm@rabbitts.com'
  const CRM_URL    = process.env.CRM_URL || 'https://rabbitts-crm.vercel.app'

  if (!RESEND_KEY) {
    // Si no hay key configurada, simplemente responde OK sin enviar
    console.warn('RESEND_API_KEY no configurada — email no enviado')
    return res.status(200).json({ success: true, skipped: true })
  }

  try {
    const { to, agentName, adminName, leadName, comment } = 
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body

    if (!to || !agentName || !comment) {
      return res.status(400).json({ error: 'Faltan campos requeridos' })
    }

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f4ff;margin:0;padding:20px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #dce8ff;">
    
    <div style="background:#1B4FC8;padding:20px 28px;display:flex;align-items:center;gap:12px;">
      <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Rabbitts Capital</div>
      <div style="color:#A8C0F0;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">CRM</div>
    </div>

    <div style="padding:28px;">
      <p style="margin:0 0 6px;font-size:14px;color:#6b7280;">Hola <strong style="color:#111827;">${agentName}</strong>,</p>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">
        <strong style="color:#1B4FC8;">${adminName}</strong> dejó un comentario en el lead de tu cliente:
      </p>

      <div style="background:#E8EFFE;border-radius:10px;padding:16px 20px;margin-bottom:20px;border-left:4px solid #1B4FC8;">
        <div style="font-size:12px;color:#4A76D8;font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Cliente</div>
        <div style="font-size:16px;font-weight:700;color:#111827;margin-bottom:14px;">${leadName}</div>
        <div style="font-size:12px;color:#4A76D8;font-weight:600;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Comentario</div>
        <div style="font-size:14px;color:#374151;line-height:1.6;">${comment}</div>
      </div>

      <a href="${CRM_URL}" style="display:inline-block;background:#1B4FC8;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:13px;font-weight:600;">
        Ver en el CRM →
      </a>
    </div>

    <div style="padding:14px 28px;border-top:1px solid #f0f4ff;font-size:11px;color:#9ca3af;">
      Este email fue enviado automáticamente por Rabbitts Capital CRM
    </div>
  </div>
</body>
</html>`

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `Rabbitts CRM <${FROM_EMAIL}>`,
        to: [to],
        subject: `💬 ${adminName} comentó en el lead de ${leadName}`,
        html
      })
    })

    const result = await r.json()
    if (!r.ok) throw new Error(result.message || 'Resend error')

    return res.status(200).json({ success: true, id: result.id })

  } catch (err) {
    console.error('Notify error:', err)
    // No falla silenciosamente para el usuario — el comentario ya se guardó
    return res.status(200).json({ success: true, warning: err.message })
  }
}
