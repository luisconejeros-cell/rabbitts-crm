// api/whatsapp.js — Meta WhatsApp Cloud API webhook + message sender
export default async function handler(req, res) {

  // ── GET: Webhook verification (Meta challenge) ────────────────────────────
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode']
    const token     = req.query['hub.verify_token']
    const challenge = req.query['hub.challenge']

    const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'rabbitts_webhook_secret'

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook verified ✅')
      return res.status(200).send(challenge)
    }
    return res.status(403).send('Forbidden')
  }

  // ── POST: Incoming messages from Meta ────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body
    // Acknowledge immediately
    res.status(200).json({ status: 'ok' })

    try {
      const entry   = body?.entry?.[0]
      const changes = entry?.changes?.[0]
      const value   = changes?.value

      if (value?.statuses) return // ignore delivery/read receipts

      const messages = value?.messages
      if (!messages || !messages.length) return

      const msg     = messages[0]
      const from    = msg.from  // WhatsApp number e.g. "56912345678"
      const msgText = msg.text?.body || ''
      const msgType = msg.type  // text, image, audio, etc.

      if (!msgText && msgType !== 'text') return // ignore non-text for now

      const SUPABASE_URL = process.env.VITE_SUPABASE_URL
      const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
      const ANTHROPIC_KEY = process.env.VITE_ANTHROPIC_KEY
      const META_TOKEN    = process.env.META_ACCESS_TOKEN
      const META_PHONE_ID = process.env.META_PHONE_NUMBER_ID

      const sbGet = async (path) => {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
        })
        return r.json()
      }
      const sbUpsert = async (table, data) => {
        await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(data)
        })
      }

      // Send WhatsApp message via Meta Cloud API
      const sendWA = async (to, text) => {
        await fetch(`https://graph.facebook.com/v19.0/${META_PHONE_ID}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${META_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: { body: text, preview_url: false }
          })
        })
      }

      // Load or create conversation
      const convs = await sbGet(`crm_conversations?telefono=eq.%2B${from}&order=created_at.desc&limit=1`)
      let conv = Array.isArray(convs) ? convs[0] : null

      if (!conv) {
        // New contact
        const contactInfo = value?.contacts?.[0]
        conv = {
          id: 'conv-' + Date.now(),
          telefono: '+' + from,
          nombre: contactInfo?.profile?.name || from,
          mode: 'ia',
          status: 'activo',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_message: msgText
        }
        await sbUpsert('crm_conversations', conv)
      }

      // Save incoming message
      await fetch(`${SUPABASE_URL}/rest/v1/crm_conv_messages`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ conv_id: conv.id, role: 'user', content: msgText, created_at: new Date().toISOString() })
      })

      // If in human mode, don't respond with AI
      if (conv.mode === 'humano') {
        // Update last_message
        await sbUpsert('crm_conversations', { ...conv, last_message: msgText, updated_at: new Date().toISOString() })
        return
      }

      // Load iaConfig
      const cfgRows = await sbGet("crm_settings?key=eq.ia_config&select=value")
      const iaConfig = Array.isArray(cfgRows) && cfgRows[0]?.value ? cfgRows[0].value : {}

      if (!iaConfig.activo) return // IA disabled

      // Load conversation history (last 20 messages)
      const histRows = await sbGet(`crm_conv_messages?conv_id=eq.${conv.id}&order=created_at.asc&limit=20`)
      const history = Array.isArray(histRows) ? histRows.map(m => ({ role: m.role, content: m.content })) : []

      // Call Rabito agent
      const agentRes = await fetch('https://crm.rabbittscapital.com/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msgText,
          conversationHistory: history.slice(0, -1), // exclude last user msg (already added)
          iaConfig,
          leadData: { telefono: '+' + from, nombre: conv.nombre }
        })
      })
      const agentData = await agentRes.json()
      const reply = agentData?.reply

      if (!reply) return

      // Send reply via Meta
      await sendWA(from, reply)

      // Save assistant message
      await fetch(`${SUPABASE_URL}/rest/v1/crm_conv_messages`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ conv_id: conv.id, role: 'assistant', content: reply, created_at: new Date().toISOString() })
      })

      // Update conversation
      await sbUpsert('crm_conversations', {
        ...conv,
        last_message: reply,
        updated_at: new Date().toISOString(),
        ...(agentData?.leadUpdate || {})
      })

      // Handle actions
      if (agentData?.action === 'escalacion') {
        await sbUpsert('crm_conversations', { ...conv, mode: 'humano', updated_at: new Date().toISOString() })
        // Notify admin
        await fetch('https://crm.rabbittscapital.com/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'escalation', to: process.env.CRM_ADMIN_EMAIL, lead: { nombre: conv.nombre, telefono: '+'+from, renta: agentData?.leadUpdate?.renta || '' } })
        }).catch(() => {})
      }

    } catch(err) {
      console.error('WhatsApp webhook error:', err)
    }

    return
  }

  return res.status(405).end()
}
