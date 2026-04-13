// api/whatsapp.js — Meta Cloud API oficial
export default async function handler(req, res) {

  // ── Verificación webhook Meta ─────────────────────────────────────────────
  if (req.method === 'GET') {
    const mode = req.query['hub.mode']
    const token = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']
    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
      return res.status(200).send(challenge)
    }
    return res.status(403).end()
  }

  if (req.method === 'POST') {
    try {
      const body = req.body
      const entry = body?.entry?.[0]
      const changes = entry?.changes?.[0]
      const value = changes?.value

      if (!value?.messages?.length) {
        return res.status(200).json({ status: 'ok', skipped: 'no messages' })
      }

      const msg = value.messages[0]
      if (msg.type !== 'text') return res.status(200).json({ status: 'ok', skipped: 'non-text' })

      const from = msg.from // número real sin @
      const msgText = msg.text?.body || ''
      const pushName = value.contacts?.[0]?.profile?.name || from
      const phoneNumberId = value.metadata?.phone_number_id

      console.log('Meta msg from:', from, 'text:', msgText?.slice(0, 30))

      if (!msgText || !from) return res.status(200).json({ status: 'ok', skipped: 'no text/from' })

      const SUPABASE_URL = process.env.VITE_SUPABASE_URL
      const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
      const META_TOKEN = process.env.META_ACCESS_TOKEN
      const META_PHONE_ID = process.env.META_PHONE_NUMBER_ID || phoneNumberId

      const sbHeaders = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }

      const sendWA = async (text) => {
        const r = await fetch(`https://graph.facebook.com/v19.0/${META_PHONE_ID}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${META_TOKEN}`
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: { body: text }
          })
        })
        const rb = await r.text()
        console.log('sendWA Meta status:', r.status, rb.slice(0, 150))
      }

      // Buscar conversación
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
          instanceName: META_PHONE_ID,
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
        body: JSON.stringify({
          message: msgText,
          conversationHistory: history.slice(0, -1),
          iaConfig,
          leadData: { telefono: '+' + from, nombre: conv.nombre }
        })
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
        body: JSON.stringify({ ...conv, last_message: reply, updated_at: new Date().toISOString(), ...(agentData?.leadUpdate || {}) })
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
          body: JSON.stringify({ type: 'escalation', to: process.env.CRM_ADMIN_EMAIL, lead: { nombre: conv.nombre, telefono: '+' + from } })
        }).catch(() => {})
      }

      return res.status(200).json({ status: 'ok', replied: true })

    } catch (err) {
      console.error('Meta webhook error:', err.message)
      return res.status(200).json({ status: 'error', message: err.message })
    }
  }

  return res.status(405).end()
}
