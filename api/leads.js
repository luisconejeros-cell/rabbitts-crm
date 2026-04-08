// ─── Rabbitts CRM — Webhook endpoint para Make / Meta Ads / Landing Pages ───
// URL: https://tu-dominio.vercel.app/api/leads
//
// Uso en Make:
//   1. Módulo "HTTP Make a request"
//   2. URL: https://rabbitts-crm.vercel.app/api/leads  (o tu dominio custom)
//   3. Method: POST
//   4. Headers: Content-Type: application/json
//   5. Body (JSON):
//      {
//        "nombre": "{{nombre del formulario}}",
//        "telefono": "{{telefono}}",
//        "email": "{{email}}",
//        "renta": "{{renta o presupuesto}}",
//        "tag": "lead",
//        "origen": "meta_ads",   // o "landing", "formulario", etc
//        "resumen": "Lead desde campaña Facebook"
//      }

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.VITE_SUPABASE_ANON_KEY || ''
)

export default async function handler(req, res) {
  // CORS headers — permite llamadas desde Make, Zapier, n8n, cualquier origen
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { nombre, telefono, email, renta, tag, origen, resumen, calificacion } = body

    if (!nombre || !telefono) {
      return res.status(400).json({ 
        error: 'nombre y telefono son obligatorios',
        example: { nombre: 'María González', telefono: '+56 9 8765 4321', renta: '$1.500.000', tag: 'lead' }
      })
    }

    const lead = {
      id: 'l-' + Date.now() + '-' + Math.random().toString(36).slice(2,7),
      fecha: new Date().toISOString(),
      stage_moved_at: new Date().toISOString(),
      stage: 'nuevo',
      assigned_to: null,
      nombre: nombre || '—',
      telefono: telefono || '—',
      email: email || '—',
      renta: renta || '—',
      calificacion: calificacion || '—',
      resumen: resumen || `Lead ingresado desde ${origen || 'webhook'}`,
      tag: tag || 'lead',
      origen: origen || 'webhook',
      creado_por: 'webhook',
      loss_reason: null,
      conversacion: '',
      comments: [],
      stage_history: [{ stage: 'nuevo', date: new Date().toISOString() }]
    }

    const { error } = await supabase.from('crm_leads').insert(lead)

    if (error) {
      console.error('Supabase error:', error)
      return res.status(500).json({ error: 'Error guardando lead', details: error.message })
    }

    return res.status(200).json({ 
      success: true, 
      leadId: lead.id,
      message: `Lead "${nombre}" creado exitosamente en Rabbitts CRM`
    })

  } catch (err) {
    console.error('Webhook error:', err)
    return res.status(500).json({ error: 'Error interno', details: err.message })
  }
}
