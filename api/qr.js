// api/qr.js — Proxy para obtener QR de Evolution API
export default async function handler(req, res) {
  const { instanceName } = req.query
  if (!instanceName) return res.status(400).json({ error: 'instanceName required' })

  const EVO_URL = 'https://wa.rabbittscapital.com'
  const EVO_KEY = 'rabbitts2024'

  try {
    // Primero verificar estado
    const stateRes = await fetch(`${EVO_URL}/instance/fetchInstances?instanceName=${instanceName}`, {
      headers: { 'apikey': EVO_KEY }
    })
    const stateData = await stateRes.json()
    const instance = Array.isArray(stateData) ? stateData[0] : stateData
    const status = instance?.connectionStatus

    if (status === 'open') {
      return res.status(200).json({ status: 'connected', phone: instance?.ownerJid?.split('@')[0] })
    }

    // Intentar obtener QR
    const qrRes = await fetch(`${EVO_URL}/instance/connect/${instanceName}`, {
      headers: { 'apikey': EVO_KEY }
    })
    const qrData = await qrRes.json()
    
    const base64 = qrData?.base64 || qrData?.qrcode?.base64 || qrData?.code
    const count = qrData?.count || 0

    if (base64) {
      return res.status(200).json({ status: 'qr', base64, count })
    }

    return res.status(200).json({ status: 'waiting', count, instanceStatus: status })

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
