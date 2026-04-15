// api/agent-worker.js — compatibilidad
// Ya no es obligatorio. Se mantiene para no romper rutas antiguas.
import { generateAgentResponse } from '../agent.js'

export async function processConversation(payload = {}) {
  return generateAgentResponse(payload)
}

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, worker: 'compat' })
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  try {
    const result = await generateAgentResponse(req.body || {})
    return res.status(200).json(result)
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message, reply: '' })
  }
}
