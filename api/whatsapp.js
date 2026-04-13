// api/whatsapp.js — Evolution API v2 webhook
export default async function handler(req, res) {

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', service: 'Rabbitts WhatsApp Webhook v2' })
  }

  if (req.method === 'POST') {
    try {
      const body = req.body
      const event = (body?.event || '').toLowerCase()
      const instanceName = body?.instance || ''

      const SUPABASE_URL = process.env.VITE_SUPABASE_URL
      const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
      const EVO_URL = 'https://wa.rabbittscapital.com'
      const EVO_KEY = 'rabbitts2024'

      const sbHeaders = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }

      // ── QR Code recibido ─────────────────────────────────────────────────
      if (event.includes('qrcode') || event.includes('qr')) {
        const qrBase64 = body?.data?.qrcode?.base64 || body?.data?.base64 || body?.data?.qr
        console.log('QR event received, has base64:', !!qrBase64, 'instance:', instanceName)
        if (qrBase64) {
          // Guardar QR en Supabase para que el CRM lo muestre
          await fetch(`${SUPABASE_URL}/rest/v1/crm_settings`, {
            method: 'POST',
            headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({ key: `wa_qr_${instanceName}`, value: { qr: qrBase64, ts: Date.now() } })
          })
          console.log('QR saved to Supabase for instance:', instanceName)
        }
        return res.status(200).json({ status: 'ok', event: 'qr' })
      }

      // ── Conexión establecida ─────────────────────────────────────────────
      if (event.includes('connection')) {
        const state = body?.data?.state || body?.data?.connection
        console.log('Connection event:', state, 'instance:', instanceName)
        if (state === 'open') {
          // Limpiar QR guardado
          await fetch(`${SUPABASE_URL}/rest/v1/crm_settings?key=eq.wa_qr_${instanceName}`, {
            method: 'DELETE',
            headers: sbHeaders
          })
          console.log('Connected! QR cleared for:', instanceName)
        }
        return res.status(200).json({ status: 'ok', event: 'connection', state })
      }

      // ── Mensajes entrantes ───────────────────────────────────────────────
      if (!event.includes('messages') || !event.includes('upsert')) {
        return res.status(200).json({ status: 'ok', skipped: event })
      }

      const data = body?.data
      const msg = Array.isArray(data) ? data[0] : data
      if (!msg) return res.status(200).json({ status: 'ok', skipped: 'no msg' })
      if (msg.key?.fromMe) return res.status(200).json({ status: 'ok', skipped: 'fromMe' })

      const remoteJid = msg.key?.remoteJid || ''
      if (remoteJid.includes('@g.us')) return res.status(200).json({ status: 'ok', skipped: 'group' })

      const msgText = msg.message?.conversation ||
                      msg.message?.extendedTextMessage?.text ||
                      msg.message?.imageMessage?.caption || ''
      const pushName = msg.pushName || ''

      let phoneFrom = remoteJid
        .replace(/@s\.whatsapp\.net$/, '')
        .replace(/@lid$/, '')
        .replace(/@[\w.]+$/, '')

      let sendNumber = remoteJid.endsWith('@s.whatsapp.net') ? phoneFrom : remoteJid

      console.log('msg from:', phoneFrom, 'sendTo:', sendNumber, 'text:', msgText?.slice(0,30))

      if (!msgText || !phoneFrom) return res.status(200).json({ status: 'ok', skipped: 'no text/from' })

      const sendWA = async (text) => {
        const r = await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
          body: JSON.stringify({ number: sendNumber, options: { delay: 500 }, textMessage: { text } })
        })
        const rb = await r.text()
        console.log('sendWA status:', r.status, rb.slice(0, 100))
      }

      const convRes = await fetch(
        `${SUPABASE_URL}/rest/v1/crm_conversations?telefono=eq.%2B${phoneFrom}&order=created_at.desc&limit=1`,
        { headers: sbHeaders }
      )
      const convs = await convRes.json()
      let conv = Array.isArray(convs) ? convs[0] : null

      if (!conv) {
        conv = {
          id: 'conv-' + Date.now(),
          telefono: '+' + phoneFrom,
          nombre: pushName || phoneFrom,
          mode: 'ia',
          status: 'activo',
          instanceName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_message: msgText
        }
        await fetch(`${SUPABASE_URL}/rest/v1/crm_conversations`, {
          method: 'POST',
          headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(conv)
        })
      }

      await fetch(`${SUPABASE_URL}/rest/v1/crm_conv_messages`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({ conv_id: conv.id, role: 'user', content: msgText, created_at: new Date().toISOString() })
      })

      if (conv.mode === 'humano') {
        await fetch(`${SUPABASE_URL}/rest/v1/crm_conversations`, {
          method: 'POST',
          headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ ...conv, last_message: msgText, updated_at: new Date().toISOString() })
        })
        return res.status(200).json({ status: 'ok', mode: 'humano' })
      }

      const cfgRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_settings?key=eq.ia_config&select=value`, { headers: sbHeaders })
      const cfgData = await cfgRes.json()
      const iaConfig = cfgData?.[0]?.value || {}
      if (!iaConfig.activo) return res.status(200).json({ status: 'ok', skipped: 'ia off' })

      const histRes = await fetch(
        `${SUPABASE_URL}/rest/v1/crm_conv_messages?conv_id=eq.${conv.id}&order=created_at.asc&limit=20`,
        { headers: sbHeaders }
      )
      const histData = await histRes.json()
      const history = Array.isArray(histData) ? histData.map(m => ({ role: m.role, content: m.content })) : []

      const agentRes = await fetch('https://crm.rabbittscapital.com/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msgText, conversationHistory: history.slice(0,-1), iaConfig, leadData: { telefono: '+'+phoneFrom, nombre: conv.nombre } })
      })
      const agentData = await agentRes.json()
      const reply = agentData?.reply
      if (!reply) return res.status(200).json({ status: 'ok', skipped: 'no reply' })

      await sendWA(reply)

      await fetch(`${SUPABASE_URL}/rest/v1/crm_conv_messages`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({ conv_id: conv.id, role: 'assistant', content: reply, created_at: new Date().toISOString() })
      })

      await fetch(`${SUPABASE_URL}/rest/v1/crm_conversations`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ ...conv, last_message: reply, updated_at: new Date().toISOString(), ...(agentData?.leadUpdate||{}) })
      })

      if (agentData?.action === 'escalacion') {
        await fetch(`${SUPABASE_URL}/rest/v1/crm_conversations`, {
          method: 'POST',
          headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ ...conv, mode: 'humano', updated_at: new Date().toISOString() })
        })
        await fetch('https://crm.rabbittscapital.com/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'escalation', to: process.env.CRM_ADMIN_EMAIL, lead: { nombre: conv.nombre, telefono: '+'+phoneFrom } })
        }).catch(()=>{})
      }

      return res.status(200).json({ status: 'ok', replied: true })

    } catch (err) {
      console.error('WA webhook error:', err.message)
      return res.status(200).json({ status: 'error', message: err.message })
    }
  }

  return res.status(405).end()
}
