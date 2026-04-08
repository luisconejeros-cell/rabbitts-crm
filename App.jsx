import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

// ─── Supabase config ─────────────────────────────────────────────────────────
// Bolt.new: ve a Settings → Environment Variables y agrega estas dos:
// VITE_SUPABASE_URL = https://xxxxx.supabase.co
// VITE_SUPABASE_ANON_KEY = eyxxxxxxx
// VITE_ANTHROPIC_KEY = sk-ant-xxxxxx
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
)
const ANTHROPIC_KEY = import.meta.env.VITE_ANTHROPIC_KEY || ''

// ─── Brand ───────────────────────────────────────────────────────────────────
const B = {
  primary: '#1B4FC8', dark: '#1240A0', light: '#E8EFFE',
  mid: '#4A76D8', border: '#A8C0F0',
}

// ─── Data ────────────────────────────────────────────────────────────────────
const STAGES = [
  { id:'nuevo',      label:'Nuevo lead',          bg:'#F1F5FF', col:'#1B4FC8', dot:'#A8C0F0' },
  { id:'contactado', label:'Contactado',           bg:'#EFF6FF', col:'#1d4ed8', dot:'#93c5fd' },
  { id:'agenda',     label:'Agenda reunión',       bg:'#F5F3FF', col:'#5b21b6', dot:'#c4b5fd' },
  { id:'credito',    label:'Crédito aprobado',     bg:'#FFFBEB', col:'#92400e', dot:'#fcd34d' },
  { id:'reserva',    label:'Reserva',              bg:'#F0FDF4', col:'#166534', dot:'#86efac' },
  { id:'firma',      label:'Firma promesa',        bg:'#FFF7ED', col:'#9a3412', dot:'#fdba74' },
  { id:'ganado',     label:'Ganado',               bg:'#DCFCE7', col:'#14532d', dot:'#4ade80' },
  { id:'perdido',    label:'Perdido',              bg:'#FEF2F2', col:'#991b1b', dot:'#fca5a5' },
]
const LOSS_REASONS = [
  'Sin capacidad de crédito','Encontró otra propiedad','Desistió de la compra',
  'Precio fuera de rango','Sin respuesta / incontactable','Compró con otro corredor',
  'Proyecto descartado','Otro',
]
const TAG_ST = {
  pool:     { bg:'#F5F3FF', col:'#5b21b6', border:'#c4b5fd' },
  lead:     { bg:'#E8EFFE', col:'#1B4FC8', border:'#A8C0F0' },
  referido: { bg:'#FFFBEB', col:'#92400e', border:'#fcd34d' },
}
const CAL = {
  Alta:  { bg:'#F0FDF4', col:'#166534' },
  Media: { bg:'#FFFBEB', col:'#92400e' },
  Baja:  { bg:'#FEF2F2', col:'#991b1b' },
}

// ─── Utils ───────────────────────────────────────────────────────────────────
const PALS = [['#E8EFFE','#1B4FC8'],['#EFF6FF','#1d4ed8'],['#F5F3FF','#5b21b6'],['#FFFBEB','#92400e'],['#FFF7ED','#9a3412'],['#F0FDF4','#166534']]
const pal  = n => PALS[(n||'?').charCodeAt(0) % PALS.length]
const ini  = n => !n||n==='—' ? '?' : n.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()
const fmt  = iso => !iso ? '—' : new Date(iso).toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric'})
const daysIn = l => {
  const m = l.stage_moved_at ? new Date(l.stage_moved_at).getTime() : new Date(l.fecha).getTime()
  return Math.floor((Date.now() - m) / 86400000)
}

// ─── Mini components ─────────────────────────────────────────────────────────
const AV = ({name, size=32}) => {
  const [bg, col] = pal(name)
  return <div style={{width:size,height:size,borderRadius:'50%',background:bg,color:col,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:size*.38,flexShrink:0}}>{ini(name)}</div>
}

const LOGO_SRC = 'data:image/png;base64,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laf27hy9/Dhv8G0RniW78rWVaGc63Xd3BR2mWEP6bQHkvseG66ZKT9I3Kalif1D5ODb7tt1aZrWtGzQB8F9T+8fdvfHx4R/Lf6n38Fuvbm2V6xzs4xvmbU5TfZq14IcWMGwPxJ3U0YfidixSjNLZKFlM132yCSXfHdZ1FV5ur5matrp7ry6L5IkVY9dXuoIiKtNwREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREB/9k='

const RabbitsLogo = ({size=36}) => (
  <img src={LOGO_SRC} alt="Rabbitts Capital" style={{width:size*2.5,height:size,objectFit:'contain'}}/>
)

const Tag = ({tag, sm}) => {
  const t = TAG_ST[tag] || TAG_ST.lead
  return <span style={{fontSize:sm?10:11,padding:sm?'2px 7px':'3px 10px',borderRadius:99,background:t.bg,color:t.col,border:`0.5px solid ${t.border}`,fontWeight:600}}>{tag}</span>
}
const Days = ({d}) => {
  const [bg,col] = d<=3 ? ['#F0FDF4','#166534'] : d<=7 ? ['#FFFBEB','#92400e'] : ['#FEF2F2','#991b1b']
  return <span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:bg,color:col,fontWeight:600,whiteSpace:'nowrap'}}>{d}d</span>
}
const Toast = ({msg}) => msg ? <div style={{position:'fixed',top:16,right:16,background:B.primary,color:'#fff',borderRadius:10,padding:'9px 20px',fontSize:13,fontWeight:600,zIndex:9999,boxShadow:'0 4px 20px rgba(27,79,200,0.35)'}}>{msg}</div> : null
const HR = () => <div style={{borderTop:'1px solid #e8effe',margin:'14px 0'}}/>

const Fld = ({label, children}) => (
  <div style={{marginBottom:12}}>
    <label style={{fontSize:12,color:'#4b6cb7',display:'block',marginBottom:4,fontWeight:500}}>{label}</label>
    {children}
  </div>
)

const sty = {
  inp: {width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid #c5d5f5',background:'#fff',color:'#111827',fontSize:13},
  sel: {width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid #c5d5f5',background:'#fff',color:'#111827',fontSize:13,cursor:'pointer'},
  btn: {fontSize:13,padding:'7px 14px',borderRadius:8,cursor:'pointer',border:'1px solid #c5d5f5',background:'#fff',color:'#374151'},
  btnP:{fontSize:13,padding:'7px 16px',borderRadius:8,cursor:'pointer',border:`1px solid ${B.primary}`,background:B.primary,color:'#fff',fontWeight:500},
  btnO:{fontSize:13,padding:'7px 14px',borderRadius:8,cursor:'pointer',border:`1px solid ${B.border}`,background:'transparent',color:B.primary},
  btnD:{fontSize:13,padding:'7px 14px',borderRadius:8,cursor:'pointer',border:'1px solid #fca5a5',background:'#FEF2F2',color:'#991b1b'},
  card:{background:'#fff',border:'1px solid #dce8ff',borderRadius:10,padding:'12px 16px'},
}

const Modal = ({title, onClose, children, wide=false}) => (
  <div style={{position:'fixed',inset:0,background:'rgba(27,79,200,0.18)',display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:60,zIndex:1000}}>
    <div style={{background:'#fff',borderRadius:14,padding:'20px 24px',width:'100%',maxWidth:wide?600:440,margin:'0 16px',maxHeight:'80vh',overflowY:'auto',boxShadow:'0 8px 40px rgba(27,79,200,0.18)',border:'1px solid #dce8ff'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <span style={{fontWeight:700,fontSize:16,color:B.primary}}>● {title}</span>
        <button onClick={onClose} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'#9ca3af',lineHeight:1}}>×</button>
      </div>
      {children}
    </div>
  </div>
)

// ─── Main App ─────────────────────────────────────────────────────────────────
const EU = {name:'',rut:'',phone:'',email:'',username:'',pin:'',role:'agent'}
const EL = {nombre:'',telefono:'',email:'',renta:'',tag:'lead'}

export default function App() {
  const [users,  setUsers]  = useState(null)
  const [leads,  setLeads]  = useState(null)
  const [me,     setMe]     = useState(null)
  const [nav,    setNav]    = useState('kanban')
  const [modal,  setModal]  = useState(null)
  const [sel,    setSel]    = useState(null)
  const [lu, setLu] = useState(''); const [lp, setLp] = useState(''); const [lerr, setLerr] = useState('')
  const [nu, setNu] = useState(EU)
  const [nl, setNl] = useState(EL)
  const [conv, setConv] = useState(''); const [xing, setXing] = useState(false); const [xerr, setXerr] = useState('')
  const [fa, setFa] = useState('all'); const [fs, setFs] = useState('all'); const [ft, setFt] = useState('all')
  const [toast, setToast] = useState('')
  const [comment, setComment] = useState('')
  const [lossR, setLossR] = useState(LOSS_REASONS[0]); const [lossOth, setLossOth] = useState(''); const [lossTgt, setLossTgt] = useState(null)
  const [editP, setEditP] = useState({name:'',phone:'',email:''})
  const [pinF,  setPinF]  = useState({cur:'',n1:'',n2:''}); const [pinErr, setPinErr] = useState(''); const [profErr, setProfErr] = useState('')
  const [dbReady, setDbReady] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [showNotifs, setShowNotifs] = useState(false)

  useEffect(() => { initDB() }, [])

  // ── Supabase Realtime ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!dbReady || !me) return
    const channel = supabase
      .channel('crm_leads_rt_' + me.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'crm_leads' }, payload => {
        const updated = payload.new
        if (!updated) return
        setLeads(prev => {
          if (!prev) return prev
          const exists = prev.find(l => l.id === updated.id)
          const next = exists ? prev.map(l => l.id === updated.id ? updated : l) : [updated, ...prev]
          setSel(s => s?.id === updated.id ? updated : s)
          if (me.role !== 'admin' && updated.assigned_to === me.id && exists) {
            const oldC = (exists.comments || []).length
            const newC = (updated.comments || []).length
            if (newC > oldC) {
              const latest = (updated.comments || [])[newC - 1]
              if (latest && latest.author_name !== me.name) {
                setNotifications(n => [{
                  id: latest.id,
                  text: `${latest.author_name} comentó en "${updated.nombre}": ${latest.text.slice(0,80)}`,
                  leadId: updated.id,
                  read: false,
                  date: latest.date
                }, ...n].slice(0, 20))
              }
            }
          }
          return next
        })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_leads' }, payload => {
        const inserted = payload.new
        if (!inserted) return
        setLeads(prev => prev ? [inserted, ...prev.filter(l => l.id !== inserted.id)] : [inserted])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbReady, me?.id])

  // ── DB init: create tables if not exist via Supabase RPC ──────────────────
  async function initDB() {
    // Try to load users — if fails, Supabase not configured, use localStorage fallback
    try {
      const { data, error } = await supabase.from('crm_users').select('*')
      if (error) throw error
      let us = data || []
      if (!us.find(u => u.role === 'admin')) {
        const admin = {id:'u-admin',name:'Luis Burgos',rut:'',phone:'',email:'',username:'admin',pin:'1234',role:'admin'}
        await supabase.from('crm_users').insert(admin)
        us = [admin, ...us]
      }
      setUsers(us)
      const { data: ls } = await supabase.from('crm_leads').select('*').order('fecha', {ascending:false})
      setLeads(ls || [])
      setDbReady(true)
    } catch (e) {
      // Fallback to localStorage if Supabase not configured yet
      console.warn('Supabase not configured, using localStorage fallback')
      let us = JSON.parse(localStorage.getItem('rcrm_users') || '[]')
      if (!us.find(u => u.role === 'admin'))
        us = [{id:'u-admin',name:'Luis Burgos',rut:'',phone:'',email:'',username:'admin',pin:'1234',role:'admin'}, ...us]
      setUsers(us)
      setLeads(JSON.parse(localStorage.getItem('rcrm_leads') || '[]'))
      setDbReady(false)
    }
  }

  async function saveUsers(us) {
    setUsers(us)
    if (dbReady) {
      for (const u of us) await supabase.from('crm_users').upsert(u)
    } else {
      localStorage.setItem('rcrm_users', JSON.stringify(us))
    }
  }

  async function saveLeads(ls) {
    setLeads(ls)
    if (dbReady) {
      for (const l of ls) await supabase.from('crm_leads').upsert(l)
    } else {
      localStorage.setItem('rcrm_leads', JSON.stringify(ls))
    }
  }

  function msg(m) { setToast(m); setTimeout(() => setToast(''), 2500) }

  // ── Auth ──────────────────────────────────────────────────────────────────
  function login() {
    const u = (users||[]).find(x => x.username === lu.trim().toLowerCase())
    if (!u || u.pin !== lp) { setLerr('Usuario o PIN incorrecto'); return }
    setMe(u); setLerr(''); setLp(''); setLu('')
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  async function createUser() {
    if (!nu.name||!nu.username||!nu.pin||!nu.rut||!nu.phone||!nu.email) { msg('Completa todos los campos'); return }
    if ((users||[]).find(u => u.username === nu.username.toLowerCase())) { msg('Usuario ya existe'); return }
    const u = {id:'u-'+Date.now(), ...nu, username:nu.username.toLowerCase()}
    await saveUsers([...users, u])
    setNu(EU); setModal(null); msg('Usuario creado')
  }
  async function deleteUser(id) {
    if (dbReady) await supabase.from('crm_users').delete().eq('id', id)
    await saveUsers(users.filter(u => u.id !== id))
    msg('Usuario eliminado')
  }
  async function saveProfile() {
    if (!editP.name) { setProfErr('El nombre no puede estar vacío'); return }
    const us = users.map(u => u.id === me.id ? {...u,...editP} : u)
    await saveUsers(us); setMe(m => ({...m,...editP}))
    setModal(null); setProfErr(''); msg('Perfil actualizado')
  }
  async function changePin() {
    if (pinF.cur !== me.pin) { setPinErr('PIN actual incorrecto'); return }
    if (pinF.n1.length < 4)  { setPinErr('Mínimo 4 dígitos'); return }
    if (pinF.n1 !== pinF.n2) { setPinErr('Los PINs no coinciden'); return }
    const us = users.map(u => u.id === me.id ? {...u, pin:pinF.n1} : u)
    await saveUsers(us); setMe(m => ({...m, pin:pinF.n1}))
    setPinF({cur:'',n1:'',n2:''}); setPinErr(''); setModal(null); msg('PIN actualizado')
  }

  // ── Leads ─────────────────────────────────────────────────────────────────
  async function createManual() {
    if (!nl.nombre||!nl.telefono) { msg('Nombre y teléfono obligatorios'); return }
    const lead = {
      id:'l-'+Date.now(), fecha:new Date().toISOString(), stage_moved_at:new Date().toISOString(),
      stage:'nuevo', assigned_to: me.role==='agent' ? me.id : null,
      nombre:nl.nombre, telefono:nl.telefono, email:nl.email||'—', renta:nl.renta||'—',
      calificacion:'—', resumen:'Lead ingresado manualmente.', tag:nl.tag,
      origen: me.role==='agent' ? 'vendedor' : 'admin', creado_por:me.id,
      comments:[], stage_history:[{stage:'nuevo',date:new Date().toISOString()}]
    }
    await saveLeads([lead, ...leads])
    setNl(EL); setModal(null); msg('Lead creado')
  }

  async function extractLead() {
    if (!conv.trim()) return
    if (!ANTHROPIC_KEY) { setXerr('API key de Anthropic no configurada. Agrégala en Settings → Environment Variables de Bolt.'); return }
    setXing(true); setXerr('')
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{'Content-Type':'application/json','x-api-key':ANTHROPIC_KEY,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-ipc':'true'},
        body: JSON.stringify({
          model:'claude-sonnet-4-20250514', max_tokens:1000,
          system:`Extrae datos del cliente de conversaciones inmobiliarias. Responde SOLO JSON sin backticks:\n{"nombre":"nombre completo o null","telefono":"teléfono o null","email":"email o null","renta":"presupuesto con moneda o null","calificacion":"Alta/Media/Baja","resumen":"2-3 oraciones sobre necesidad e interés del cliente"}`,
          messages:[{role:'user',content:'Conversación:\n\n'+conv}]
        })
      })
      const d = await r.json()
      const txt = (d.content||[]).find(b=>b.type==='text')?.text||'{}'
      const p = JSON.parse(txt.replace(/```json|```/g,'').trim())
      const lead = {
        id:'l-'+Date.now(), fecha:new Date().toISOString(), stage_moved_at:new Date().toISOString(),
        stage:'nuevo', assigned_to:null, tag:'lead', origen:'whatsapp',
        nombre:p.nombre||'—', telefono:p.telefono||'—', email:p.email||'—',
        renta:p.renta||'—', calificacion:p.calificacion||'—', resumen:p.resumen||'—',
        conversacion:conv, creado_por:me.id, comments:[], stage_history:[{stage:'nuevo',date:new Date().toISOString()}]
      }
      await saveLeads([lead, ...leads])
      setConv(''); msg('Lead extraído con IA')
    } catch (e) { setXerr('Error al procesar. Verifica tu API key de Anthropic.') }
    setXing(false)
  }

  async function assignLead(lid, aid) {
    const ls = leads.map(l => l.id===lid ? {...l, assigned_to:aid||null} : l)
    await saveLeads(ls); if (sel?.id===lid) setSel(ls.find(l=>l.id===lid)); msg('Lead asignado')
  }

  function reqMove(lid, sid) {
    if (sid==='perdido') { setLossTgt(lid); setLossR(LOSS_REASONS[0]); setLossOth(''); setModal('lost'); return }
    moveStage(lid, sid, null)
  }

  async function moveStage(lid, sid, reason) {
    const ls = leads.map(l => l.id===lid ? {
      ...l, stage:sid, stage_moved_at:new Date().toISOString(),
      loss_reason: reason!==null ? reason : l.loss_reason,
      stage_history:[...(l.stage_history||[]), {stage:sid,date:new Date().toISOString()}]
    } : l)
    await saveLeads(ls); if (sel?.id===lid) setSel(ls.find(l=>l.id===lid))
  }

  async function confirmLoss() {
    const reason = lossR==='Otro' ? lossOth : lossR
    if (!reason) { msg('Indica el motivo'); return }
    await moveStage(lossTgt, 'perdido', reason)
    setLossTgt(null); setModal(sel?'lead':null); msg('Lead marcado como perdido')
  }

  async function updateTag(lid, tag) {
    const ls = leads.map(l => l.id===lid ? {...l,tag} : l)
    await saveLeads(ls); if (sel?.id===lid) setSel(ls.find(l=>l.id===lid)); msg('Etiqueta actualizada')
  }

  async function addComment(lid) {
    if (!comment.trim()) return
    const lead = leads.find(l => l.id === lid)
    const c = {id:'c-'+Date.now(), text:comment.trim(), author_name:me.name, date:new Date().toISOString()}
    const ls = leads.map(l => l.id===lid ? {...l, comments:[...(l.comments||[]),c]} : l)
    await saveLeads(ls); if (sel?.id===lid) setSel(ls.find(l=>l.id===lid)); setComment('')
    // Email notification: only when admin comments and lead has an assigned agent with email
    if (me.role === 'admin' && lead?.assigned_to) {
      const agent = (users||[]).find(u => u.id === lead.assigned_to)
      if (agent?.email) {
        try {
          await fetch('/api/notify', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              to: agent.email,
              agentName: agent.name,
              adminName: me.name,
              leadName: lead.nombre,
              comment: comment.trim(),
              leadId: lid
            })
          })
        } catch(e) { console.warn('Email notification failed:', e) }
      }
    }
  }

  async function deleteLead(id) {
    if (dbReady) await supabase.from('crm_leads').delete().eq('id', id)
    await saveLeads(leads.filter(l => l.id!==id))
    setModal(null); setSel(null); msg('Lead eliminado')
  }

  function exportCSV() {
    const H = ['Nombre','Teléfono','Email','Renta','Etiqueta','Etapa','Motivo pérdida','Cal.','Agente','Creado','Días','Resumen']
    const rows = (vL||[]).map(l => {
      const ag = (users||[]).find(u=>u.id===l.assigned_to)
      const st = STAGES.find(x=>x.id===l.stage)||STAGES[0]
      return [`"${l.nombre}"`,l.telefono,l.email,l.renta,l.tag,st.label,l.loss_reason||'',l.calificacion,ag?ag.name:'—',fmt(l.fecha),daysIn(l),`"${(l.resumen||'').replace(/"/g,"'")}"`].join(',')
    })
    const csv = [H.join(','),...rows].join('\n')
    const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download='rabbitts_leads_'+new Date().toISOString().slice(0,10)+'.csv'; a.click(); URL.revokeObjectURL(url)
    msg('CSV descargado')
  }

  if (!users || !leads) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontSize:14,color:B.primary,gap:10}}>
    <RabbitsLogo size={28}/> Cargando Rabbitts CRM...
  </div>

  const isAdmin   = me?.role === 'admin'
  const isPartner = me?.role === 'partner'
  const isAgent   = me?.role === 'agent'

  const vL = !me ? [] : isAdmin
    ? leads.filter(l => (fa==='all'||l.assigned_to===fa) && (fs==='all'||l.stage===fs) && (ft==='all'||l.tag===ft))
    : isPartner ? leads.filter(l => l.tag==='pool')
    : leads.filter(l => l.assigned_to===me.id)

  const NAV = isAdmin ? ['kanban','lista','usuarios','extraer'] : isPartner ? ['pool'] : ['kanban','lista','nuevo lead']

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (!me) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:32,background:'linear-gradient(135deg,#E8EFFE 0%,#f0f4ff 100%)'}}>
      <div style={{width:'100%',maxWidth:360}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',marginBottom:28,gap:12}}>
          <RabbitsLogo size={80}/>
          <div style={{textAlign:'center'}}>
            <div style={{fontWeight:800,fontSize:22,color:B.primary,letterSpacing:'-0.5px'}}>Rabbitts Capital</div>
            <div style={{fontSize:12,color:B.mid,fontWeight:500,letterSpacing:'0.5px',textTransform:'uppercase'}}>CRM Inmobiliario</div>
          </div>
        </div>
        <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:14,padding:28,boxShadow:'0 4px 24px rgba(27,79,200,0.10)'}}>
          <Fld label="Usuario"><input value={lu} onChange={e=>setLu(e.target.value)} placeholder="tu.usuario" style={sty.inp}/></Fld>
          <Fld label="PIN"><input type="password" value={lp} onChange={e=>setLp(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} placeholder="••••" style={sty.inp}/></Fld>
          {lerr && <p style={{margin:'0 0 10px',fontSize:12,color:'#991b1b'}}>{lerr}</p>}
          <button onClick={login} style={{...sty.btnP,width:'100%',padding:'11px 16px',fontSize:14,borderRadius:10}}>Ingresar</button>
        </div>
        {!dbReady && <p style={{textAlign:'center',fontSize:11,color:'#9ca3af',marginTop:12}}>⚠ Modo offline — configura Supabase para datos persistentes entre dispositivos</p>}
      </div>
    </div>
  )

  // ── APP ────────────────────────────────────────────────────────────────────
  return (
    <div style={{fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',minHeight:'100vh',background:'#f0f4ff'}}>
      <Toast msg={toast}/>

      {/* Topbar */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',borderBottom:'3px solid '+B.primary,background:'#fff',flexWrap:'wrap',gap:8,position:'sticky',top:0,zIndex:100,boxShadow:'0 2px 12px rgba(27,79,200,0.08)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <RabbitsLogo size={34}/>
            <div>
              <div style={{fontWeight:800,fontSize:13,color:B.primary,lineHeight:1}}>Rabbitts Capital</div>
              <div style={{fontSize:9,color:B.mid,fontWeight:600,letterSpacing:'0.5px',textTransform:'uppercase'}}>CRM</div>
            </div>
          </div>
          <div style={{display:'flex',gap:2,flexWrap:'wrap'}}>
            {NAV.map(n => (
              <button key={n} onClick={()=>setNav(n)} style={{fontSize:13,padding:'5px 12px',borderRadius:8,border:'none',background:nav===n?B.light:'transparent',cursor:'pointer',color:nav===n?B.primary:'#6b7280',fontWeight:nav===n?700:400}}>
                {n.charAt(0).toUpperCase()+n.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <AV name={me.name} size={28}/>
          <span style={{fontSize:13,color:'#6b7280',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{me.name}</span>
          <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:isAdmin?B.light:isPartner?'#F5F3FF':'#EFF6FF',color:isAdmin?B.primary:isPartner?'#5b21b6':'#1d4ed8',fontWeight:700}}>{me.role}</span>
          {!isAdmin && (
            <div style={{position:'relative'}}>
              <button onClick={()=>{setShowNotifs(v=>!v);setNotifications(n=>n.map(x=>({...x,read:true})))}} style={{fontSize:12,padding:'4px 10px',borderRadius:8,border:'1px solid #dce8ff',background:'transparent',cursor:'pointer',color:B.mid,position:'relative'}}>
                🔔
                {notifications.filter(n=>!n.read).length>0 && (
                  <span style={{position:'absolute',top:-4,right:-4,width:16,height:16,borderRadius:'50%',background:'#E24B4A',color:'#fff',fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {notifications.filter(n=>!n.read).length}
                  </span>
                )}
              </button>
              {showNotifs && (
                <div style={{position:'absolute',top:36,right:0,width:320,background:'#fff',border:'1px solid #dce8ff',borderRadius:12,boxShadow:'0 8px 32px rgba(27,79,200,0.15)',zIndex:500,maxHeight:360,overflowY:'auto'}}>
                  <div style={{padding:'10px 14px',borderBottom:'1px solid #f0f4ff',fontWeight:700,fontSize:13,color:B.primary}}>Notificaciones</div>
                  {notifications.length===0 && <div style={{padding:'20px 14px',fontSize:12,color:'#9ca3af',textAlign:'center'}}>Sin notificaciones</div>}
                  {notifications.map(n=>(
                    <div key={n.id} onClick={()=>{setShowNotifs(false);const l=leads.find(x=>x.id===n.leadId);if(l){setSel(l);setModal('lead')}}} style={{padding:'10px 14px',borderBottom:'1px solid #f0f4ff',cursor:'pointer',background:n.read?'#fff':B.light}}>
                      <div style={{fontSize:12,color:'#111827',lineHeight:1.5}}>{n.text}</div>
                      <div style={{fontSize:11,color:'#9ca3af',marginTop:3}}>{fmt(n.date)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={()=>{setEditP({name:me.name,phone:me.phone||'',email:me.email||''});setPinF({cur:'',n1:'',n2:''});setPinErr('');setProfErr('');setModal('profile')}} style={{fontSize:12,padding:'4px 10px',borderRadius:8,border:'1px solid #dce8ff',background:'transparent',cursor:'pointer',color:B.mid}}>Mi perfil</button>
          <button onClick={()=>setMe(null)} style={{fontSize:12,padding:'4px 10px',borderRadius:8,border:'none',background:'transparent',cursor:'pointer',color:'#9ca3af'}}>Salir</button>
        </div>
      </div>

      <div style={{padding:16}}>

        {/* KANBAN */}
        {(nav==='kanban'||nav==='pool') && (
          <div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8}}>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                {isAdmin && <>
                  <select value={fa} onChange={e=>setFa(e.target.value)} style={{...sty.sel,width:'auto'}}>
                    <option value="all">Todos los agentes</option>
                    <option value="">Sin asignar</option>
                    {(users||[]).filter(u=>u.role==='agent').map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <select value={fs} onChange={e=>setFs(e.target.value)} style={{...sty.sel,width:'auto'}}>
                    <option value="all">Todas las etapas</option>
                    {STAGES.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                  <select value={ft} onChange={e=>setFt(e.target.value)} style={{...sty.sel,width:'auto'}}>
                    <option value="all">Todas las etiquetas</option>
                    {['pool','lead','referido'].map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </>}
                <span style={{fontSize:12,color:B.mid,fontWeight:500}}>{(vL||[]).length} leads</span>
              </div>
              <div style={{display:'flex',gap:8}}>
                {isAdmin && <button onClick={exportCSV} style={sty.btnO}>Exportar CSV</button>}
                {(isAdmin||isAgent) && <button onClick={()=>setModal('newLead')} style={sty.btnP}>+ Nuevo lead</button>}
              </div>
            </div>
            <div style={{display:'flex',gap:10,overflowX:'auto',paddingBottom:8,alignItems:'flex-start'}}>
              {STAGES.map(st => {
                const cols = (vL||[]).filter(l=>l.stage===st.id)
                return (
                  <div key={st.id} style={{minWidth:190,flexShrink:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                      <div style={{width:8,height:8,borderRadius:'50%',background:st.dot}}/>
                      <span style={{fontSize:12,fontWeight:700,color:st.col}}>{st.label}</span>
                      <span style={{fontSize:11,color:'#9ca3af',marginLeft:'auto'}}>{cols.length}</span>
                    </div>
                    <div style={{background:st.bg,borderRadius:12,padding:8,minHeight:60,border:'1px solid '+st.dot+'44'}}>
                      {cols.map(l=><KCard key={l.id} lead={l} users={users} isAdmin={isAdmin} isPartner={isPartner} onOpen={()=>{setSel(l);setModal('lead')}} onMove={reqMove}/>)}
                      {cols.length===0&&<div style={{fontSize:11,color:'#9ca3af',textAlign:'center',padding:'14px 0'}}>—</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* LISTA */}
        {nav==='lista' && (
          <div>
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
              {isAdmin && <button onClick={exportCSV} style={sty.btnO}>Exportar CSV</button>}
            </div>
            <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,overflow:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead>
                  <tr style={{background:B.light,borderBottom:'1px solid #dce8ff'}}>
                    {['Cliente','Teléfono','Renta','Etiqueta','Etapa','Motivo pérdida','Días',...(isAdmin?['Agente']:[]),'Cal.','Creado'].map(h=>(
                      <th key={h} style={{padding:'9px 10px',textAlign:'left',fontSize:12,fontWeight:700,color:B.primary,whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(vL||[]).length===0&&<tr><td colSpan={11} style={{padding:32,textAlign:'center',color:'#9ca3af'}}>Sin leads registrados</td></tr>}
                  {(vL||[]).map(lead => {
                    const st = STAGES.find(x=>x.id===lead.stage)||STAGES[0]
                    const ag = (users||[]).find(u=>u.id===lead.assigned_to)
                    const cal = CAL[lead.calificacion]
                    return (
                      <tr key={lead.id} onClick={()=>{setSel(lead);setModal('lead')}} style={{borderBottom:'1px solid #f0f4ff',cursor:'pointer'}}>
                        <td style={{padding:'9px 10px'}}><div style={{display:'flex',alignItems:'center',gap:7}}><AV name={lead.nombre} size={26}/><span style={{fontWeight:600,color:'#111827',maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.nombre}</span></div></td>
                        <td style={{padding:'9px 10px',color:'#6b7280',whiteSpace:'nowrap'}}>{lead.telefono}</td>
                        <td style={{padding:'9px 10px',color:'#6b7280',whiteSpace:'nowrap'}}>{lead.renta}</td>
                        <td style={{padding:'9px 10px'}}><Tag tag={lead.tag||'lead'} sm/></td>
                        <td style={{padding:'9px 10px'}}><span style={{fontSize:11,padding:'2px 8px',borderRadius:99,background:st.bg,color:st.col,fontWeight:600,whiteSpace:'nowrap'}}>{st.label}</span></td>
                        <td style={{padding:'9px 10px',fontSize:11,color:'#9ca3af',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.loss_reason||'—'}</td>
                        <td style={{padding:'9px 10px'}}><Days d={daysIn(lead)}/></td>
                        {isAdmin&&<td style={{padding:'9px 10px'}}>{ag?<div style={{display:'flex',alignItems:'center',gap:5}}><AV name={ag.name} size={18}/><span style={{fontSize:12,color:'#6b7280',whiteSpace:'nowrap'}}>{ag.name.split(' ')[0]}</span></div>:<span style={{fontSize:12,color:'#9ca3af'}}>—</span>}</td>}
                        <td style={{padding:'9px 10px'}}>{cal&&<span style={{fontSize:11,padding:'2px 7px',borderRadius:99,background:cal.bg,color:cal.col}}>{lead.calificacion}</span>}</td>
                        <td style={{padding:'9px 10px',fontSize:11,color:'#9ca3af',whiteSpace:'nowrap'}}>{fmt(lead.fecha)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* USUARIOS */}
        {nav==='usuarios' && isAdmin && (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
              <span style={{fontSize:14,fontWeight:700,color:B.primary}}>{(users||[]).length} usuarios</span>
              <button onClick={()=>setModal('newUser')} style={sty.btnP}>+ Nuevo usuario</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:10}}>
              {(users||[]).map(u => {
                const uL = leads.filter(l=>l.assigned_to===u.id)
                const RC = {admin:[B.light,B.primary],agent:['#EFF6FF','#1d4ed8'],partner:['#F5F3FF','#5b21b6']}
                const [rb,rc] = RC[u.role]||RC.agent
                return (
                  <div key={u.id} style={sty.card}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                      <AV name={u.name} size={38}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,fontSize:14,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.name}</div>
                        <div style={{fontSize:12,color:'#9ca3af'}}>@{u.username}</div>
                      </div>
                      <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:rb,color:rc,fontWeight:700}}>{u.role}</span>
                    </div>
                    <div style={{borderTop:'1px solid #f0f4ff',paddingTop:10,fontSize:12}}>
                      {[['RUT',u.rut],['Teléfono',u.phone],['Email',u.email]].filter(([,v])=>v).map(([k,v])=>(
                        <div key={k} style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                          <span style={{color:'#9ca3af'}}>{k}</span>
                          <span style={{color:'#6b7280',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',textAlign:'right'}}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10}}>
                      <span style={{fontSize:12,color:B.mid,fontWeight:500}}>{uL.length} leads</span>
                      {u.id!==me.id && <button onClick={()=>deleteUser(u.id)} style={{...sty.btnD,fontSize:11,padding:'3px 8px'}}>Eliminar</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* EXTRAER */}
        {nav==='extraer' && isAdmin && (
          <div style={{maxWidth:560}}>
            <p style={{margin:'0 0 4px',fontSize:14,fontWeight:700,color:B.primary}}>Extraer lead calificado desde WhatsApp</p>
            <p style={{margin:'0 0 12px',fontSize:12,color:B.mid}}>Solo pasan al CRM los clientes que califican por renta.</p>
            {!ANTHROPIC_KEY && <div style={{background:'#FFFBEB',border:'1px solid #fcd34d',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#92400e',marginBottom:12}}>⚠ Para activar la IA: en Bolt ve a <strong>Settings → Environment Variables</strong> y agrega <code>VITE_ANTHROPIC_KEY</code> con tu API key de <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{color:B.primary}}>console.anthropic.com</a></div>}
            <textarea value={conv} onChange={e=>setConv(e.target.value)} placeholder="Pega aquí la conversación completa de WhatsApp..." style={{...sty.inp,minHeight:160,resize:'vertical'}}/>
            <div style={{display:'flex',gap:8,marginTop:8}}>
              <button onClick={extractLead} disabled={xing||!conv.trim()} style={{...sty.btnP,opacity:xing||!conv.trim()?0.5:1}}>{xing?'Procesando con IA...':'Extraer con IA'}</button>
              {conv && <button onClick={()=>setConv('')} style={sty.btn}>Limpiar</button>}
            </div>
            {xerr && <p style={{margin:'8px 0 0',fontSize:12,color:'#991b1b'}}>{xerr}</p>}
          </div>
        )}

        {/* NUEVO LEAD agente */}
        {nav==='nuevo lead' && isAgent && (
          <div style={{maxWidth:480}}>
            <p style={{margin:'0 0 14px',fontSize:14,fontWeight:700,color:B.primary}}>Ingresar nuevo lead</p>
            <LeadForm data={nl} onChange={setNl} onSubmit={createManual}/>
          </div>
        )}
      </div>

      {/* MODALS */}

      {/* Lead detail */}
      {modal==='lead' && sel && (
        <Modal title={sel.nombre} onClose={()=>{setModal(null);setSel(null);setComment('')}} wide>
          <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
            {(()=>{const st=STAGES.find(x=>x.id===sel.stage)||STAGES[0];return<span style={{fontSize:11,padding:'3px 10px',borderRadius:99,background:st.bg,color:st.col,fontWeight:600}}>{st.label}</span>})()}
            <Tag tag={sel.tag||'lead'}/>
            {CAL[sel.calificacion]&&<span style={{fontSize:11,padding:'3px 10px',borderRadius:99,background:CAL[sel.calificacion].bg,color:CAL[sel.calificacion].col,fontWeight:600}}>Cal. {sel.calificacion}</span>}
            <Days d={daysIn(sel)}/>
            {sel.stage==='perdido'&&sel.loss_reason&&<span style={{fontSize:11,padding:'3px 10px',borderRadius:99,background:'#FEF2F2',color:'#991b1b'}}>Motivo: {sel.loss_reason}</span>}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
            {[['Teléfono',sel.telefono],['Email',sel.email],['Renta',sel.renta],['Origen',sel.origen||'—'],['Creado',fmt(sel.fecha)],['Agente',((users||[]).find(u=>u.id===sel.assigned_to)||{}).name||'Sin asignar']].map(([k,v])=>(
              <div key={k} style={{background:B.light,padding:'8px 10px',borderRadius:8,border:'1px solid #dce8ff'}}>
                <div style={{fontSize:11,color:B.mid,marginBottom:2}}>{k}</div>
                <div style={{fontSize:13,color:'#111827'}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{background:B.light,padding:'10px 12px',borderRadius:8,fontSize:13,color:'#374151',lineHeight:1.6,marginBottom:12,border:'1px solid #dce8ff'}}>{sel.resumen}</div>
          {(sel.stage_history||[]).length>1&&(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:600,color:B.mid,marginBottom:6}}>Historial de etapas</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                {(sel.stage_history||[]).map((h,i)=>{const st=STAGES.find(x=>x.id===h.stage)||STAGES[0];return<div key={i} style={{fontSize:11,padding:'3px 8px',borderRadius:8,background:st.bg,color:st.col}}>{st.label} <span style={{opacity:.65}}>{fmt(h.date)}</span></div>})}
              </div>
            </div>
          )}
          {!isPartner && <>
            <div style={{marginBottom:6,fontSize:12,color:B.mid,fontWeight:600}}>Mover a etapa</div>
            <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:14}}>
              {STAGES.map(st=><button key={st.id} onClick={()=>reqMove(sel.id,st.id)} style={{fontSize:11,padding:'4px 10px',borderRadius:99,border:sel.stage===st.id?'2px solid '+st.dot:'1px solid #dce8ff',background:sel.stage===st.id?st.bg:'transparent',color:sel.stage===st.id?st.col:B.mid,cursor:'pointer',fontWeight:sel.stage===st.id?700:400}}>{st.label}</button>)}
            </div>
            {isAdmin ? (
              <Fld label="Etiqueta">
                <select value={sel.tag||'lead'} onChange={e=>updateTag(sel.id,e.target.value)} style={sty.sel}>
                  <option value="pool">Pool</option><option value="lead">Lead</option><option value="referido">Referido</option>
                </select>
              </Fld>
            ) : (
              <div style={{marginBottom:12}}>
                <div style={{fontSize:12,color:'#4b6cb7',marginBottom:6,fontWeight:500}}>Etiqueta</div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <Tag tag={sel.tag||'lead'}/>
                  <span style={{fontSize:11,color:'#9ca3af'}}>Solo el administrador puede cambiar la etiqueta</span>
                </div>
              </div>
            )}
            {isAdmin && <Fld label="Asignar a agente">
              <select value={sel.assigned_to||''} onChange={e=>assignLead(sel.id,e.target.value)} style={sty.sel}>
                <option value="">Sin asignar</option>
                {(users||[]).filter(u=>u.role==='agent').map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Fld>}
            {isAdmin && <button onClick={()=>deleteLead(sel.id)} style={{...sty.btnD,width:'100%',marginBottom:14}}>Eliminar lead</button>}
          </>}
          {isPartner && <div style={{padding:'10px 12px',background:B.light,borderRadius:8,fontSize:12,color:B.primary,marginBottom:12}}>Vista de solo lectura — socio comercial</div>}
          <HR/>
          <div style={{fontSize:12,fontWeight:700,color:B.mid,marginBottom:8}}>Comentarios ({(sel.comments||[]).length})</div>
          {(sel.comments||[]).length===0&&<p style={{fontSize:12,color:'#9ca3af',margin:'0 0 10px'}}>Sin comentarios aún</p>}
          {(sel.comments||[]).map(c=>(
            <div key={c.id} style={{marginBottom:10,paddingBottom:10,borderBottom:'1px solid #f0f4ff'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                <AV name={c.author_name} size={22}/>
                <span style={{fontSize:12,fontWeight:600,color:'#111827'}}>{c.author_name}</span>
                <span style={{fontSize:11,color:'#9ca3af',marginLeft:'auto'}}>{fmt(c.date)}</span>
              </div>
              <div style={{fontSize:13,color:'#6b7280',lineHeight:1.5,paddingLeft:28}}>{c.text}</div>
            </div>
          ))}
          {!isPartner && <div style={{display:'flex',gap:8,marginTop:8}}>
            <input value={comment} onChange={e=>setComment(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addComment(sel.id)} placeholder="Escribe un comentario..." style={{...sty.inp,flex:1}}/>
            <button onClick={()=>addComment(sel.id)} disabled={!comment.trim()} style={{...sty.btnP,opacity:!comment.trim()?0.5:1}}>Enviar</button>
          </div>}
        </Modal>
      )}

      {/* Perdido */}
      {modal==='lost' && (
        <Modal title="Marcar como perdido" onClose={()=>setModal(sel?'lead':null)}>
          <p style={{margin:'0 0 12px',fontSize:13,color:'#6b7280'}}>Selecciona el motivo de pérdida.</p>
          <Fld label="Motivo"><select value={lossR} onChange={e=>setLossR(e.target.value)} style={sty.sel}>{LOSS_REASONS.map(r=><option key={r} value={r}>{r}</option>)}</select></Fld>
          {lossR==='Otro'&&<Fld label="Especifica"><input value={lossOth} onChange={e=>setLossOth(e.target.value)} placeholder="Describe el motivo..." style={sty.inp}/></Fld>}
          <div style={{display:'flex',gap:8,marginTop:4}}>
            <button onClick={confirmLoss} style={{...sty.btnD,flex:1}}>Confirmar pérdida</button>
            <button onClick={()=>setModal(sel?'lead':null)} style={{...sty.btn,flex:1}}>Cancelar</button>
          </div>
        </Modal>
      )}

      {/* Nuevo usuario */}
      {modal==='newUser' && (
        <Modal title="Nuevo usuario" onClose={()=>{setModal(null);setNu(EU)}} wide>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {[['Nombre completo *','name','text','Juan Pérez'],['RUT *','rut','text','12.345.678-9'],['Teléfono *','phone','text','+56 9 1234 5678'],['Email *','email','email','juan@email.com'],['Usuario (login) *','username','text','juan.perez'],['PIN *','pin','password','••••']].map(([lbl,key,type,ph])=>(
              <Fld key={key} label={lbl}><input type={type} value={nu[key]} onChange={e=>setNu(p=>({...p,[key]:e.target.value}))} placeholder={ph} style={sty.inp}/></Fld>
            ))}
          </div>
          <Fld label="Rol">
            <select value={nu.role} onChange={e=>setNu(p=>({...p,role:e.target.value}))} style={sty.sel}>
              <option value="agent">Agente / Vendedor</option>
              <option value="partner">Socio Comercial</option>
              <option value="admin">Administrador</option>
            </select>
          </Fld>
          <button onClick={createUser} style={{...sty.btnP,width:'100%',padding:'10px 16px'}}>Crear usuario</button>
        </Modal>
      )}

      {/* Nuevo lead */}
      {modal==='newLead' && (
        <Modal title="Nuevo lead" onClose={()=>{setModal(null);setNl(EL)}}>
          <LeadForm data={nl} onChange={setNl} onSubmit={createManual}/>
        </Modal>
      )}

      {/* Perfil */}
      {modal==='profile' && (
        <Modal title="Mi perfil" onClose={()=>setModal(null)}>
          <div style={{fontSize:12,fontWeight:700,color:B.mid,marginBottom:10}}>Datos personales</div>
          <Fld label="Nombre completo"><input value={editP.name} onChange={e=>setEditP(p=>({...p,name:e.target.value}))} placeholder="Tu nombre" style={sty.inp}/></Fld>
          <Fld label="Teléfono"><input value={editP.phone} onChange={e=>setEditP(p=>({...p,phone:e.target.value}))} placeholder="+56 9 ..." style={sty.inp}/></Fld>
          <Fld label="Email"><input value={editP.email} onChange={e=>setEditP(p=>({...p,email:e.target.value}))} placeholder="tu@email.com" style={sty.inp}/></Fld>
          {profErr&&<p style={{margin:'0 0 8px',fontSize:12,color:'#991b1b'}}>{profErr}</p>}
          <button onClick={saveProfile} style={{...sty.btnP,width:'100%',marginBottom:4}}>Guardar datos</button>
          <HR/>
          <div style={{fontSize:12,fontWeight:700,color:B.mid,marginBottom:10}}>Cambiar PIN</div>
          <Fld label="PIN actual"><input type="password" value={pinF.cur} onChange={e=>setPinF(p=>({...p,cur:e.target.value}))} placeholder="••••" style={sty.inp}/></Fld>
          <Fld label="Nuevo PIN"><input type="password" value={pinF.n1} onChange={e=>setPinF(p=>({...p,n1:e.target.value}))} placeholder="••••" style={sty.inp}/></Fld>
          <Fld label="Repetir nuevo PIN"><input type="password" value={pinF.n2} onChange={e=>setPinF(p=>({...p,n2:e.target.value}))} placeholder="••••" style={sty.inp}/></Fld>
          {pinErr&&<p style={{margin:'0 0 8px',fontSize:12,color:'#991b1b'}}>{pinErr}</p>}
          <button onClick={changePin} style={{...sty.btnO,width:'100%'}}>Actualizar PIN</button>
        </Modal>
      )}
    </div>
  )
}

// ─── Lead Form ────────────────────────────────────────────────────────────────
function LeadForm({data, onChange, onSubmit}) {
  const sI = {width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid #c5d5f5',background:'#fff',color:'#111827',fontSize:13}
  return (
    <div>
      <Fld label="Nombre completo *"><input value={data.nombre} onChange={e=>onChange(p=>({...p,nombre:e.target.value}))} placeholder="María González" style={sI}/></Fld>
      <Fld label="Teléfono *"><input value={data.telefono} onChange={e=>onChange(p=>({...p,telefono:e.target.value}))} placeholder="+56 9 8765 4321" style={sI}/></Fld>
      <Fld label="Email"><input value={data.email} onChange={e=>onChange(p=>({...p,email:e.target.value}))} placeholder="maria@email.com" style={sI}/></Fld>
      <Fld label="Renta / Presupuesto"><input value={data.renta} onChange={e=>onChange(p=>({...p,renta:e.target.value}))} placeholder="$1.500.000 CLP" style={sI}/></Fld>
      <Fld label="Etiqueta">
        <select value={data.tag} onChange={e=>onChange(p=>({...p,tag:e.target.value}))} style={{...sI,cursor:'pointer'}}>
          <option value="lead">Lead</option><option value="referido">Referido</option><option value="pool">Pool</option>
        </select>
      </Fld>
      <button onClick={onSubmit} disabled={!data.nombre||!data.telefono} style={{width:'100%',padding:'10px 16px',borderRadius:8,cursor:!data.nombre||!data.telefono?'not-allowed':'pointer',border:`1px solid #1B4FC8`,background:'#1B4FC8',color:'#fff',fontSize:13,fontWeight:500,opacity:!data.nombre||!data.telefono?0.5:1}}>Guardar lead</button>
    </div>
  )
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────
function KCard({lead, users, isAdmin, isPartner, onOpen, onMove}) {
  const si = STAGES.findIndex(x=>x.id===lead.stage)
  const ag = (users||[]).find(u=>u.id===lead.assigned_to)
  const cal = CAL[lead.calificacion]
  return (
    <div onClick={onOpen} style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:10,padding:'10px 12px',cursor:'pointer',marginBottom:8,boxShadow:'0 1px 4px rgba(27,79,200,0.05)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:5}}>
        <div style={{fontWeight:600,fontSize:13,color:'#111827',lineHeight:1.3,flex:1,marginRight:6}}>{lead.nombre}</div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:3,flexShrink:0}}>
          <Days d={daysIn(lead)}/>
          {cal&&<span style={{fontSize:10,padding:'1px 6px',borderRadius:99,background:cal.bg,color:cal.col,fontWeight:600}}>{lead.calificacion}</span>}
        </div>
      </div>
      <div style={{fontSize:12,color:'#6b7280',marginBottom:5}}>{lead.telefono!=='—'?lead.telefono:lead.email}</div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:5}}>
          <Tag tag={lead.tag||'lead'} sm/>
          {(lead.comments||[]).length>0&&<span style={{fontSize:10,color:'#9ca3af'}}>💬{(lead.comments||[]).length}</span>}
        </div>
        {isAdmin&&ag&&<div style={{display:'flex',alignItems:'center',gap:4}}><AV name={ag.name} size={16}/><span style={{fontSize:10,color:'#9ca3af'}}>{ag.name.split(' ')[0]}</span></div>}
      </div>
      {!isAdmin&&!isPartner&&(
        <div style={{display:'flex',gap:4,marginTop:8}} onClick={e=>e.stopPropagation()}>
          {si>0&&<button onClick={()=>onMove(lead.id,STAGES[si-1].id)} style={{fontSize:11,padding:'3px 8px',borderRadius:8,border:'1px solid #dce8ff',background:'transparent',cursor:'pointer',color:'#6b7280'}}>← Atrás</button>}
          {si<STAGES.length-1&&<button onClick={()=>onMove(lead.id,STAGES[si+1].id)} style={{fontSize:11,padding:'3px 8px',borderRadius:8,border:`1px solid ${B.border}`,background:'transparent',cursor:'pointer',color:B.primary,fontWeight:600}}>Avanzar →</button>}
        </div>
      )}
    </div>
  )
}
