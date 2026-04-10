import React, { useState, useEffect } from 'react'
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
const DEFAULT_STAGES = [
  { id:'nuevo',      label:'Nuevo lead',          bg:'#F1F5FF', col:'#1B4FC8', dot:'#A8C0F0' },
  { id:'contactado', label:'Contactado',           bg:'#EFF6FF', col:'#1d4ed8', dot:'#93c5fd' },
  { id:'agenda',     label:'Agenda reunión',       bg:'#F5F3FF', col:'#5b21b6', dot:'#c4b5fd' },
  { id:'credito',    label:'Crédito aprobado',     bg:'#FFFBEB', col:'#92400e', dot:'#fcd34d' },
  { id:'reserva',    label:'Reserva',              bg:'#F0FDF4', col:'#166534', dot:'#86efac' },
  { id:'firma',      label:'Firma promesa',        bg:'#FFF7ED', col:'#9a3412', dot:'#fdba74',  restricted:true },
  { id:'escritura',  label:'Firma escritura',      bg:'#FEF9C3', col:'#713f12', dot:'#fbbf24',  restricted:true },
  { id:'ganado',     label:'Ganado',               bg:'#DCFCE7', col:'#14532d', dot:'#4ade80' },
  { id:'perdido',    label:'Perdido',              bg:'#FEF2F2', col:'#991b1b', dot:'#fca5a5' },
  { id:'desistio',   label:'Desistió escritura',   bg:'#FDF4FF', col:'#7e22ce', dot:'#d8b4fe', restricted:true },
]

// Stages only Operaciones/Admin can move leads into
const RESTRICTED_STAGES = ['firma','escritura','desistio']
// Stages that lock the lead from agent movement entirely
const OPS_LOCKED_STAGES = ['firma','escritura','ganado','desistio']

// Empty property template
const EMPTY_PROP = {
  id:'', inmobiliaria:'', proyecto:'', depto:'', moneda:'UF', precio:0,
  bono_pie:false, bono_pct:10, precio_sin_bono:0,
  tipo_entrega:'Inmediata', fecha_escritura:'',
  // Gestión de cobro
  oc_estado:'pendiente_oc',  // pendiente_oc | oc_recibida | factura_emitida | pagado
  oc_fecha_solicitud:'',     // cuando se solicitó/notificó a la inmobiliaria
  oc_fecha_recepcion:'',     // cuando llegó la OC
  factura_fecha:'',          // cuando se emitió la factura
  factura_numero:'',         // N° de factura
  pago_fecha:'',             // cuando pagaron
  oc_notas:'',               // notas del proceso
  // Pago a broker
  inmob_pago_fecha:'',       // cuando pagó la inmobiliaria a Rabbitts
  inmob_monto_recibido:'',   // monto exacto recibido
  broker_factura_fecha:'',   // cuando el broker envió su factura a Rabbitts
  broker_factura_numero:'',  // N° factura del broker
  broker_pago_fecha:''       // cuando Rabbitts pagó al broker
}

// Color presets for stage editor
const COLOR_PRESETS = [
  { label:'Azul',     bg:'#EFF6FF', col:'#1d4ed8', dot:'#93c5fd' },
  { label:'Azul Rabbitts', bg:'#F1F5FF', col:'#1B4FC8', dot:'#A8C0F0' },
  { label:'Violeta',  bg:'#F5F3FF', col:'#5b21b6', dot:'#c4b5fd' },
  { label:'Amarillo', bg:'#FFFBEB', col:'#92400e', dot:'#fcd34d' },
  { label:'Verde',    bg:'#F0FDF4', col:'#166534', dot:'#86efac' },
  { label:'Verde osc.',bg:'#DCFCE7',col:'#14532d', dot:'#4ade80' },
  { label:'Naranja',  bg:'#FFF7ED', col:'#9a3412', dot:'#fdba74' },
  { label:'Rojo',     bg:'#FEF2F2', col:'#991b1b', dot:'#fca5a5' },
  { label:'Gris',     bg:'#F9FAFB', col:'#374151', dot:'#9ca3af' },
  { label:'Teal',     bg:'#F0FDFA', col:'#065f46', dot:'#6ee7b7' },
  { label:'Rosa',     bg:'#FDF2F8', col:'#86198f', dot:'#e879f9' },
  { label:'Cyan',     bg:'#ECFEFF', col:'#155e75', dot:'#22d3ee' },
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
  const [indicators, setIndicators] = useState({uf:null, dolar:null, updatedAt:null})
  const [stages, setStages] = useState(DEFAULT_STAGES)
  const [newStage, setNewStage] = useState({label:'', colorIdx:0})
  const [editStageId, setEditStageId] = useState(null)
  const [editStageLabel, setEditStageLabel] = useState('')
  const [editLead, setEditLead] = useState(null)
  const [editUser, setEditUser] = useState(null)
  const [dateRange, setDateRange] = useState('all')
  const [importRows, setImportRows] = useState([])
  const [importErrors, setImportErrors] = useState([])
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState(null)
  const [sessions, setSessions] = useState([])
  const [commissions, setCommissions] = useState({}) // {propKey: {pctComision, pctBroker, cobrado}}
  const [ufHistory, setUfHistory] = useState({})   // {YYYY-MM-DD: ufValue}
  const [impTag, setImpTag] = useState('lead')
  const [impAgent, setImpAgent] = useState('')
  const [propModal, setPropModal] = useState(null)  // leadId to add properties to
  const [editingProps, setEditingProps] = useState([])  // array of properties being edited
  const [pendingStage, setPendingStage] = useState(null)  // {leadId, stageId} waiting for prop form
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => {
    initDB()
    // Restore session if not expired
    try {
      const saved = localStorage.getItem('rcrm_session')
      if (saved) {
        const { id, expires } = JSON.parse(saved)
        if (Date.now() < expires) {
          // Will be set once users are loaded
          window.__sessionUserId = id
        } else {
          localStorage.removeItem('rcrm_session')
        }
      }
    } catch(_) {}
  }, [])

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
          if (me.role !== 'admin') {
            // Notify when a lead is assigned to this agent
            if (updated.assigned_to === me.id && (!exists || exists.assigned_to !== me.id)) {
              setNotifications(n => [{
                id: 'assign-' + updated.id,
                text: 'Te asignaron el lead de ' + updated.nombre,
                leadId: updated.id,
                read: false,
                date: new Date().toISOString()
              }, ...n].slice(0, 20))
            }
            // Notify on new comment
            if (updated.assigned_to === me.id && exists) {
              const oldC = (exists.comments || []).length
              const newC = (updated.comments || []).length
              if (newC > oldC) {
                const latest = (updated.comments || [])[newC - 1]
                if (latest && latest.author_name !== me.name) {
                  setNotifications(n => [{
                    id: latest.id,
                    text: latest.author_name + ' comentó en "' + updated.nombre + '": ' + latest.text.slice(0,80),
                    leadId: updated.id,
                    read: false,
                    date: latest.date
                  }, ...n].slice(0, 20))
                }
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

  // ── Preload historical UF for closing leads ─────────────────────────────
  useEffect(() => {
    if (nav !== 'comisiones') return
    const closingLeads = (leads||[]).filter(l => ['firma','escritura'].includes(l.stage))
    const dates = [...new Set(closingLeads.map(l => l.stage_moved_at).filter(Boolean).map(d => new Date(d).toISOString().slice(0,10)))]
    for (const date of dates) {
      if (!ufHistory[date]) fetchUFForDate(date)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, leads])

  // ── Chilean financial indicators ─────────────────────────────────────────
  useEffect(() => {
    async function fetchIndicators() {
      try {
        const r = await fetch('https://mindicador.cl/api')
        const d = await r.json()
        setIndicators({
          uf:    d.uf?.valor    ? parseFloat(d.uf.valor).toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2}) : null,
          dolar: d.dolar?.valor ? parseFloat(d.dolar.valor).toLocaleString('es-CL',{minimumFractionDigits:0,maximumFractionDigits:0}) : null,
          updatedAt: d.uf?.fecha ? new Date(d.uf.fecha).toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit'}) : null
        })
      } catch(e) { console.warn('No se pudieron obtener indicadores') }
    }
    fetchIndicators()
    // Refresh every hour
    const t = setInterval(fetchIndicators, 3600000)
    return () => clearInterval(t)
  }, [])

  // ── Realtime for stages (crm_settings) ──────────────────────────────────
  useEffect(() => {
    if (!dbReady) return
    const ch = supabase
      .channel('crm_settings_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_settings' }, payload => {
        if (payload.new?.key === 'stages' && payload.new?.value) {
          const saved = payload.new.value
          const required = DEFAULT_STAGES.filter(ds => ['firma','escritura','perdido'].includes(ds.id))
          const merged = [...saved]
          for (const rs of required) {
            if (!merged.find(s => s.id === rs.id)) merged.push(rs)
          }
          setStages(merged)
        }
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [dbReady])

  // ── DB init ───────────────────────────────────────────────────────────────
  async function initDB() {
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
      // Load sessions for activity stats
      try {
        const { data: sess } = await supabase.from('crm_sessions').select('*').order('logged_at',{ascending:false})
        setSessions(sess || [])
      } catch(_) {}
      // Auto-login from saved session
      if (window.__sessionUserId) {
        const saved = us.find(u => u.id === window.__sessionUserId)
        if (saved) {
          setMe(saved)
          setNav(saved.role === 'admin' || saved.role === 'partner' ? 'dashboard' : 'kanban')
        }
        window.__sessionUserId = null
      }
      const { data: ls } = await supabase.from('crm_leads').select('*').order('fecha', {ascending:false})
      setLeads(ls || [])
      // Load commissions
      try {
        const { data: comms } = await supabase.from('crm_commissions').select('*')
        if (comms && comms.length > 0) {
          const commMap = {}
          comms.forEach(c => { commMap[c.id] = {pctComision:c.pct_comision||'',pctBroker:c.pct_broker||'',cobrado:c.cobrado||false,notasInmob:c.notas_inmob||''} })
          setCommissions(commMap)
        }
      } catch(_) {}
      // Load custom stages — merge with DEFAULT_STAGES to ensure new required stages always exist
      try {
        const { data: st } = await supabase.from('crm_settings').select('value').eq('key','stages').single()
        if (st?.value) {
          const saved = st.value
          // Only ensure truly required stages exist — don't re-add deleted ones
          const required = DEFAULT_STAGES.filter(ds => ['firma','escritura','perdido'].includes(ds.id))
          const merged = [...saved]
          for (const rs of required) {
            if (!merged.find(s => s.id === rs.id)) merged.push(rs)
          }
          setStages(merged)
        }
      } catch(_) {}
      setDbReady(true)
    } catch (e) {
      console.warn('Supabase not configured, using localStorage fallback')
      let us = JSON.parse(localStorage.getItem('rcrm_users') || '[]')
      if (!us.find(u => u.role === 'admin'))
        us = [{id:'u-admin',name:'Luis Burgos',rut:'',phone:'',email:'',username:'admin',pin:'1234',role:'admin'}, ...us]
      setUsers(us)
      if (window.__sessionUserId) {
        const saved = us.find(u => u.id === window.__sessionUserId)
        if (saved) { setMe(saved); setNav(saved.role==='admin'||saved.role==='partner'?'dashboard':saved.role==='finanzas'?'dashboard_finanzas':'kanban') }
        window.__sessionUserId = null
      }
      setLeads(JSON.parse(localStorage.getItem('rcrm_leads') || '[]'))
      const savedStages = localStorage.getItem('rcrm_stages')
      if (savedStages) {
        const saved = JSON.parse(savedStages)
        const required = DEFAULT_STAGES.filter(ds => ['firma','escritura','perdido'].includes(ds.id))
        const merged = [...saved]
        for (const rs of required) {
          if (!merged.find(s => s.id === rs.id)) merged.push(rs)
        }
        setStages(merged)
      }
      setDbReady(false)
    }
  }

  async function saveStages(st) {
    setStages(st)
    if (dbReady) {
      await supabase.from('crm_settings').upsert({key:'stages', value:st})
    } else {
      localStorage.setItem('rcrm_stages', JSON.stringify(st))
    }
  }

  async function addStage() {
    if (!newStage.label.trim()) { msg('Escribe un nombre para la etapa'); return }
    const preset = COLOR_PRESETS[newStage.colorIdx] || COLOR_PRESETS[0]
    const s = {
      id: 'st-' + Date.now(),
      label: newStage.label.trim(),
      bg: preset.bg, col: preset.col, dot: preset.dot
    }
    await saveStages([...stages, s])
    setNewStage({label:'', colorIdx:0})
    msg('Etapa creada')
  }

  async function deleteStage(id) {
    const inUse = leads.filter(l => l.stage === id).length
    if (inUse > 0) { msg(`No se puede eliminar: hay ${inUse} leads en esta etapa`); return }
    await saveStages(stages.filter(s => s.id !== id))
    msg('Etapa eliminada')
  }

  async function moveStageUp(idx) {
    if (idx === 0) return
    const st = [...stages]
    ;[st[idx-1], st[idx]] = [st[idx], st[idx-1]]
    await saveStages(st)
  }

  async function moveStageDown(idx) {
    if (idx === stages.length - 1) return
    const st = [...stages]
    ;[st[idx], st[idx+1]] = [st[idx+1], st[idx]]
    await saveStages(st)
  }

  async function renameStage(id, label) {
    if (!label.trim()) return
    await saveStages(stages.map(s => s.id === id ? {...s, label: label.trim()} : s))
    setEditStageId(null)
    msg('Etapa renombrada')
  }

  async function changeStageColor(id, colorIdx) {
    const preset = COLOR_PRESETS[colorIdx]
    await saveStages(stages.map(s => s.id === id ? {...s, bg:preset.bg, col:preset.col, dot:preset.dot} : s))
  }

  async function saveUsers(us) {
    setUsers(us)
    if (dbReady) {
      for (const u of us) await supabase.from('crm_users').upsert(u)
    } else {
      localStorage.setItem('rcrm_users', JSON.stringify(us))
    }
  }

  async function saveCommission(key, data) {
    if (!dbReady) return
    try {
      await supabase.from('crm_commissions').upsert({
        id: key,
        pct_comision: data.pctComision || '',
        pct_broker: data.pctBroker || '',
        cobrado: data.cobrado || false,
        notas_inmob: data.notasInmob || '',
        updated_at: new Date().toISOString()
      })
    } catch(e) { console.warn('Commission save failed:', e) }
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
  async function login() {
    const u = (users||[]).find(x => x.username === lu.trim().toLowerCase())
    if (!u || u.pin !== lp) { setLerr('Usuario o PIN incorrecto'); return }
    setMe(u); setLerr(''); setLp(''); setLu('')
    setNav(u.role==='admin'||u.role==='partner'?'dashboard':u.role==='finanzas'?'dashboard_finanzas':'kanban')
    // Persist session for 8 hours
    localStorage.setItem('rcrm_session', JSON.stringify({id:u.id, expires: Date.now() + 8*60*60*1000}))
    // Record login for activity tracking
    if (dbReady) {
      try {
        await supabase.from('crm_sessions').insert({
          user_id: u.id,
          logged_at: new Date().toISOString(),
          day_of_week: new Date().getDay()
        })
      } catch(_) {}
    }
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  async function createUser() {
    if (!nu.name||!nu.username||!nu.pin||!nu.rut||!nu.phone||!nu.email) { msg('Completa todos los campos'); return }
    if ((users||[]).find(u => u.username === nu.username.toLowerCase())) { msg('Usuario ya existe'); return }
    const u = {id:'u-'+Date.now(), ...nu, username:nu.username.toLowerCase()}
    await saveUsers([...users, u])
    // Send welcome email with credentials
    if (nu.email) {
      try {
        await fetch('/api/notify', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            type: 'welcome',
            to: nu.email,
            agentName: nu.name,
            adminName: me.name,
            username: nu.username.toLowerCase(),
            pin: nu.pin,
            role: nu.role
          })
        })
      } catch(e) { console.warn('Welcome email failed:', e) }
    }
    setNu(EU); setModal(null); msg('Usuario creado — se envió email de bienvenida')
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
    setXing(true); setXerr('')
    try {
      // Llamada via endpoint del servidor (evita CORS y protege la API key)
      const r = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation: conv })
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || 'Error desconocido')
      const p = d.data
      const lead = {
        id:'l-'+Date.now(), fecha:new Date().toISOString(), stage_moved_at:new Date().toISOString(),
        stage: stages[0]?.id || 'nuevo', assigned_to:null, tag:'lead', origen:'whatsapp',
        nombre:p.nombre||'—', telefono:p.telefono||'—', email:p.email||'—',
        renta:p.renta||'—', calificacion:p.calificacion||'—', resumen:p.resumen||'—',
        conversacion:conv, creado_por:me.id, comments:[], stage_history:[{stage:stages[0]?.id||'nuevo',date:new Date().toISOString()}]
      }
      await saveLeads([lead, ...leads])
      setConv(''); msg('Lead extraído con IA')
    } catch (e) {
      setXerr('Error: ' + (e.message || 'Verifica que VITE_ANTHROPIC_KEY esté configurada en Vercel'))
    }
    setXing(false)
  }

  async function assignLead(lid, aid) {
    const lead = leads.find(l => l.id === lid)
    const ls = leads.map(l => l.id===lid ? {...l, assigned_to:aid||null} : l)
    setLeads(ls); if (sel?.id===lid) setSel(ls.find(l=>l.id===lid))
    if (dbReady) await supabase.from('crm_leads').update({assigned_to:aid||null}).eq('id',lid)
    else localStorage.setItem('rcrm_leads', JSON.stringify(ls))
    // Email notification to assigned agent
    if (aid && lead) {
      const agent = (users||[]).find(u => u.id === aid)
      if (agent?.email) {
        try {
          await fetch('/api/notify', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
              type: 'assignment',
              to: agent.email,
              agentName: agent.name,
              adminName: me.name,
              leadName: lead.nombre,
              leadPhone: lead.telefono,
              leadEmail: lead.email,
              leadRenta: lead.renta,
              leadId: lid
            })
          })
        } catch(e) { console.warn('Assignment email failed:', e) }
      }
    }
    msg('Lead asignado')
  }

  function reqMove(lid, sid) {
    // Block agents from moving leads that are already in ops-locked stages
    const lead = leads.find(l => l.id === lid)
    if (me?.role === 'agent' && OPS_LOCKED_STAGES.includes(lead?.stage)) {
      msg('Este lead está en gestión de Operaciones — solo ellos pueden moverlo')
      return
    }
    if (sid==='perdido') { setLossTgt(lid); setLossR(LOSS_REASONS[0]); setLossOth(''); setModal('lost'); return }
    // Restricted stages require property form (admin or operaciones only)
    if (RESTRICTED_STAGES.includes(sid)) {
      if (me?.role !== 'admin' && me?.role !== 'operaciones') { msg('Solo Operaciones o el Administrador puede mover a esta etapa'); return }
      const lead = leads.find(l => l.id === lid)
      const existingProps = lead?.propiedades || []
      setEditingProps(existingProps.length > 0 ? [...existingProps] : [{...EMPTY_PROP, id:'p-'+Date.now()}])
      setPendingStage({leadId:lid, stageId:sid})
      setPropModal(lid)
      return
    }
    moveStage(lid, sid, null)
  }

  async function moveStage(lid, sid, reason) {
    const updated = leads.map(l => l.id===lid ? {
      ...l, stage:sid, stage_moved_at:new Date().toISOString(),
      loss_reason: reason!==null ? reason : l.loss_reason,
      stage_history:[...(l.stage_history||[]), {stage:sid,date:new Date().toISOString()}]
    } : l)
    const changedLead = updated.find(l => l.id === lid)
    setLeads(updated)
    if (sel?.id===lid) setSel(changedLead)
    // Targeted update of only stage fields — avoids overwriting other data
    if (dbReady && changedLead) {
      await supabase.from('crm_leads').update({
        stage: changedLead.stage,
        stage_moved_at: changedLead.stage_moved_at,
        loss_reason: changedLead.loss_reason,
        stage_history: changedLead.stage_history
      }).eq('id', lid)
    } else {
      localStorage.setItem('rcrm_leads', JSON.stringify(updated))
    }
  }

  async function confirmLoss() {
    const reason = lossR==='Otro' ? lossOth : lossR
    if (!reason) { msg('Indica el motivo'); return }
    await moveStage(lossTgt, 'perdido', reason)
    setLossTgt(null); setModal(sel?'lead':null); msg('Lead marcado como perdido')
  }

  async function updateTag(lid, tag) {
    const ls = leads.map(l => l.id===lid ? {...l,tag} : l)
    setLeads(ls); if (sel?.id===lid) setSel(ls.find(l=>l.id===lid))
    if (dbReady) await supabase.from('crm_leads').update({tag}).eq('id',lid)
    else localStorage.setItem('rcrm_leads', JSON.stringify(ls))
    msg('Etiqueta actualizada')
  }

  async function addComment(lid) {
    if (!comment.trim()) return
    const lead = leads.find(l => l.id === lid)
    const c = {id:'c-'+Date.now(), text:comment.trim(), author_name:me.name, date:new Date().toISOString()}
    const ls = leads.map(l => l.id===lid ? {...l, comments:[...(l.comments||[]),c]} : l)
    const updatedLead = ls.find(l=>l.id===lid)
    setLeads(ls); if (sel?.id===lid) setSel(updatedLead); setComment('')
    if (dbReady) await supabase.from('crm_leads').update({comments:updatedLead.comments}).eq('id',lid)
    else localStorage.setItem('rcrm_leads', JSON.stringify(ls))
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

  async function updateLeadData(lid, fields) {
    const ls = leads.map(l => l.id===lid ? {...l,...fields} : l)
    await saveLeads(ls)
    if (sel?.id===lid) setSel(ls.find(l=>l.id===lid))
    setEditLead(null)
    msg('Lead actualizado')
  }

  async function updateUserData(uid, fields) {
    const us = users.map(u => u.id===uid ? {...u,...fields} : u)
    await saveUsers(us)
    if (me.id===uid) setMe(m=>({...m,...fields}))
    setEditUser(null)
    msg('Usuario actualizado')
  }

  // ── Historical UF fetch ──────────────────────────────────────────────────
  async function fetchUFForDate(dateStr) {
    // dateStr = YYYY-MM-DD (stage_moved_at)
    if (!dateStr) return null
    const d = new Date(dateStr)
    const key = d.toISOString().slice(0,10)
    if (ufHistory[key]) return ufHistory[key]
    try {
      const day   = String(d.getDate()).padStart(2,'0')
      const month = String(d.getMonth()+1).padStart(2,'0')
      const year  = d.getFullYear()
      const r = await fetch('https://mindicador.cl/api/uf/'+day+'-'+month+'-'+year)
      const data = await r.json()
      const val = data.serie?.[0]?.valor || null
      if (val) setUfHistory(prev => ({...prev, [key]: val}))
      return val
    } catch(_) { return null }
  }

  // ── Bulk import ──────────────────────────────────────────────────────────
  function parseCSV(text) {
    const lines = text.trim().split('\n').map(l => l.replace(/\r$/, ''))
    if (lines.length < 2) return { rows: [], errors: ['El archivo vacío o sin datos'] }
    const splitLine = l => l.split(',').length > 1 ? l.split(',') : l.split(';').length > 1 ? l.split(';') : l.split('\t')
    const headers = splitLine(lines[0]).map(h => h.trim().toLowerCase().replace(/['"]/g,''))
    const colMap = {}
    const aliases = {
      nombre:   ['nombre','name','cliente','nombre completo'],
      telefono: ['telefono','telefono','phone','fono','celular','movil','tel'],
      email:    ['email','correo','mail'],
      renta:    ['renta','ingreso','presupuesto','sueldo','salario'],
    }
    for (const [field, opts] of Object.entries(aliases)) {
      const idx = headers.findIndex(h => opts.some(o => h.includes(o)))
      if (idx >= 0) colMap[field] = idx
    }
    if (colMap.nombre === undefined) return { rows: [], errors: ['No se encontró columna "Nombre". Revisa el archivo.'] }
    const rows = []; const errors = []
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue
      const cols = splitLine(lines[i]).map(c => c.trim().replace(/^["']|["']$/g,''))
      const nombre = cols[colMap.nombre] || ''
      if (!nombre) { errors.push('Fila '+(i+1)+': sin nombre — omitida'); continue }
      rows.push({
        _row: i+1,
        nombre,
        telefono: colMap.telefono !== undefined ? (cols[colMap.telefono] || '—') : '—',
        email:    colMap.email    !== undefined ? (cols[colMap.email]    || '—') : '—',
        renta:    colMap.renta    !== undefined ? (cols[colMap.renta]    || '—') : '—',
      })
    }
    return { rows, errors }
  }

  function handleImportFile(file) {
    if (!file) return
    const isXLSX = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    if (isXLSX) {
      const doRead = () => {
        const reader = new FileReader()
        reader.onload = e => {
          try {
            const wb = window.XLSX.read(e.target.result, { type: 'array' })
            const ws = wb.Sheets[wb.SheetNames[0]]
            const csv = window.XLSX.utils.sheet_to_csv(ws)
            const { rows, errors } = parseCSV(csv)
            setImportRows(rows); setImportErrors(errors); setImportDone(null)
          } catch(err) { setImportErrors(['Error al leer el Excel: ' + err.message]) }
        }
        reader.readAsArrayBuffer(file)
      }
      if (!window.XLSX) {
        const script = document.createElement('script')
        script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
        script.onload = doRead
        document.head.appendChild(script)
      } else { doRead() }
    } else {
      const reader = new FileReader()
      reader.onload = e => {
        const { rows, errors } = parseCSV(e.target.result)
        setImportRows(rows); setImportErrors(errors); setImportDone(null)
      }
      reader.readAsText(file, 'UTF-8')
    }
  }

  async function confirmImport(tag, assignTo) {
    if (!importRows.length) return
    setImporting(true)
    const now = new Date().toISOString()
    const newLeads = importRows.map(r => ({
      id: 'l-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
      fecha: now, stage_moved_at: now, stage: stages[0]?.id || 'nuevo',
      assigned_to: assignTo || null, tag: tag || 'lead', origen: 'importacion',
      nombre: r.nombre, telefono: r.telefono, email: r.email, renta: r.renta,
      calificacion: '—', resumen: 'Lead importado masivamente.',
      creado_por: me.id, comments: [], stage_history: [{ stage: stages[0]?.id || 'nuevo', date: now }],
      conversacion: ''
    }))
    await saveLeads([...newLeads, ...leads])
    setImportDone(newLeads.length)
    setImportRows([]); setImportErrors([])
    setImporting(false)
    msg(newLeads.length + ' leads importados exitosamente')
  }

  function downloadTemplate() {
    const rows = [
      'Nombre,Telefono,Email,Renta',
      'Maria Gonzalez,+56 9 8765 4321,maria@email.com,$1.500.000',
      'Juan Perez,+56 9 1234 5678,juan@email.com,$2.000.000',
    ]
    const csv = rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'plantilla_rabbitts.csv'; a.click(); URL.revokeObjectURL(url)
  }

    function calcProp(p) {
    const precio = parseFloat(p.precio)||0
    const bono = p.bono_pie ? precio * (parseFloat(p.bono_pct)||0) / 100 : 0
    return {...p, precio_sin_bono: p.bono_pie ? Math.round((precio - bono)*100)/100 : precio}
  }

  async function savePropField(leadId, propId, fields) {
    // Update a single property's fields without changing stage
    const updated = leads.map(l => {
      if (l.id !== leadId) return l
      const props = (l.propiedades||[]).map(p =>
        (p.id===propId) ? {...p, ...fields} : p
      )
      return {...l, propiedades: props}
    })
    const changedLead = updated.find(l => l.id === leadId)
    setLeads(updated)
    if (sel?.id===leadId) setSel(changedLead)
    if (dbReady && changedLead) {
      await supabase.from('crm_leads').update({propiedades: changedLead.propiedades}).eq('id', leadId)
    }
  }

  async function savePropiedades(leadId, props, stageId) {
    const calculatedProps = props.map(calcProp)
    // Capture UF value at the moment of closing
    const closingUF = stageId && ['firma','escritura'].includes(stageId)
      ? (indicators.uf ? parseFloat(indicators.uf.split('.').join('').replace(',','.')) : null)
      : null
    const updated = leads.map(l => l.id===leadId ? {
      ...l,
      propiedades: calculatedProps,
      ...(stageId ? {
        stage: stageId,
        stage_moved_at: new Date().toISOString(),
        uf_cierre: closingUF,
        stage_history: [...(l.stage_history||[]), {stage:stageId, date:new Date().toISOString(), uf:closingUF}]
      } : {})
    } : l)
    const changedLead = updated.find(l => l.id === leadId)
    setLeads(updated)
    if (sel?.id===leadId) setSel(changedLead)
    // Targeted update
    if (dbReady && changedLead) {
      await supabase.from('crm_leads').update({
        propiedades: changedLead.propiedades,
        stage: changedLead.stage,
        stage_moved_at: changedLead.stage_moved_at,
        stage_history: changedLead.stage_history,
        uf_cierre: changedLead.uf_cierre || null
      }).eq('id', leadId)
    } else {
      localStorage.setItem('rcrm_leads', JSON.stringify(updated))
    }
    setPropModal(null); setPendingStage(null); setEditingProps([])
    msg(stageId ? 'Propiedades guardadas y etapa actualizada' : 'Propiedades guardadas')
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
      const st = stages.find(x=>x.id===l.stage)||stages[0]
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

  const isAdmin    = me?.role === 'admin'
  const isPartner  = me?.role === 'partner'
  const isAgent    = me?.role === 'agent'
  const isOps      = me?.role === 'operaciones'
  const isFinanzas = me?.role === 'finanzas'

  const OPS_STAGES = ['reserva','firma','escritura','perdido']
  const vL = !me ? [] : isAdmin
    ? leads.filter(l => (fa==='all'||(fa===''?(!l.assigned_to):l.assigned_to===fa)) && (fs==='all'||l.stage===fs) && (ft==='all'||l.tag===ft))
    : isPartner ? leads.filter(l => l.tag==='pool')
    : isOps     ? leads.filter(l => OPS_STAGES.includes(l.stage))
    : leads.filter(l => l.assigned_to===me.id)

  const NAV = isAdmin    ? ['dashboard','kanban','lista','usuarios','ranking','finanzas','etapas','importar','extraer']
            : isPartner  ? ['dashboard','pool']
            : isOps      ? ['kanban','lista']
            : isFinanzas ? ['dashboard_finanzas','comisiones']
            : ['kanban','lista','mis comisiones','nuevo lead']

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
        {/* Financial indicators + date */}
        <div style={{display:'flex',gap:6,alignItems:'center',marginLeft:'auto',flexWrap:'wrap'}}>
          {indicators.uf && (
            <div style={{display:'flex',alignItems:'center',gap:5,background:'#E8EFFE',borderRadius:8,padding:'4px 10px',border:'1px solid #A8C0F0'}}>
              <span style={{fontSize:10,fontWeight:700,color:B.primary,letterSpacing:'0.3px'}}>UF</span>
              <span style={{fontSize:12,fontWeight:700,color:B.primary}}>${indicators.uf}</span>
            </div>
          )}
          {indicators.dolar && (
            <div style={{display:'flex',alignItems:'center',gap:5,background:'#F0FDF4',borderRadius:8,padding:'4px 10px',border:'1px solid #86efac'}}>
              <span style={{fontSize:10,fontWeight:700,color:'#166534',letterSpacing:'0.3px'}}>USD</span>
              <span style={{fontSize:12,fontWeight:700,color:'#166534'}}>${indicators.dolar}</span>
            </div>
          )}
          <div style={{display:'flex',alignItems:'center',gap:5,background:'#F9FAFB',borderRadius:8,padding:'4px 10px',border:'1px solid #e5e7eb'}}>
            <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>
              {new Date().toLocaleDateString('es-CL',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).replace(/^\w/,c=>c.toUpperCase())}
            </span>
          </div>
        </div>

        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <AV name={me.name} size={28}/>
          <span style={{fontSize:13,color:'#6b7280',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{me.name}</span>
          <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:isAdmin?B.light:isPartner?'#F5F3FF':isOps?'#FEF9C3':isFinanzas?'#F0FDF4':'#EFF6FF',color:isAdmin?B.primary:isPartner?'#5b21b6':isOps?'#713f12':isFinanzas?'#166534':'#1d4ed8',fontWeight:700}}>{me.role}</span>
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
          {/* Ranking badge for agents */}
          {isAgent && (() => {
            const agents = (users||[]).filter(u => u.role === 'agent')
            const rankingStages = ['firma','escritura','ganado']
            const ranked = agents.map(ag => {
              const ufTotal = leads.filter(l=>l.assigned_to===ag.id&&rankingStages.includes(l.stage)).reduce((s,l)=>s+(l.propiedades||[]).filter(p=>p.moneda==='UF').reduce((ss,p)=>ss+(parseFloat(p.bono_pie?p.precio_sin_bono:p.precio)||0),0),0)
              return {id:ag.id, ufTotal}
            }).sort((a,b)=>b.ufTotal-a.ufTotal)
            const pos = ranked.findIndex(r=>r.id===me.id)+1
            const medals = {1:'🥇',2:'🥈',3:'🥉'}
            if (pos === 0) return null
            return (
              <div style={{display:'flex',alignItems:'center',gap:4,background:'#E8EFFE',borderRadius:8,padding:'3px 10px',border:'1px solid #A8C0F0'}}>
                {medals[pos] && <span style={{fontSize:14}}>{medals[pos]}</span>}
                <span style={{fontSize:12,fontWeight:700,color:B.primary}}>{pos}/{ranked.length}</span>
              </div>
            )
          })()}
          <button onClick={()=>{setEditP({name:me.name,phone:me.phone||'',email:me.email||''});setPinF({cur:'',n1:'',n2:''});setPinErr('');setProfErr('');setModal('profile')}} style={{fontSize:12,padding:'4px 10px',borderRadius:8,border:'1px solid #dce8ff',background:'transparent',cursor:'pointer',color:B.mid}}>Mi perfil</button>
          <button onClick={()=>{setMe(null);localStorage.removeItem('rcrm_session')}} style={{fontSize:12,padding:'4px 10px',borderRadius:8,border:'none',background:'transparent',cursor:'pointer',color:'#9ca3af'}}>Salir</button>
        </div>
      </div>

      <div style={{padding:16}}>

        {/* KANBAN */}
        {(nav==='kanban'||nav==='pool') && !isFinanzas && (
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
                    {stages.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}
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
              {(isOps ? stages.filter(s=>OPS_STAGES.includes(s.id)) : stages).map(st => {
                const cols = (vL||[]).filter(l=>l.stage===st.id)
                return (
                  <div key={st.id} style={{minWidth:190,flexShrink:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
                      <div style={{width:8,height:8,borderRadius:'50%',background:st.dot}}/>
                      <span style={{fontSize:12,fontWeight:700,color:st.col}}>{st.label}</span>
                      <span style={{fontSize:11,color:'#9ca3af',marginLeft:'auto'}}>{cols.length}</span>
                    </div>
                    <div style={{background:st.bg,borderRadius:12,padding:8,minHeight:60,border:'1px solid '+st.dot+'44'}}>
                      {cols.map(l=><KCard key={l.id} lead={l} users={users} isAdmin={isAdmin} isPartner={isPartner} isOps={isOps} onOpen={()=>{setSel(l);setModal('lead')}} onMove={reqMove} stages={stages}/>)}
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
                    const st = stages.find(x=>x.id===lead.stage)||stages[0]
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
                const RC = {admin:[B.light,B.primary],agent:['#EFF6FF','#1d4ed8'],partner:['#F5F3FF','#5b21b6'],operaciones:['#FEF9C3','#713f12'],finanzas:['#F0FDF4','#166534']}
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
                      <div style={{display:'flex',gap:6}}>
                        <button onClick={()=>setEditUser({...u})} style={{...sty.btnO,fontSize:11,padding:'3px 10px'}}>Editar</button>
                        {u.id!==me.id && <button onClick={()=>deleteUser(u.id)} style={{...sty.btnD,fontSize:11,padding:'3px 8px'}}>Eliminar</button>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Activity stats */}
            <div style={{marginTop:24}}>
              <p style={{margin:'0 0 12px',fontSize:14,fontWeight:700,color:B.primary}}>Actividad de usuarios</p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:10}}>
                {(users||[]).map(u => {
                  const uSess = sessions.filter(s => s.user_id === u.id)
                  const lastLogin = uSess[0]?.logged_at ? new Date(uSess[0].logged_at) : null
                  const now = new Date()
                  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate()-now.getDay()+1); startOfWeek.setHours(0,0,0,0)
                  const startOfMonth = new Date(now.getFullYear(),now.getMonth(),1)
                  const daysThisWeek = [...new Set(uSess.filter(s=>new Date(s.logged_at)>=startOfWeek).map(s=>new Date(s.logged_at).toDateString()))].length
                  const sessMonth = uSess.filter(s=>new Date(s.logged_at)>=startOfMonth).length
                  const minsAgo = lastLogin ? Math.floor((now-lastLogin)/60000) : null
                  const isOnline = minsAgo !== null && minsAgo < 30
                  const RC = {admin:[B.light,B.primary],agent:['#EFF6FF','#1d4ed8'],partner:['#F5F3FF','#5b21b6'],operaciones:['#FEF9C3','#713f12'],finanzas:['#F0FDF4','#166534']}
                  const [rb,rc] = RC[u.role]||RC.agent
                  return (
                    <div key={u.id} style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,padding:'14px 16px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                        <div style={{position:'relative'}}>
                          <AV name={u.name} size={34}/>
                          <div style={{position:'absolute',bottom:0,right:0,width:10,height:10,borderRadius:'50%',background:isOnline?'#22c55e':'#d1d5db',border:'2px solid #fff'}}/>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:13,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.name}</div>
                          <span style={{fontSize:10,padding:'1px 6px',borderRadius:99,background:rb,color:rc,fontWeight:700}}>{u.role}</span>
                        </div>
                        <div style={{flexShrink:0}}>
                          {isOnline
                            ? <span style={{fontSize:11,color:'#166534',background:'#DCFCE7',padding:'2px 8px',borderRadius:99,fontWeight:600}}>● En línea</span>
                            : <span style={{fontSize:11,color:'#9ca3af'}}>● Offline</span>
                          }
                        </div>
                      </div>
                      <div style={{borderTop:'1px solid #f0f4ff',paddingTop:10,display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                        <div style={{background:'#f9fbff',borderRadius:8,padding:'6px 10px',gridColumn:'1/-1'}}>
                          <div style={{fontSize:10,color:'#9ca3af',marginBottom:2}}>Última conexión</div>
                          <div style={{fontSize:12,fontWeight:600,color:'#374151'}}>
                            {lastLogin
                              ? minsAgo < 60 ? minsAgo+'m atrás'
                                : minsAgo < 1440 ? Math.floor(minsAgo/60)+'h atrás'
                                : lastLogin.toLocaleDateString('es-CL',{weekday:'short',day:'2-digit',month:'short'})+' '+lastLogin.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})
                              : 'Nunca ha ingresado'
                            }
                          </div>
                        </div>
                        <div style={{background:'#f9fbff',borderRadius:8,padding:'6px 10px'}}>
                          <div style={{fontSize:10,color:'#9ca3af',marginBottom:2}}>Esta semana</div>
                          <div style={{fontSize:13,fontWeight:700,color:B.primary}}>{daysThisWeek} {daysThisWeek===1?'día':'días'}</div>
                        </div>
                        <div style={{background:'#f9fbff',borderRadius:8,padding:'6px 10px'}}>
                          <div style={{fontSize:10,color:'#9ca3af',marginBottom:2}}>Este mes</div>
                          <div style={{fontSize:13,fontWeight:700,color:B.primary}}>{sessMonth} sesiones</div>
                        </div>
                        <div style={{background:'#f9fbff',borderRadius:8,padding:'6px 10px'}}>
                          <div style={{fontSize:10,color:'#9ca3af',marginBottom:2}}>Total histórico</div>
                          <div style={{fontSize:13,fontWeight:700,color:'#374151'}}>{uSess.length} sesiones</div>
                        </div>
                        <div style={{background:'#f9fbff',borderRadius:8,padding:'6px 10px'}}>
                          <div style={{fontSize:10,color:'#9ca3af',marginBottom:2}}>Días activo/mes</div>
                          <div style={{fontSize:13,fontWeight:700,color:'#374151'}}>{[...new Set(uSess.filter(s=>new Date(s.logged_at)>=startOfMonth).map(s=>new Date(s.logged_at).toDateString()))].length}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ETAPAS */}
        {nav==='etapas' && isAdmin && (
          <div style={{maxWidth:700}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div>
                <p style={{margin:'0 0 2px',fontSize:14,fontWeight:700,color:B.primary}}>Gestión de etapas del pipeline</p>
                <p style={{margin:0,fontSize:12,color:B.mid}}>Crea, renombra, reordena y elimina etapas. Solo tú puedes modificarlas.</p>
              </div>
            </div>

            {/* Existing stages list */}
            <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,overflow:'hidden',marginBottom:16}}>
              {stages.map((st, idx) => (
                <div key={st.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderBottom: idx<stages.length-1 ? '1px solid #f0f4ff' : 'none'}}>
                  {/* Color dot */}
                  <div style={{width:12,height:12,borderRadius:'50%',background:st.dot,flexShrink:0}}/>

                  {/* Label — editable inline */}
                  {editStageId===st.id ? (
                    <input
                      autoFocus
                      value={editStageLabel}
                      onChange={e=>setEditStageLabel(e.target.value)}
                      onKeyDown={e=>{ if(e.key==='Enter') renameStage(st.id,editStageLabel); if(e.key==='Escape') setEditStageId(null) }}
                      style={{flex:1,fontSize:13,padding:'4px 8px',borderRadius:6,border:'1px solid #A8C0F0',background:'#f0f4ff',color:'#111827'}}
                    />
                  ) : (
                    <span style={{flex:1,fontSize:13,fontWeight:600,color:st.col}}>{st.label}</span>
                  )}

                  {/* Lead count badge */}
                  <span style={{fontSize:11,color:'#9ca3af',minWidth:56,textAlign:'center'}}>{leads.filter(l=>l.stage===st.id).length} leads</span>

                  {/* Color picker */}
                  <select
                    value={COLOR_PRESETS.findIndex(p=>p.col===st.col)}
                    onChange={e=>changeStageColor(st.id,parseInt(e.target.value))}
                    style={{fontSize:11,padding:'3px 6px',borderRadius:6,border:'1px solid #dce8ff',background:'#fff',color:'#374151',cursor:'pointer'}}
                  >
                    {COLOR_PRESETS.map((p,i)=><option key={i} value={i}>{p.label}</option>)}
                  </select>

                  {/* Action buttons */}
                  <div style={{display:'flex',gap:4,flexShrink:0}}>
                    {editStageId===st.id ? (
                      <>
                        <button onClick={()=>renameStage(st.id,editStageLabel)} style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px solid #A8C0F0',background:B.light,color:B.primary,cursor:'pointer',fontWeight:600}}>✓</button>
                        <button onClick={()=>setEditStageId(null)} style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px solid #e5e7eb',background:'transparent',color:'#9ca3af',cursor:'pointer'}}>✕</button>
                      </>
                    ) : (
                      <button onClick={()=>{setEditStageId(st.id);setEditStageLabel(st.label)}} style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px solid #dce8ff',background:'transparent',color:B.mid,cursor:'pointer'}}>Renombrar</button>
                    )}
                    <button onClick={()=>moveStageUp(idx)} disabled={idx===0} style={{fontSize:12,padding:'3px 7px',borderRadius:6,border:'1px solid #dce8ff',background:'transparent',color:idx===0?'#e5e7eb':B.mid,cursor:idx===0?'not-allowed':'pointer'}}>↑</button>
                    <button onClick={()=>moveStageDown(idx)} disabled={idx===stages.length-1} style={{fontSize:12,padding:'3px 7px',borderRadius:6,border:'1px solid #dce8ff',background:'transparent',color:idx===stages.length-1?'#e5e7eb':B.mid,cursor:idx===stages.length-1?'not-allowed':'pointer'}}>↓</button>
                    <button onClick={()=>deleteStage(st.id)} style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px solid #fca5a5',background:'#FEF2F2',color:'#991b1b',cursor:'pointer'}}>Eliminar</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add new stage */}
            <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,padding:'14px 16px'}}>
              <p style={{margin:'0 0 10px',fontSize:13,fontWeight:600,color:B.primary}}>+ Nueva etapa</p>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end'}}>
                <div style={{flex:1,minWidth:160}}>
                  <label style={{fontSize:12,color:'#4b6cb7',display:'block',marginBottom:4,fontWeight:500}}>Nombre</label>
                  <input
                    value={newStage.label}
                    onChange={e=>setNewStage(p=>({...p,label:e.target.value}))}
                    onKeyDown={e=>e.key==='Enter'&&addStage()}
                    placeholder="Ej: Visita propiedad"
                    style={{...sty.inp}}
                  />
                </div>
                <div style={{minWidth:140}}>
                  <label style={{fontSize:12,color:'#4b6cb7',display:'block',marginBottom:4,fontWeight:500}}>Color</label>
                  <select
                    value={newStage.colorIdx}
                    onChange={e=>setNewStage(p=>({...p,colorIdx:parseInt(e.target.value)}))}
                    style={sty.sel}
                  >
                    {COLOR_PRESETS.map((p,i)=><option key={i} value={i}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:12,color:'transparent',display:'block',marginBottom:4}}>.</label>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{width:24,height:24,borderRadius:'50%',background:COLOR_PRESETS[newStage.colorIdx]?.dot,border:'2px solid '+COLOR_PRESETS[newStage.colorIdx]?.col}}/>
                    <button onClick={addStage} disabled={!newStage.label.trim()} style={{...sty.btnP,opacity:!newStage.label.trim()?0.5:1}}>Crear etapa</button>
                  </div>
                </div>
              </div>
            </div>

            <div style={{marginTop:12,padding:'10px 14px',background:'#FFFBEB',border:'1px solid #fcd34d',borderRadius:8,fontSize:12,color:'#92400e'}}>
              <strong>Nota:</strong> No puedes eliminar una etapa que tenga leads. Mueve los leads primero a otra etapa antes de eliminar.
            </div>
          </div>
        )}

        {/* DASHBOARD */}
        {nav==='dashboard' && isAdmin && (() => {
          const now = new Date()

          // ── Date range filter ──────────────────────────────────────────
          function getRangeDate(range) {
            const n = new Date()
            if (range === 'this_week') { const d=new Date(n); d.setDate(n.getDate()-n.getDay()+1); d.setHours(0,0,0,0); return [d, null] }
            if (range === 'this_month') return [new Date(n.getFullYear(),n.getMonth(),1), null]
            if (range === 'last_month') return [new Date(n.getFullYear(),n.getMonth()-1,1), new Date(n.getFullYear(),n.getMonth(),0,23,59,59)]
            if (range === 'last_3m') { const d=new Date(n); d.setMonth(n.getMonth()-3); return [d, null] }
            if (range === 'last_6m') { const d=new Date(n); d.setMonth(n.getMonth()-6); return [d, null] }
            if (range === 'this_year') return [new Date(n.getFullYear(),0,1), null]
            if (range === 'custom' && customFrom) return [new Date(customFrom), customTo ? new Date(customTo+'T23:59:59') : null]
            return [null, null]
          }
          const [rangeFrom, rangeTo] = getRangeDate(dateRange)
          const inRange = l => {
            const d = new Date(l.fecha)
            if (rangeFrom && d < rangeFrom) return false
            if (rangeTo && d > rangeTo) return false
            return true
          }
          const filteredLeads = leads.filter(inRange)

          // ── Previous period for comparison ─────────────────────────────
          function getPrevRange(range) {
            const n = new Date()
            if (range === 'this_month') return [new Date(n.getFullYear(),n.getMonth()-1,1), new Date(n.getFullYear(),n.getMonth(),0,23,59,59)]
            if (range === 'last_month') return [new Date(n.getFullYear(),n.getMonth()-2,1), new Date(n.getFullYear(),n.getMonth()-1,0,23,59,59)]
            if (range === 'this_week') { const d=new Date(n); d.setDate(n.getDate()-n.getDay()-6); d.setHours(0,0,0,0); const e=new Date(n); e.setDate(n.getDate()-n.getDay()); e.setHours(23,59,59); return [d,e] }
            return [null,null]
          }
          const [prevFrom, prevTo] = getPrevRange(dateRange)
          const inPrev = l => { const d=new Date(l.fecha); if(prevFrom&&d<prevFrom)return false; if(prevTo&&d>prevTo)return false; return true }
          const prevLeads = leads.filter(inPrev)

          const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay() + 1); startOfWeek.setHours(0,0,0,0)
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
          const startOfLastMonth = new Date(now.getFullYear(), now.getMonth()-1, 1)
          const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

          const leadsThisWeek  = leads.filter(l => new Date(l.fecha) >= startOfWeek).length
          const leadsThisMonth = leads.filter(l => new Date(l.fecha) >= startOfMonth).length
          const leadsLastMonth = leads.filter(l => new Date(l.fecha) >= startOfLastMonth && new Date(l.fecha) <= endOfLastMonth).length
          const ganados        = filteredLeads.filter(l => ['firma','escritura'].includes(l.stage)).length
          const perdidos       = filteredLeads.filter(l => l.stage === 'perdido').length
          const sinAsignar     = filteredLeads.filter(l => !l.assigned_to).length
          const convRate       = filteredLeads.length > 0 ? Math.round((ganados / filteredLeads.length) * 100) : 0
          const tendenciaCount = prevLeads.length > 0 ? Math.round(((filteredLeads.length - prevLeads.length) / prevLeads.length)*100) : null

          // Leads por etapa (filtrados)
          const byStage = stages.map(st => ({
            ...st,
            count: filteredLeads.filter(l => l.stage === st.id).length,
            pct: filteredLeads.length > 0 ? Math.round((filteredLeads.filter(l=>l.stage===st.id).length / filteredLeads.length)*100) : 0
          }))

          // Leads por agente (filtrados)
          const agents = (users||[]).filter(u => u.role === 'agent')
          const byAgent = agents.map(ag => {
            const agLeads = filteredLeads.filter(l => l.assigned_to === ag.id)
            const agGanados = agLeads.filter(l => ['firma','escritura'].includes(l.stage)).length
            const agPerdidos = agLeads.filter(l => l.stage === 'perdido').length
            return {
              ...ag,
              total: agLeads.length,
              ganados: agGanados,
              perdidos: agPerdidos,
              enProceso: agLeads.filter(l => !['firma','escritura','perdido'].includes(l.stage)).length,
              convRate: agLeads.length > 0 ? Math.round((agGanados/agLeads.length)*100) : 0
            }
          }).sort((a,b) => b.total - a.total)

          // Leads por etiqueta (filtrados)
          const byTag = ['lead','referido','pool'].map(tag => ({
            tag, count: filteredLeads.filter(l => l.tag === tag).length
          }))

          // Leads estancados (filtrados)
          const stancados = filteredLeads.filter(l => {
            if (['firma','escritura','perdido'].includes(l.stage)) return false
            return daysIn(l) > 7
          }).length

          const RANGE_OPTS = [
            {v:'all',       l:'Todo el tiempo'},
            {v:'this_week', l:'Esta semana'},
            {v:'this_month',l:'Este mes'},
            {v:'last_month',l:'Mes anterior'},
            {v:'last_3m',   l:'Últimos 3 meses'},
            {v:'last_6m',   l:'Últimos 6 meses'},
            {v:'this_year', l:'Este año'},
            {v:'custom',    l:'Rango personalizado'},
          ]
          const rangeLabel = RANGE_OPTS.find(o=>o.v===dateRange)?.l || 'Todo el tiempo'
          const totalInRange = filteredLeads.length

          return (
            <div>
              {/* Date range filter bar */}
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,flexWrap:'wrap',padding:'10px 14px',background:'#fff',border:'1px solid #dce8ff',borderRadius:12}}>
                <span style={{fontSize:12,fontWeight:700,color:B.primary,flexShrink:0}}>Período:</span>
                <div style={{display:'flex',gap:6,flexWrap:'wrap',flex:1}}>
                  {RANGE_OPTS.filter(o=>o.v!=='custom').map(o=>(
                    <button key={o.v} onClick={()=>setDateRange(o.v)} style={{fontSize:12,padding:'5px 12px',borderRadius:8,border:dateRange===o.v?`2px solid ${B.primary}`:'1px solid #dce8ff',background:dateRange===o.v?B.light:'transparent',color:dateRange===o.v?B.primary:'#6b7280',cursor:'pointer',fontWeight:dateRange===o.v?700:400}}>
                      {o.l}
                    </button>
                  ))}
                  <button onClick={()=>setDateRange('custom')} style={{fontSize:12,padding:'5px 12px',borderRadius:8,border:dateRange==='custom'?`2px solid ${B.primary}`:'1px solid #dce8ff',background:dateRange==='custom'?B.light:'transparent',color:dateRange==='custom'?B.primary:'#6b7280',cursor:'pointer',fontWeight:dateRange==='custom'?700:400}}>
                    Personalizado
                  </button>
                </div>
                {dateRange==='custom' && (
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{...sty.inp,width:'auto',fontSize:12,padding:'5px 8px'}}/>
                    <span style={{fontSize:12,color:'#9ca3af'}}>→</span>
                    <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{...sty.inp,width:'auto',fontSize:12,padding:'5px 8px'}}/>
                  </div>
                )}
                <div style={{marginLeft:'auto',flexShrink:0}}>
                  <span style={{fontSize:12,color:B.mid,fontWeight:600}}>{totalInRange} leads</span>
                  {tendenciaCount!==null && <span style={{fontSize:11,marginLeft:8,color:tendenciaCount>=0?'#166534':'#991b1b',fontWeight:600}}>{tendenciaCount>=0?'+':''}{tendenciaCount}% vs período ant.</span>}
                </div>
              </div>

              {/* KPI cards row */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10,marginBottom:20}}>
                {[
                  {label:'Total período', value:filteredLeads.length, bg:'#E8EFFE', col:B.primary},
                  {label:'Esta semana',   value:leadsThisWeek, bg:'#F0FDF4', col:'#166534'},
                  {label:'Este mes',      value:leadsThisMonth, bg:'#F5F3FF', col:'#5b21b6'},
                  {label:'En cierre',     value:ganados, bg:'#DCFCE7', col:'#14532d'},
                  {label:'Perdidos',      value:perdidos, bg:'#FEF2F2', col:'#991b1b'},
                  {label:'Conversión',    value:convRate+'%', bg:'#FFFBEB', col:'#92400e'},
                  {label:'Sin asignar',   value:sinAsignar, bg: sinAsignar>0 ? '#FEF2F2' : '#F9FAFB', col: sinAsignar>0 ? '#991b1b' : '#374151'},
                  {label:'Estancados +7d',value:stancados, bg: stancados>0 ? '#FFF7ED' : '#F9FAFB', col: stancados>0 ? '#9a3412' : '#374151'},
                ].map((k,i) => (
                  <div key={i} style={{background:k.bg,borderRadius:10,padding:'12px 14px',border:'1px solid '+k.col+'33'}}>
                    <div style={{fontSize:11,color:k.col,fontWeight:600,marginBottom:4,opacity:.8}}>{k.label}</div>
                    <div style={{fontSize:26,fontWeight:800,color:k.col,lineHeight:1}}>{k.value}</div>
                    {k.sub && <div style={{fontSize:10,color:k.subCol,marginTop:4,fontWeight:600}}>{k.sub}</div>}
                  </div>
                ))}
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>

                {/* Pipeline por etapa */}
                <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Pipeline por etapa</p>
                  {byStage.map(st => (
                    <div key={st.id} style={{marginBottom:10}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                        <span style={{fontSize:12,color:'#374151',fontWeight:500}}>{st.label}</span>
                        <span style={{fontSize:12,fontWeight:700,color:st.col}}>{st.count} <span style={{fontSize:10,color:'#9ca3af',fontWeight:400}}>({st.pct}%)</span></span>
                      </div>
                      <div style={{height:6,background:'#f0f4ff',borderRadius:99,overflow:'hidden'}}>
                        <div style={{height:'100%',width:st.pct+'%',background:st.col,borderRadius:99,transition:'width .4s ease',minWidth:st.count>0?8:0}}/>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Rendimiento por agente */}
                <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Rendimiento por agente</p>
                  {byAgent.length === 0 && <p style={{fontSize:12,color:'#9ca3af'}}>Sin agentes registrados</p>}
                  {byAgent.map(ag => (
                    <div key={ag.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,paddingBottom:12,borderBottom:'1px solid #f0f4ff'}}>
                      <AV name={ag.name} size={34}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ag.name}</div>
                        <div style={{display:'flex',gap:10,marginTop:3}}>
                          <span style={{fontSize:11,color:'#6b7280'}}>{ag.total} leads</span>
                          <span style={{fontSize:11,color:'#166534',fontWeight:600}}>{ag.ganados} en cierre</span>
                          <span style={{fontSize:11,color:'#991b1b'}}>{ag.perdidos} perdidos</span>
                        </div>
                        <div style={{height:4,background:'#f0f4ff',borderRadius:99,marginTop:5,overflow:'hidden'}}>
                          <div style={{height:'100%',width:(leads.length>0?Math.round((ag.total/leads.length)*100):0)+'%',background:B.primary,borderRadius:99}}/>
                        </div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        <div style={{fontSize:16,fontWeight:800,color:ag.convRate>=30?'#166534':ag.convRate>=15?'#92400e':'#374151'}}>{ag.convRate}%</div>
                        <div style={{fontSize:10,color:'#9ca3af'}}>conv.</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>

                {/* Por etiqueta */}
                <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Distribución por etiqueta</p>
                  {byTag.map(({tag,count}) => {
                    const t = TAG_ST[tag]||TAG_ST.lead
                    const pct = leads.length>0 ? Math.round((count/leads.length)*100) : 0
                    return (
                      <div key={tag} style={{marginBottom:10}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                          <Tag tag={tag}/>
                          <span style={{fontSize:12,fontWeight:700,color:t.col}}>{count} <span style={{fontSize:10,color:'#9ca3af',fontWeight:400}}>({pct}%)</span></span>
                        </div>
                        <div style={{height:6,background:'#f0f4ff',borderRadius:99,overflow:'hidden'}}>
                          <div style={{height:'100%',width:pct+'%',background:t.col,borderRadius:99,opacity:.7}}/>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Leads estancados */}
                <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Leads estancados {stancados>0&&<span style={{fontSize:11,padding:'2px 8px',borderRadius:99,background:'#FFF7ED',color:'#9a3412',fontWeight:600,marginLeft:4}}>+7 días</span>}</p>
                  {leads.filter(l=>!['firma','escritura','perdido'].includes(l.stage)&&daysIn(l)>7).length===0
                    ? <p style={{fontSize:12,color:'#9ca3af'}}>Sin leads estancados. ¡Todo fluye bien!</p>
                    : leads.filter(l=>!['firma','escritura','perdido'].includes(l.stage)&&daysIn(l)>7)
                        .sort((a,b)=>daysIn(b)-daysIn(a))
                        .slice(0,6)
                        .map(l => {
                          const st = stages.find(x=>x.id===l.stage)||stages[0]||{}
                          const ag = (users||[]).find(u=>u.id===l.assigned_to)
                          return (
                            <div key={l.id} onClick={()=>{setSel(l);setModal('lead')}} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,padding:'6px 8px',borderRadius:8,background:'#FFF7ED',border:'1px solid #fdba74',cursor:'pointer'}}>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:12,fontWeight:600,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.nombre}</div>
                                <div style={{fontSize:11,color:'#9ca3af'}}>{st.label} {ag?'· '+ag.name.split(' ')[0]:''}</div>
                              </div>
                              <Days d={daysIn(l)}/>
                            </div>
                          )
                        })
                  }
                </div>
              </div>
            </div>
          )
        })()}


        {/* DASHBOARD SOCIO COMERCIAL */}
        {nav==='dashboard' && isPartner && (() => {
          const now = new Date()

          // ── Date range filter (shared state with admin) ────────────────
          function getRangeDateP(range) {
            const n = new Date()
            if (range === 'this_week') { const d=new Date(n); d.setDate(n.getDate()-n.getDay()+1); d.setHours(0,0,0,0); return [d, null] }
            if (range === 'this_month') return [new Date(n.getFullYear(),n.getMonth(),1), null]
            if (range === 'last_month') return [new Date(n.getFullYear(),n.getMonth()-1,1), new Date(n.getFullYear(),n.getMonth(),0,23,59,59)]
            if (range === 'last_3m') { const d=new Date(n); d.setMonth(n.getMonth()-3); return [d, null] }
            if (range === 'last_6m') { const d=new Date(n); d.setMonth(n.getMonth()-6); return [d, null] }
            if (range === 'this_year') return [new Date(n.getFullYear(),0,1), null]
            if (range === 'custom' && customFrom) return [new Date(customFrom), customTo ? new Date(customTo+'T23:59:59') : null]
            return [null, null]
          }
          const [pRangeFrom, pRangeTo] = getRangeDateP(dateRange)
          const inRangeP = l => {
            const d = new Date(l.fecha)
            if (pRangeFrom && d < pRangeFrom) return false
            if (pRangeTo && d > pRangeTo) return false
            return true
          }

          const allPool = leads.filter(l => l.tag === 'pool')
          const poolLeads = allPool.filter(inRangeP)

          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
          const startOfLastMonth = new Date(now.getFullYear(), now.getMonth()-1, 1)
          const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

          const poolThisMonth  = allPool.filter(l => new Date(l.fecha) >= startOfMonth).length
          const poolLastMonth  = allPool.filter(l => new Date(l.fecha) >= startOfLastMonth && new Date(l.fecha) <= endOfLastMonth).length
          const poolGanados    = poolLeads.filter(l => ['firma','escritura'].includes(l.stage)).length
          const poolPerdidos   = poolLeads.filter(l => l.stage === 'perdido').length
          const poolEnProceso  = poolLeads.filter(l => !['firma','escritura','perdido'].includes(l.stage)).length
          const convRate       = poolLeads.length > 0 ? Math.round((poolGanados / poolLeads.length) * 100) : 0
          const tendencia      = poolLastMonth > 0 ? Math.round(((poolThisMonth - poolLastMonth) / poolLastMonth)*100) : null
          const stancados      = poolLeads.filter(l => l.stage !== 'ganado' && l.stage !== 'perdido' && daysIn(l) > 7).length

          // Pool por etapa
          const byStage = stages.map(st => ({
            ...st,
            count: poolLeads.filter(l => l.stage === st.id).length,
            pct: poolLeads.length > 0 ? Math.round((poolLeads.filter(l=>l.stage===st.id).length / poolLeads.length)*100) : 0
          })).filter(st => st.count > 0)

          // Pool por agente
          const agents = (users||[]).filter(u => u.role === 'agent')
          const byAgent = agents.map(ag => {
            const agLeads = poolLeads.filter(l => l.assigned_to === ag.id)
            const agGanados = agLeads.filter(l => ['firma','escritura'].includes(l.stage)).length
            return {
              ...ag,
              total: agLeads.length,
              ganados: agGanados,
              enProceso: agLeads.filter(l => !['firma','escritura','perdido'].includes(l.stage)).length,
              convRate: agLeads.length > 0 ? Math.round((agGanados/agLeads.length)*100) : 0
            }
          }).filter(ag => ag.total > 0).sort((a,b) => b.total - a.total)

          // Cal distribution for pool
          const byCal = ['Alta','Media','Baja'].map(cal => ({
            cal,
            count: poolLeads.filter(l => l.calificacion === cal).length,
            pct: poolLeads.length > 0 ? Math.round((poolLeads.filter(l=>l.calificacion===cal).length/poolLeads.length)*100) : 0
          }))

          return (
            <div>
              {/* Header */}
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,paddingBottom:12,borderBottom:'2px solid #E8EFFE'}}>
                <div style={{width:40,height:40,borderRadius:10,background:B.light,border:`1px solid ${B.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>📊</div>
                <div>
                  <div style={{fontSize:16,fontWeight:800,color:B.primary}}>Dashboard Pool</div>
                  <div style={{fontSize:12,color:B.mid}}>Rendimiento de leads etiquetados como pool</div>
                </div>
              </div>

              {/* Date range filter bar */}
              {(() => {
                const ROPTS = [
                  {v:'all',l:'Todo'},{v:'this_week',l:'Esta semana'},{v:'this_month',l:'Este mes'},
                  {v:'last_month',l:'Mes anterior'},{v:'last_3m',l:'3 meses'},{v:'last_6m',l:'6 meses'},{v:'this_year',l:'Este año'},{v:'custom',l:'Personalizado'}
                ]
                return (
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,flexWrap:'wrap',padding:'10px 14px',background:'#fff',border:'1px solid #dce8ff',borderRadius:12}}>
                    <span style={{fontSize:12,fontWeight:700,color:B.primary,flexShrink:0}}>Período:</span>
                    <div style={{display:'flex',gap:5,flexWrap:'wrap',flex:1}}>
                      {ROPTS.filter(o=>o.v!=='custom').map(o=>(
                        <button key={o.v} onClick={()=>setDateRange(o.v)} style={{fontSize:11,padding:'4px 10px',borderRadius:8,border:dateRange===o.v?`2px solid ${B.primary}`:'1px solid #dce8ff',background:dateRange===o.v?B.light:'transparent',color:dateRange===o.v?B.primary:'#6b7280',cursor:'pointer',fontWeight:dateRange===o.v?700:400}}>
                          {o.l}
                        </button>
                      ))}
                      <button onClick={()=>setDateRange('custom')} style={{fontSize:11,padding:'4px 10px',borderRadius:8,border:dateRange==='custom'?`2px solid ${B.primary}`:'1px solid #dce8ff',background:dateRange==='custom'?B.light:'transparent',color:dateRange==='custom'?B.primary:'#6b7280',cursor:'pointer',fontWeight:dateRange==='custom'?700:400}}>
                        Personalizado
                      </button>
                    </div>
                    {dateRange==='custom' && (
                      <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                        <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{fontSize:11,padding:'4px 7px',borderRadius:6,border:'1px solid #c5d5f5',background:'#fff',color:'#111827'}}/>
                        <span style={{fontSize:11,color:'#9ca3af'}}>→</span>
                        <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{fontSize:11,padding:'4px 7px',borderRadius:6,border:'1px solid #c5d5f5',background:'#fff',color:'#111827'}}/>
                      </div>
                    )}
                    <span style={{marginLeft:'auto',fontSize:12,color:B.mid,fontWeight:600,flexShrink:0}}>{poolLeads.length} leads pool</span>
                  </div>
                )
              })()}

              {/* KPIs */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10,marginBottom:20}}>
                {[
                  {label:'Total pool',    value:poolLeads.length,  bg:'#E8EFFE', col:B.primary},
                  {label:'Este mes',      value:poolThisMonth,     bg:'#F5F3FF', col:'#5b21b6',
                    sub: tendencia!==null ? (tendencia>=0?`+${tendencia}%`:`${tendencia}%`)+' vs mes ant.' : null,
                    subCol: tendencia>=0?'#166534':'#991b1b'
                  },
                  {label:'En proceso',   value:poolEnProceso,     bg:'#FFFBEB', col:'#92400e'},
                  {label:'En cierre',    value:poolGanados,       bg:'#DCFCE7', col:'#14532d'},
                  {label:'Perdidos',     value:poolPerdidos,      bg:'#FEF2F2', col:'#991b1b'},
                  {label:'Conversión',   value:convRate+'%',      bg: convRate>=30?'#DCFCE7':convRate>=15?'#FFFBEB':'#F9FAFB', col: convRate>=30?'#14532d':convRate>=15?'#92400e':'#374151'},
                  {label:'Estancados +7d',value:stancados,        bg: stancados>0?'#FFF7ED':'#F9FAFB', col: stancados>0?'#9a3412':'#374151'},
                ].map((k,i) => (
                  <div key={i} style={{background:k.bg,borderRadius:10,padding:'12px 14px',border:'1px solid '+k.col+'33'}}>
                    <div style={{fontSize:11,color:k.col,fontWeight:600,marginBottom:4,opacity:.8}}>{k.label}</div>
                    <div style={{fontSize:26,fontWeight:800,color:k.col,lineHeight:1}}>{k.value}</div>
                    {k.sub && <div style={{fontSize:10,color:k.subCol,marginTop:4,fontWeight:600}}>{k.sub}</div>}
                  </div>
                ))}
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>

                {/* Pipeline pool por etapa */}
                <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Pipeline pool por etapa</p>
                  {byStage.length === 0
                    ? <p style={{fontSize:12,color:'#9ca3af'}}>Sin leads pool aún</p>
                    : byStage.map(st => (
                      <div key={st.id} style={{marginBottom:10}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                          <span style={{fontSize:12,color:'#374151',fontWeight:500}}>{st.label}</span>
                          <span style={{fontSize:12,fontWeight:700,color:st.col}}>{st.count} <span style={{fontSize:10,color:'#9ca3af',fontWeight:400}}>({st.pct}%)</span></span>
                        </div>
                        <div style={{height:6,background:'#f0f4ff',borderRadius:99,overflow:'hidden'}}>
                          <div style={{height:'100%',width:st.pct+'%',background:st.col,borderRadius:99,minWidth:st.count>0?8:0}}/>
                        </div>
                      </div>
                    ))
                  }
                </div>

                {/* Calificación */}
                <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Calificación de pool</p>
                  {byCal.map(({cal,count,pct}) => {
                    const c = CAL[cal] || {bg:'#F9FAFB',col:'#374151'}
                    return (
                      <div key={cal} style={{marginBottom:12}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                          <span style={{fontSize:12,padding:'2px 10px',borderRadius:99,background:c.bg,color:c.col,fontWeight:600}}>{cal}</span>
                          <span style={{fontSize:12,fontWeight:700,color:c.col}}>{count} <span style={{fontSize:10,color:'#9ca3af',fontWeight:400}}>({pct}%)</span></span>
                        </div>
                        <div style={{height:6,background:'#f0f4ff',borderRadius:99,overflow:'hidden'}}>
                          <div style={{height:'100%',width:pct+'%',background:c.col,borderRadius:99,opacity:.7}}/>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>

                {/* Brokers asignados */}
                <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Brokers asignados</p>
                  {byAgent.length === 0
                    ? <p style={{fontSize:12,color:'#9ca3af'}}>Sin leads asignados a brokers</p>
                    : byAgent.map(ag => (
                      <div key={ag.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,paddingBottom:12,borderBottom:'1px solid #f0f4ff'}}>
                        <AV name={ag.name} size={34}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ag.name}</div>
                          <div style={{display:'flex',gap:8,marginTop:2}}>
                            <span style={{fontSize:11,color:'#6b7280'}}>{ag.total} leads</span>
                            <span style={{fontSize:11,color:'#166534',fontWeight:600}}>{ag.ganados} en cierre</span>
                            <span style={{fontSize:11,color:'#92400e'}}>{ag.enProceso} en proceso</span>
                          </div>
                          <div style={{height:4,background:'#f0f4ff',borderRadius:99,marginTop:5,overflow:'hidden'}}>
                            <div style={{height:'100%',width:(poolLeads.length>0?Math.round((ag.total/poolLeads.length)*100):0)+'%',background:B.primary,borderRadius:99}}/>
                          </div>
                        </div>
                        <div style={{textAlign:'right',flexShrink:0}}>
                          <div style={{fontSize:16,fontWeight:800,color:ag.convRate>=30?'#166534':ag.convRate>=15?'#92400e':'#374151'}}>{ag.convRate}%</div>
                          <div style={{fontSize:10,color:'#9ca3af'}}>conv.</div>
                        </div>
                      </div>
                    ))
                  }
                </div>

                {/* Pool recientes */}
                <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Últimos leads pool</p>
                  {poolLeads.length === 0
                    ? <p style={{fontSize:12,color:'#9ca3af'}}>Sin leads pool registrados</p>
                    : [...poolLeads].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0,7).map(l => {
                        const st = stages.find(x=>x.id===l.stage)||stages[0]||{}
                        const ag = (users||[]).find(u=>u.id===l.assigned_to)
                        const cal = CAL[l.calificacion]
                        return (
                          <div key={l.id} onClick={()=>{setSel(l);setModal('lead')}} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,padding:'7px 10px',borderRadius:8,background:'#f9fbff',border:'1px solid #dce8ff',cursor:'pointer'}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:12,fontWeight:600,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.nombre}</div>
                              <div style={{display:'flex',gap:6,alignItems:'center',marginTop:2}}>
                                <span style={{fontSize:10,padding:'1px 6px',borderRadius:99,background:st.bg,color:st.col,fontWeight:600}}>{st.label}</span>
                                {ag && <span style={{fontSize:10,color:'#9ca3af'}}>{ag.name.split(' ')[0]}</span>}
                              </div>
                            </div>
                            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2,flexShrink:0}}>
                              {cal && <span style={{fontSize:10,padding:'1px 6px',borderRadius:99,background:cal.bg,color:cal.col,fontWeight:600}}>{l.calificacion}</span>}
                              <span style={{fontSize:10,color:'#9ca3af'}}>{fmt(l.fecha)}</span>
                            </div>
                          </div>
                        )
                      })
                  }
                </div>
              </div>
            </div>
          )
        })()}

        {/* IMPORTAR */}
        {nav==='importar' && isAdmin && (() => {
          return (
            <div style={{maxWidth:700}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16,flexWrap:'wrap',gap:8}}>
                <div>
                  <p style={{margin:'0 0 2px',fontSize:14,fontWeight:700,color:B.primary}}>Carga masiva de leads</p>
                  <p style={{margin:0,fontSize:12,color:B.mid}}>Sube un archivo Excel o CSV con tus leads. Solo el administrador puede usar esta función.</p>
                </div>
                <button onClick={downloadTemplate} style={{...sty.btnO,fontSize:12}}>Descargar plantilla CSV</button>
              </div>

              {/* Format info */}
              <div style={{background:'#FFFBEB',border:'1px solid #fcd34d',borderRadius:10,padding:'10px 14px',marginBottom:16,fontSize:12,color:'#92400e'}}>
                <strong>Columnas aceptadas:</strong> Nombre (obligatorio), Teléfono, Email, Renta.
                Los encabezados pueden estar en español o inglés. Formatos soportados: <strong>.xlsx, .xls, .csv</strong>
              </div>

              {/* Drop zone */}
              <div
                style={{border:'2px dashed #A8C0F0',borderRadius:12,padding:'32px 20px',textAlign:'center',background:'#f9fbff',marginBottom:16,cursor:'pointer'}}
                onClick={()=>document.getElementById('imp-file').click()}
                onDragOver={e=>e.preventDefault()}
                onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleImportFile(f)}}
              >
                <div style={{fontSize:32,marginBottom:8}}>📂</div>
                <div style={{fontSize:14,fontWeight:600,color:B.primary,marginBottom:4}}>Arrastra tu archivo aquí o haz clic para seleccionar</div>
                <div style={{fontSize:12,color:'#9ca3af'}}>.xlsx · .xls · .csv</div>
                <input id="imp-file" type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>handleImportFile(e.target.files[0])}/>
              </div>

              {/* Errors */}
              {importErrors.length>0 && (
                <div style={{background:'#FEF2F2',border:'1px solid #fca5a5',borderRadius:10,padding:'10px 14px',marginBottom:14}}>
                  {importErrors.map((e,i)=><div key={i} style={{fontSize:12,color:'#991b1b',marginBottom:2}}>⚠ {e}</div>)}
                </div>
              )}

              {/* Preview */}
              {importRows.length>0 && (
                <div style={{marginBottom:16}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <span style={{fontSize:13,fontWeight:700,color:B.primary}}>{importRows.length} leads listos para importar</span>
                    <button onClick={()=>{setImportRows([]);setImportErrors([]);setImportDone(null)}} style={{...sty.btn,fontSize:11,padding:'3px 8px'}}>Limpiar</button>
                  </div>

                  {/* Options */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                    <Fld label="Etiqueta para todos los leads">
                      <select value={impTag} onChange={e=>setImpTag(e.target.value)} style={sty.sel}>
                        <option value="lead">Lead</option>
                        <option value="pool">Pool</option>
                        <option value="referido">Referido</option>
                      </select>
                    </Fld>
                    <Fld label="Asignar a agente (opcional)">
                      <select value={impAgent} onChange={e=>setImpAgent(e.target.value)} style={sty.sel}>
                        <option value="">Sin asignar</option>
                        {(users||[]).filter(u=>u.role==='agent').map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </Fld>
                  </div>

                  {/* Table preview */}
                  <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:10,overflow:'auto',maxHeight:280,marginBottom:12}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                      <thead>
                        <tr style={{background:B.light,position:'sticky',top:0}}>
                          {['#','Nombre','Teléfono','Email','Renta'].map(h=><th key={h} style={{padding:'7px 10px',textAlign:'left',fontWeight:700,color:B.primary,whiteSpace:'nowrap'}}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((r,i)=>(
                          <tr key={i} style={{borderBottom:'1px solid #f0f4ff'}}>
                            <td style={{padding:'6px 10px',color:'#9ca3af'}}>{r._row}</td>
                            <td style={{padding:'6px 10px',fontWeight:600,color:'#111827'}}>{r.nombre}</td>
                            <td style={{padding:'6px 10px',color:'#6b7280'}}>{r.telefono}</td>
                            <td style={{padding:'6px 10px',color:'#6b7280'}}>{r.email}</td>
                            <td style={{padding:'6px 10px',color:'#6b7280'}}>{r.renta}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    onClick={()=>confirmImport(impTag,impAgent)}
                    disabled={importing}
                    style={{...sty.btnP,width:'100%',padding:'10px 16px',fontSize:14,opacity:importing?0.6:1}}
                  >{importing?'Importando...':'Importar '+importRows.length+' leads'}</button>
                </div>
              )}

              {/* Success */}
              {importDone!==null && (
                <div style={{background:'#DCFCE7',border:'1px solid #86efac',borderRadius:10,padding:'16px 20px',textAlign:'center'}}>
                  <div style={{fontSize:28,marginBottom:6}}>✅</div>
                  <div style={{fontSize:15,fontWeight:700,color:'#14532d',marginBottom:4}}>{importDone} leads importados exitosamente</div>
                  <div style={{fontSize:12,color:'#166534',marginBottom:12}}>Ya puedes verlos en el Kanban y asignarlos a tus agentes</div>
                  <button onClick={()=>setNav('kanban')} style={{...sty.btnP,fontSize:12}}>Ir al Kanban →</button>
                </div>
              )}
            </div>
          )
        })()}

        {/* RANKING */}
        {nav==='ranking' && isAdmin && (() => {
          const now = new Date()
          const RANK_OPTS = [
            {v:'all',        l:'Todo el tiempo'},
            {v:'this_month', l:'Este mes'},
            {v:'last_month', l:'Mes anterior'},
            {v:'q1',         l:'Q1 (Ene-Mar)'},
            {v:'q2',         l:'Q2 (Abr-Jun)'},
            {v:'q3',         l:'Q3 (Jul-Sep)'},
            {v:'q4',         l:'Q4 (Oct-Dic)'},
            {v:'this_year',  l:'Este año'},
            {v:'custom',     l:'Personalizado'},
          ]

          function getRankRange(v) {
            const y = now.getFullYear()
            if (v==='this_month') return [new Date(y,now.getMonth(),1), null]
            if (v==='last_month') return [new Date(y,now.getMonth()-1,1), new Date(y,now.getMonth(),0,23,59,59)]
            if (v==='q1') return [new Date(y,0,1), new Date(y,2,31,23,59,59)]
            if (v==='q2') return [new Date(y,3,1), new Date(y,5,30,23,59,59)]
            if (v==='q3') return [new Date(y,6,1), new Date(y,8,30,23,59,59)]
            if (v==='q4') return [new Date(y,9,1), new Date(y,11,31,23,59,59)]
            if (v==='this_year') return [new Date(y,0,1), null]
            if (v==='custom' && customFrom) return [new Date(customFrom), customTo?new Date(customTo+'T23:59:59'):null]
            return [null, null]
          }

          const [rFrom, rTo] = getRankRange(dateRange)
          const inRankRange = l => {
            const d = new Date(l.stage_moved_at || l.fecha)
            if (rFrom && d < rFrom) return false
            if (rTo && d > rTo) return false
            return true
          }

          const rankingStages = ['firma','escritura']
          const agents = (users||[]).filter(u => u.role === 'agent')

          const calcUF = agLeads => agLeads.reduce((sum,l) => {
            return sum + (l.propiedades||[]).filter(p=>p.moneda==='UF').reduce((s,p)=>s+(parseFloat(p.bono_pie?p.precio_sin_bono:p.precio)||0),0)
          },0)
          const calcUSD = agLeads => agLeads.reduce((sum,l) => {
            return sum + (l.propiedades||[]).filter(p=>p.moneda==='USD').reduce((s,p)=>s+(parseFloat(p.bono_pie?p.precio_sin_bono:p.precio)||0),0)
          },0)

          const ranked = agents.map(ag => {
            const allClosedLeads = leads.filter(l => l.assigned_to===ag.id && rankingStages.includes(l.stage))
            const filteredLeads  = allClosedLeads.filter(inRankRange)
            return {
              ...ag,
              totalUF:    calcUF(filteredLeads),
              totalUSD:   calcUSD(filteredLeads),
              ufYear:     calcUF(allClosedLeads.filter(l => new Date(l.stage_moved_at||l.fecha).getFullYear()===now.getFullYear())),
              ufQ:        calcUF(allClosedLeads.filter(l => { const m=new Date(l.stage_moved_at||l.fecha).getMonth(); const q=Math.floor(now.getMonth()/3); return m>=q*3&&m<q*3+3 && new Date(l.stage_moved_at||l.fecha).getFullYear()===now.getFullYear() })),
              ufMonth:    calcUF(allClosedLeads.filter(l => { const d=new Date(l.stage_moved_at||l.fecha); return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear() })),
              propCount:  filteredLeads.reduce((s,l)=>s+(l.propiedades||[]).length,0),
              leadsCount: filteredLeads.length,
            }
          }).sort((a,b) => b.totalUF - a.totalUF)

          const medals = ['🥇','🥈','🥉']
          const qName = ['Q1','Q2','Q3','Q4'][Math.floor(now.getMonth()/3)]
          const grandTotalUF = ranked.reduce((s,ag)=>s+ag.totalUF,0)

          return (
            <div>
              {/* Header */}
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,paddingBottom:12,borderBottom:'2px solid #E8EFFE'}}>
                <div style={{fontSize:28}}>🏆</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:16,fontWeight:800,color:B.primary}}>Ranking de Asesores</div>
                  <div style={{fontSize:12,color:B.mid}}>UF acumuladas en Firma Promesa y Firma Escritura</div>
                </div>
                {grandTotalUF > 0 && <div style={{textAlign:'right'}}>
                  <div style={{fontSize:11,color:B.mid}}>Total período</div>
                  <div style={{fontSize:18,fontWeight:800,color:B.primary}}>UF {grandTotalUF.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                </div>}
              </div>

              {/* Period filter */}
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,padding:'10px 14px',background:'#fff',border:'1px solid #dce8ff',borderRadius:12,flexWrap:'wrap'}}>
                <span style={{fontSize:12,fontWeight:700,color:B.primary,flexShrink:0}}>Período:</span>
                <div style={{display:'flex',gap:5,flexWrap:'wrap',flex:1}}>
                  {RANK_OPTS.filter(o=>o.v!=='custom').map(o=>(
                    <button key={o.v} onClick={()=>setDateRange(o.v)} style={{fontSize:11,padding:'4px 10px',borderRadius:8,border:dateRange===o.v?`2px solid ${B.primary}`:'1px solid #dce8ff',background:dateRange===o.v?B.light:'transparent',color:dateRange===o.v?B.primary:'#6b7280',cursor:'pointer',fontWeight:dateRange===o.v?700:400}}>
                      {o.l}
                    </button>
                  ))}
                  <button onClick={()=>setDateRange('custom')} style={{fontSize:11,padding:'4px 10px',borderRadius:8,border:dateRange==='custom'?`2px solid ${B.primary}`:'1px solid #dce8ff',background:dateRange==='custom'?B.light:'transparent',color:dateRange==='custom'?B.primary:'#6b7280',cursor:'pointer',fontWeight:dateRange==='custom'?700:400}}>Personalizado</button>
                </div>
                {dateRange==='custom' && (
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{fontSize:11,padding:'4px 7px',borderRadius:6,border:'1px solid #c5d5f5',background:'#fff',color:'#111827'}}/>
                    <span style={{fontSize:11,color:'#9ca3af'}}>→</span>
                    <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{fontSize:11,padding:'4px 7px',borderRadius:6,border:'1px solid #c5d5f5',background:'#fff',color:'#111827'}}/>
                  </div>
                )}
              </div>

              {/* Summary cards */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:16}}>
                {[
                  {l:`Este mes (${now.toLocaleString('es-CL',{month:'short'})})`, v: ranked.reduce((s,ag)=>s+ag.ufMonth,0), col:'#14532d', bg:'#DCFCE7'},
                  {l:`${qName} ${now.getFullYear()}`,                             v: ranked.reduce((s,ag)=>s+ag.ufQ,0),     col:'#92400e', bg:'#FFFBEB'},
                  {l:`Año ${now.getFullYear()}`,                                   v: ranked.reduce((s,ag)=>s+ag.ufYear,0),  col:B.primary, bg:B.light},
                ].map((k,i)=>(
                  <div key={i} style={{background:k.bg,borderRadius:10,padding:'10px 14px',border:'1px solid '+k.col+'33'}}>
                    <div style={{fontSize:11,color:k.col,fontWeight:600,marginBottom:3}}>{k.l}</div>
                    <div style={{fontSize:18,fontWeight:800,color:k.col}}>UF {k.v.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                  </div>
                ))}
              </div>

              {/* Ranking list */}
              {ranked.length === 0 && <p style={{fontSize:13,color:'#9ca3af'}}>Sin asesores registrados aún.</p>}
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {ranked.map((ag, idx) => {
                  const pos = idx+1
                  const medal = medals[idx]||null
                  const isTop3 = idx < 3
                  return (
                    <div key={ag.id} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 18px',background:isTop3?'#fff':'#f9fbff',border:isTop3?`2px solid ${B.border}`:'1px solid #dce8ff',borderRadius:12,boxShadow:isTop3?'0 2px 12px rgba(27,79,200,0.08)':'none'}}>
                      <div style={{minWidth:52,textAlign:'center',flexShrink:0}}>
                        {medal ? <div style={{fontSize:32,lineHeight:1}}>{medal}</div> : <div style={{fontSize:18,fontWeight:800,color:'#9ca3af'}}>#{pos}</div>}
                        <div style={{fontSize:10,color:'#9ca3af',marginTop:2}}>{pos}/{ranked.length}</div>
                      </div>
                      <AV name={ag.name} size={44}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:15,fontWeight:700,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ag.name}</div>
                        <div style={{fontSize:11,color:'#6b7280',marginTop:2,display:'flex',gap:10,flexWrap:'wrap'}}>
                          <span>{ag.leadsCount} leads</span>
                          <span>{ag.propCount} propiedades</span>
                          <span style={{color:'#166534',fontWeight:600}}>Mes: UF {ag.ufMonth.toLocaleString('es-CL',{minimumFractionDigits:0,maximumFractionDigits:0})}</span>
                          <span style={{color:'#92400e',fontWeight:600}}>{qName}: UF {ag.ufQ.toLocaleString('es-CL',{minimumFractionDigits:0,maximumFractionDigits:0})}</span>
                        </div>
                        {ranked[0]?.totalUF > 0 && (
                          <div style={{marginTop:6}}>
                            <div style={{height:7,background:'#f0f4ff',borderRadius:99,overflow:'hidden'}}>
                              <div style={{height:'100%',width:(ag.totalUF/ranked[0].totalUF*100)+'%',background:isTop3?B.primary:'#93c5fd',borderRadius:99,transition:'width .5s ease'}}/>
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        <div style={{fontSize:11,color:'#9ca3af',marginBottom:2}}>Período seleccionado</div>
                        <div style={{fontSize:22,fontWeight:800,color:isTop3?B.primary:'#374151'}}>
                          {ag.totalUF > 0 ? 'UF '+ag.totalUF.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}
                        </div>
                        {ag.totalUSD > 0 && <div style={{fontSize:12,color:'#166534',fontWeight:600}}>+ USD {ag.totalUSD.toLocaleString('es-CL')}</div>}
                        <div style={{fontSize:11,color:B.mid,marginTop:2}}>Año: UF {ag.ufYear.toLocaleString('es-CL',{minimumFractionDigits:0,maximumFractionDigits:0})}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* COMISIONES — Finanzas */}
        {/* DASHBOARD FINANZAS */}
        {(nav==='dashboard_finanzas'||nav==='finanzas') && (isAdmin||isFinanzas) && (() => {
          const closingLeads = leads.filter(l => ['firma','escritura'].includes(l.stage))
          const now = new Date()

          // Helper: get all props with comm data
          const allProps = closingLeads.flatMap((l,li) =>
            (l.propiedades||[]).map((p,pi) => {
              const key = l.id+'-'+(p.id||'idx'+pi)
              const comm = commissions[key] || {pctComision:'',pctBroker:'',cobrado:false,notasInmob:''}
              const base = parseFloat(p.bono_pie ? p.precio_sin_bono : p.precio)||0
              const ufVal = (() => {
                if (!l.stage_moved_at) return null
                const k = new Date(l.stage_moved_at).toISOString().slice(0,10)
                return ufHistory[k] || null
              })()
              const dolarVal = indicators.dolar ? parseFloat(indicators.dolar.split('.').join('').replace(',','.')) : null
              const ufHoyVal = indicators.uf ? parseFloat(indicators.uf.split('.').join('').replace(',','.')) : null
              const ufRef = ufVal || ufHoyVal
              const pctC = parseFloat(comm.pctComision)||0
              const pctB = parseFloat(comm.pctBroker)||0
              const comisTotal = base * pctC / 100
              const pagoAsesor = comisTotal * pctB / 100
              const margen = comisTotal - pagoAsesor
              let clp = null
              if (p.moneda==='UF' && ufRef) clp = Math.round(pagoAsesor * ufRef)
              else if (p.moneda==='USD' && dolarVal) clp = Math.round(pagoAsesor * dolarVal)
              // Payment date
              const fp = l.stage_moved_at ? new Date(l.stage_moved_at) : null
              const fe = p.fecha_escritura ? new Date(p.fecha_escritura) : null
              let fechaPago = null
              if (fp) {
                const base2 = (p.tipo_entrega==='Futura') ? new Date(fp) : (fe ? new Date(fe) : new Date(fp))
                base2.setDate(base2.getDate()+45)
                fechaPago = base2
              }
              const isVencido = fechaPago && fechaPago <= now && (p.oc_estado||'pendiente_oc') === 'pendiente_oc'
              const isProximo = fechaPago && !comm.cobrado && fechaPago > now && (fechaPago - now) < 30*24*60*60*1000
              const ag = (users||[]).find(u=>u.id===l.assigned_to)
              return {
                ...p, key, comm, base, ufRef, clp, comisTotal, pagoAsesor, margen,
                fechaPago, isVencido, isProximo,
                leadNombre: l.nombre, stage: l.stage, agName: ag?.name||'—',
                inmob: p.inmobiliaria||'—'
              }
            })
          )

          // KPIs
          const totalComisUF   = allProps.filter(p=>p.moneda==='UF'&&p.comisTotal>0).reduce((s,p)=>s+p.comisTotal,0)
          const totalBrokerUF  = allProps.filter(p=>p.moneda==='UF'&&p.pagoAsesor>0).reduce((s,p)=>s+p.pagoAsesor,0)
          const margenTotalUF  = allProps.filter(p=>p.moneda==='UF'&&p.margen>0).reduce((s,p)=>s+p.margen,0)
          const cobradoUF      = allProps.filter(p=>p.moneda==='UF'&&p.comm.cobrado&&p.comisTotal>0).reduce((s,p)=>s+p.comisTotal,0)
          const pendienteUF    = totalComisUF - cobradoUF
          const vencidoUF      = allProps.filter(p=>p.moneda==='UF'&&p.isVencido&&p.comisTotal>0).reduce((s,p)=>s+p.comisTotal,0)
          const proximoUF      = allProps.filter(p=>p.moneda==='UF'&&p.isProximo&&p.comisTotal>0).reduce((s,p)=>s+p.comisTotal,0)
          const totalComisUSD  = allProps.filter(p=>p.moneda==='USD'&&p.comisTotal>0).reduce((s,p)=>s+p.comisTotal,0)
          const cobradoUSD     = allProps.filter(p=>p.moneda==='USD'&&p.comm.cobrado&&p.comisTotal>0).reduce((s,p)=>s+p.comisTotal,0)

          // Monthly flow (next 12 months)
          const monthlyFlow = {}
          allProps.filter(p=>p.fechaPago&&!p.comm.cobrado&&p.comisTotal>0).forEach(p => {
            const mk = p.fechaPago.getFullYear()+'-'+String(p.fechaPago.getMonth()+1).padStart(2,'0')
            if (!monthlyFlow[mk]) monthlyFlow[mk] = {uf:0,usd:0,count:0,vencido:false}
            if (p.moneda==='UF') monthlyFlow[mk].uf += p.comisTotal
            else if (p.moneda==='USD') monthlyFlow[mk].usd += p.comisTotal
            monthlyFlow[mk].count++
            if (p.isVencido) monthlyFlow[mk].vencido = true
          })
          const sortedMonths = Object.entries(monthlyFlow).sort((a,b)=>a[0].localeCompare(b[0])).slice(0,8)
          const maxUF = Math.max(...sortedMonths.map(([,v])=>v.uf), 1)

          // By inmobiliaria
          const byInmob = {}
          allProps.filter(p=>p.comisTotal>0).forEach(p => {
            if (!byInmob[p.inmob]) byInmob[p.inmob] = {total:0,cobrado:0,pendiente:0,vencido:0,count:0}
            byInmob[p.inmob].total += p.moneda==='UF'?p.comisTotal:0
            byInmob[p.inmob].count++
            if (p.comm.cobrado) byInmob[p.inmob].cobrado += p.moneda==='UF'?p.comisTotal:0
            else byInmob[p.inmob].pendiente += p.moneda==='UF'?p.comisTotal:0
            if (p.isVencido) byInmob[p.inmob].vencido += p.moneda==='UF'?p.comisTotal:0
          })

          // By broker (what we owe them)
          const byBroker = {}
          allProps.filter(p=>p.pagoAsesor>0).forEach(p => {
            if (!byBroker[p.agName]) byBroker[p.agName] = {total:0,cobrado:0,pendiente:0}
            if (p.moneda==='UF') {
              byBroker[p.agName].total += p.pagoAsesor
              if (p.comm.cobrado) byBroker[p.agName].cobrado += p.pagoAsesor
              else byBroker[p.agName].pendiente += p.pagoAsesor
            }
          })

          const fmt2 = n => n.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})
          const fmt0 = n => n.toLocaleString('es-CL',{minimumFractionDigits:0,maximumFractionDigits:0})
          const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

          return (
            <div>
              {/* Header */}
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,paddingBottom:12,borderBottom:'2px solid #E8EFFE'}}>
                <div style={{fontSize:28}}>📊</div>
                <div>
                  <div style={{fontSize:16,fontWeight:800,color:B.primary}}>Dashboard Finanzas</div>
                  <div style={{fontSize:12,color:B.mid}}>Control de comisiones, cobros y flujo de pagos</div>
                </div>
              </div>

              {/* KPI Row */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10,marginBottom:20}}>
                {[
                  {l:'Comisiones total (UF)',  v:'UF '+fmt2(totalComisUF),  bg:B.light,     col:B.primary},
                  {l:'✅ Cobrado',             v:'UF '+fmt2(cobradoUF),     bg:'#DCFCE7',   col:'#14532d'},
                  {l:'⏳ Pendiente',           v:'UF '+fmt2(pendienteUF),   bg:'#FFFBEB',   col:'#92400e'},
                  {l:'⚠️ Vencido',             v:'UF '+fmt2(vencidoUF),     bg: vencidoUF>0?'#FEF2F2':'#F9FAFB', col:vencidoUF>0?'#991b1b':'#374151'},
                  {l:'⏰ Próx. 30 días',       v:'UF '+fmt2(proximoUF),     bg:'#F5F3FF',   col:'#5b21b6'},
                  {l:'Margen Rabbitts (UF)',   v:'UF '+fmt2(margenTotalUF), bg:'#E8EFFE',   col:B.primary},
                  {l:'Total pago brokers (UF)',v:'UF '+fmt2(totalBrokerUF), bg:'#F0FDF4',   col:'#166534'},
                  ...(totalComisUSD>0?[{l:'Comisiones (USD)',v:'USD '+fmt2(totalComisUSD),bg:'#F0FDF4',col:'#166534'}]:[]),
                ].map((k,i) => (
                  <div key={i} style={{background:k.bg,borderRadius:10,padding:'10px 14px',border:'1px solid '+k.col+'33'}}>
                    <div style={{fontSize:11,color:k.col,fontWeight:600,marginBottom:4,opacity:.8}}>{k.l}</div>
                    <div style={{fontSize:15,fontWeight:800,color:k.col,lineHeight:1.2}}>{k.v}</div>
                  </div>
                ))}
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>

                {/* Monthly flow */}
                <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Flujo de cobros pendientes por mes</p>
                  {sortedMonths.length === 0
                    ? <p style={{fontSize:12,color:'#9ca3af'}}>Sin cobros pendientes</p>
                    : sortedMonths.map(([mk, v]) => {
                        const [year, month] = mk.split('-')
                        const label = monthNames[parseInt(month)-1]+' '+year
                        const pct = Math.round((v.uf/maxUF)*100)
                        const isPast = new Date(mk+'-01') < now
                        return (
                          <div key={mk} style={{marginBottom:10}}>
                            <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                              <span style={{fontSize:12,fontWeight:600,color:isPast?'#991b1b':'#374151'}}>{isPast?'⚠ ':''}{label}</span>
                              <div style={{textAlign:'right'}}>
                                <span style={{fontSize:12,fontWeight:700,color:B.primary}}>UF {fmt2(v.uf)}</span>
                                {v.usd>0&&<span style={{fontSize:11,color:'#166634',marginLeft:6}}>+ USD {fmt0(v.usd)}</span>}
                                <span style={{fontSize:10,color:'#9ca3af',marginLeft:6}}>{v.count} ops</span>
                              </div>
                            </div>
                            <div style={{height:8,background:'#f0f4ff',borderRadius:99,overflow:'hidden'}}>
                              <div style={{height:'100%',width:pct+'%',background:isPast?'#ef4444':B.primary,borderRadius:99}}/>
                            </div>
                          </div>
                        )
                      })
                  }
                </div>

                {/* By inmobiliaria */}
                <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Estado cobros por inmobiliaria</p>
                  {Object.entries(byInmob).sort((a,b)=>b[1].pendiente-a[1].pendiente).map(([inmob, d]) => (
                    <div key={inmob} style={{marginBottom:12,paddingBottom:12,borderBottom:'1px solid #f0f4ff'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                        <span style={{fontWeight:700,fontSize:13,color:'#111827'}}>{inmob}</span>
                        {d.vencido>0&&<span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:'#FEF2F2',color:'#991b1b',fontWeight:600}}>⚠ UF {fmt2(d.vencido)} vencido</span>}
                      </div>
                      <div style={{display:'flex',gap:12,fontSize:11}}>
                        <span style={{color:'#6b7280'}}>Total: UF {fmt2(d.total)}</span>
                        <span style={{color:'#166534',fontWeight:600}}>✅ UF {fmt2(d.cobrado)}</span>
                        <span style={{color:'#92400e',fontWeight:600}}>⏳ UF {fmt2(d.pendiente)}</span>
                      </div>
                      {d.total > 0 && (
                        <div style={{height:5,background:'#f0f4ff',borderRadius:99,marginTop:5,overflow:'hidden'}}>
                          <div style={{height:'100%',width:(d.cobrado/d.total*100)+'%',background:'#22c55e',borderRadius:99}}/>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>

                {/* By broker - what we owe */}
                <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Pago pendiente a brokers</p>
                  {Object.entries(byBroker).sort((a,b)=>b[1].pendiente-a[1].pendiente).map(([agName, d]) => (
                    <div key={agName} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,paddingBottom:10,borderBottom:'1px solid #f0f4ff'}}>
                      <AV name={agName} size={32}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:'#111827'}}>{agName}</div>
                        <div style={{fontSize:11,color:'#6b7280'}}>Total: UF {fmt2(d.total)} · Cobrado: UF {fmt2(d.cobrado)}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontSize:14,fontWeight:700,color:d.pendiente>0?'#9a3412':'#166534'}}>
                          {d.pendiente>0?'⏳ UF '+fmt2(d.pendiente):'✅ Al día'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Vencidos alert */}
                <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>
                    Cobros vencidos {allProps.filter(p=>p.isVencido).length>0&&<span style={{fontSize:11,padding:'2px 8px',borderRadius:99,background:'#FEF2F2',color:'#991b1b',fontWeight:600,marginLeft:4}}>⚠ {allProps.filter(p=>p.isVencido).length} pagos</span>}
                  </p>
                  {allProps.filter(p=>p.isVencido).length===0
                    ? <p style={{fontSize:12,color:'#9ca3af'}}>✅ Sin cobros vencidos. Todo al día.</p>
                    : allProps.filter(p=>p.isVencido).sort((a,b)=>a.fechaPago-b.fechaPago).map((p,i) => (
                        <div key={p.key} style={{background:'#FEF2F2',border:'1px solid #fca5a5',borderRadius:8,padding:'8px 12px',marginBottom:6}}>
                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                            <div>
                              <div style={{fontSize:12,fontWeight:700,color:'#991b1b'}}>{p.inmob} — {p.base>0?p.moneda+' '+fmt2(p.comisTotal):''}</div>
                              <div style={{fontSize:11,color:'#9ca3af'}}>{p.leadNombre} · {p.agName}</div>
                            </div>
                            <div style={{textAlign:'right',flexShrink:0}}>
                              <div style={{fontSize:11,color:'#991b1b',fontWeight:600}}>
                                Venció: {p.fechaPago.toLocaleDateString('es-CL',{day:'2-digit',month:'short',year:'numeric'})}
                              </div>
                              <div style={{fontSize:10,color:'#9ca3af'}}>
                                {Math.floor((now-p.fechaPago)/(86400000))} días de retraso
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                  }
                </div>
              </div>
            </div>
          )
        })()}

        {(nav==='comisiones'||nav==='finanzas') && (isAdmin||isFinanzas) && (
          <ComisionesView
            leads={leads}
            users={users}
            stages={stages}
            indicators={indicators}
            commissions={commissions}
            setCommissions={setCommissions}
            saveCommission={saveCommission}
            savePropField={savePropField}
            ufHistory={ufHistory}
          />
        )}

        {/* MIS COMISIONES — Agente */}
        {nav==='mis comisiones' && isAgent && (
          <AgentComisionesView
            leads={leads.filter(l=>l.assigned_to===me.id)}
            me={me}
            users={users}
            stages={stages}
            indicators={indicators}
            commissions={commissions}
            ufHistory={ufHistory}
          />
        )}

        {/* EXTRAER */}
        {nav==='extraer' && isAdmin && (
          <div style={{maxWidth:560}}>
            <p style={{margin:'0 0 4px',fontSize:14,fontWeight:700,color:B.primary}}>Extraer lead calificado desde WhatsApp</p>
            <p style={{margin:'0 0 12px',fontSize:12,color:B.mid}}>Solo pasan al CRM los clientes que califican por renta.</p>
            {/* API key is server-side — no warning needed */}
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
            {(()=>{const st=stages.find(x=>x.id===sel.stage)||stages[0];return<span style={{fontSize:11,padding:'3px 10px',borderRadius:99,background:st.bg,color:st.col,fontWeight:600}}>{st.label}</span>})()}
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
                {(sel.stage_history||[]).map((h,i)=>{const st=stages.find(x=>x.id===h.stage)||stages[0];return<div key={i} style={{fontSize:11,padding:'3px 8px',borderRadius:8,background:st.bg,color:st.col}}>{st.label} <span style={{opacity:.65}}>{fmt(h.date)}</span></div>})}
              </div>
            </div>
          )}
          {!isPartner && <>
            <div style={{marginBottom:6,fontSize:12,color:B.mid,fontWeight:600}}>Mover a etapa</div>
            <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:14}}>
              {(isOps ? stages.filter(s=>OPS_STAGES.includes(s.id)) : stages).map(st=>{
              const isLocked = isAgent && OPS_LOCKED_STAGES.includes(st.id)
              return <button key={st.id} onClick={()=>!isLocked&&reqMove(sel.id,st.id)} style={{fontSize:11,padding:'4px 10px',borderRadius:99,border:sel.stage===st.id?'2px solid '+st.dot:'1px solid #dce8ff',background:sel.stage===st.id?st.bg:'transparent',color:sel.stage===st.id?st.col:isLocked?'#d1d5db':B.mid,cursor:isLocked?'not-allowed':'pointer',fontWeight:sel.stage===st.id?700:400,opacity:isLocked?0.5:1}}>{st.label}{isLocked?' 🔒':''}</button>
            })}
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
            {!isPartner && (
              <div style={{display:'flex',gap:8,marginBottom:14}}>
                <button onClick={()=>setEditLead({nombre:sel.nombre,telefono:sel.telefono,email:sel.email,renta:sel.renta,resumen:sel.resumen})} style={{...sty.btnO,flex:1}}>Editar datos</button>
                {isAdmin && <button onClick={()=>deleteLead(sel.id)} style={{...sty.btnD,flex:1}}>Eliminar lead</button>}
              </div>
            )}
          </>}
          {isPartner && <div style={{padding:'10px 12px',background:B.light,borderRadius:8,fontSize:12,color:B.primary,marginBottom:12}}>Vista de solo lectura — socio comercial</div>}

          {/* Properties section — visible to all, editable by admin/ops */}
          {(sel.propiedades||[]).length > 0 && (
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:B.primary,marginBottom:8}}>Propiedades registradas ({(sel.propiedades||[]).length})</div>
              {(sel.propiedades||[]).map((p,i) => (
                <div key={p.id||i} style={{background:'#FFFBEB',border:'1px solid #fcd34d',borderRadius:8,padding:'8px 12px',marginBottom:6,fontSize:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                    <div style={{fontWeight:700,color:'#713f12',marginBottom:3}}>{i+1}. {p.inmobiliaria} — {p.proyecto}{p.depto?' · Depto '+p.depto:''}</div>
                    {(isAdmin||isOps) && <button onClick={e=>{e.stopPropagation();const newProps=(sel.propiedades||[]).filter((_,pi)=>pi!==i);savePropiedades(sel.id,newProps,null)}} style={{fontSize:10,padding:'2px 7px',borderRadius:5,border:'1px solid #fca5a5',background:'#FEF2F2',color:'#991b1b',cursor:'pointer',flexShrink:0,marginLeft:8}}>Eliminar</button>}
                  </div>
                  <div style={{display:'flex',gap:12,flexWrap:'wrap',color:'#92400e'}}>
                    <span>Precio: <strong>{p.moneda} {p.precio}</strong></span>
                    {p.bono_pie && <span>Con bono pie {p.bono_pct}%: <strong>{p.moneda} {p.precio_sin_bono}</strong></span>}
                  </div>
                </div>
              ))}
              <div style={{display:'flex',gap:16,marginTop:4,flexWrap:'wrap'}}>
                {(()=>{
                  const totalUF = (sel.propiedades||[]).filter(p=>p.moneda==='UF').reduce((s,p)=>s+(parseFloat(p.bono_pie?p.precio_sin_bono:p.precio)||0),0)
                  const totalUSD = (sel.propiedades||[]).filter(p=>p.moneda==='USD').reduce((s,p)=>s+(parseFloat(p.bono_pie?p.precio_sin_bono:p.precio)||0),0)
                  return <>
                    {totalUF>0 && <span style={{fontSize:11,color:'#92400e',fontWeight:700}}>Total UF: {totalUF.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>}
                    {totalUSD>0 && <span style={{fontSize:11,color:'#166534',fontWeight:700}}>Total USD: {totalUSD.toLocaleString('es-CL',{minimumFractionDigits:0,maximumFractionDigits:0})}</span>}
                  </>
                })()}
              </div>
            </div>
          )}
          {(isAdmin||isOps) && (RESTRICTED_STAGES.includes(sel.stage)||(sel.propiedades||[]).length>0) && (
            <button onClick={()=>{setEditingProps((sel.propiedades||[]).length>0?[...sel.propiedades]:[{...EMPTY_PROP,id:'p-'+Date.now()}]);setPendingStage(null);setPropModal(sel.id)}} style={{...sty.btnO,fontSize:12,marginBottom:12,width:'100%'}}>
              {(sel.propiedades||[]).length>0 ? 'Editar propiedades ('+sel.propiedades.length+')' : '+ Agregar propiedades'}
            </button>
          )}
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


      {/* PROPIEDADES MODAL */}
      {propModal && (
        <Modal title="Propiedades del cliente" onClose={()=>{setPropModal(null);setPendingStage(null);setEditingProps([])}} wide>
          <p style={{margin:'0 0 12px',fontSize:12,color:B.mid}}>
            Registra hasta 15 propiedades. {pendingStage ? 'Al guardar, el lead pasará a '+stages.find(s=>s.id===pendingStage.stageId)?.label+'.' : ''}
          </p>

          {editingProps.map((p, idx) => {
            const calculated = p.bono_pie ? Math.round((parseFloat(p.precio)||0) * (1 - (parseFloat(p.bono_pct)||0)/100) * 100)/100 : (parseFloat(p.precio)||0)
            return (
              <div key={p.id||idx} style={{background:'#FFFBEB',border:'1px solid #fcd34d',borderRadius:10,padding:'12px 14px',marginBottom:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <span style={{fontSize:13,fontWeight:700,color:'#713f12'}}>Propiedad {idx+1}</span>
                  {editingProps.length > 1 && <button onClick={()=>setEditingProps(prev=>prev.filter((_,i)=>i!==idx))} style={{fontSize:11,padding:'2px 8px',borderRadius:6,border:'1px solid #fca5a5',background:'#FEF2F2',color:'#991b1b',cursor:'pointer'}}>Eliminar</button>}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                  <Fld label="Inmobiliaria *">
                    <input value={p.inmobiliaria} onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,inmobiliaria:e.target.value}:x))} placeholder="Nombre inmobiliaria" style={sty.inp}/>
                  </Fld>
                  <Fld label="Proyecto *">
                    <input value={p.proyecto} onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,proyecto:e.target.value}:x))} placeholder="Nombre proyecto" style={sty.inp}/>
                  </Fld>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                  <Fld label="N° Depto / Unidad">
                    <input value={p.depto||''} onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,depto:e.target.value}:x))} placeholder="Ej: 502, Casa 3, Lote 12" style={sty.inp}/>
                  </Fld>
                  <Fld label="Tipo de entrega">
                    <select value={p.tipo_entrega||'Inmediata'} onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,tipo_entrega:e.target.value}:x))} style={sty.sel}>
                      <option value="Inmediata">Entrega Inmediata</option>
                      <option value="Futura">Entrega Futura</option>
                    </select>
                  </Fld>
                </div>
                <div style={{marginBottom:8}}>
                  <Fld label="Fecha escritura (opcional)">
                    <input type="date" value={p.fecha_escritura||''} onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,fecha_escritura:e.target.value}:x))} style={sty.inp}/>
                  </Fld>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                  <Fld label="Moneda">
                    <select value={p.moneda} onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,moneda:e.target.value}:x))} style={sty.sel}>
                      <option value="UF">UF</option>
                      <option value="USD">USD</option>
                    </select>
                  </Fld>
                  <Fld label={'Precio en '+p.moneda+' *'}>
                    <input type="number" value={p.precio} onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,precio:e.target.value}:x))} placeholder="0" style={sty.inp}/>
                  </Fld>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:p.bono_pie?8:0}}>
                  <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:13,color:'#713f12',fontWeight:500}}>
                    <input type="checkbox" checked={p.bono_pie} onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,bono_pie:e.target.checked}:x))} style={{width:16,height:16}}/>
                    Con bono pie
                  </label>
                </div>
                {p.bono_pie && (
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
                    <Fld label="Porcentaje bono pie (1-20%)">
                      <input type="number" min="1" max="20" value={p.bono_pct} onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,bono_pct:Math.min(20,Math.max(1,parseInt(e.target.value)||1))}:x))} style={sty.inp}/>
                    </Fld>
                    <Fld label={'Precio sin bono pie ('+p.moneda+')'}>
                      <div style={{...sty.inp,background:'#f0f4ff',color:B.primary,fontWeight:700,display:'flex',alignItems:'center'}}>
                        {calculated.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})}
                      </div>
                    </Fld>
                  </div>
                )}
              </div>
            )
          })}

          {editingProps.length < 15 && (
            <button onClick={()=>setEditingProps(prev=>[...prev,{...EMPTY_PROP,id:'p-'+Date.now()}])} style={{...sty.btnO,width:'100%',marginBottom:12,fontSize:12}}>
              + Agregar propiedad ({editingProps.length}/15)
            </button>
          )}

          <div style={{display:'flex',gap:8}}>
            <button
              onClick={()=>savePropiedades(propModal, editingProps, pendingStage?.stageId||null)}
              disabled={editingProps.some(p=>!p.inmobiliaria||!p.proyecto||!p.precio)}
              style={{...sty.btnP,flex:1,opacity:editingProps.some(p=>!p.inmobiliaria||!p.proyecto||!p.precio)?0.5:1}}
            >{pendingStage ? 'Guardar y mover a '+stages.find(s=>s.id===pendingStage?.stageId)?.label : 'Guardar propiedades'}</button>
            <button onClick={()=>{setPropModal(null);setPendingStage(null);setEditingProps([])}} style={{...sty.btn,flex:1}}>Cancelar</button>
          </div>
        </Modal>
      )}


      {/* EDITAR LEAD */}
      {editLead && sel && (
        <Modal title={'Editar — '+sel.nombre} onClose={()=>setEditLead(null)} wide>
          <Fld label="Nombre completo *">
            <input value={editLead.nombre} onChange={e=>setEditLead(p=>({...p,nombre:e.target.value}))} style={sty.inp} placeholder="Nombre completo"/>
          </Fld>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <Fld label="Teléfono">
              <input value={editLead.telefono} onChange={e=>setEditLead(p=>({...p,telefono:e.target.value}))} style={sty.inp} placeholder="+56 9 ..."/>
            </Fld>
            <Fld label="Email">
              <input value={editLead.email} onChange={e=>setEditLead(p=>({...p,email:e.target.value}))} style={sty.inp} placeholder="email@dominio.com"/>
            </Fld>
          </div>
          <Fld label="Renta / Presupuesto">
            <input value={editLead.renta} onChange={e=>setEditLead(p=>({...p,renta:e.target.value}))} style={sty.inp} placeholder="$1.500.000 CLP"/>
          </Fld>
          <Fld label="Resumen">
            <textarea value={editLead.resumen} onChange={e=>setEditLead(p=>({...p,resumen:e.target.value}))} style={{...sty.inp,minHeight:80,resize:'vertical'}} placeholder="Resumen del cliente..."/>
          </Fld>
          <div style={{display:'flex',gap:8,marginTop:4}}>
            <button onClick={()=>updateLeadData(sel.id,editLead)} disabled={!editLead.nombre?.trim()} style={{...sty.btnP,flex:1,opacity:!editLead.nombre?.trim()?0.5:1}}>Guardar cambios</button>
            <button onClick={()=>setEditLead(null)} style={{...sty.btn,flex:1}}>Cancelar</button>
          </div>
        </Modal>
      )}

      {/* EDITAR USUARIO */}
      {editUser && (
        <Modal title={'Editar — '+editUser.name} onClose={()=>setEditUser(null)} wide>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <Fld label="Nombre completo *">
              <input value={editUser.name} onChange={e=>setEditUser(p=>({...p,name:e.target.value}))} style={sty.inp} placeholder="Nombre completo"/>
            </Fld>
            <Fld label="RUT">
              <input value={editUser.rut||''} onChange={e=>setEditUser(p=>({...p,rut:e.target.value}))} style={sty.inp} placeholder="12.345.678-9"/>
            </Fld>
            <Fld label="Teléfono">
              <input value={editUser.phone||''} onChange={e=>setEditUser(p=>({...p,phone:e.target.value}))} style={sty.inp} placeholder="+56 9 ..."/>
            </Fld>
            <Fld label="Email">
              <input value={editUser.email||''} onChange={e=>setEditUser(p=>({...p,email:e.target.value}))} style={sty.inp} placeholder="email@dominio.com"/>
            </Fld>
            <Fld label="Usuario (login)">
              <input value={editUser.username||''} onChange={e=>setEditUser(p=>({...p,username:e.target.value.toLowerCase()}))} style={sty.inp} placeholder="usuario.login"/>
            </Fld>
            <Fld label="Nuevo PIN (dejar vacío para no cambiar)">
              <input type="password" value={editUser._newPin||''} onChange={e=>setEditUser(p=>({...p,_newPin:e.target.value}))} style={sty.inp} placeholder="••••"/>
            </Fld>
          </div>
          <Fld label="Rol">
            <select value={editUser.role} onChange={e=>setEditUser(p=>({...p,role:e.target.value}))} style={sty.sel}>
              <option value="agent">Agente / Vendedor</option>
              <option value="operaciones">Operaciones</option>
              <option value="finanzas">Finanzas</option>
              <option value="partner">Socio Comercial</option>
              <option value="admin">Administrador</option>
            </select>
          </Fld>
          <div style={{display:'flex',gap:8,marginTop:4}}>
            <button
              onClick={()=>{
                const fields = {
                  name:editUser.name, rut:editUser.rut, phone:editUser.phone,
                  email:editUser.email, username:editUser.username, role:editUser.role
                }
                if (editUser._newPin && editUser._newPin.length>=4) fields.pin = editUser._newPin
                updateUserData(editUser.id, fields)
              }}
              disabled={!editUser.name?.trim()}
              style={{...sty.btnP,flex:1,opacity:!editUser.name?.trim()?0.5:1}}
            >Guardar cambios</button>
            <button onClick={()=>setEditUser(null)} style={{...sty.btn,flex:1}}>Cancelar</button>
          </div>
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
              <option value="operaciones">Operaciones</option>
              <option value="finanzas">Finanzas</option>
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

// ─── Comisiones View ─────────────────────────────────────────────────────────
const OC_ESTADOS = [
  {id:'pendiente_oc',      label:'⏳ Esperando OC',         bg:'#FFF7ED', col:'#9a3412'},
  {id:'oc_recibida',       label:'📋 OC Recibida',           bg:'#E8EFFE', col:'#1B4FC8'},
  {id:'factura_rabbitts',  label:'🧾 Facturado a Inmob.',    bg:'#F5F3FF', col:'#5b21b6'},
  {id:'inmob_pago',        label:'💵 Inmob. Pagó',           bg:'#FFFBEB', col:'#92400e'},
  {id:'broker_factura',    label:'📄 Esperando Fact. Broker',bg:'#FEF9C3', col:'#713f12'},
  {id:'pagado_broker',     label:'✅ Broker Pagado',         bg:'#DCFCE7', col:'#14532d'},
]

function ComisionesView({leads, users, stages, indicators, commissions, setCommissions, saveCommission, savePropField, ufHistory}) {
  const closingLeads = (leads||[]).filter(l => ['firma','escritura'].includes(l.stage))
  const [filterAgent, setFilterAgent] = useState('all')
  const [filterInmob, setFilterInmob] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterOC, setFilterOC] = useState('all')
  const [expandedOC, setExpandedOC] = useState({})

  const ufHoy = indicators.uf ? parseFloat(indicators.uf.split('.').join('').replace(',','.')) : null
  const dolarHoy = indicators.dolar ? parseFloat(indicators.dolar.split('.').join('').replace(',','.')) : null

  const getComm = key => commissions[key] || {pctComision:'', pctBroker:'', cobrado:false, notasInmob:''}
  const setComm = (key, field, val) => {
    setCommissions(prev => {
      const updated = {...prev, [key]: {...(prev[key]||{pctComision:'',pctBroker:'',cobrado:false,notasInmob:''}), [field]: val}}
      if (saveCommission) {
        clearTimeout(window['_commTimer_'+key])
        window['_commTimer_'+key] = setTimeout(() => saveCommission(key, updated[key]), 800)
      }
      return updated
    })
  }

  const getUF = lead => {
    if (!lead.stage_moved_at) return ufHoy
    const k = new Date(lead.stage_moved_at).toISOString().slice(0,10)
    return ufHistory[k] || ufHoy
  }

  const calc = (precio, pctC, pctB, moneda, ufVal) => {
    const dolarVal = dolarHoy
    const p = parseFloat(precio)||0
    const comisionTotal = p * (parseFloat(pctC)||0) / 100
    const montoAsesor = comisionTotal * (parseFloat(pctB)||0) / 100
    let pesos = null
    if (moneda==='UF' && ufVal) pesos = Math.round(montoAsesor * ufVal)
    else if (moneda==='USD' && dolarVal) pesos = Math.round(montoAsesor * dolarVal)
    return { comisionTotal, montoAsesor, pesos }
  }

  const calcFechaPago = p => {
    const fp = p._fechaPromesa ? new Date(p._fechaPromesa) : null
    const fe = p.fecha_escritura ? new Date(p.fecha_escritura) : null
    if (!fp) return null
    const base = (p.tipo_entrega==='Futura') ? new Date(fp) : (fe ? new Date(fe) : new Date(fp))
    base.setDate(base.getDate()+45)
    return base
  }

  const allProps = closingLeads.flatMap(l =>
    (l.propiedades||[]).map((p, pi) => ({
      ...p,
      _key: l.id+'-'+(p.id||('idx'+pi)),
      _leadId: l.id,
      _agId: l.assigned_to, _leadNombre: l.nombre, _leadTag: l.tag,
      _stage: l.stage, _ufCierre: getUF(l),
      _fechaCierre: l.stage_moved_at, _fechaPromesa: l.stage_moved_at,
    }))
  )

  const allInmobs = [...new Set(allProps.map(p=>p.inmobiliaria).filter(Boolean))].sort()
  const allAgents = (users||[]).filter(u=>u.role==='agent').filter(ag=>allProps.some(p=>p._agId===ag.id))

  const filtered = allProps.filter(p => {
    if (filterAgent!=='all' && p._agId!==filterAgent) return false
    if (filterInmob!=='all' && p.inmobiliaria!==filterInmob) return false
    const c = getComm(p._key)
    if (filterStatus==='cobrado' && !c.cobrado) return false
    if (filterStatus==='pendiente' && c.cobrado) return false
    if (filterOC!=='all' && (p.oc_estado||'pendiente_oc')!==filterOC) return false
    return true
  })

  const totUF = filtered.filter(p=>p.moneda==='UF').reduce((s,p)=>s+calc(p.bono_pie?p.precio_sin_bono:p.precio,getComm(p._key).pctComision,getComm(p._key).pctBroker,'UF',p._ufCierre).montoAsesor,0)
  const totPesos = filtered.filter(p=>p.moneda==='UF').reduce((s,p)=>s+(calc(p.bono_pie?p.precio_sin_bono:p.precio,getComm(p._key).pctComision,getComm(p._key).pctBroker,'UF',p._ufCierre).pesos||0),0)
  const cobCount = filtered.filter(p=>getComm(p._key).cobrado||(p.oc_estado==='pagado_broker')).length
  const pendCount = filtered.length - cobCount

  if (allProps.length===0) return (
    <div style={{padding:'40px',textAlign:'center',color:'#9ca3af',fontSize:13}}>
      <div style={{fontSize:32,marginBottom:8}}>💰</div>Sin leads en Firma Promesa o Firma Escritura aún.
    </div>
  )

  const byAgent = {}
  filtered.forEach(p => { if(!byAgent[p._agId])byAgent[p._agId]=[]; byAgent[p._agId].push(p) })

  const ocStyle = id => OC_ESTADOS.find(o=>o.id===id)||OC_ESTADOS[0]
  const fmt2 = n => (parseFloat(n)||0).toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,paddingBottom:12,borderBottom:'2px solid #E8EFFE',flexWrap:'wrap'}}>
        <div style={{fontSize:28}}>💰</div>
        <div style={{flex:1}}>
          <div style={{fontSize:16,fontWeight:800,color:B.primary}}>Control de Comisiones</div>
          <div style={{fontSize:12,color:B.mid}}>Firma Promesa · Firma Escritura · UF: {indicators.uf?'$'+indicators.uf:'—'} · USD: {indicators.dolar?'$'+indicators.dolar:'—'}</div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {OC_ESTADOS.map(o => {
            const count = allProps.filter(p=>(p.oc_estado||'pendiente_oc')===o.id).length
            return count>0 ? (
              <div key={o.id} style={{background:o.bg,borderRadius:8,padding:'4px 10px',border:'1px solid '+o.col+'44',textAlign:'center'}}>
                <div style={{fontSize:10,color:o.col,fontWeight:600}}>{o.label}</div>
                <div style={{fontSize:15,fontWeight:800,color:o.col}}>{count}</div>
              </div>
            ) : null
          })}
        </div>
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',padding:'10px 12px',background:'#fff',border:'1px solid #dce8ff',borderRadius:10}}>
        <span style={{fontSize:12,fontWeight:600,color:B.primary,alignSelf:'center'}}>Filtrar:</span>
        <select value={filterAgent} onChange={e=>setFilterAgent(e.target.value)} style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid #dce8ff',background:'#fff',cursor:'pointer'}}>
          <option value="all">Todos los brokers</option>
          {allAgents.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={filterInmob} onChange={e=>setFilterInmob(e.target.value)} style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid #dce8ff',background:'#fff',cursor:'pointer'}}>
          <option value="all">Todas las inmobiliarias</option>
          {allInmobs.map(im=><option key={im} value={im}>{im}</option>)}
        </select>
        <select value={filterOC} onChange={e=>setFilterOC(e.target.value)} style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid #dce8ff',background:'#fff',cursor:'pointer'}}>
          <option value="all">Todos los estados OC</option>
          {OC_ESTADOS.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid #dce8ff',background:'#fff',cursor:'pointer'}}>
          <option value="all">Todos</option>
          <option value="pendiente">⏳ Pago pendiente</option>
          <option value="cobrado">✅ Cobrado</option>
        </select>
        <span style={{fontSize:11,color:'#9ca3af',alignSelf:'center'}}>{filtered.length} propiedades</span>
      </div>

      {/* Broker cards */}
      {Object.entries(byAgent).map(([agId, props]) => {
        const ag = (users||[]).find(u=>u.id===agId)
        if (!ag) return null
        const agTotUF = props.filter(p=>p.moneda==='UF').reduce((s,p)=>s+calc(p.bono_pie?p.precio_sin_bono:p.precio,getComm(p._key).pctComision,getComm(p._key).pctBroker,'UF',p._ufCierre).montoAsesor,0)
        const agTotPesos = props.filter(p=>p.moneda==='UF').reduce((s,p)=>s+(calc(p.bono_pie?p.precio_sin_bono:p.precio,getComm(p._key).pctComision,getComm(p._key).pctBroker,'UF',p._ufCierre).pesos||0),0)
        const agTotUSD = props.filter(p=>p.moneda==='USD').reduce((s,p)=>s+calc(p.bono_pie?p.precio_sin_bono:p.precio,getComm(p._key).pctComision,getComm(p._key).pctBroker,'USD',null).montoAsesor,0)

        return (
          <div key={agId} style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:14,marginBottom:16,overflow:'hidden'}}>
            {/* Broker header */}
            <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:B.light,borderBottom:'1px solid #dce8ff',flexWrap:'wrap'}}>
              <AV name={ag.name} size={40}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:15,color:B.primary}}>{ag.name}</div>
                <div style={{fontSize:12,color:B.mid,display:'flex',gap:8,flexWrap:'wrap',marginTop:2}}>
                  <span>{[...new Set(props.map(p=>p._leadNombre))].length} clientes · {props.length} propiedades</span>
                  {OC_ESTADOS.map(o => {
                    const n = props.filter(p=>(p.oc_estado||'pendiente_oc')===o.id).length
                    return n>0?<span key={o.id} style={{color:o.col,fontWeight:600}}>{o.label.split(' ')[0]} {n}</span>:null
                  })}
                </div>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                {agTotUF>0&&<div style={{fontSize:13,fontWeight:700,color:'#14532d'}}>
                  UF {fmt2(agTotUF)}{agTotPesos>0&&<span style={{fontSize:11,color:'#6b7280',fontWeight:400}}> · ${agTotPesos.toLocaleString('es-CL')}</span>}
                </div>}
                {agTotUSD>0&&<div style={{fontSize:12,fontWeight:700,color:'#166534'}}>USD {fmt2(agTotUSD)}</div>}
              </div>
            </div>

            {/* Properties */}
            <div style={{padding:'0'}}>
              {props.map((p, pi) => {
                const comm = getComm(p._key)
                const base = parseFloat(p.bono_pie?p.precio_sin_bono:p.precio)||0
                const {comisionTotal, montoAsesor, pesos} = calc(base, comm.pctComision, comm.pctBroker, p.moneda, p._ufCierre)
                const stLab = (stages||[]).find(s=>s&&s.id===p._stage)?.label||(p._stage||'—')
                const ocEst = ocStyle(p.oc_estado||'pendiente_oc')
                const isExpanded = expandedOC[p._key]
                const tagC = {pool:['#F5F3FF','#5b21b6'],lead:[B.light,B.primary],referido:['#FFFBEB','#92400e']}
                const [tBg,tCol] = tagC[p._leadTag||'lead']||tagC.lead

                const updateProp = (fields) => {
                  if (savePropField && p.id) savePropField(p._leadId, p.id, fields)
                }

                return (
                  <div key={p._key} style={{borderBottom:pi<props.length-1?'1px solid #f0f4ff':'none'}}>
                    {/* Main row */}
                    <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',flexWrap:'wrap',background:comm.cobrado?'#f0fdf4':'#fff'}}>
                      {/* Property info */}
                      <div style={{minWidth:160,flex:2}}>
                        <div style={{fontWeight:600,fontSize:13,color:'#111827'}}>{p.inmobiliaria} — {p.proyecto}{p.depto?' · '+p.depto:''}</div>
                        <div style={{fontSize:11,color:'#6b7280',marginTop:2}}>
                          <strong>{p._leadNombre}</strong>
                          <span style={{marginLeft:5,padding:'1px 5px',borderRadius:99,background:tBg,color:tCol,fontSize:10,fontWeight:600}}>{p._leadTag}</span>
                          <span style={{marginLeft:5,padding:'1px 5px',borderRadius:99,background:'#FFF7ED',color:'#9a3412',fontSize:10,fontWeight:600}}>{stLab}</span>
                        </div>
                        <div style={{fontSize:12,fontWeight:600,color:'#374151',marginTop:2}}>
                          {p.moneda} {fmt2(base)}{p.bono_pie&&<span style={{fontSize:10,color:'#9ca3af',fontWeight:400}}> (sin bono {p.bono_pct}%)</span>}
                        </div>
                      </div>

                      {/* Commission inputs */}
                      <div style={{display:'flex',gap:4,alignItems:'center',flexShrink:0}}>
                        <input type="number" min="0" max="100" step="0.1" value={comm.pctComision}
                          onChange={e=>setComm(p._key,'pctComision',e.target.value)}
                          placeholder="% c" title="% Comisión inmobiliaria"
                          style={{width:52,fontSize:11,padding:'4px 6px',border:'1px solid #dce8ff',borderRadius:5,background:'#f9fbff'}}/>
                        <span style={{fontSize:10,color:'#9ca3af'}}>/</span>
                        <input type="number" min="0" max="100" step="0.1" value={comm.pctBroker}
                          onChange={e=>setComm(p._key,'pctBroker',e.target.value)}
                          placeholder="% b" title="% Para el broker"
                          style={{width:52,fontSize:11,padding:'4px 6px',border:'1px solid #dce8ff',borderRadius:5,background:'#f9fbff'}}/>
                      </div>

                      {/* Result */}
                      {montoAsesor>0 ? (
                        <div style={{textAlign:'right',flexShrink:0}}>
                          <div style={{fontSize:11,color:'#6b7280'}}>Comis: {p.moneda} {fmt2(comisionTotal)}</div>
                          <div style={{fontSize:14,fontWeight:800,color:'#14532d'}}>{p.moneda} {fmt2(montoAsesor)}</div>
                          {pesos&&<div style={{fontSize:11,fontWeight:600,color:'#166534'}}>${pesos.toLocaleString('es-CL')} CLP</div>}
                          {p._ufCierre&&p.moneda==='UF'&&<div style={{fontSize:10,color:'#9ca3af'}}>UF cierre: {fmt2(p._ufCierre)}</div>}
                        </div>
                      ) : (
                        <div style={{fontSize:11,color:'#9ca3af',flexShrink:0}}>Ingresa %</div>
                      )}

                      {/* OC Status badge + expand */}
                      <div style={{flexShrink:0}}>
                        <button
                          onClick={()=>setExpandedOC(prev=>({...prev,[p._key]:!prev[p._key]}))}
                          style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:8,border:'1px solid '+ocEst.col+'44',background:ocEst.bg,cursor:'pointer',fontWeight:600,fontSize:12,color:ocEst.col}}
                        >
                          {ocEst.label}
                          <span style={{fontSize:10,opacity:.7}}>{isExpanded?'▲':'▼'}</span>
                        </button>
                      </div>

                      {/* Payment cobrado toggle */}
                      <div style={{flexShrink:0}}>
                        <button onClick={()=>setComm(p._key,'cobrado',!comm.cobrado)}
                          style={{fontSize:11,padding:'6px 12px',borderRadius:8,border:'none',cursor:'pointer',fontWeight:700,
                            background:comm.cobrado?'#DCFCE7':'#FFF7ED',color:comm.cobrado?'#14532d':'#9a3412'}}>
                          {comm.cobrado?'✅ Cobrado':'⏳ Pendiente'}
                        </button>
                      </div>
                    </div>

                    {/* Expanded OC tracking panel */}
                    {isExpanded && (
                      <div style={{background:'#fafbff',borderTop:'1px solid #dce8ff',padding:'14px 16px'}}>
                        <div style={{fontSize:12,fontWeight:700,color:B.primary,marginBottom:12}}>📋 Gestión de Orden de Compra y Facturación</div>

                        {/* OC Estado selector */}
                        <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
                          {OC_ESTADOS.map(o => (
                            <button key={o.id}
                              onClick={()=>updateProp({oc_estado:o.id})}
                              style={{fontSize:11,padding:'5px 12px',borderRadius:8,cursor:'pointer',fontWeight:600,
                                border:(p.oc_estado||'pendiente_oc')===o.id?'2px solid '+o.col:'1px solid '+o.col+'44',
                                background:(p.oc_estado||'pendiente_oc')===o.id?o.bg:'transparent',
                                color:o.col}}
                            >{o.label}</button>
                          ))}
                        </div>

                        {/* FASE 1: OC + Factura Rabbitts → Inmobiliaria */}
                        <div style={{fontSize:11,fontWeight:700,color:'#1B4FC8',marginBottom:8,paddingBottom:4,borderBottom:'1px solid #dce8ff'}}>
                          1️⃣ OC y Facturación a Inmobiliaria
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:10,marginBottom:14}}>
                          <Fld label="Solicitud OC enviada a inmob.">
                            <input type="date" value={p.oc_fecha_solicitud||''}
                              onChange={e=>updateProp({oc_fecha_solicitud:e.target.value})}
                              style={sty.inp}/>
                          </Fld>
                          <Fld label="OC recibida de inmob.">
                            <input type="date" value={p.oc_fecha_recepcion||''}
                              onChange={e=>updateProp({oc_fecha_recepcion:e.target.value, oc_estado:'oc_recibida'})}
                              style={sty.inp}/>
                          </Fld>
                          <Fld label="Factura Rabbitts emitida">
                            <input type="date" value={p.factura_fecha||''}
                              onChange={e=>updateProp({factura_fecha:e.target.value, oc_estado:'factura_rabbitts'})}
                              style={sty.inp}/>
                          </Fld>
                          <Fld label="N° Factura Rabbitts">
                            <input value={p.factura_numero||''}
                              onChange={e=>updateProp({factura_numero:e.target.value})}
                              placeholder="Ej: 1234" style={sty.inp}/>
                          </Fld>
                        </div>

                        {/* FASE 2: Cobro de inmobiliaria */}
                        <div style={{fontSize:11,fontWeight:700,color:'#92400e',marginBottom:8,paddingBottom:4,borderBottom:'1px solid #fcd34d'}}>
                          2️⃣ Cobro a Inmobiliaria
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:10,marginBottom:14}}>
                          <Fld label="Fecha pago de inmob. recibido">
                            <input type="date" value={p.inmob_pago_fecha||''}
                              onChange={e=>updateProp({inmob_pago_fecha:e.target.value, oc_estado:'inmob_pago'})}
                              style={sty.inp}/>
                          </Fld>
                          <Fld label="Monto recibido">
                            <input value={p.inmob_monto_recibido||''}
                              onChange={e=>updateProp({inmob_monto_recibido:e.target.value})}
                              placeholder={`${p.moneda} ${(parseFloat(p.bono_pie?p.precio_sin_bono:p.precio)||0).toFixed(2)}`}
                              style={sty.inp}/>
                          </Fld>
                        </div>

                        {/* FASE 3: Pago al broker */}
                        <div style={{fontSize:11,fontWeight:700,color:'#166534',marginBottom:8,paddingBottom:4,borderBottom:'1px solid #86efac'}}>
                          3️⃣ Pago al Broker
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:10,marginBottom:12}}>
                          <Fld label="Factura broker recibida">
                            <input type="date" value={p.broker_factura_fecha||''}
                              onChange={e=>updateProp({broker_factura_fecha:e.target.value, oc_estado:'broker_factura'})}
                              style={sty.inp}/>
                          </Fld>
                          <Fld label="N° Factura del broker">
                            <input value={p.broker_factura_numero||''}
                              onChange={e=>updateProp({broker_factura_numero:e.target.value})}
                              placeholder="Ej: 456" style={sty.inp}/>
                          </Fld>
                          <Fld label="Fecha pago al broker">
                            <input type="date" value={p.broker_pago_fecha||''}
                              onChange={e=>updateProp({broker_pago_fecha:e.target.value, oc_estado:'pagado_broker'})}
                              style={sty.inp}/>
                          </Fld>
                        </div>

                        {/* Timeline visual */}
                        {(p.oc_fecha_solicitud||p.oc_fecha_recepcion||p.factura_fecha||p.inmob_pago_fecha||p.broker_pago_fecha) && (
                          <div style={{marginBottom:12}}>
                            <div style={{fontSize:11,color:B.mid,fontWeight:600,marginBottom:8}}>📅 Línea de tiempo</div>
                            <div style={{display:'flex',alignItems:'center',gap:0,overflowX:'auto',paddingBottom:4}}>
                              {[
                                {label:'Firma',            date:p._fechaPromesa,           dot:'#A8C0F0', fase:''},
                                {label:'Solic. OC',        date:p.oc_fecha_solicitud,      dot:'#fdba74', fase:'1'},
                                {label:'OC Recibida',      date:p.oc_fecha_recepcion,      dot:'#93c5fd', fase:'1'},
                                {label:'Fact. Rabbitts',   date:p.factura_fecha,           dot:'#c4b5fd', fase:'2'},
                                {label:'Inmob. Pagó',      date:p.inmob_pago_fecha,        dot:'#fbbf24', fase:'2'},
                                {label:'Fact. Broker',     date:p.broker_factura_fecha,    dot:'#6ee7b7', fase:'3'},
                                {label:'Broker Pagado',    date:p.broker_pago_fecha,       dot:'#4ade80', fase:'3'},
                              ].filter(s=>s.date).map((step,i,arr)=>(
                                <div key={i} style={{display:'flex',alignItems:'center'}}>
                                  <div style={{textAlign:'center',minWidth:76}}>
                                    <div style={{width:12,height:12,borderRadius:'50%',background:step.dot,margin:'0 auto 3px',border:'2px solid '+step.dot+'88'}}/>
                                    <div style={{fontSize:10,fontWeight:600,color:'#374151',lineHeight:1.2}}>{step.label}</div>
                                    <div style={{fontSize:9,color:'#9ca3af'}}>{new Date(step.date).toLocaleDateString('es-CL',{day:'2-digit',month:'short'})}</div>
                                  </div>
                                  {i<arr.length-1&&<div style={{height:2,width:24,background:'#dce8ff',flexShrink:0}}/>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Notes */}
                        <Fld label="Notas del proceso de cobro">
                          <textarea value={p.oc_notas||''}
                            onChange={e=>updateProp({oc_notas:e.target.value})}
                            placeholder="Ej: La inmobiliaria confirma OC a 10 días post escritura..."
                            style={{...sty.inp,minHeight:52,resize:'vertical'}}/>
                        </Fld>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Agent Comisiones View ───────────────────────────────────────────────────
function AgentComisionesView({leads, me, users, stages, indicators, commissions, ufHistory}) {
  const now = new Date()

  const ufHoy = indicators.uf ? parseFloat(indicators.uf.split('.').join('').replace(',','.')) : null
  const dolarHoy = indicators.dolar ? parseFloat(indicators.dolar.split('.').join('').replace(',','.')) : null

  // All closed leads for this agent
  const closedLeads  = leads.filter(l => ['firma','escritura','ganado'].includes(l.stage))
  const closingLeads = leads.filter(l => ['firma','escritura'].includes(l.stage))

  const getUF = lead => {
    if (!lead.stage_moved_at) return ufHoy
    const k = new Date(lead.stage_moved_at).toISOString().slice(0,10)
    return ufHistory[k] || ufHoy
  }

  // Build all properties with commission data
  const myProps = closingLeads.flatMap((l,li) =>
    (l.propiedades||[]).map((p,pi) => {
      const key = l.id+'-'+(p.id||'idx'+pi)
      const comm = commissions[key] || {}
      const base = parseFloat(p.bono_pie?p.precio_sin_bono:p.precio)||0
      const ufRef = getUF(l)
      const pctC = parseFloat(comm.pctComision)||0
      const pctB = parseFloat(comm.pctBroker)||0
      const comisTotal  = base * pctC / 100
      const miComision  = comisTotal * pctB / 100
      let clp = null
      if (p.moneda==='UF' && ufRef) clp = Math.round(miComision * ufRef)
      else if (p.moneda==='USD' && dolarHoy) clp = Math.round(miComision * dolarHoy)
      const ocEst = p.oc_estado || 'pendiente_oc'
      return {
        ...p, key, comm, base, ufRef, comisTotal, miComision, clp,
        leadNombre: l.nombre, stage: l.stage,
        fechaPromesa: l.stage_moved_at
      }
    })
  )

  // KPIs
  const totalUFVendida = closedLeads.reduce((s,l) =>
    s + (l.propiedades||[]).filter(p=>p.moneda==='UF').reduce((a,p)=>a+(parseFloat(p.bono_pie?p.precio_sin_bono:p.precio)||0),0), 0)

  const totalMiComisionUF = myProps.filter(p=>p.moneda==='UF').reduce((s,p)=>s+p.miComision,0)
  const totalMiComisionUSD = myProps.filter(p=>p.moneda==='USD').reduce((s,p)=>s+p.miComision,0)
  const totalClp = myProps.reduce((s,p)=>s+(p.clp||0),0)

  const isCobrado = p => (p.oc_estado==='pagado_broker') || p.comm.cobrado
  const cobradoUF    = myProps.filter(p=>p.moneda==='UF' &&  isCobrado(p) && p.miComision>0).reduce((s,p)=>s+p.miComision,0)
  const pendienteUF  = myProps.filter(p=>p.moneda==='UF' && !isCobrado(p) && p.miComision>0).reduce((s,p)=>s+p.miComision,0)
  const cobradoUSD   = myProps.filter(p=>p.moneda==='USD'&&  isCobrado(p) && p.miComision>0).reduce((s,p)=>s+p.miComision,0)
  const pendienteUSD = myProps.filter(p=>p.moneda==='USD'&& !isCobrado(p) && p.miComision>0).reduce((s,p)=>s+p.miComision,0)
  // CLP separated by currency to avoid mixing UF and USD under same box
  const cobradoCLP   = myProps.filter(p=>p.moneda==='UF' && isCobrado(p)  && p.clp).reduce((s,p)=>s+(p.clp||0),0)
  const pendienteCLP = myProps.filter(p=>p.moneda==='UF' && !isCobrado(p) && p.clp).reduce((s,p)=>s+(p.clp||0),0)
  const cobradoUSDclp   = myProps.filter(p=>p.moneda==='USD'&&  isCobrado(p) && p.clp).reduce((s,p)=>s+(p.clp||0),0)
  const pendienteUSDclp = myProps.filter(p=>p.moneda==='USD'&& !isCobrado(p) && p.clp).reduce((s,p)=>s+(p.clp||0),0)

  // Ranking vs all agents
  const allAgents = (users||[]).filter(u=>u.role==='agent')
  const rankingStages = ['firma','escritura','ganado']
  const ranked = allAgents.map(ag => {
    const agLeads = (leads.__all || []).filter ? [] : []
    return ag
  })
  // Simple ranking: use commissions keys to find others - just show position from users
  const myRank = null // will compute if we have all leads

  // OC status labels
  const OC_LABEL = {
    pendiente_oc:     {l:'⏳ Esperando OC',        bg:'#FFF7ED',col:'#9a3412'},
    oc_recibida:      {l:'📋 OC Recibida',          bg:'#E8EFFE',col:'#1B4FC8'},
    factura_rabbitts: {l:'🧾 Facturado a Inmob.',   bg:'#F5F3FF',col:'#5b21b6'},
    inmob_pago:       {l:'💵 Inmob. Pagó',           bg:'#FFFBEB',col:'#92400e'},
    broker_factura:   {l:'📄 Enviá tu factura',      bg:'#FEF9C3',col:'#713f12'},
    pagado_broker:    {l:'✅ Pagado',                bg:'#DCFCE7',col:'#14532d'},
  }

  const fmt2 = n => (parseFloat(n)||0).toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})
  const hasComm = myProps.some(p=>p.miComision>0)

  // Monthly earnings (paid)
  const byMonth = {}
  myProps.filter(p=>p.comm.cobrado&&p.miComision>0&&p.comm.pago_fecha).forEach(p => {
    const d = new Date(p.pago_fecha||p.comm.pago_fecha||now)
    const mk = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')
    byMonth[mk] = (byMonth[mk]||0) + (p.moneda==='UF'?p.miComision:0)
  })

  return (
    <div>
      {/* Hero header */}
      <div style={{background:'linear-gradient(135deg,#1B4FC8 0%,#3b82f6 100%)',borderRadius:16,padding:'20px 24px',marginBottom:20,color:'#fff',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',right:-20,top:-20,width:120,height:120,borderRadius:'50%',background:'rgba(255,255,255,0.07)'}}/>
        <div style={{position:'absolute',right:40,bottom:-30,width:80,height:80,borderRadius:'50%',background:'rgba(255,255,255,0.05)'}}/>
        <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:16}}>
          <AV name={me.name} size={52}/>
          <div>
            <div style={{fontSize:20,fontWeight:800}}>{me.name}</div>
            <div style={{fontSize:13,opacity:.8}}>{me.role==='agent'?'Asesor Comercial':me.role} · Rabbitts Capital</div>
          </div>
        </div>
        {/* Hero KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:10}}>
          {[
            {l:'UF total vendida',      v:'UF '+fmt2(totalUFVendida),    sub:closedLeads.length+' cierres'},
            {l:'Mi comisión total',     v:'UF '+fmt2(totalMiComisionUF), sub:totalClp>0?'$'+totalClp.toLocaleString('es-CL')+' CLP':null},
            {l:'✅ Ya cobrado (UF)',    v:'UF '+fmt2(cobradoUF),          sub:cobradoCLP>0?'$'+cobradoCLP.toLocaleString('es-CL')+' CLP':null},
            {l:'⏳ Pendiente (UF)',     v:'UF '+fmt2(pendienteUF),        sub:pendienteCLP>0?'$'+pendienteCLP.toLocaleString('es-CL')+' CLP':null},
            ...(totalMiComisionUSD>0?[
              {l:'✅ Cobrado (USD)',    v:'USD '+fmt2(cobradoUSD),   sub:cobradoUSDclp>0?'$'+cobradoUSDclp.toLocaleString('es-CL')+' CLP':null},
              {l:'⏳ Pendiente (USD)',  v:'USD '+fmt2(pendienteUSD), sub:pendienteUSDclp>0?'$'+pendienteUSDclp.toLocaleString('es-CL')+' CLP':null},
            ]:[]),
          ].map((k,i) => (
            <div key={i} style={{background:'rgba(255,255,255,0.13)',borderRadius:10,padding:'10px 12px',backdropFilter:'blur(4px)'}}>
              <div style={{fontSize:10,opacity:.75,marginBottom:3,fontWeight:600}}>{k.l}</div>
              <div style={{fontSize:15,fontWeight:800,lineHeight:1.2}}>{k.v}</div>
              {k.sub&&<div style={{fontSize:10,opacity:.65,marginTop:2}}>{k.sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Progress bar cobrado vs pendiente */}
      {totalMiComisionUF > 0 && (
        <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,padding:'14px 16px',marginBottom:16}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
            <span style={{fontSize:13,fontWeight:700,color:B.primary}}>Progreso de cobros</span>
            <span style={{fontSize:12,color:'#6b7280'}}>{Math.round(cobradoUF/totalMiComisionUF*100)}% cobrado</span>
          </div>
          <div style={{height:12,background:'#f0f4ff',borderRadius:99,overflow:'hidden',marginBottom:8}}>
            <div style={{height:'100%',width:(cobradoUF/totalMiComisionUF*100)+'%',background:'linear-gradient(90deg,#22c55e,#16a34a)',borderRadius:99,transition:'width .5s ease'}}/>
          </div>
          <div style={{display:'flex',gap:16,fontSize:11,flexWrap:'wrap'}}>
            <span style={{color:'#166534'}}>✅ Cobrado: UF {fmt2(cobradoUF)}{cobradoCLP>0?' ($'+cobradoCLP.toLocaleString('es-CL')+')':''}</span>
            <span style={{color:'#9a3412'}}>⏳ Pendiente: UF {fmt2(pendienteUF)}{pendienteCLP>0?' ($'+pendienteCLP.toLocaleString('es-CL')+')':''}</span>
            {cobradoUSD>0&&<span style={{color:'#166534'}}>✅ USD {fmt2(cobradoUSD)}{cobradoUSDclp>0?' ($'+cobradoUSDclp.toLocaleString('es-CL')+')':''}</span>}
            {pendienteUSD>0&&<span style={{color:'#9a3412'}}>⏳ USD {fmt2(pendienteUSD)}{pendienteUSDclp>0?' ($'+pendienteUSDclp.toLocaleString('es-CL')+')':''}</span>}
          </div>
        </div>
      )}

      {myProps.length === 0 ? (
        <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,padding:'40px',textAlign:'center'}}>
          <div style={{fontSize:40,marginBottom:12}}>🚀</div>
          <div style={{fontSize:15,fontWeight:700,color:B.primary,marginBottom:6}}>¡A cerrar negocios!</div>
          <div style={{fontSize:13,color:'#6b7280'}}>Cuando tengas propiedades en Firma Promesa o Firma Escritura aparecerán aquí con el detalle de tus comisiones.</div>
        </div>
      ) : (
        <div>
          <div style={{fontSize:14,fontWeight:700,color:B.primary,marginBottom:12}}>
            💼 Mis negocios en curso — {myProps.length} {myProps.length===1?'propiedad':'propiedades'}
          </div>
          {myProps.map((p,i) => {
            const ocInfo = OC_LABEL[p.oc_estado||'pendiente_oc']||OC_LABEL.pendiente_oc
            const stLab = (stages||[]).find(s=>s&&s.id===p.stage)?.label||(p.stage||'—')
            const needsBrokerInvoice = p.oc_estado==='broker_factura'

            return (
              <div key={p.key} style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,marginBottom:10,overflow:'hidden'}}>
                <div style={{display:'flex',alignItems:'stretch',gap:0}}>
                  {/* Left accent bar based on OC state */}
                  <div style={{width:5,flexShrink:0,background:ocInfo.col,borderRadius:'12px 0 0 12px'}}/>

                  <div style={{flex:1,padding:'14px 16px'}}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
                      {/* Deal info */}
                      <div style={{flex:1,minWidth:180}}>
                        <div style={{fontWeight:700,fontSize:14,color:'#111827'}}>{p.inmobiliaria} — {p.proyecto}{p.depto?' · '+p.depto:''}</div>
                        <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>
                          <strong>{p.leadNombre}</strong>
                          <span style={{marginLeft:8,padding:'1px 7px',borderRadius:99,background:'#FFF7ED',color:'#9a3412',fontSize:11,fontWeight:600}}>{stLab}</span>
                          {p.tipo_entrega&&<span style={{marginLeft:6,fontSize:11,color:'#9ca3af'}}>{p.tipo_entrega}</span>}
                        </div>
                        <div style={{fontSize:12,fontWeight:600,color:'#374151',marginTop:4}}>
                          {p.moneda} {fmt2(p.base)}
                          {p.bono_pie&&<span style={{fontSize:10,color:'#9ca3af',fontWeight:400}}> (sin bono {p.bono_pct}%)</span>}
                          {p.ufRef&&p.moneda==='UF'&&<span style={{fontSize:10,color:'#9ca3af',marginLeft:6}}>UF: {fmt2(p.ufRef)}</span>}
                        </div>
                      </div>

                      {/* Commission box */}
                      {p.miComision > 0 ? (
                        <div style={{background:'linear-gradient(135deg,#f0fdf4,#dcfce7)',border:'1px solid #86efac',borderRadius:10,padding:'10px 14px',textAlign:'right',flexShrink:0}}>
                          <div style={{fontSize:10,color:'#166534',fontWeight:600,marginBottom:2}}>Mi comisión</div>
                          <div style={{fontSize:20,fontWeight:800,color:'#14532d'}}>{p.moneda} {fmt2(p.miComision)}</div>
                          {p.clp&&<div style={{fontSize:12,fontWeight:700,color:'#166534'}}>${p.clp.toLocaleString('es-CL')} CLP</div>}
                          <div style={{fontSize:10,color:'#9ca3af',marginTop:2}}>
                            {fmt2(parseFloat(p.comm.pctBroker)||0)}% de comis. {fmt2(p.comisTotal)} {p.moneda}
                          </div>
                        </div>
                      ) : (
                        <div style={{background:'#f9fbff',border:'1px solid #dce8ff',borderRadius:10,padding:'10px 14px',textAlign:'center',flexShrink:0}}>
                          <div style={{fontSize:11,color:'#9ca3af'}}>Finanzas está<br/>configurando %</div>
                        </div>
                      )}
                    </div>

                    {/* OC Status + alert if broker needs to invoice */}
                    <div style={{marginTop:10,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                      <span style={{fontSize:11,padding:'4px 12px',borderRadius:99,background:ocInfo.bg,color:ocInfo.col,fontWeight:700,border:'1px solid '+ocInfo.col+'44'}}>
                        {ocInfo.l}
                      </span>

                      {/* Call to action for broker when they need to send invoice */}
                      {needsBrokerInvoice && (
                        <span style={{fontSize:11,padding:'4px 12px',borderRadius:99,background:'#FEF9C3',color:'#713f12',fontWeight:700,border:'1px solid #fcd34d',animation:'pulse 2s infinite'}}>
                          ⚡ La inmobiliaria ya pagó — envía tu factura a Rabbitts para recibir tu pago
                        </span>
                      )}

                      {/* Payment received */}
                      {p.oc_estado==='pagado_broker' && (
                        <span style={{fontSize:11,padding:'4px 12px',borderRadius:99,background:'#DCFCE7',color:'#14532d',fontWeight:700}}>
                          🎉 ¡Pago recibido! {p.broker_pago_fecha?new Date(p.broker_pago_fecha).toLocaleDateString('es-CL',{day:'2-digit',month:'short',year:'numeric'}):''}
                        </span>
                      )}
                    </div>

                    {/* OC timeline mini for agent (read-only) */}
                    {(p.oc_fecha_solicitud||p.oc_fecha_recepcion||p.factura_fecha||p.inmob_pago_fecha||p.broker_pago_fecha) && (
                      <div style={{marginTop:10,display:'flex',alignItems:'center',gap:0,overflowX:'auto',paddingBottom:2}}>
                        {[
                          {l:'Firma',       d:p.fechaPromesa,          c:'#A8C0F0'},
                          {l:'OC',          d:p.oc_fecha_recepcion,    c:'#93c5fd'},
                          {l:'Factura R.',  d:p.factura_fecha,         c:'#c4b5fd'},
                          {l:'Inmob. Pagó', d:p.inmob_pago_fecha,      c:'#fbbf24'},
                          {l:'Tu factura',  d:p.broker_factura_fecha,  c:'#6ee7b7'},
                          {l:'¡Cobrado!',   d:p.broker_pago_fecha,     c:'#4ade80'},
                        ].filter(s=>s.d).map((step,idx,arr)=>(
                          <div key={idx} style={{display:'flex',alignItems:'center'}}>
                            <div style={{textAlign:'center',minWidth:60}}>
                              <div style={{width:10,height:10,borderRadius:'50%',background:step.c,margin:'0 auto 2px',border:'2px solid '+step.c+'88'}}/>
                              <div style={{fontSize:9,fontWeight:600,color:'#374151'}}>{step.l}</div>
                              <div style={{fontSize:8,color:'#9ca3af'}}>{new Date(step.d).toLocaleDateString('es-CL',{day:'2-digit',month:'short'})}</div>
                            </div>
                            {idx<arr.length-1&&<div style={{height:2,width:20,background:'#dce8ff',flexShrink:0}}/>}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Factura broker info (read) */}
                    {p.factura_numero&&<div style={{marginTop:6,fontSize:11,color:'#6b7280'}}>📄 Fact. Rabbitts N° {p.factura_numero}{p.broker_factura_numero?' · Tu factura N° '+p.broker_factura_numero:''}</div>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Monthly earnings if any paid */}
      {Object.keys(byMonth).length > 0 && (
        <div style={{background:'#fff',border:'1px solid #dce8ff',borderRadius:12,padding:'14px 16px',marginTop:16}}>
          <div style={{fontSize:13,fontWeight:700,color:B.primary,marginBottom:10}}>📈 Historial de cobros</div>
          {Object.entries(byMonth).sort((a,b)=>b[0].localeCompare(a[0])).map(([mk,uf])=>{
            const [y,m] = mk.split('-')
            const mNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
            return (
              <div key={mk} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #f0f4ff',fontSize:13}}>
                <span style={{color:'#374151',fontWeight:600}}>{mNames[parseInt(m)-1]} {y}</span>
                <span style={{fontWeight:700,color:'#14532d'}}>UF {fmt2(uf)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────
function KCard({lead, users, isAdmin, isPartner, isOps, onOpen, onMove, stages=[]}) {
  const si = stages.findIndex(x=>x.id===lead.stage)
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
      {!isAdmin&&!isPartner&&(()=>{
        const isOpsLocked = OPS_LOCKED_STAGES.includes(lead.stage)
        if (isOpsLocked && !isOps) {
          return (
            <div style={{display:'flex',alignItems:'center',gap:4,marginTop:8}}>
              <span style={{fontSize:10,color:'#7e22ce',background:'#FDF4FF',padding:'2px 8px',borderRadius:6,border:'1px solid #d8b4fe',fontWeight:600}}>🔒 En gestión de Operaciones</span>
            </div>
          )
        }
        return (
          <div style={{display:'flex',gap:4,marginTop:8}} onClick={e=>e.stopPropagation()}>
            {si>0&&!RESTRICTED_STAGES.includes(stages[si-1]?.id)&&<button onClick={()=>onMove(lead.id,stages[si-1].id)} style={{fontSize:11,padding:'3px 8px',borderRadius:8,border:'1px solid #dce8ff',background:'transparent',cursor:'pointer',color:'#6b7280'}}>← Atrás</button>}
            {si<stages.length-1&&(()=>{
              const nextStage = stages[si+1]
              const isRestricted = RESTRICTED_STAGES.includes(nextStage?.id)
              if (isRestricted && !isOps) return <span style={{fontSize:10,color:'#9ca3af',padding:'3px 6px'}}>🔒 Solo Ops</span>
              return <button onClick={()=>onMove(lead.id,nextStage.id)} style={{fontSize:11,padding:'3px 8px',borderRadius:8,border:`1px solid ${B.border}`,background:'transparent',cursor:'pointer',color:B.primary,fontWeight:600}}>Avanzar →</button>
            })()}
          </div>
        )
      })()}
    </div>
  )
}
