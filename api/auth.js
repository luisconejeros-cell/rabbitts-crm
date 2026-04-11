// api/auth.js — Google OAuth handler for Calendar integration
// Handles both: /api/auth?action=login and /auth/callback (via vercel.json rewrite)

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REDIRECT_URI = 'https://crm.rabbittscapital.com/auth/callback'
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ')

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { action, code, state, error } = req.query

  // ── 1. Initiate OAuth flow ────────────────────────────────────────────────
  if (action === 'login') {
    const { userId } = req.query
    if (!userId) return res.status(400).json({ error: 'userId required' })

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state: userId // pass userId through state
    })

    const authUrl = `https://accounts.google.com/o/oauth2/auth?${params}`
    return res.redirect(302, authUrl)
  }

  // ── 2. OAuth Callback ─────────────────────────────────────────────────────
  if (code) {
    if (error) {
      return res.redirect(302, `https://crm.rabbittscapital.com?gcal_error=${error}`)
    }

    try {
      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code'
        })
      })

      const tokens = await tokenRes.json()
      if (tokens.error) throw new Error(tokens.error_description || tokens.error)

      // Get user email from Google
      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      })
      const userInfo = await userRes.json()

      // Save tokens to Supabase
      const userId = state
      const SUPABASE_URL = process.env.VITE_SUPABASE_URL
      const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

      if (SUPABASE_URL && SUPABASE_KEY && userId) {
        await fetch(`${SUPABASE_URL}/rest/v1/crm_users?id=eq.${userId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            google_tokens: {
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token,
              expiry: Date.now() + (tokens.expires_in * 1000),
              email: userInfo.email
            }
          })
        })
      }

      // Redirect back to CRM with success
      return res.redirect(302, `https://crm.rabbittscapital.com?gcal_success=1&gcal_email=${encodeURIComponent(userInfo.email||'')}`)

    } catch (err) {
      console.error('OAuth error:', err)
      return res.redirect(302, `https://crm.rabbittscapital.com?gcal_error=${encodeURIComponent(err.message)}`)
    }
  }

  return res.status(400).json({ error: 'Invalid request' })
}
