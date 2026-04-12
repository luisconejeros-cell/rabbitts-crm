// api/whatsapp.js — Evolution API webhook con resolución @lid
export default async function handler(req, res) {

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', service: 'Rabbitts WhatsApp Webhook' })
  }

  if (req.method === 'POST') {
    try {
      const body = req.body
      const event = (body?.event || '').toLowerCase().replace('_','.')
      if (!event.includes('messages') || !event.includes('upsert')) {
        return res.status(200).json({ status: 'ok', skipped: event })
      }

      const msg = body?.data?.messages?.[0] || body?.data
      if (!msg) return res.status(200).json({ status: 'ok', skipped: 'no msg' })
      if (msg.key?.fromMe) return res.status(200).json({ status: 'ok', skipped: 'fromMe' })

      const remoteJid = msg.key?.remoteJid || ''
      if (remoteJid.includes('@g.us')) return res.status(200).json({ status: 'ok', skipped: 'group' })

      const instanceName = body?.instance || ''
      const msgText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ''
      const pushName = msg.pushName || ''

      const EVO_URL = 'https://wa.rabbittscapital.com'
      const EVO_KEY = 'rabbitts2024'

      // Resolver número real desde @lid usando contactos de Evolution API
      let sendNumber = remoteJid
      let phoneFrom = remoteJid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '').replace(/@[\w.]+$/, '')

      if (remoteJid.endsWith('@s.whatsapp.net')) {
        // Formato normal - usar número directo
        sendNumber = phoneFrom
      } else if (remoteJid.endsWith('@lid')) {
        // Buscar número real en contactos
        try {
          const contactRes = await fetch(
            `${EVO_URL}/chat/findContacts/${instanceName}?where={"id":"${remoteJid}"}`,
            { headers: { 'apikey': EVO_KEY } }
          )
          const contacts = await contactRes.json()
          const contact = Array.isArray(contacts) ? contacts[0] : contacts
          const realPhone = contact?.number || contact?.pushName
          if (realPhone && !realPhone.includes('@')) {
            sendNumber = realPhone
            phoneFrom = realPhone
            console.log('Resolved @lid to:', sendNumber)
          } else {
            // Fallback: usar pushName si tiene número, o mantener @lid
            sendNumber = remoteJid
            console.log('Could not resolve @lid, using remoteJid:', remoteJid)
          }
        } catch(e) {
          sendNumber = remoteJid
          console.log('Error resolving @lid:', e.message)
        }
      }

      console.log('WA msg from:', phoneFrom, 'sendTo:', sendNumber, 'instance:', instanceName, 'text:', msgText?.slice(0,30))

      if (!msgText || !phoneFrom) return res.status(200).json({ status: 'ok', skipped: 'no text/from' })

      const SUPABASE_URL = process.env.VITE_SUPABASE_URL
      const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
      const sbHeaders = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }

      const sendWA = async (text) => {
        console.log('Sending to:', sendNumber)
        const r = await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
          body: JSON.stringify({ number: sendNumber, options: { delay: 500 }, textMessage: { text } })
        })
        const rb = await r.text()
        console.log('sendWA status:', r.status, rb.slice(0, 150))
      }

      // Buscar conversación
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

      const histRes = await fetch(`${SUPABASE_URL}/rest/v1/crm_conv_messages?conv_id=eq.${conv.id}&order=created_at.asc&limit=20`, { headers: sbHeaders })
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
