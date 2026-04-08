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

const RabbitsLogo = ({size=36}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="46" fill="#fff" stroke={B.primary} strokeWidth="4"/>
    <ellipse cx="50" cy="50" rx="25" ry="46" fill="none" stroke={B.primary} strokeWidth="1.5" opacity=".35"/>
    <line x1="4" y1="50" x2="96" y2="50" stroke={B.primary} strokeWidth="1.5" opacity=".35"/>
    <path d="M10 30 Q50 38 90 30" stroke={B.primary} strokeWidth="1.2" fill="none" opacity=".25"/>
    <path d="M10 70 Q50 62 90 70" stroke={B.primary} strokeWidth="1.2" fill="none" opacity=".25"/>
    <ellipse cx="50" cy="60" rx="16" ry="20" fill={B.primary}/>
    <ellipse cx="50" cy="40" rx="11" ry="10" fill={B.primary}/>
    <ellipse cx="42" cy="25" rx="4" ry="12" fill={B.primary}/>
    <ellipse cx="58" cy="25" rx="4" ry="12" fill={B.primary}/>
    <ellipse cx="42" cy="25" rx="2" ry="8" fill="#A8C0F0" opacity=".6"/>
    <ellipse cx="58" cy="25" rx="2" ry="8" fill="#A8C0F0" opacity=".6"/>
    <circle cx="46" cy="39" r="1.5" fill="#fff"/>
    <circle cx="54" cy="39" r="1.5" fill="#fff"/>
    <ellipse cx="50" cy="43" rx="2.5" ry="1.5" fill="#A8C0F0"/>
    <circle cx="64" cy="68" r="5" fill="#E8EFFE" stroke={B.primary} strokeWidth="1.5"/>
  </svg>
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

  useEffect(() => { initDB() }, [])

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
    const c = {id:'c-'+Date.now(), text:comment.trim(), author_name:me.name, date:new Date().toISOString()}
    const ls = leads.map(l => l.id===lid ? {...l, comments:[...(l.comments||[]),c]} : l)
    await saveLeads(ls); if (sel?.id===lid) setSel(ls.find(l=>l.id===lid)); setComment('')
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
            <Fld label="Etiqueta">
              <select value={sel.tag||'lead'} onChange={e=>updateTag(sel.id,e.target.value)} style={sty.sel}>
                <option value="pool">Pool</option><option value="lead">Lead</option><option value="referido">Referido</option>
              </select>
            </Fld>
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
