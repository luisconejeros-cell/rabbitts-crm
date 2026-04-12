// api/whatsapp.js — Evolution API webhook (WhatsApp QR via WA Web)
export default async function handler(req, res) {

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', service: 'Rabbitts WhatsApp Webhook' })
  }

  if (req.method === 'POST') {
    res.status(200).json({ status: 'ok' })

    try {
      const body = req.body
      if (body?.event !== 'messages.upsert') return

      const msg = body?.data?.messages?.[0] || body?.data
      if (!msg) return
      if (msg.key?.fromMe) return

      const remoteJid = msg.key?.remoteJid || ''
      // Ignorar grupos
      if (remoteJid.includes('@g.us')) return
      // Manejar @s.whatsapp.net y @lid (nuevo formato WhatsApp)
      const from = remoteJid.replace('@s.whatsapp.net','').replace('@lid','')
      const msgText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
      const instanceName = body?.instance || body?.instanceName || ''
      const pushName = msg.pushName || from

      if (!msgText || !from) return

      const SUPABASE_URL = process.env.VITE_SUPABASE_URL
      const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
      const EVO_URL = 'https://wa.rabbittscapital.com'
      const EVO_KEY = 'rabbitts2024'

      const sbHeaders = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }

      // Enviar mensaje via Evolution API — usar remoteJid completo para responder
      const sendWA = async (text) => {
        await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
          body: JSON.stringify({
            number: remoteJid,
            options: { delay: 500 },
            textMessage: { text }
          })
        })
      }

      // Buscar conversación existente
      const convRes = await fetch(
        `${SUPABASE_URL}/rest/v1/crm_conversations?telefono=eq.%2B${from}&order=created_at.desc&limit=1`,
        { headers: sbHeaders }
      )
      const convs = await convRes.json()
      let conv = Array.isArray(convs) ? convs[0] : null

      if (!conv) {
        conv = {
          id: 'conv-' + Date.now(),
          telefono: '+' + from,
          nombre: pushName,
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

      // Guardar mensaje entrante
      await fetch(`${SUPABASE_URL}/rest/v1/crm_conv_messages`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({
          conv_id: conv.id,
          role: 'user',
          content: msgText,
          created_at: new Date().toISOString()
        })
      })

      // Modo humano → no responder con IA
      if (conv.mode === 'humano') {
        await fetch(`${SUPABASE_URL}/rest/v1/crm_conversations`, {
          method: 'POST',
          headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ ...conv, last_message: msgText, updated_at: new Date().toISOString() })
        })
        return
      }

      // Cargar iaConfig
      const cfgRes = await fetch(
        `${SUPABASE_URL}/rest/v1/crm_settings?key=eq.ia_config&select=value`,
        { headers: sbHeaders }
      )
      const cfgData = await cfgRes.json()
      const iaConfig = cfgData?.[0]?.value || {}
      if (!iaConfig.activo) return

      // Cargar historial
      const histRes = await fetch(
        `${SUPABASE_URL}/rest/v1/crm_conv_messages?conv_id=eq.${conv.id}&order=created_at.asc&limit=20`,
        { headers: sbHeaders }
      )
      const histData = await histRes.json()
      const history = Array.isArray(histData)
        ? histData.map(m => ({ role: m.role, content: m.content }))
        : []

      // Llamar a Rabito
      const agentRes = await fetch('https://crm.rabbittscapital.com/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msgText,
          conversationHistory: history.slice(0, -1),
          iaConfig,
          leadData: { telefono: '+' + from, nombre: conv.nombre }
        })
      })
      const agentData = await agentRes.json()
      const reply = agentData?.reply
      if (!reply) return

      // Enviar respuesta
      await sendWA(reply)

      // Guardar respuesta
      await fetch(`${SUPABASE_URL}/rest/v1/crm_conv_messages`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({
          conv_id: conv.id,
          role: 'assistant',
          content: reply,
          created_at: new Date().toISOString()
        })
      })

      // Actualizar conversación
      await fetch(`${SUPABASE_URL}/rest/v1/crm_conversations`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          ...conv,
          last_message: reply,
          updated_at: new Date().toISOString(),
          ...(agentData?.leadUpdate || {})
        })
      })

      // Escalación
      if (agentData?.action === 'escalacion') {
        await fetch(`${SUPABASE_URL}/rest/v1/crm_conversations`, {
          method: 'POST',
          headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ ...conv, mode: 'humano', updated_at: new Date().toISOString() })
        })
        await fetch('https://crm.rabbittscapital.com/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'escalation',
            to: process.env.CRM_ADMIN_EMAIL,
            lead: { nombre: conv.nombre, telefono: '+' + from }
          })
        }).catch(() => {})
      }

    } catch (err) {
      console.error('WhatsApp webhook error:', err)
    }
    return
  }

  return res.status(405).end()
}
