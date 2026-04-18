import React, { useState, useEffect, useRef } from 'react'
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
  primary: '#2563EB', dark: '#1D4ED8', light: '#EFF6FF',
  mid: '#64748B', border: '#E2E8F0', bg: '#F8FAFC',
}

// ─── Data ────────────────────────────────────────────────────────────────────
const DEFAULT_STAGES = [
  { id:'nuevo',      label:'Nuevo lead',          bg:'#F1F5FF', col:'#1B4FC8', dot:'#A8C0F0' },
  { id:'contactado', label:'Contactado',           bg:'#EFF6FF', col:'#1d4ed8', dot:'#93c5fd' },
  { id:'agenda',     label:'Agenda reunión',       bg:'#F5F3FF', col:'#5b21b6', dot:'#c4b5fd' },
  { id:'visita_proyecto', label:'Visita proyecto',   bg:'#FFF0F6', col:'#9d174d', dot:'#f9a8d4' },
  { id:'credito',    label:'Crédito aprobado',     bg:'#FFFBEB', col:'#92400e', dot:'#fcd34d' },
  { id:'reserva',    label:'Reserva',              bg:'#F0FDF4', col:'#166534', dot:'#86efac' },
  { id:'solicitud_promesa', label:'Solicitud de promesa', bg:'#ECFEFF', col:'#155e75', dot:'#22d3ee', restricted:true },
  { id:'firma',      label:'Firma promesa',        bg:'#FFF7ED', col:'#9a3412', dot:'#fdba74',  restricted:true },
  { id:'escritura',  label:'Firma escritura',      bg:'#FEF9C3', col:'#713f12', dot:'#fbbf24',  restricted:true },
  { id:'ganado',     label:'Ganado',               bg:'#DCFCE7', col:'#14532d', dot:'#4ade80' },
  { id:'perdido',    label:'Perdido',              bg:'#FEF2F2', col:'#991b1b', dot:'#fca5a5' },
  { id:'desistio',   label:'Desistió escritura',   bg:'#FDF4FF', col:'#7e22ce', dot:'#d8b4fe', restricted:true },
]

// Stages only Operaciones/Admin can move leads into
const RESTRICTED_STAGES = ['solicitud_promesa','firma','escritura','desistio']
// Stages that lock the lead from agent movement entirely
const OPS_LOCKED_STAGES = ['solicitud_promesa','firma','escritura','ganado','desistio']

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
  broker_pago_fecha:'',      // cuando Rabbitts pagó al broker
  // Operación 360 — post reserva
  negocio_id:'',
  estado_operativo:'handoff_pendiente', // handoff_pendiente | docs_incompletos | en_revision | promesa | credito | escritura | entregado
  estado_financiero:'no_devengado',     // no_devengado | solicitar_oc | oc_recibida | facturado | cobrado_inmob | broker_facturar | broker_pagado
  riesgo_caida:'medio',                 // bajo | medio | alto
  responsable_ops:'',
  fecha_reserva:'', monto_reserva:'', comprobante_reserva:'', ejecutivo_inmobiliaria:'',
  forma_pago_pie:'', condiciones_especiales:'', documentos_cliente:'',
  promesa_enviada:'', promesa_firmada:'', pie_confirmado:'',
  banco_mutuaria:'', ejecutivo_hipotecario:'', preaprobacion:'', aprobacion_final:'', tasacion:'', estudio_titulos:'',
  notaria:'', escritura_firmada:'', inscripcion_cbr:'', entrega_propiedad:'',
  amoblamiento:'', administracion:'', tributacion:'', proxima_inversion:'',
  docs_estado:{},
  docs_promesa:{}, solicitud_promesa_fecha:'',
  operational_log:[]
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

const safeJsonParseUi = (text, fallback=null) => { try { return text ? JSON.parse(text) : fallback } catch(_) { return fallback } }
const stripCodeFenceUi = (text='') => String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
const jsonStringValueFromKeyUi = (text='', key='reply') => {
  const src = String(text || '')
  const rx = new RegExp('"' + key + '"\\s*:\\s*"', 'i')
  const m = rx.exec(src)
  if (!m) return ''
  let i = m.index + m[0].length, out = '', escaped = false
  for (; i < src.length; i++) {
    const ch = src[i]
    if (escaped) { out += '\\' + ch; escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') break
    out += ch
  }
  try { return JSON.parse('"' + out + '"') } catch(_) { return out.replace(/\\n/g, '\n').replace(/\\"/g, '"') }
}
const extractVisibleMessageContent = (text='') => {
  const raw = String(text || '').trim()
  if (!raw) return ''
  const low = raw.toLowerCase()
  if (low.startsWith('[sistema]') || low.includes('rabito no generó respuesta visible') || low.includes('rabito no genero respuesta visible') || low.includes('agent_no_reply')) return ''
  if (raw.startsWith('{')) {
    const parsed = safeJsonParseUi(stripCodeFenceUi(raw))
    if (parsed && typeof parsed === 'object') {
      const inner = parsed.reply || parsed.message || parsed.text || ''
      return extractVisibleMessageContent(typeof inner === 'object' ? (inner.reply || inner.text || inner.message || '') : inner)
    }
    const innerReply = jsonStringValueFromKeyUi(raw, 'reply')
    return innerReply ? String(innerReply).trim() : ''
  }
  return raw
}
const isInternalSystemContent = (text='') => {
  const value = String(text || '').trim().toLowerCase()
  return value.startsWith('[sistema]') ||
    value.includes('rabito no generó respuesta visible') ||
    value.includes('rabito no genero respuesta visible') ||
    value.includes('revisar entrenamiento/conocimiento') ||
    value.includes('no generó respuesta visible') ||
    value.includes('no genero respuesta visible') ||
    value.includes('agent_no_reply') ||
    (String(text || '').trim().startsWith('{') && !extractVisibleMessageContent(text))
}

const cleanVisibleLastMessage = (text='') => extractVisibleMessageContent(text)

// ─── Mini components ─────────────────────────────────────────────────────────
// ─── WhatsApp Link Component ─────────────────────────────────────────────────
const WaLink = ({phone, label=null}) => {
  if (!phone || phone === '—' || phone === '') return <span style={{color:'#9ca3af',fontSize:12}}>{label||'—'}</span>
  const clean = phone.toString().replace(/[^0-9+]/g,'')
  const url = `https://wa.me/${clean.startsWith('+') ? clean.slice(1) : clean}`
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      style={{display:'inline-flex',alignItems:'center',gap:4,textDecoration:'none',color:'#075E54',fontWeight:500,fontSize:12}}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
      {label||phone}
    </a>
  )
}

const AV = ({name, size=32, src=null}) => {
  const [bg, col] = pal(name)
  if (src) return <img src={src} alt={name||''} style={{width:size,height:size,borderRadius:'50%',objectFit:'cover',flexShrink:0}} onError={e=>e.target.style.display='none'}/>
  return <div style={{width:size,height:size,borderRadius:'50%',background:bg,color:col,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:size*.38,flexShrink:0}}>{ini(name)}</div>
}

const LOGO_SRC = 'data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAJYAlgDASIAAhEBAxEB/8QAHQABAAICAwEBAAAAAAAAAAAAAAcIBQYBAgQDCf/EAE4QAAEDAwMCAgcEBwMICQQDAAEAAgMEBREGByESMUFREyIyYXGBkQgUobEVI0JScsHRM2LhJDRDc4KSk/EWFzVTVFWDsvAYJaLCJkRk/8QAGwEBAAIDAQEAAAAAAAAAAAAAAAUGAQMEAgf/xAA1EQACAgEDAgUDAgUEAgMAAAAAAQIDBAURMRIhBhMiQVEUMmFxsSNCgZGhFRYzUtHwJDRD/9oADAMBAAIRAxEAPwC2qIi6zSEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBEXBOO5A+KA5RY+vvVpoH9FZcIIHeTnLCXHX+maN2Pvwn/ANXgrZCmyf2xbPLklyza0UeV+7Gn4WH0DZHu/vAAfmsFPvXTsdhtBE4fxldMdOyZcQZ4d1a9yYEUMO3wj8LdF/vlfJ+9/lQRD/aK2rSct/yHn6mr5JsRQqze9v7VDEf9or7M3wpycOt8Q/2yn+kZf/QfU1fJMiKKqLeS3SuHpqZjQf3XZWdpdz9MzNGZJWH3gf1Wmen5MOYM9K6t8M3hFr9HrLTdSwObdYGE+DncrM01VTVUQlp52SsPYtK5pVzh9y2NiafB90RF4MhERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBEXBQHK4WB1Dq6w2ONxrK2MvAJDGOySfLjson1Vve55fDaYfu7CMdRdl2fMELtxtPyMn/jj2+TVZdCvlk41NTT00bn1E8cbWjJ6nLUb9uRp22ZDJ/vLsfsdgfmq36g17drnI6SerlkPm52VqNfe6iUnqlcfmrDieGJSf8V/2OGzUUvtROeo98anDo6KOKAZ4e3PUtCvm6t7uXE1bI4eHOFF8tQ5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6oqaan/ziphi/jeG/mtZve4GnLX6Rj6v00jP2Wcg/NVnumr7xXH9ZVzSZ/ecSscHXCuOAHuJUnV4d6e90znlnb9oomzUO8biXMtsbImEY9bk/VebSO7FUytDbgHVELuDzyFHmn9B6ju8jPQ0E3o3HHpC0ho+alXSmzjKcNlu1X64IJjj5BHxXrJp0zHrcG93+OTNcr5vck+yXihvFI2popg4EctPBHyS9WS2XiB0VwpGS9Qx1Y9YfApZLNb7PT+goIehviScn6rIqruSjLeB3+3c0az7bWe13xtfAcxNdlsbhk+7lbz70Rerbp2veb3ZiMVHskERFqPQREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAcEZ7HC0vWGkLndHGSguz2Od3a9xA/Bbqi2V2yrl1RMNKS2ZAN+211a1xEf+Ve+NxK0K76U1BRzOZPTTMcPAgq3fPmujmMdy6NpPvAUvTrt9a2aTOaWJBlK6u03iPvHIB815DHc4uD1j5lXUrLTbKwYqqGGX4tWOl0bpaTPVZKUk+OD/VSFfiVfz1miWB8SKesluQ8X/Ur6trLi39p/wBVa6fbzS8pOKBkef3QvHJtdpl5z6ORvwwt68R475ga3gT/AOxWJtfcsY6n/Urq+puMnGX/AFKtFDtjpmPvC9/8WF7qfQOlYTk2uGT+ILy/EOOuKzKwJ+8ipzYbjJ2D/wAV7KWyXWoHEUp+RVsY9I6ZjIMdmpWn3A/1WUpqCjpmdEFLFG3yDVz2eI9/sgbI4HyyqVu291HcjmnoZnj3BbPaNlb7Us6qgxU/ukJz+Ssa1rW+y0D4Bdlxz8QZT+3ZG1Yda5Ikseytqgja64VTnyDuGDgrd7NojTdqcySmtsfpGj2nZOfkVsiKNuzci775tm+NUIcI6RRxxN6Y42sb5NGF2XKLlNgREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAf/9k='

const RabbitsLogo = ({size=36}) => (
  <img src={LOGO_SRC} alt="Rabbitts Capital" style={{width:size,height:size,objectFit:'contain'}}/>
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
  inp: {width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #E2E8F0',background:'#fff',color:'#0F172A',fontSize:13,transition:'border-color .15s',outline:'none'},
  sel: {width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #E2E8F0',background:'#fff',color:'#0F172A',fontSize:13,cursor:'pointer',outline:'none'},
  btn: {fontSize:13,padding:'8px 14px',borderRadius:8,cursor:'pointer',border:'1px solid #E2E8F0',background:'#fff',color:'#374151',fontWeight:500},
  btnP:{fontSize:13,padding:'8px 16px',borderRadius:8,cursor:'pointer',border:'1px solid #2563EB',background:'#2563EB',color:'#fff',fontWeight:600},
  btnO:{fontSize:13,padding:'7px 14px',borderRadius:8,cursor:'pointer',border:`1px solid ${B.border}`,background:'transparent',color:B.primary},
  btnD:{fontSize:13,padding:'7px 14px',borderRadius:8,cursor:'pointer',border:'1px solid #fca5a5',background:'#FEF2F2',color:'#991b1b'},
  card:{background:'#fff',border:'1px solid #E2E8F0',borderRadius:10,padding:'12px 16px'},
}

const Modal = ({title, onClose, children, wide=false}) => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  return (
  <div style={{position:'fixed',inset:0,background:'rgba(27,79,200,0.18)',display:'flex',alignItems:isMobile?'flex-end':'flex-start',justifyContent:'center',paddingTop:isMobile?0:60,zIndex:1000}}>
    <div style={{background:'#fff',borderRadius:isMobile?'20px 20px 0 0':14,padding:isMobile?'16px':'20px 24px',width:'100%',maxWidth:isMobile?'100%':wide?600:440,margin:isMobile?0:'0 16px',maxHeight:isMobile?'92vh':'80vh',overflowY:'auto',boxShadow:'0 8px 40px rgba(27,79,200,0.18)',border:'1px solid #E2E8F0'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <span style={{fontWeight:700,fontSize:16,color:B.primary}}>● {title}</span>
        <button onClick={onClose} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'#9ca3af',lineHeight:1}}>×</button>
      </div>
      {children}
    </div>
  </div>
  )
}

// ─── Agenda Pública (no requiere login) ──────────────────────────────────────
const bookingSlug = (txt='') => String(txt||'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'broker'

function AgendaPublicaView({settings={}, brokerSlug=''}) {
  const LOGO_SIZES = {pequeno: 36, mediano: 56, grande: 88}
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const DIAS_H = ['DOM.','LUN.','MAR.','MIÉ.','JUE.','VIE.','SÁB.']

  const [remote, setRemote] = React.useState({settings:null, broker:null, eventTypes:[]})
  const [step, setStep] = React.useState(1)
  const [curDate, setCurDate] = React.useState(new Date())
  const [selDate, setSelDate] = React.useState(null)
  const [selSlot, setSelSlot] = React.useState(null)
  const [slots, setSlots] = React.useState([])
  const [loadingSlots, setLoadingSlots] = React.useState(false)
  const [eventTypeId, setEventTypeId] = React.useState('')
  const [form, setForm] = React.useState({nombre:'',email:'',telefono:'',ingresos:'',notas:''})
  const [confirming, setConfirming] = React.useState(false)
  const [result, setResult] = React.useState(null)

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const today = new Date(); today.setHours(0,0,0,0)

  React.useEffect(()=>{
    let alive = true
    ;(async()=>{
      try {
        const qs = new URLSearchParams({meta:'1'})
        if (brokerSlug) qs.set('broker', brokerSlug)
        const res = await fetch(`/api/booking?${qs.toString()}`)
        const data = await res.json()
        if (!alive) return
        setRemote(data || {})
        const firstActive = (data?.eventTypes || []).find(e=>e.activo !== false) || (data?.eventTypes || [])[0]
        if (firstActive?.id) setEventTypeId(firstActive.id)
      } catch(_) {}
    })()
    return ()=>{ alive = false }
  }, [brokerSlug])

  const mergedSettings = {...settings, ...(remote.settings||{})}
  const broker = remote.broker || null
  const eventTypes = (remote.eventTypes || mergedSettings.eventTypes || []).filter(e=>e.activo !== false)
  const currentEvent = eventTypes.find(e=>e.id===eventTypeId) || eventTypes[0] || null
  const S = {
    logo: mergedSettings.logo || null,
    logoSize: LOGO_SIZES[mergedSettings.logoSize] || 56,
    titulo: broker ? (currentEvent?.nombre || 'Agenda una reunión') : (mergedSettings.titulo || 'Reunión de asesoría'),
    subtitulo: broker ? `Agenda directa con ${broker.name}` : (mergedSettings.subtitulo || 'Agenda'),
    descripcion: broker
      ? (currentEvent?.descripcion || `Elige un horario disponible en la agenda de ${broker.name}.`)
      : (mergedSettings.descripcion || 'Elige un horario disponible para coordinar una reunión.'),
    colorPrimario: mergedSettings.colorPrimario || '#2563EB',
    duracionLabel: currentEvent?.duracion ? `${currentEvent.duracion} min` : (mergedSettings.duracionLabel || '1 hora'),
    empresa: mergedSettings.empresa || 'Rabbitts Capital',
  }

  const loadSlots = async (dateStr) => {
    setLoadingSlots(true); setSlots([])
    try {
      const qs = new URLSearchParams({fecha:dateStr, ingresos:String(form.ingresos||1500000)})
      if (eventTypeId) qs.set('eventTypeId', eventTypeId)
      if (brokerSlug) qs.set('broker', brokerSlug)
      const res = await fetch(`/api/booking?${qs.toString()}`)
      const data = await res.json()
      setSlots(data.slots || [])
    } catch(e) { setSlots([]) }
    setLoadingSlots(false)
  }

  React.useEffect(()=>{ if (selDate) loadSlots(selDate) }, [eventTypeId])
  const selectDate = (dateStr) => { setSelDate(dateStr); setSelSlot(null); loadSlots(dateStr) }

  const confirmar = async () => {
    if (!selSlot || !form.nombre || !form.telefono) return
    setConfirming(true)
    try {
      const res = await fetch('/api/booking', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          nombre: form.nombre, telefono: form.telefono, email: form.email || '', ingresos: form.ingresos || '', notas: form.notas || '',
          fecha: selDate, hora: selSlot.time, brokerId: selSlot.broker?.id || '', brokerSlug: brokerSlug || '', eventTypeId: eventTypeId || currentEvent?.id || ''
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo confirmar')
      setResult(data); setStep(3)
    } catch(e) { alert(e.message || 'Error al confirmar. Intenta de nuevo.') }
    setConfirming(false)
  }

  const renderCalDays = () => {
    const year = curDate.getFullYear(), month = curDate.getMonth()
    const firstDow = new Date(year,month,1).getDay()
    const startDow = firstDow===0?6:firstDow-1
    const daysInMonth = new Date(year,month+1,0).getDate()
    const cells = []
    for (let i=0;i<startDow;i++) cells.push(<div key={'e'+i}/>)
    for (let d=1;d<=daysInMonth;d++) {
      const date = new Date(year,month,d)
      const ds = date.toISOString().split('T')[0]
      const isPast = date < today
      const isSel = selDate===ds
      const isToday = date.getTime()===today.getTime()
      cells.push(<button key={d} disabled={isPast} onClick={()=>selectDate(ds)} style={{display:'flex',alignItems:'center',justifyContent:'center',width:38,height:38,margin:'0 auto',position:'relative',borderRadius:'50%',border:'none',cursor:isPast?'default':'pointer',fontFamily:'inherit',fontSize:14,fontWeight:isSel?800:500,background:isSel?S.colorPrimario:isToday?S.colorPrimario+'18':'transparent',color:isPast?'#D1D5DB':isSel?'#fff':isToday?S.colorPrimario:'#0F172A',transition:'all .12s'}}>{d}{isToday&&!isSel&&<span style={{position:'absolute',bottom:3,left:'50%',transform:'translateX(-50%)',width:4,height:4,borderRadius:'50%',background:S.colorPrimario}}/>}</button>)
    }
    return cells
  }

  const selDateFmt = selDate ? new Date(selDate+'T12:00').toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) : ''
  const page = {fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",minHeight:'100vh',background:'#F8FAFC',WebkitFontSmoothing:'antialiased',letterSpacing:'-0.01em'}
  const leftPanel = {width:isMobile?'100%':320,borderRight:isMobile?'none':'1px solid #E2E8F0',padding:isMobile?'24px 20px':'36px 30px',flexShrink:0,background:'#fff'}
  const rightPanel = {flex:1,padding:isMobile?'20px 16px':'36px 40px',background:'#fff'}
  const inp = {width:'100%',padding:'12px 14px',borderRadius:12,border:'1.5px solid #E5E7EB',fontSize:15,fontFamily:'inherit',color:'#0F172A',outline:'none',boxSizing:'border-box',marginTop:6,letterSpacing:'-0.01em'}
  const btnBlue = {padding:'13px 28px',borderRadius:999,border:'none',fontSize:15,fontWeight:800,cursor:'pointer',background:S.colorPrimario,color:'#fff',fontFamily:'inherit',letterSpacing:'-0.01em'}

  return (
    <div style={page}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');`}</style>
      <div style={{maxWidth:980,margin:'0 auto',display:'flex',flexDirection:isMobile?'column':'row',minHeight:isMobile?'100vh':'auto',border:'1px solid #E2E8F0',borderRadius:isMobile?0:22,marginTop:isMobile?0:42,marginBottom:isMobile?0:42,boxShadow:'0 24px 80px rgba(15,23,42,0.10)',overflow:'hidden',background:'#fff'}}>
        <div style={leftPanel}>
          <div style={{marginBottom:24}}>{S.logo ? <img src={S.logo} alt={S.empresa} style={{height:S.logoSize,maxWidth:'100%',objectFit:'contain',objectPosition:'left center',display:'block',marginBottom:14}}/> : <img src="/icon-192.png" alt={S.empresa} style={{width:S.logoSize,height:S.logoSize,borderRadius:18,objectFit:'cover',display:'block',marginBottom:14,boxShadow:'0 10px 30px rgba(37,99,235,.15)'}}/>}<div style={{fontSize:12,fontWeight:900,color:'#94A3B8',letterSpacing:'0.08em',textTransform:'uppercase'}}>{S.empresa}</div></div>
          {broker && <div style={{display:'flex',gap:10,alignItems:'center',padding:12,border:'1px solid #E2E8F0',background:'#F8FAFC',borderRadius:16,marginBottom:18}}><AV name={broker.name} size={42} src={broker.avatar_url||null}/><div style={{minWidth:0}}><div style={{fontSize:13,fontWeight:900,color:'#0F172A'}}>{broker.name}</div><div style={{fontSize:12,color:'#64748B'}}>Agenda individual</div></div></div>}
          <div style={{fontSize:25,fontWeight:900,color:'#0F172A',marginBottom:14,lineHeight:1.15,letterSpacing:'-0.7px'}}>{S.titulo}</div>
          <div style={{fontSize:14,color:'#64748B',lineHeight:1.65,marginBottom:22}}>{S.descripcion}</div>
          <div style={{display:'grid',gap:10,marginBottom:22}}><div style={{display:'flex',alignItems:'center',gap:10,fontSize:14,color:'#334155',fontWeight:650}}>⏱️ {S.duracionLabel}</div><div style={{display:'flex',alignItems:'center',gap:10,fontSize:14,color:'#334155',fontWeight:650}}>🎥 Google Meet</div><div style={{display:'flex',alignItems:'center',gap:10,fontSize:14,color:'#334155',fontWeight:650}}>🌎 Santiago, Chile</div></div>
          {eventTypes.length > 1 && <div style={{padding:12,border:'1px solid #E2E8F0',borderRadius:14,background:'#F8FAFC'}}><div style={{fontSize:12,fontWeight:900,color:'#334155',marginBottom:8}}>Tipo de reunión</div><select value={eventTypeId} onChange={e=>{setEventTypeId(e.target.value); setSelSlot(null)}} style={{...inp,marginTop:0,fontSize:13,padding:'10px 12px'}}>{eventTypes.map(e=><option key={e.id} value={e.id}>{e.nombre} · {e.duracion || 60} min</option>)}</select></div>}
        </div>
        <div style={rightPanel}>
          {step===1&&<div><div style={{fontSize:21,fontWeight:900,color:'#0F172A',marginBottom:24,letterSpacing:'-0.5px'}}>Selecciona fecha y hora</div><div style={{display:'flex',flexDirection:isMobile?'column':'row',gap:26}}><div style={{flex:1,minWidth:0}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}><button onClick={()=>setCurDate(d=>new Date(d.getFullYear(),d.getMonth()-1,1))} style={{width:34,height:34,borderRadius:10,border:'1px solid #E2E8F0',cursor:'pointer',fontSize:18,background:'#fff',color:'#334155'}}>‹</button><span style={{fontWeight:900,fontSize:15,color:'#0F172A'}}>{MESES[curDate.getMonth()]} {curDate.getFullYear()}</span><button onClick={()=>setCurDate(d=>new Date(d.getFullYear(),d.getMonth()+1,1))} style={{width:34,height:34,borderRadius:10,border:'1px solid #E2E8F0',cursor:'pointer',fontSize:18,background:'#fff',color:'#334155'}}>›</button></div><div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4,marginBottom:8}}>{DIAS_H.map(d=><div key={d} style={{fontSize:10,fontWeight:900,color:'#94A3B8',textAlign:'center',padding:'4px 0'}}>{d}</div>)}</div><div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:4}}>{renderCalDays()}</div></div>{selDate&&<div style={{width:isMobile?'100%':220,flexShrink:0}}><div style={{fontWeight:800,fontSize:14,color:'#0F172A',marginBottom:12,textTransform:'capitalize'}}>{selDateFmt}</div>{loadingSlots&&<div style={{color:'#94A3B8',fontSize:13,textAlign:'center',padding:18}}>Cargando horarios...</div>}{!loadingSlots&&slots.length===0&&<div style={{color:'#94A3B8',fontSize:13,textAlign:'center',padding:'18px 0'}}>Sin horarios disponibles</div>}<div style={{display:'flex',flexDirection:'column',gap:8,maxHeight:420,overflowY:'auto'}}>{slots.map((s,i)=> selSlot?.time===s.time ? <div key={i} style={{display:'flex',gap:8}}><button style={{flex:1,padding:'12px 8px',borderRadius:12,border:`2px solid ${S.colorPrimario}`,background:S.colorPrimario+'18',color:S.colorPrimario,cursor:'pointer',fontSize:14,fontWeight:900,fontFamily:'inherit'}}>{s.time}</button><button onClick={()=>setStep(2)} style={{padding:'12px 16px',borderRadius:12,border:'none',background:S.colorPrimario,color:'#fff',cursor:'pointer',fontSize:14,fontWeight:900,fontFamily:'inherit',whiteSpace:'nowrap'}}>Siguiente</button></div> : <button key={i} onClick={()=>setSelSlot(s)} style={{width:'100%',padding:'12px 8px',borderRadius:12,border:'1.5px solid #E2E8F0',background:'#fff',color:'#334155',cursor:'pointer',fontSize:14,fontWeight:800,fontFamily:'inherit'}}>{s.time}</button>)}</div></div>}</div></div>}
          {step===2&&<div style={{maxWidth:500}}><button onClick={()=>setStep(1)} style={{background:'none',border:'none',cursor:'pointer',color:S.colorPrimario,fontSize:14,fontWeight:800,marginBottom:24,fontFamily:'inherit',padding:0}}>← Volver</button><div style={{fontSize:21,fontWeight:900,color:'#0F172A',marginBottom:20}}>Datos para confirmar</div><div style={{display:'grid',gap:14}}><label style={{fontSize:13,fontWeight:800,color:'#334155'}}>Nombre completo *<input style={inp} value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/></label><label style={{fontSize:13,fontWeight:800,color:'#334155'}}>Correo electrónico<input style={inp} type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></label><label style={{fontSize:13,fontWeight:800,color:'#334155'}}>Teléfono WhatsApp *<input style={inp} value={form.telefono} onChange={e=>setForm(f=>({...f,telefono:e.target.value}))} placeholder="+56 9 XXXX XXXX"/></label><label style={{fontSize:13,fontWeight:800,color:'#334155'}}>Dato de calificación opcional<select style={inp} value={form.ingresos} onChange={e=>setForm(f=>({...f,ingresos:e.target.value}))}><option value="">No indicar ahora</option><option value="1500000">$1.500.000 – $2.500.000</option><option value="2500000">$2.500.000 – $5.000.000</option><option value="5000000">$5.000.000 o más</option></select></label><label style={{fontSize:13,fontWeight:800,color:'#334155'}}>Comentario opcional<textarea style={{...inp,minHeight:84,resize:'none'}} value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))}/></label></div><button onClick={confirmar} disabled={confirming||!form.nombre||!form.telefono} style={{...btnBlue,width:'100%',marginTop:22,opacity:confirming||!form.nombre||!form.telefono?0.5:1}}>{confirming?'Confirmando...':'Programar reunión'}</button></div>}
          {step===3&&<div style={{textAlign:'center',padding:'60px 24px'}}><div style={{width:76,height:76,borderRadius:'50%',background:'#DCFCE7',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px',fontSize:34}}>✓</div><div style={{fontSize:25,fontWeight:900,color:'#0F172A',marginBottom:10}}>Reunión confirmada</div><div style={{fontSize:15,color:'#64748B',lineHeight:1.7,marginBottom:24,maxWidth:420,margin:'0 auto 24px'}}>Tu reunión fue agendada para el <strong style={{color:'#0F172A',textTransform:'capitalize'}}>{selDateFmt}</strong> a las <strong style={{color:'#0F172A'}}>{selSlot?.time}</strong>. Recibirás la confirmación.</div>{result?.meetLink&&<a href={result.meetLink} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:8,padding:'13px 28px',borderRadius:999,background:'#1a73e8',color:'#fff',textDecoration:'none',fontWeight:900,fontSize:15}}>🎥 Unirse a Google Meet</a>}</div>}
        </div>
      </div>
    </div>
  )
}


// ─── Main App ─────────────────────────────────────────────────────────────────
const EU = {name:'',rut:'',phone:'',email:'',username:'',pin:'',role:'agent'}
const EL = {nombre:'',telefono:'',email:'',renta:'',tag:'lead'}

// ─── Importación masiva de usuarios ──────────────────────────────────────────
function ImportUsuariosModal({ onClose, users, saveUsers, me, genTempPin, dbReady, supabase }) {
  const B = { primary:'#2563EB', light:'#EFF6FF', mid:'#64748B' }
  const sty = { inp:{padding:'7px 10px',borderRadius:8,border:'1px solid #E2E8F0',fontSize:13,width:'100%',boxSizing:'border-box'} }

  const [rows,    setRows]    = React.useState([])   // filas parseadas
  const [errors,  setErrors]  = React.useState([])
  const [importing, setImporting] = React.useState(false)
  const [done,    setDone]    = React.useState(null)  // {ok, skipped}
  const [defRole, setDefRole] = React.useState('agent')
  const fileRef = React.useRef()

  const ROLE_MAP = {
    'agente':'agent','agent':'agent','vendedor':'agent','broker':'agent',
    'team leader':'team_leader','team_leader':'team_leader','lider':'team_leader',
    'operaciones':'operaciones','ops':'operaciones',
    'finanzas':'finanzas','admin':'admin','administrador':'admin',
    'partner':'partner','socio':'partner'
  }

  const downloadTemplate = () => {
    const csv = 'Nombre,RUT,Teléfono,Email,Usuario,Rol\nJuan Pérez,12.345.678-9,+56912345678,juan@email.com,juan.perez,agent\nMaría López,11.111.111-1,+56987654321,maria@email.com,maria.lopez,agent\n'
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = 'plantilla_usuarios_rabbitts.csv'
    a.click()
  }

  const parseFile = async (file) => {
    setRows([]); setErrors([]); setDone(null)
    if (!window.XLSX) {
      await new Promise((res,rej)=>{
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
        s.onload = res; s.onerror = rej
        document.head.appendChild(s)
      })
    }
    try {
      const ab = await file.arrayBuffer()
      const wb = window.XLSX.read(ab, {type:'array'})
      const ws = wb.Sheets[wb.SheetNames[0]]
      const raw = window.XLSX.utils.sheet_to_json(ws, {defval:''})
      const norm = k => String(k||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()

      const errs = []
      const parsed = raw.map((r, i) => {
        const keys = Object.keys(r)
        const get = (...candidates) => {
          const k = keys.find(k => candidates.some(c => norm(k).includes(c)))
          return String(r[k]||'').trim()
        }
        const nombre   = get('nombre','name','names')
        const rut      = get('rut','run','documento')
        const phone    = get('telefono','phone','celular','movil','fono')
        const email    = get('email','correo','mail')
        const username = get('usuario','username','login','user').toLowerCase().replace(/[^a-z0-9._]/g,'')
        const rolRaw   = norm(get('rol','role','cargo','perfil'))
        const role     = ROLE_MAP[rolRaw] || defRole

        if (!nombre) errs.push(`Fila ${i+2}: falta el nombre`)
        if (!email)  errs.push(`Fila ${i+2}: falta el email (${nombre||'?'})`)

        // Generar username si no viene
        const usernameGen = username || nombre.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
          .replace(/\s+/g,'.').replace(/[^a-z0-9.]/g,'').slice(0,20)

        return { _row:i+2, nombre, rut, phone, email, username:usernameGen, role, _valid:!!nombre&&!!email }
      }).filter(r => r._valid)

      setErrors(errs)
      setRows(parsed)
    } catch(e) {
      setErrors(['Error al leer el archivo: '+e.message])
    }
  }

  const doImport = async () => {
    setImporting(true)
    let ok = 0, skipped = 0
    const newUsers = []

    for (const r of rows) {
      // Verificar si usuario ya existe
      const usernameBase = r.username
      let username = usernameBase
      let attempt  = 0
      while ([...users, ...newUsers].find(u => u.username === username)) {
        attempt++
        username = usernameBase + attempt
      }
      if (attempt > 5) { skipped++; continue }

      const tempPin = genTempPin(8)
      const newU = {
        id:       'u-' + Date.now() + '-' + ok,
        name:     r.nombre,
        rut:      r.rut || '',
        phone:    r.phone || '',
        email:    r.email,
        username,
        pin:      tempPin,
        mustChange: true,
        role:     r.role
      }
      newUsers.push(newU)

      // Enviar email + WhatsApp
      if (r.email) {
        try {
          await fetch('/api/notify', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
              type:'welcome', to:r.email,
              agentName:r.nombre, adminName:me.name,
              username, pin:tempPin, phone:r.phone||'', role:r.role
            })
          })
        } catch(e) {}
      }
      ok++
      // Pequeña pausa para no saturar la API de email
      if (ok % 5 === 0) await new Promise(res => setTimeout(res, 500))
    }

    await saveUsers([...users, ...newUsers])
    setImporting(false)
    setDone({ ok, skipped })
  }

  const existentes = rows.filter(r => users.find(u => u.username === r.username))

  return (
    <Modal title="📥 Importar usuarios masivo" onClose={onClose} wide>
      <div style={{marginBottom:14}}>
        <p style={{margin:'0 0 10px',fontSize:13,color:B.mid}}>
          Sube un Excel o CSV con los datos de los nuevos usuarios. El sistema generará una clave temporal para cada uno y les enviará las credenciales por email y WhatsApp.
        </p>

        {/* Plantilla + formato */}
        <div style={{background:'#FFFBEB',border:'1px solid #fcd34d',borderRadius:8,
          padding:'10px 14px',marginBottom:12,fontSize:12,color:'#92400e'}}>
          <strong>Columnas:</strong> Nombre (obligatorio), RUT, Teléfono, Email (obligatorio), Usuario, Rol
          <br/>Roles válidos: agent, team_leader, operaciones, finanzas, admin, partner
          <br/>Si no hay columna Usuario, se genera automáticamente del nombre.
        </div>

        <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
          <button onClick={downloadTemplate} style={{...sty.inp,width:'auto',padding:'7px 14px',
            cursor:'pointer',background:B.light,color:B.primary,fontWeight:600,border:`1px solid ${B.primary}`}}>
            📄 Descargar plantilla CSV
          </button>
          <div style={{flex:1,minWidth:160}}>
            <label style={{fontSize:11,color:B.mid,display:'block',marginBottom:4}}>Rol por defecto (si no viene en el archivo)</label>
            <select value={defRole} onChange={e=>setDefRole(e.target.value)}
              style={{...sty.inp,padding:'6px 10px'}}>
              <option value="agent">Agente</option>
              <option value="team_leader">Team Leader</option>
              <option value="operaciones">Operaciones</option>
              <option value="finanzas">Finanzas</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        {/* Drop zone */}
        <div style={{border:'2px dashed #A8C0F0',borderRadius:12,padding:'24px 20px',
          textAlign:'center',background:'#f9fbff',marginBottom:14,cursor:'pointer'}}
          onClick={()=>fileRef.current?.click()}
          onDragOver={e=>e.preventDefault()}
          onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)parseFile(f)}}>
          <div style={{fontSize:28,marginBottom:6}}>👥</div>
          <div style={{fontSize:14,fontWeight:600,color:B.primary,marginBottom:3}}>
            Arrastra tu archivo o haz clic para seleccionar
          </div>
          <div style={{fontSize:12,color:'#9ca3af'}}>.xlsx · .xls · .csv</div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}}
            onChange={e=>e.target.files[0]&&parseFile(e.target.files[0])}/>
        </div>

        {/* Errores */}
        {errors.length>0 && (
          <div style={{background:'#FEF2F2',border:'1px solid #fca5a5',borderRadius:8,
            padding:'10px 14px',marginBottom:12}}>
            {errors.map((e,i)=><div key={i} style={{fontSize:12,color:'#991b1b',marginBottom:2}}>⚠ {e}</div>)}
          </div>
        )}

        {/* Preview */}
        {rows.length>0 && !done && (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <span style={{fontSize:13,fontWeight:700,color:B.primary}}>
                {rows.length} usuarios listos para importar
                {existentes.length>0 && <span style={{color:'#d97706',marginLeft:8}}>· {existentes.length} con usuario existente (se renombrarán)</span>}
              </span>
              <button onClick={()=>{setRows([]);setErrors([])}}
                style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px solid #E2E8F0',
                  background:'#fff',cursor:'pointer',color:B.mid}}>
                Limpiar
              </button>
            </div>

            <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:10,
              overflow:'auto',maxHeight:240,marginBottom:12}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{background:B.light}}>
                    {['#','Nombre','Usuario','Email','Teléfono','Rol'].map(h=>(
                      <th key={h} style={{padding:'7px 10px',textAlign:'left',fontWeight:700,
                        color:B.primary,whiteSpace:'nowrap',fontSize:11}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r,i)=>(
                    <tr key={i} style={{borderBottom:'1px solid #f0f4ff',
                      background:existentes.find(e=>e._row===r._row)?'#FFFBEB':'transparent'}}>
                      <td style={{padding:'6px 10px',color:'#9ca3af'}}>{r._row}</td>
                      <td style={{padding:'6px 10px',fontWeight:600,color:'#0F172A'}}>{r.nombre}</td>
                      <td style={{padding:'6px 10px',fontFamily:'monospace',fontSize:11}}>{r.username}</td>
                      <td style={{padding:'6px 10px',color:'#6b7280'}}>{r.email}</td>
                      <td style={{padding:'6px 10px',color:'#6b7280'}}>{r.phone||'—'}</td>
                      <td style={{padding:'6px 10px'}}>
                        <span style={{fontSize:10,padding:'2px 7px',borderRadius:99,
                          background:B.light,color:B.primary,fontWeight:600}}>{r.role}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{background:'#F0FDF4',border:'1px solid #86efac',borderRadius:8,
              padding:'8px 12px',marginBottom:12,fontSize:12,color:'#14532d'}}>
              ✅ Se generará una clave temporal para cada usuario y se enviarán las credenciales por email{' '}
              {rows.some(r=>r.phone) ? 'y WhatsApp' : ''}.
            </div>

            <button onClick={doImport} disabled={importing}
              style={{width:'100%',padding:'11px',borderRadius:10,border:'none',
                fontWeight:700,fontSize:14,cursor:importing?'wait':'pointer',
                background:importing?'#93c5fd':B.primary,color:'#fff'}}>
              {importing ? `⏳ Importando... (esto puede tardar)` : `📥 Importar ${rows.length} usuarios`}
            </button>
          </div>
        )}

        {/* Resultado */}
        {done && (
          <div style={{background:'#DCFCE7',border:'1px solid #86efac',borderRadius:10,
            padding:'20px',textAlign:'center'}}>
            <div style={{fontSize:36,marginBottom:8}}>✅</div>
            <div style={{fontSize:16,fontWeight:700,color:'#14532d',marginBottom:4}}>
              {done.ok} usuarios creados exitosamente
            </div>
            {done.skipped>0 && (
              <div style={{fontSize:12,color:'#166534',marginBottom:8}}>
                {done.skipped} omitidos (conflicto de usuario)
              </div>
            )}
            <div style={{fontSize:13,color:'#166534',marginBottom:16}}>
              Cada usuario recibió su clave temporal por email. Al ingresar deberán crear una nueva clave.
            </div>
            <button onClick={onClose} style={{padding:'8px 20px',borderRadius:8,border:'none',
              background:'#14532d',color:'#fff',cursor:'pointer',fontWeight:700,fontSize:13}}>
              Cerrar
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─── Cambio forzado de clave (clave temporal expirada) ───────────────────────
function ForzarCambioClaveForm({ me, users, setUsers, setMe, dbReady, supabase, validarClave, onSuccess }) {
  const [n1, setN1] = React.useState('')
  const [n2, setN2] = React.useState('')
  const [err, setErr] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const B = { primary:'#2563EB', light:'#EFF6FF', mid:'#64748B' }

  const save = async () => {
    const errV = validarClave(n1)
    if (errV) { setErr(errV); return }
    if (n1 !== n2) { setErr('Las claves no coinciden'); return }
    setSaving(true)
    const nextUsers = users.map(u => u.id === me.id ? {...u, pin:n1, mustChange:false} : u)
    setUsers(nextUsers)
    setMe(m => ({...m, pin:n1, mustChange:false}))
    if (dbReady && supabase) {
      await supabase.from('crm_users').update({pin:n1, mustChange:false}).eq('id', me.id)
    }
    setSaving(false)
    onSuccess()
  }

  return (
    <div>
      <div style={{marginBottom:14}}>
        <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:5}}>
          Nueva clave
        </label>
        <input type="password" value={n1} onChange={e=>{setN1(e.target.value);setErr('')}}
          placeholder="Mínimo 6 caracteres, letras y números"
          style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #E2E8F0',
            fontSize:13,boxSizing:'border-box'}}/>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{display:'block',fontSize:12,fontWeight:600,color:'#374151',marginBottom:5}}>
          Repetir nueva clave
        </label>
        <input type="password" value={n2} onChange={e=>{setN2(e.target.value);setErr('')}}
          onKeyDown={e=>e.key==='Enter'&&save()}
          placeholder="Repite la clave"
          style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #E2E8F0',
            fontSize:13,boxSizing:'border-box'}}/>
      </div>
      <div style={{background:'#EFF6FF',border:'1px solid #bfdbfe',borderRadius:8,
        padding:'8px 12px',marginBottom:14,fontSize:11,color:'#1d4ed8'}}>
        La clave debe tener entre 6 y 12 caracteres, con letras y números (ej: Rb4xK2mP)
      </div>
      {err && <p style={{margin:'0 0 10px',fontSize:12,color:'#991b1b'}}>{err}</p>}
      <button onClick={save} disabled={saving||!n1||!n2}
        style={{width:'100%',padding:'11px',borderRadius:10,border:'none',cursor:'pointer',
          fontWeight:700,fontSize:14,
          background:n1&&n2?B.primary:'#e5e7eb',
          color:n1&&n2?'#fff':'#9ca3af'}}>
        {saving ? 'Guardando...' : 'Guardar nueva clave'}
      </button>
    </div>
  )
}

// Componente para el campo de contacto en el modal del lead
// (debe ser componente propio para poder usar useState — no puede ser IIFE)
function ModalContactInput({ sel, leads, setLeads, setSel, me, dbReady, supabase, msg, B }) {
  const [note, setNote] = React.useState('')
  const save = async () => {
    if (!note.trim()) return
    const now = new Date().toISOString()
    const c = {id:'c-'+Date.now(), text:'📞 '+note.trim(), author_name:me.name, date:now}
    const nc = [...(sel.comments||[]), c]
    const ls = leads.map(l=>l.id===sel.id?{...l,comments:nc,stage_moved_at:now}:l)
    setLeads(ls); setSel(ls.find(l=>l.id===sel.id))
    if (dbReady) await supabase.from('crm_leads').update({comments:nc,stage_moved_at:now}).eq('id',sel.id)
    setNote('')
    msg('✓ Contacto registrado')
  }
  return (
    <div style={{display:'flex',gap:6,flex:1,alignItems:'center'}}>
      <input
        value={note}
        onChange={e=>setNote(e.target.value)}
        onKeyDown={e=>{if(e.key==='Enter')save()}}
        placeholder="¿Qué pasó? Escribe y presiona Enter..."
        style={{flex:1,padding:'5px 10px',borderRadius:8,border:'1px solid #E2E8F0',
          fontSize:12,background:'#fff',outline:'none',minWidth:120}}
      />
      <button onClick={save} disabled={!note.trim()}
        style={{fontSize:12,padding:'6px 12px',borderRadius:8,fontWeight:700,
          border:'none',cursor:note.trim()?'pointer':'not-allowed',flexShrink:0,
          background:note.trim()?B.primary:'#e5e7eb',
          color:note.trim()?'#fff':'#9ca3af'}}>
        Guardar
      </button>
    </div>
  )
}

export default function App() {
  const [users,  setUsers]  = useState(null)
  const [leads,  setLeads]  = useState(null)
  const [me,     setMe]     = useState(null)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [gcalModal, setGcalModal] = useState(null)
  const [gcalForm, setGcalForm] = useState({fecha:'', hora:'09:00', duracion:60, notas:''})
  const [gcalLoading, setGcalLoading] = useState(false)
  const [gcalResult, setGcalResult] = useState(null)
  const [marketplaceConfig, setMarketplaceConfig] = useState({ url: '', enabled: false, label: 'Marketplace', allowRoles: ['admin','agent','partner'] })
  // Responsive helper
  const R = (desktop, mobile) => isMobile ? mobile : desktop
  const [nav,    setNav]    = useState('kanban')
  const [modal,  setModal]  = useState(null)
  const [sel,    setSel]    = useState(null)
  const [lu, setLu] = useState(''); const [lp, setLp] = useState(''); const [lerr, setLerr] = useState('')
  const [nu, setNu] = useState(EU)
  const [nl, setNl] = useState(EL)
  const [conv, setConv] = useState(''); const [xing, setXing] = useState(false); const [xerr, setXerr] = useState('')
  const [fa, setFa] = useState('all'); const [fs, setFs] = useState('all'); const [ft, setFt] = useState('all')
  const [brokerSearch, setBrokerSearch] = useState('')  // broker lead search
  const [toast, setToast] = useState('')
  const [comment, setComment] = useState('')
  const [contactModal, setContactModal] = useState(null)  // {leadId}
  const [contactMethod, setContactMethod] = useState('')
  const [editResumen, setEditResumen] = useState(null)
  const [visitaModal, setVisitaModal] = useState(null)
  const [condiciones, setCondiciones] = useState([])
  const [condMes, setCondMes] = useState(new Date().toISOString().slice(0,7))
  const [visitaForm, setVisitaForm] = useState({fecha:'',hora:'10:00',proyecto:'',comentario:''})
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
  const [conversations, setConversations] = useState([]) // WhatsApp conversations
  const [activeConv, setActiveConv] = useState(null)    // selected conversation
  const [convMessages, setConvMessages] = useState({})  // {convId: [messages]}
  const [agendaSettings, setAgendaSettings] = useState({
    logo: null,           // base64 or null (uses default)
    logoSize: 'mediano',  // pequeno | mediano | grande
    titulo: 'Reunión de asesoría',
    subtitulo: 'Agenda',
    descripcion: 'Revisaremos tus objetivos y te orientaremos con el siguiente paso comercial.',
    colorPrimario: '#2563EB',
    duracionLabel: '1 hora',
    empresa: 'Rabbitts Capital',
    timezone: 'America/Santiago',
    slotInterval: 30,
    minNoticeHours: 12,
    bufferBefore: 0,
    bufferAfter: 0,
    distributionMode: 'round_robin',
    teams: [{ id:'principal', nombre:'Equipo comercial', memberIds:[] }],
    eventTypes: [{
      id:'asesoria', nombre:'Reunión de asesoría', duracion:60,
      descripcion:'Reunión comercial inicial', modo:'round_robin', equipoId:'principal',
      anticipacionHoras:12, intervalo:30, bufferAntes:0, bufferDespues:0, activo:true
    }],
  })

  const [iaConfig, setIaConfig] = useState({
    nombre: 'Rabito',
    tono: 'motivador',
    horarioDesde: '09:00',
    horarioHasta: '20:00',
    siempreActivo: true,       // 24/7
    pausarAlIntervenir: true,   // pause IA when human intervenes
    tiempoEspera: 7,            // seconds to wait before responding
    notifApp: true,             // in-app notification when escalates
    notifEmail: true,           // email notification when escalates
    notifEntradaHumano: true,   // notify when enters human stage
    notifMensajeHumano: true,   // notify when new message in human stage
    activo: false,
    agendaLink: 'https://crm.rabbittscapital.com/agenda',
    calendlyLink: '',
    metaPhoneId: '',
    metaWabaId: '',
    metaToken: '',
    metaVerifyToken: 'rabbitts_webhook_secret',
    metaPhoneNumber: '',
    driveUrl: '',
    driveFiles: [], // cached file list from Drive
    driveFileUrls: [], // individual doc URLs to sync
    driveLastSync: null,
    driveScriptUrl: '', // Google Apps Script web app URL
    driveFolderIds: [], // folder IDs to sync via Apps Script
    montoMinimo: '',
    criterioCalificacion: '',
    eventos: {
      asignacion: true, cambioEtapa: true, ocRecibida: true,
      brokerPagar: true, inactividad: true, diasInactividad: 7
    },
    plantillas: {
      asignacion:   'Hola {broker}, te asignaron un nuevo cliente: {cliente}, interesado en {proyecto}. Revisalo en el CRM.',
      firma:        'Excelente, {broker}. Tu cliente {cliente} acaba de avanzar a {etapa}. Sigue gestionando desde el CRM.',
      ocRecibida:   'Llego la OC de {inmobiliaria} por {cliente}. Ya puedes emitir la factura.',
      brokerPagar:  'La inmobiliaria pago la comision de {cliente}. Envia tu factura a Rabbitts para recibir tu pago.',
      inactividad:  'Hola {broker}, tienes {n} clientes sin actividad hace mas de {dias} dias. Quieres repasarlos?',
    },
    personalidad: "Eres un asistente comercial entrenable. Tu rubro, oferta y proceso NO vienen del código: vienen únicamente del Panel IA, documentos y feedback. Responde como humano por WhatsApp: breve, claro, amable y orientado a avanzar. No inventes productos, precios, condiciones, requisitos ni beneficios. Si falta información, pregunta solo una cosa. Si el cliente pide humano o agenda y existe link, entrega el link. Si el cliente reclama repetición, reconoce el error y no vuelvas a preguntar lo mismo.",
    guion: "Define aquí el proceso de venta real que debe seguir el agente. Ejemplo genérico: 1) entender necesidad, 2) confirmar interés, 3) calificar con los datos mínimos que tú definas, 4) resolver objeciones usando el conocimiento cargado, 5) invitar a reunión/compra/cierre cuando corresponda. El agente no debe crear pasos que no estén definidos aquí.",
    productosRabito: "Describe aquí qué vende el agente: productos, servicios, beneficios, precios, condiciones, público objetivo y límites. Si este campo está vacío, el agente no debe inventar qué vende.",
    pasosRabito: "Entender necesidad → Confirmar interés → Calificar según tus criterios → Responder objeciones → Cerrar siguiente paso. Ajusta estos pasos según lo que vendas.",
    reglasRabito: "Siempre disponible. Nunca decir alta demanda ni que responderá después. Nunca inventar información. Nunca repetir preguntas ya respondidas. Máximo una pregunta por mensaje. Mensajes cortos estilo WhatsApp. Obedecer siempre el Panel IA, documentos y feedback.",
    objecionesRabito: "Escribe aquí las objeciones típicas y cómo responderlas. Ejemplo: precio, confianza, plazo, comparación, falta de información, pedir humano, no interesado. Si una objeción no está definida, responder de forma prudente y derivar.",
    reglasEntrenamiento: [],
    cerebroDocs: [],
    entrenamiento: []
  })
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


  // ── Sincronización defensiva de leads ─────────────────────────────────────
  // Refuerza que broker/admin/operaciones vean la misma etapa sin depender solo de realtime.
  useEffect(() => {
    if (!dbReady || !me) return
    let stop = false
    const refreshLeads = async () => {
      try {
        const { data } = await supabase.from('crm_leads').select('*').order('fecha', {ascending:false})
        if (!stop && data) {
          setLeads(data)
          setSel(current => current ? (data.find(x=>x.id===current.id) || current) : current)
        }
      } catch(_) {}
    }
    const onFocus = () => refreshLeads()
    window.addEventListener('focus', onFocus)
    const timer = setInterval(refreshLeads, 15000)
    return () => { stop = true; window.removeEventListener('focus', onFocus); clearInterval(timer) }
  }, [dbReady, me?.id])

  // ── Auto-save agendaSettings to Supabase ────────────────────────────────────
  useEffect(() => {
    if (!dbReady) return
    clearTimeout(window._agendaSettingsTimer)
    window._agendaSettingsTimer = setTimeout(async () => {
      try { await supabase.from('crm_settings').upsert({key:'agenda_settings', value:agendaSettings}) } catch(_) {}
      localStorage.setItem('rcrm_agenda_settings', JSON.stringify(agendaSettings))
    }, 1000)
  }, [agendaSettings, dbReady])

  // ── Auto-save iaConfig to Supabase ──────────────────────────────────────
  useEffect(() => {
    if (!dbReady) return
    clearTimeout(window._iaConfigTimer)
    window._iaConfigTimer = setTimeout(() => saveIaConfig(iaConfig), 1000)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iaConfig, dbReady])
  // ── Alertas de ranking — notifica al broker cuando sube de puesto ──────────
  useEffect(() => {
    if (!dbReady || !leads.length || !users.length || !me) return
    const RANK_STAGES = ['firma','escritura','ganado']
    const agents = users.filter(u => u.role === 'agent')
    const ranked = agents.map(ag => {
      const total = leads.filter(l => l.assigned_to===ag.id && RANK_STAGES.includes(l.stage))
        .reduce((s,l) => s + (l.propiedades||[]).filter(p=>p.moneda==='UF').reduce((ss,p)=>ss+(parseFloat(p.bono_pie?p.precio_sin_bono:p.precio)||0),0), 0)
      return { id: ag.id, name: ag.name, email: ag.email, phone: ag.phone, total }
    }).sort((a,b) => b.total - a.total)

    const posMap = {}
    ranked.forEach((r,i) => { posMap[r.id] = i+1 })

    const stored = JSON.parse(localStorage.getItem('rcrm_ranking_pos') || '{}')
    const alerts = []

    for (const ag of ranked) {
      const prev = stored[ag.id]
      const curr = posMap[ag.id]
      if (prev && curr < prev) {
        // Subió de puesto
        alerts.push({ ag, prev, curr })
      }
    }

    // Save current positions
    localStorage.setItem('rcrm_ranking_pos', JSON.stringify(posMap))

    // Send alerts for rank improvements (only admin triggers, but notifies each broker)
    if (isAdmin && alerts.length > 0) {
      for (const { ag, prev, curr } of alerts) {
        const medals = {1:'🥇',2:'🥈',3:'🥉'}
        const medal = medals[curr] || '🏅'
        // Email
        if (ag.email) {
          fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'ranking_subida',
              to: ag.email,
              agentName: ag.name,
              prevPos: prev,
              currPos: curr,
              medal,
              total: ranked.length
            })
          }).catch(() => {})
        }
        // WhatsApp
        if (ag.phone) {
          fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'ranking_subida_wa',
              phone: ag.phone,
              agentName: ag.name,
              prevPos: prev,
              currPos: curr,
              medal,
              total: ranked.length
            })
          }).catch(() => {})
        }
      }
    }
  }, [leads, users, dbReady])



  // ── Responsive resize handler ───────────────────────────────────────────────
  useEffect(() => {
    const handle = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handle)
    return () => window.removeEventListener('resize', handle)
  }, [])

  // ── PWA Install prompt ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setInstallPrompt(e)
      setShowInstallBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // ── Google Calendar OAuth callback ────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('gcal_success')) {
      const email = params.get('gcal_email') || ''
      msg('Google Calendar conectado' + (email ? ' — ' + email : ''))
      // Update me user with google connected status
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (params.get('gcal_error')) {
      msg('Error conectando Calendar: ' + params.get('gcal_error'))
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

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
          const required = DEFAULT_STAGES.filter(ds => ['solicitud_promesa','firma','escritura','perdido'].includes(ds.id))
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
      let us = (data || []).map(u => { try { return {...u, ...(JSON.parse(localStorage.getItem('rcrm_profile_'+u.id)||'{}'))} } catch(_) { return u } }) // rcrm_profile_ merge
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
          setNav(saved.role === 'admin' || saved.role === 'partner' ? 'dashboard' : saved.role === 'operaciones' ? 'operaciones' : saved.role === 'finanzas' ? 'dashboard_finanzas' : 'broker_home')
        }
        window.__sessionUserId = null
      }
      const { data: ls } = await supabase.from('crm_leads').select('*').order('fecha', {ascending:false})
      setLeads(ls || [])
      // Load iaConfig
      try {
        const { data: ia } = await supabase.from('crm_settings').select('value').eq('key','ia_config').single()
        if (ia?.value) setIaConfig(prev => ({...prev, ...ia.value}))
      } catch(_) {}
      // Load marketplace config
      try {
        const { data: mp } = await supabase.from('crm_settings').select('value').eq('key','marketplace_config').single()
        if (mp?.value) setMarketplaceConfig(prev => ({...prev, ...mp.value}))
        const { data: condRow } = await supabase.from('crm_settings').select('value').eq('key','condiciones_comerciales').single()
        if (condRow?.value) setCondiciones(condRow.value)
      } catch(_) {}
      // Load agendaSettings
      try {
        const { data: ag } = await supabase.from('crm_settings').select('value').eq('key','agenda_settings').single()
        if (ag?.value) {
          setAgendaSettings(prev => ({...prev, ...ag.value}))
          localStorage.setItem('rcrm_agenda_settings', JSON.stringify({...ag.value}))
        }
      } catch(_) {}
      // Load conversations
      try {
        const { data: convs } = await supabase.from('crm_conversations')
          .select('*').order('updated_at',{ascending:false}).limit(200)
        if (convs) setConversations(mergeConversationsByPhone(convs))
      } catch(_) {}
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
          const required = DEFAULT_STAGES.filter(ds => ['solicitud_promesa','firma','escritura','perdido'].includes(ds.id))
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
      let us = JSON.parse(localStorage.getItem('rcrm_users') || '[]').map(u => { try { return {...u, ...(JSON.parse(localStorage.getItem('rcrm_profile_'+u.id)||'{}'))} } catch(_) { return u } })
      if (!us.find(u => u.role === 'admin'))
        us = [{id:'u-admin',name:'Luis Burgos',rut:'',phone:'',email:'',username:'admin',pin:'1234',role:'admin'}, ...us]
      setUsers(us)
      if (window.__sessionUserId) {
        const saved = us.find(u => u.id === window.__sessionUserId)
        if (saved) { setMe(saved); setNav(saved.role==='admin'||saved.role==='partner'?'dashboard':saved.role==='finanzas'?'dashboard_finanzas':'kanban') }
      // Load condiciones comerciales
      try {
        const { data: condData } = await supabase.from('crm_settings').select('value').eq('key','condiciones_comerciales').single()
        if (condData?.value) setCondiciones(Array.isArray(condData.value) ? condData.value : [])
      } catch(_) {}
        window.__sessionUserId = null
      }
      setLeads(JSON.parse(localStorage.getItem('rcrm_leads') || '[]'))
      const savedStages = localStorage.getItem('rcrm_stages')
      if (savedStages) {
        const saved = JSON.parse(savedStages)
        const required = DEFAULT_STAGES.filter(ds => ['solicitud_promesa','firma','escritura','perdido'].includes(ds.id))
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
      for (const u of us) {
        try {
          await supabase.from('crm_users').upsert(u, {onConflict:'id'})
        } catch(e) {
          console.warn('saveUsers error for', u.id, e)
        }
      }
    } else {
      localStorage.setItem('rcrm_users', JSON.stringify(us))
    }
  }

  async function createCalendarEvent(lead, broker) {
    if (!broker?.google_tokens) return null
    setGcalLoading(true)
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          action: 'create',
          tokens: broker.google_tokens,
          event: {
            titulo: `Reunión — ${lead.nombre}`,
            fecha: gcalForm.fecha,
            hora: gcalForm.hora,
            duracion: gcalForm.duracion,
            clienteEmail: lead.email !== '—' ? lead.email : '',
            clienteNombre: lead.nombre,
            brokerEmail: broker.email,
            notas: gcalForm.notas
          }
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setGcalResult(data)
      // Update lead with meeting date
      if (dbReady) {
        await supabase.from('crm_leads').update({
          meeting_date: gcalForm.fecha + 'T' + gcalForm.hora,
          meeting_event_id: data.eventId,
          meeting_link: data.meetLink || data.eventLink
        }).eq('id', lead.id)
        setLeads(prev => prev.map(l => l.id===lead.id ? {...l, meeting_date: gcalForm.fecha+'T'+gcalForm.hora, meeting_link: data.meetLink||data.eventLink} : l))
      }
      msg('Reunión creada en Google Calendar')
      return data
    } catch(e) {
      msg('Error: ' + e.message)
      return null
    } finally {
      setGcalLoading(false)
    }
  }

  async function saveIaConfig(config) {
    if (!dbReady) return
    try {
      await supabase.from('crm_settings').upsert({key:'ia_config', value:config})
    } catch(e) { console.warn('iaConfig save failed:', e) }
  }

  async function upsertConversation(conv) {
    if (!dbReady || !conv?.id) return null
    const cleanConv = Object.fromEntries(Object.entries(conv).filter(([k]) => !String(k).startsWith('_')))
    if (cleanConv.last_message) cleanConv.last_message = extractVisibleMessageContent(cleanConv.last_message) || cleanConv.last_message
    try {
      const { data, error } = await supabase.from('crm_conversations').upsert(cleanConv, { onConflict:'id' }).select().single()
      if (error) throw error
      if (data) {
        setConversations(prev => {
          const idx = prev.findIndex(c=>c.id===data.id)
          if (idx>=0) { const n=[...prev]; n[idx]={...n[idx],...data}; return n }
          return [data, ...prev]
        })
        setActiveConv(prev => prev?.id===data.id ? {...prev,...data} : prev)
      }
      return data
    } catch(e) {
      console.warn('Conv save failed:', e.message || e)
      return null
    }
  }

  async function saveConvMessage(convId, message) {
    if (!dbReady || !convId || !message?.content) return false
    const cleanMessage = {
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: extractVisibleMessageContent(message.content) || String(message.content || ''),
      created_at: message.created_at || new Date().toISOString()
    }

    const attempts = [
      { conv_id: convId, ...message, ...cleanMessage },
      { conv_id: convId, ...cleanMessage }
    ]

    for (const payload of attempts) {
      try {
        const { error } = await supabase.from('crm_conv_messages').insert(payload)
        if (!error) {
          setConvMessages(prev => ({...prev, [convId]: [...(prev[convId]||[]), cleanMessage]}))
          return true
        }
        console.warn('Message save attempt failed:', error.message)
      } catch(e) { console.warn('Message save exception:', e.message) }
    }
    return false
  }

  async function loadConvMessages(convId) {
    if (!dbReady) return
    try {
      const conv = conversations.find(c => c.id === convId) || activeConv
      const ids = Array.from(new Set([convId, ...((conv && conv._mergedIds) || [])].filter(Boolean)))
      const query = supabase.from('crm_conv_messages').select('*').order('created_at',{ascending:true})
      const { data } = ids.length > 1 ? await query.in('conv_id', ids) : await query.eq('conv_id', convId)
      if (data) {
        const visible = data
          .map(m => ({...m, content: extractVisibleMessageContent(m.content)}))
          .filter(m => !m.internal && m.content && !isInternalSystemContent(m.content))
        setConvMessages(prev => ({...prev, [convId]: visible}))
      }
    } catch(e) { console.warn('loadConvMessages error:', e) }
  }

  async function deleteConversation(conv) {
    if (!conv || !dbReady) return
    const ids = Array.from(new Set([conv.id, ...((conv && conv._mergedIds) || [])].filter(Boolean)))
    const label = conv.nombre || conv.telefono || 'esta conversación'
    const ok = window.confirm('¿Borrar ' + label + ' del panel?\n\nSe eliminarán la conversación y sus mensajes del CRM. No se borra el contacto de WhatsApp ni el lead asociado.')
    if (!ok) return

    try {
      await supabase.from('crm_conv_messages').delete().in('conv_id', ids)
      await supabase.from('crm_conversations').delete().in('id', ids)

      setConvMessages(prev => {
        const next = {...prev}
        ids.forEach(id => delete next[id])
        return next
      })
      setConversations(prev => prev.filter(c => !ids.includes(c.id)))
      if (activeConv && ids.includes(activeConv.id)) setActiveConv(null)
      msg('Conversación borrada del panel')
    } catch(e) {
      console.warn('deleteConversation error:', e)
      msg('No se pudo borrar la conversación')
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

  // ── Generador de clave temporal alfanumérica ───────────────────────────────
  function genTempPin(len = 8) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let result = ''
    // Garantizar al menos 1 letra y 1 número
    result += chars[Math.floor(Math.random() * 48)] // letra
    result += chars[48 + Math.floor(Math.random() * 8)] // número
    for (let i = 2; i < len; i++) result += chars[Math.floor(Math.random() * chars.length)]
    return result.split('').sort(() => Math.random() - 0.5).join('')
  }

  function validarClave(clave) {
    if (clave.length < 6)  return 'Mínimo 6 caracteres'
    if (clave.length > 12) return 'Máximo 12 caracteres'
    const tieneLetra  = /[a-zA-Z]/.test(clave)
    const tieneNumero = /[0-9]/.test(clave)
    // PINs de 4 dígitos numéricos siguen siendo válidos (compatibilidad)
    if (/^\d{4}$/.test(clave)) return null
    if (!tieneLetra)  return 'Debe contener al menos una letra'
    if (!tieneNumero) return 'Debe contener al menos un número'
    return null // válida
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  async function login() {
    const u = (users||[]).find(x => x.username === lu.trim().toLowerCase())
    if (!u || u.pin !== lp) { setLerr('Usuario o clave incorrectos'); return }
    setMe(u); setLerr(''); setLp(''); setLu('')
    // Si tiene clave temporal, mostrar pantalla de cambio forzado
    if (u.mustChange) {
      setNav('__cambiar_clave__')
    } else {
      setNav(u.role==='admin'||u.role==='partner'?'dashboard':u.role==='finanzas'?'dashboard_finanzas':u.role==='operaciones'?'operaciones':'broker_home')
    }
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

  // Olvidé mi clave
  async function olvideClave() {
    const username = lu.trim().toLowerCase()
    if (!username) { setLerr('Ingresa tu usuario primero'); return }
    const u = (users||[]).find(x => x.username === username)
    if (!u) { setLerr('Usuario no encontrado'); return }
    if (!u.email) { setLerr('Este usuario no tiene email registrado. Contacta al admin.'); return }
    setLerr('')
    const tempPin = genTempPin(8)
    // Guardar en DB con mustChange = true
    const nextUsers = users.map(x => x.id === u.id ? {...x, pin: tempPin, mustChange: true} : x)
    setUsers(nextUsers)
    if (dbReady) await supabase.from('crm_users').update({pin: tempPin, mustChange: true}).eq('id', u.id)
    // Enviar email + WhatsApp
    try {
      await fetch('/api/notify', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          type: 'reset_password',
          to: u.email,
          agentName: u.name,
          adminName: 'el sistema',
          username: u.username,
          tempPin,
          phone: u.phone || ''
        })
      })
    } catch(e) { console.warn('Reset email failed:', e) }
    setLerr('')
    setLu('')
    alert(`✅ Se envió una clave temporal al email${u.phone ? ' y WhatsApp' : ''} de ${u.name}. Revisa tu correo.`)
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  async function createUser() {
    if (!nu.name||!nu.username||!nu.rut||!nu.phone||!nu.email) { msg('Completa todos los campos'); return }
    if ((users||[]).find(u => u.username === nu.username.toLowerCase())) { msg('Usuario ya existe'); return }
    // Generar clave temporal automática
    const tempPin = genTempPin(8)
    const u = {id:'u-'+Date.now(), ...nu, username:nu.username.toLowerCase(), pin:tempPin, mustChange:true}
    await saveUsers([...users, u])
    // Enviar email + WhatsApp con clave temporal
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
            pin: tempPin,
            phone: nu.phone || '',
            role: nu.role
          })
        })
      } catch(e) { console.warn('Welcome email failed:', e) }
    }
    setNu(EU); setModal(null); msg(`Usuario creado — clave temporal enviada por email${nu.phone?' y WhatsApp':''}`)
  }
  async function deleteUser(id) {
    if (dbReady) await supabase.from('crm_users').delete().eq('id', id)
    await saveUsers(users.filter(u => u.id !== id))
    msg('Usuario eliminado')
  }
  async function saveProfile() {
    if (!editP.name?.trim()) { setProfErr('El nombre no puede estar vacío'); return }
    const fields = {name:editP.name.trim(), phone:editP.phone||'', email:editP.email||'', avatar_url:editP.avatar_url||''}
    const nextUsers = users.map(u => u.id === me.id ? {...u,...fields} : u)
    setUsers(nextUsers); setMe(m => ({...m,...fields}))
    localStorage.setItem('rcrm_profile_'+me.id, JSON.stringify(fields))
    if (dbReady) {
      try {
        const { error } = await supabase.from('crm_users').update(fields).eq('id', me.id)
        if (error) {
          // Si la tabla no tiene avatar_url, guardamos datos básicos y mantenemos la foto localmente.
          const basic = {name:fields.name, phone:fields.phone, email:fields.email}
          await supabase.from('crm_users').update(basic).eq('id', me.id)
          setProfErr('Datos guardados. Para guardar la foto en Supabase agrega la columna avatar_url.')
          msg('Perfil actualizado parcialmente')
          return
        }
      } catch(e) {
        setProfErr('No se pudo guardar en Supabase. Quedó guardado localmente.')
        msg('Perfil guardado localmente')
        return
      }
    } else {
      localStorage.setItem('rcrm_users', JSON.stringify(nextUsers))
    }
    setModal(null); setProfErr(''); msg('Perfil actualizado')
  }
  async function changePin() {
    if (pinF.cur !== me.pin) { setPinErr('Clave actual incorrecta'); return }
    const err = validarClave(pinF.n1)
    if (err) { setPinErr(err); return }
    if (pinF.n1 !== pinF.n2) { setPinErr('Las claves no coinciden'); return }
    const nextUsers = users.map(u => u.id === me.id ? {...u, pin:pinF.n1, mustChange:false} : u)
    setUsers(nextUsers); setMe(m => ({...m, pin:pinF.n1, mustChange:false}))
    if (dbReady) {
      const { error } = await supabase.from('crm_users').update({pin:pinF.n1, mustChange:false}).eq('id', me.id)
      if (error) { setPinErr('No se pudo guardar la clave en Supabase'); return }
    } else {
      localStorage.setItem('rcrm_users', JSON.stringify(nextUsers))
    }
    setPinF({cur:'',n1:'',n2:''}); setPinErr(''); setModal(null); msg('Clave actualizada ✅')
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
    const lead = leads.find(l => l.id === lid)
    // Block brokers from moving leads once Operaciones owns the workflow
    if (me?.role === 'agent' && OPS_LOCKED_STAGES.includes(lead?.stage)) {
      msg('Este lead está en gestión de Operaciones — solo ellos pueden moverlo')
      return
    }
    if (sid==='perdido') { setLossTgt(lid); setLossR(LOSS_REASONS[0]); setLossOth(''); setModal('lost'); return }

    // Reserva: se registra la operación. No se suben documentos aquí.
    if (sid === 'reserva') {
      const existingProps = lead?.propiedades || []
      setEditingProps(existingProps.length > 0 ? [...existingProps] : [{...EMPTY_PROP, id:'p-'+Date.now(), fecha_reserva:new Date().toISOString().slice(0,10)}])
      setPendingStage({leadId:lid, stageId:sid})
      setPropModal(lid)
      return
    }

    // Solicitud de promesa / promesa / escritura: solo Admin u Operaciones.
    // En Solicitud de promesa se cargan y revisan los documentos esenciales.
    if (RESTRICTED_STAGES.includes(sid)) {
      if (me?.role !== 'admin' && me?.role !== 'operaciones') { msg('Solo Operaciones o el Administrador puede mover a esta etapa'); return }
      const existingProps = lead?.propiedades || []
      if (sid === 'firma') {
        const ok = existingProps.length > 0 && existingProps.every(p => docsPromesaProgress(p).pct >= 100)
        if (!ok) { msg('Antes de firma de promesa deben estar cargados los documentos esenciales'); return }
      }
      setEditingProps(existingProps.length > 0 ? [...existingProps] : [{...EMPTY_PROP, id:'p-'+Date.now()}])
      setPendingStage({leadId:lid, stageId:sid})
      setPropModal(lid)
      return
    }
    // Contactado: broker debe indicar medio de contacto
    if (sid === 'contactado') {
      setContactModal({ leadId: lid })
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
    // Targeted update of only stage fields — avoids overwriting other data.
    // Fallbacks prevent the lead from returning to the previous stage if Supabase lacks optional columns.
    if (dbReady && changedLead) {
      await updateCrmLeadSafe(lid, [
        {
          stage: changedLead.stage,
          stage_moved_at: changedLead.stage_moved_at,
          loss_reason: changedLead.loss_reason,
          stage_history: changedLead.stage_history
        },
        {
          stage: changedLead.stage,
          stage_moved_at: changedLead.stage_moved_at,
          loss_reason: changedLead.loss_reason
        },
        { stage: changedLead.stage, stage_moved_at: changedLead.stage_moved_at },
        { stage: changedLead.stage }
      ], 'stage')
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

  async function updateCrmLeadSafe(id, payloads, label='lead') {
    if (!dbReady) return true
    let lastError = null
    for (const payload of payloads) {
      const clean = Object.fromEntries(Object.entries(payload || {}).filter(([_, v]) => v !== undefined))
      if (!Object.keys(clean).length) continue
      const { error } = await supabase.from('crm_leads').update(clean).eq('id', id)
      if (!error) return true
      lastError = error
      console.warn('Supabase update fallback failed for '+label, error, clean)
    }
    if (lastError) msg('No se pudo guardar completamente en Supabase. Revisa columnas de crm_leads.')
    return false
  }

  async function savePropField(leadId, propId, fields, auditLabel='Actualización operación') {
    // Update a single property's fields without changing stage. Guarda trazabilidad por operación.
    const updated = leads.map(l => {
      if (l.id !== leadId) return l
      const props = (l.propiedades||[]).map(p => {
        if (p.id !== propId) return p
        const logItem = {
          at: new Date().toISOString(),
          by: me?.name || 'Sistema',
          role: me?.role || '',
          action: auditLabel,
          fields: Object.keys(fields || {}).filter(k => k !== 'operational_log')
        }
        return {...p, ...fields, operational_log:[...(p.operational_log||[]), logItem].slice(-60)}
      })
      return {...l, propiedades: props}
    })
    const changedLead = updated.find(l => l.id === leadId)
    setLeads(updated)
    if (sel?.id===leadId) setSel(changedLead)
    if (dbReady && changedLead) {
      await supabase.from('crm_leads').update({propiedades: changedLead.propiedades}).eq('id', leadId)
    } else {
      localStorage.setItem('rcrm_leads', JSON.stringify(updated))
    }
  }

  async function savePropiedades(leadId, props, stageId) {
    const nowIso = new Date().toISOString()
    const today = nowIso.slice(0,10)
    const calculatedProps = props.map(p => {
      const base = calcProp(p)
      const logItem = stageId ? {at:nowIso, by:me?.name||'Sistema', role:me?.role||'', action:'Movimiento a '+(stages.find(s=>s.id===stageId)?.label||stageId), fields:['stage']} : null
      const stageFields = stageId==='reserva'
        ? {fecha_reserva:base.fecha_reserva||today, estado_operativo:base.estado_operativo||'handoff_pendiente'}
        : stageId==='solicitud_promesa'
          ? {solicitud_promesa_fecha:base.solicitud_promesa_fecha||today, estado_operativo:'solicitud_promesa'}
          : stageId==='firma'
            ? {promesa_firmada:base.promesa_firmada||today, estado_operativo:'promesa', estado_financiero:base.estado_financiero==='no_devengado'?'solicitar_oc':base.estado_financiero}
            : stageId==='escritura'
              ? {escritura_firmada:base.escritura_firmada||today, estado_operativo:'escritura'}
              : {}
      return {...base, ...stageFields, operational_log: logItem ? [...(base.operational_log||[]), logItem].slice(-60) : (base.operational_log||[])}
    })
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
    // Targeted update con fallbacks: si Supabase no tiene columnas opcionales, igual guarda stage + propiedades.
    if (dbReady && changedLead) {
      const basePayload = stageId ? {
        propiedades: changedLead.propiedades,
        stage: changedLead.stage,
        stage_moved_at: changedLead.stage_moved_at,
        stage_history: changedLead.stage_history,
        uf_cierre: changedLead.uf_cierre || null
      } : { propiedades: changedLead.propiedades }
      await updateCrmLeadSafe(leadId, stageId ? [
        basePayload,
        {
          propiedades: changedLead.propiedades,
          stage: changedLead.stage,
          stage_moved_at: changedLead.stage_moved_at,
          stage_history: changedLead.stage_history
        },
        { propiedades: changedLead.propiedades, stage: changedLead.stage, stage_moved_at: changedLead.stage_moved_at },
        { propiedades: changedLead.propiedades, stage: changedLead.stage },
        { stage: changedLead.stage }
      ] : [{ propiedades: changedLead.propiedades }], 'propiedades/stage')
    } else {
      localStorage.setItem('rcrm_leads', JSON.stringify(updated))
    }
    setPropModal(null); setPendingStage(null); setEditingProps([])
    msg(stageId ? 'Propiedades guardadas y etapa actualizada' : 'Propiedades guardadas')

    // ── Notificaciones automáticas al llegar a Reserva ───────────────────────
    if (stageId === 'reserva') {
      const lead = leads.find(l => l.id === leadId)
      const agent = (users||[]).find(u => u.id === lead?.assigned_to)
      const opsUsers = (users||[]).filter(u => u.role === 'operaciones' || u.role === 'admin')
      const notifyPayload = {
        type: 'reserva_documentos',
        agentName: agent?.name || 'Broker',
        leadNombre: lead?.nombre || 'el cliente',
        leadId,
        agentEmail: agent?.email,
        agentPhone: agent?.phone,
        opsEmails: opsUsers.map(u=>u.email).filter(Boolean),
        opsPhones: opsUsers.map(u=>u.phone).filter(Boolean),
        reminderDays: 3
      }
      fetch('/api/notify', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(notifyPayload)
      }).catch(()=>{})
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
    <RabbitsLogo size={28}/> Cargando Rabbitts Capital...
  </div>

  const isAdmin    = me?.role === 'admin'
  const isPartner  = me?.role === 'partner'
  const isAgent    = me?.role === 'agent' || me?.role === 'team_leader'
  const isTeamLeader = me?.role === 'team_leader'
  const isOps      = me?.role === 'operaciones'
  const isFinanzas = me?.role === 'finanzas'
  const adminSideNav = !isMobile  // Sidebar izquierdo para todos los roles en desktop

  const OPS_STAGES = ['reserva','solicitud_promesa','firma','escritura','perdido']
  const vL = !me ? [] : isAdmin
    ? leads.filter(l => (fa==='all'||(fa===''?(!l.assigned_to):l.assigned_to===fa)) && (fs==='all'||l.stage===fs) && (ft==='all'||l.tag===ft))
    : isPartner ? leads.filter(l => l.tag==='pool')
    : isOps     ? leads.filter(l => OPS_STAGES.includes(l.stage))
    : isTeamLeader
    ? leads.filter(l => {
        const myTeamIds = (users||[]).filter(u=>u.team_leader_id===me.id).map(u=>u.id)
        const isMyLead = l.assigned_to===me.id || myTeamIds.includes(l.assigned_to)
        const searchMatch = !brokerSearch || [l.nombre,l.telefono,l.email,l.rut].join(' ').toLowerCase().includes(brokerSearch.toLowerCase())
        return isMyLead && searchMatch
      })
    : isFinanzas ? leads.filter(l => ['firma','escritura','ganado'].includes(l.stage))  // finanzas: solo firma promesa, escritura y ganado
    : leads.filter(l => l.assigned_to===me.id && (!brokerSearch || [l.nombre,l.telefono,l.email,l.rut].join(' ').toLowerCase().includes(brokerSearch.toLowerCase())))

  const mpVisible = marketplaceConfig.url && (marketplaceConfig.allowRoles||[]).includes(me?.role) && marketplaceConfig.enabled
  const NAV = isAdmin    ? ['dashboard','kanban','lista','operaciones','finanzas_360','usuarios','ranking','ia','conversaciones','rabito_interno','visitas','condiciones','agenda','etapas','importar','extraer','marketplace']
            : isPartner  ? ['dashboard','pool',                                                                                                          ...(mpVisible?['marketplace']:[]) ]
            : isOps      ? ['operaciones','kanban','lista','visitas','rabito_interno','usuarios']
            : isFinanzas ? ['dashboard_finanzas','finanzas_360','kanban','rabito_interno']
            :              ['broker_home','kanban','lista','mis_notas','condiciones','portal_broker',...(isTeamLeader?['team_dashboard']:[]),'mis_visitas','mi agenda','nuevo lead',...(mpVisible?['marketplace']:[]) ]

  const NAV_LABELS = {
    broker_home:'Inicio', dashboard:'Dashboard', kanban:'Leads', lista:'Lista', mis_notas:'Mis Notas', usuarios:'Usuarios', ranking:'Ranking', finanzas:'Finanzas', ia:'Panel IA', conversaciones:'WhatsApp', agenda:'Agenda', etapas:'Etapas', importar:'Importar', extraer:'Extraer', marketplace:'Marketplace',
    operaciones:'Operaciones 360', condiciones:'Condiciones Comerciales', finanzas_360:'Finanzas 360', portal_broker:'Mis Comisiones', mi_equipo:'Mi Equipo', rabito_interno:'Rabito Interno', pool:'Pool', dashboard_finanzas:'Dashboard Finanzas', comisiones:'Comisiones Brokers', 'mis comisiones':'Mis Comisiones', 'mi agenda':'Mi Agenda', 'nuevo lead':'Nuevo Lead','team_dashboard':'Mi Equipo','visitas':'Visitas','mis_visitas':'Mis Visitas'
  }
  const navLabel = n => NAV_LABELS[n] || n.charAt(0).toUpperCase()+n.slice(1).replace('_',' ')

  // ── AGENDA PÚBLICA — no requiere login ─────────────────────────────────────
  if (typeof window !== 'undefined' && (window.location.pathname === '/agenda' || window.location.pathname.startsWith('/reservar/'))) {
    const savedSettings = JSON.parse(localStorage.getItem('rcrm_agenda_settings')||'{}')
    const brokerSlug = window.location.pathname.startsWith('/reservar/')
      ? decodeURIComponent(window.location.pathname.replace('/reservar/','').split('/')[0] || '')
      : ''
    return <AgendaPublicaView settings={savedSettings} brokerSlug={brokerSlug}/>
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (!me) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:32,background:'linear-gradient(135deg,#E8EFFE 0%,#f0f4ff 100%)'}}>
      <div style={{width:'100%',maxWidth:360}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',marginBottom:28,gap:isMobile?8:12}}>
          <RabbitsLogo size={80}/>
          <div style={{textAlign:'center'}}>
            <div style={{fontWeight:800,fontSize:22,color:B.primary,letterSpacing:'-0.5px'}}>Rabbitts Capital</div>
            <div style={{fontSize:12,color:B.mid,fontWeight:500,letterSpacing:'0.5px',textTransform:'uppercase'}}>CRM Inmobiliario</div>
          </div>
        </div>
        <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,padding:28,boxShadow:'0 4px 24px rgba(27,79,200,0.10)'}}>
          <Fld label="Usuario"><input value={lu} onChange={e=>setLu(e.target.value)} placeholder="tu.usuario" style={sty.inp}/></Fld>
          <Fld label="Clave"><input type="password" value={lp} onChange={e=>setLp(e.target.value)} onKeyDown={e=>e.key==='Enter'&&login()} placeholder="••••" style={sty.inp}/></Fld>
          {lerr && <p style={{margin:'0 0 10px',fontSize:12,color:'#991b1b'}}>{lerr}</p>}
          <button onClick={login} style={{...sty.btnP,width:'100%',padding:'11px 16px',fontSize:14,borderRadius:10}}>Ingresar</button>
          <button onClick={olvideClave}
            style={{width:'100%',marginTop:10,padding:'8px',background:'none',border:'none',
              fontSize:12,color:B.mid,cursor:'pointer',textDecoration:'underline'}}>
            Olvidé mi clave
          </button>
        </div>
        {!dbReady && <p style={{textAlign:'center',fontSize:11,color:'#9ca3af',marginTop:12}}>⚠ Modo offline — configura Supabase para datos persistentes entre dispositivos</p>}
      </div>
    </div>
  )
  // ── CAMBIO FORZADO DE CLAVE ────────────────────────────────────────────────
  if (me && nav === '__cambiar_clave__') {
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',
        padding:32,background:'linear-gradient(135deg,#E8EFFE 0%,#f0f4ff 100%)'}}>
        <div style={{width:'100%',maxWidth:380}}>
          <div style={{textAlign:'center',marginBottom:24}}>
            <div style={{fontSize:40,marginBottom:8}}>🔐</div>
            <div style={{fontWeight:800,fontSize:20,color:B.primary}}>Crea tu nueva clave</div>
            <div style={{fontSize:13,color:B.mid,marginTop:6}}>
              Tu clave temporal ha expirado. Debes crear una nueva para continuar.
            </div>
          </div>
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,padding:28,
            boxShadow:'0 4px 24px rgba(27,79,200,0.10)'}}>
            <ForzarCambioClaveForm
              me={me} users={users} setUsers={setUsers} setMe={setMe}
              dbReady={dbReady} supabase={supabase}
              validarClave={validarClave}
              onSuccess={() => {
                setNav(me.role==='admin'||me.role==='partner'?'dashboard':me.role==='finanzas'?'dashboard_finanzas':me.role==='operaciones'?'operaciones':'broker_home')
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  // ── APP ────────────────────────────────────────────────────────────────────
  return (
    <div style={{fontFamily:'Inter,"SF Pro Display",-apple-system,BlinkMacSystemFont,sans-serif',minHeight:'100vh',background:'#F8FAFC'}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; font-family: 'Inter', sans-serif; }
        body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; letter-spacing: -0.01em; }
        body { margin: 0; -webkit-text-size-adjust: 100%; }
        input, textarea, select, button { font-family: inherit; -webkit-appearance: none; }
        @media (max-width: 767px) {
          input, select, textarea {
            font-size: 16px !important;
            padding: 10px 12px !important;
            min-height: 44px;
          }
          button {
            min-height: 40px;
          }
          .rcrm-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .rcrm-grid-2 { grid-template-columns: 1fr !important; }
          .rcrm-grid-3 { grid-template-columns: 1fr !important; }
          .rcrm-hide-mobile { display: none !important; }
          .rcrm-full-mobile { width: 100% !important; min-width: 0 !important; }
          .rcrm-card { padding: 10px !important; border-radius: 10px !important; }
          h2, .rcrm-title { font-size: 15px !important; }
        }
        @media (min-width: 768px) {
          .rcrm-hide-desktop { display: none !important; }
        }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #F8FAFC; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 99px; }
        input:focus, select:focus, textarea:focus { border-color: #2563EB !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.1) !important; }
        button { transition: opacity .15s, transform .1s; }
        button:active { transform: scale(0.97); }
        .rcrm-card { box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04) !important; }
      `}</style>
      <Toast msg={toast}/>

      {/* Google Calendar Meeting Modal */}
      {gcalModal && (
        <Modal title="Agendar reunión en Google Calendar" onClose={()=>{setGcalModal(null);setGcalResult(null);setGcalForm({fecha:'',hora:'09:00',duracion:60,notas:''})}}>
          {gcalResult ? (
            <div>
              <div style={{textAlign:'center',padding:'16px 0'}}>
                <div style={{fontSize:40,marginBottom:8}}>📅</div>
                <div style={{fontWeight:700,fontSize:16,color:'#14532d',marginBottom:4}}>¡Reunión agendada!</div>
                <div style={{fontSize:13,color:'#6b7280',marginBottom:16}}>{gcalModal.nombre} recibirá la invitación por email</div>
                {gcalResult.meetLink && (
                  <a href={gcalResult.meetLink} target="_blank" rel="noopener noreferrer"
                    style={{display:'inline-flex',alignItems:'center',gap:6,padding:'8px 16px',borderRadius:8,background:'#1a73e8',color:'#fff',textDecoration:'none',fontSize:13,fontWeight:600,marginBottom:8}}>
                    🎥 Unirse a Google Meet
                  </a>
                )}
                <br/>
                <a href={gcalResult.eventLink} target="_blank" rel="noopener noreferrer"
                  style={{fontSize:12,color:'#2563EB'}}>Ver en Google Calendar</a>
              </div>
              <button onClick={()=>{setGcalModal(null);setGcalResult(null)}} style={{...sty.btnP,width:'100%'}}>Cerrar</button>
            </div>
          ) : (
            <div>
              <div style={{padding:'10px 12px',background:'#EFF6FF',borderRadius:8,fontSize:12,color:'#1D4ED8',marginBottom:14}}>
                📅 Agendando reunión para <strong>{gcalModal.nombre}</strong>
                {gcalModal.email&&gcalModal.email!=='—'&&<span> · Se enviará invitación a <strong>{gcalModal.email}</strong></span>}
              </div>
              {/* Broker selector */}
              {(() => {
                const broker = (users||[]).find(u=>u.id===gcalModal.assigned_to)
                const gcalBroker = broker?.google_tokens ? broker : (users||[]).find(u=>u.google_tokens)
                return gcalBroker ? (
                  <div style={{padding:'8px 10px',background:'#DCFCE7',borderRadius:8,fontSize:12,color:'#14532d',marginBottom:12}}>
                    ✅ Usando calendario de <strong>{gcalBroker.name}</strong> ({gcalBroker.google_tokens.email})
                  </div>
                ) : (
                  <div style={{padding:'8px 10px',background:'#FEF2F2',borderRadius:8,fontSize:12,color:'#991b1b',marginBottom:12}}>
                    ⚠️ Ningún broker tiene Google Calendar conectado.
                    <button onClick={()=>window.location.href=`/api/auth?action=login&userId=${me.id}`}
                      style={{display:'block',marginTop:6,fontSize:12,padding:'5px 12px',borderRadius:6,border:'1px solid #dc2626',background:'#fff',color:'#dc2626',cursor:'pointer'}}>
                      Conectar mi Google Calendar
                    </button>
                  </div>
                )
              })()}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
                <Fld label="Fecha">
                  <input type="date" value={gcalForm.fecha} min={new Date().toISOString().split('T')[0]}
                    onChange={e=>setGcalForm(f=>({...f,fecha:e.target.value}))} style={sty.inp}/>
                </Fld>
                <Fld label="Hora">
                  <input type="time" value={gcalForm.hora}
                    onChange={e=>setGcalForm(f=>({...f,hora:e.target.value}))} style={sty.inp}/>
                </Fld>
              </div>
              <Fld label="Duración">
                <select value={gcalForm.duracion} onChange={e=>setGcalForm(f=>({...f,duracion:parseInt(e.target.value)}))} style={sty.sel}>
                  <option value={30}>30 minutos</option>
                  <option value={60}>1 hora</option>
                  <option value={90}>1.5 horas</option>
                  <option value={120}>2 horas</option>
                </select>
              </Fld>
              <div style={{marginTop:10}}>
                <Fld label="Notas para la reunión (opcional)">
                  <textarea value={gcalForm.notas} onChange={e=>setGcalForm(f=>({...f,notas:e.target.value}))}
                    placeholder="Ej: Cliente interesado en Wynwood, renta $2.5M..."
                    style={{...sty.inp,minHeight:60,resize:'none'}}/>
                </Fld>
              </div>
              <button onClick={()=>{
                const broker = (users||[]).find(u=>u.id===gcalModal.assigned_to)
                const gcalBroker = broker?.google_tokens ? broker : (users||[]).find(u=>u.google_tokens)
                if (!gcalBroker) return
                if (!gcalForm.fecha) return msg('Selecciona una fecha')
                createCalendarEvent(gcalModal, gcalBroker)
              }} disabled={gcalLoading||!gcalForm.fecha}
                style={{...sty.btnP,width:'100%',marginTop:14,opacity:gcalLoading||!gcalForm.fecha?0.5:1}}>
                {gcalLoading ? 'Creando evento...' : '📅 Crear reunión en Google Calendar'}
              </button>
            </div>
          )}
        </Modal>
      )}

      {/* PWA Install Banner */}
      {showInstallBanner && (
        <div style={{position:'fixed',bottom:isMobile?80:20,left:'50%',transform:'translateX(-50%)',
          background:'#0F172A',color:'#fff',borderRadius:14,padding:'12px 16px',
          display:'flex',alignItems:'center',gap:12,zIndex:9999,
          boxShadow:'0 8px 32px rgba(0,0,0,0.3)',maxWidth:340,width:'calc(100% - 32px)'}}>
          <img src="/icon-72.png" style={{width:36,height:36,borderRadius:8,objectFit:'cover',flexShrink:0}} alt="logo"/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:13}}>Instalar Rabbitts Capital</div>
            <div style={{fontSize:11,color:'#94a3b8',marginTop:1}}>Acceso rápido desde tu pantalla de inicio</div>
          </div>
          <div style={{display:'flex',gap:6,flexShrink:0}}>
            <button onClick={async()=>{
              if (!installPrompt) return
              installPrompt.prompt()
              const {outcome} = await installPrompt.userChoice
              setInstallPrompt(null)
              setShowInstallBanner(false)
            }} style={{padding:'7px 14px',borderRadius:8,border:'none',background:'#2563EB',
              color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer'}}>
              Instalar
            </button>
            <button onClick={()=>setShowInstallBanner(false)}
              style={{padding:'7px 10px',borderRadius:8,border:'none',background:'rgba(255,255,255,0.1)',
                color:'#94a3b8',fontSize:12,cursor:'pointer'}}>
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Topbar */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:isMobile?'8px 12px':'10px 16px',borderBottom:'2px solid '+B.primary,background:'#fff',position:'sticky',top:0,zIndex:100,boxShadow:'0 2px 12px rgba(27,79,200,0.08)',gap:6,minHeight:isMobile?52:56}}>
        <div style={{display:'flex',alignItems:'center',gap:isMobile?8:12}}>
          <div style={{display:'flex',alignItems:'center',gap:isMobile?6:8,marginLeft:'auto',flexShrink:0}}>
            <RabbitsLogo size={isMobile?28:34}/>
            {!isMobile && <div>
              <div style={{fontWeight:800,fontSize:13,color:B.primary,lineHeight:1}}>Rabbitts Capital</div>
              <div style={{fontSize:9,color:B.mid,fontWeight:600,letterSpacing:'0.5px',textTransform:'uppercase'}}>CRM</div>
            </div>}
          </div>
          {/* Desktop nav */}
          {!isMobile && !adminSideNav && <div style={{display:'flex',gap:2,flexWrap:'wrap'}}>
            {NAV.map(n => (
              <button key={n} onClick={()=>setNav(n)} style={{fontSize:13,padding:'5px 12px',borderRadius:8,border:'none',background:nav===n?B.light:'transparent',cursor:'pointer',color:nav===n?B.primary:'#6b7280',fontWeight:nav===n?700:400}}>
                {navLabel(n)}
              </button>
            ))}
          </div>}
          {/* Mobile: current page title */}
          {isMobile && <span style={{fontSize:14,fontWeight:700,color:B.primary}}>{navLabel(nav)}</span>}
        </div>
        {/* Financial indicators - hide on mobile */}
        {!isMobile && <div style={{display:'flex',gap:6,alignItems:'center',marginLeft:'auto',flexWrap:'wrap'}}>
          {indicators.uf && (
            <div style={{display:'flex',alignItems:'center',gap:5,background:'#E8EFFE',borderRadius:8,padding:'4px 10px',border:'1px solid #A8C0F0'}}>
              <span style={{fontSize:10,fontWeight:700,color:B.primary}}>UF</span>
              <span style={{fontSize:12,fontWeight:700,color:B.primary}}>${indicators.uf}</span>
            </div>
          )}
          {indicators.dolar && (
            <div style={{display:'flex',alignItems:'center',gap:5,background:'#F0FDF4',borderRadius:8,padding:'4px 10px',border:'1px solid #86efac'}}>
              <span style={{fontSize:10,fontWeight:700,color:'#166534'}}>USD</span>
              <span style={{fontSize:12,fontWeight:700,color:'#166534'}}>${indicators.dolar}</span>
            </div>
          )}
          <div style={{display:'flex',alignItems:'center',gap:5,background:'#F9FAFB',borderRadius:8,padding:'4px 10px',border:'1px solid #e5e7eb'}}>
            <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>
              {new Date().toLocaleDateString('es-CL',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).replace(/^\w/,c=>c.toUpperCase())}
            </span>
          </div>
        </div>}

        <div style={{display:'flex',alignItems:'center',gap:isMobile?6:8}}>
          <AV name={me.name} size={isMobile?30:28} src={me.avatar_url||null}/>
          {!isMobile && <span style={{fontSize:13,color:'#6b7280',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{me.name}</span>}
          {!isMobile && <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:isAdmin?B.light:isPartner?'#F5F3FF':isOps?'#FEF9C3':isFinanzas?'#F0FDF4':'#EFF6FF',color:isAdmin?B.primary:isPartner?'#5b21b6':isOps?'#713f12':isFinanzas?'#166534':'#1d4ed8',fontWeight:700}}>{me.role}</span>}
          {!isAdmin && (
            <div style={{position:'relative'}}>
              <button onClick={()=>{setShowNotifs(v=>!v);setNotifications(n=>n.map(x=>({...x,read:true})))}} style={{fontSize:isMobile?18:12,padding:isMobile?'6px':'4px 10px',borderRadius:8,border:'1px solid #E2E8F0',background:'transparent',cursor:'pointer',color:B.mid,position:'relative',width:isMobile?36:undefined,height:isMobile?36:undefined,display:'flex',alignItems:'center',justifyContent:'center'}}>
                🔔
                {notifications.filter(n=>!n.read).length>0 && (
                  <span style={{position:'absolute',top:-4,right:-4,width:16,height:16,borderRadius:'50%',background:'#E24B4A',color:'#fff',fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {notifications.filter(n=>!n.read).length}
                  </span>
                )}
              </button>
              {showNotifs && (
                <div style={{position:'absolute',top:36,right:0,width:320,background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,boxShadow:'0 8px 32px rgba(27,79,200,0.15)',zIndex:500,maxHeight:360,overflowY:'auto'}}>
                  <div style={{padding:'10px 14px',borderBottom:'1px solid #f0f4ff',fontWeight:700,fontSize:13,color:B.primary}}>Notificaciones</div>
                  {notifications.length===0 && <div style={{padding:'20px 14px',fontSize:12,color:'#9ca3af',textAlign:'center'}}>Sin notificaciones</div>}
                  {notifications.map(n=>(
                    <div key={n.id} onClick={()=>{setShowNotifs(false);const l=leads.find(x=>x.id===n.leadId);if(l){setSel(l);setModal('lead')}}} style={{padding:'10px 14px',borderBottom:'1px solid #f0f4ff',cursor:'pointer',background:n.read?'#fff':B.light}}>
                      <div style={{fontSize:12,color:'#0F172A',lineHeight:1.5}}>{n.text}</div>
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
          {!isMobile && <button onClick={()=>{setEditP({name:me.name,phone:me.phone||'',email:me.email||'',avatar_url:me.avatar_url||''});setPinF({cur:'',n1:'',n2:''});setPinErr('');setProfErr('');setModal('profile')}} style={{fontSize:12,padding:'4px 10px',borderRadius:8,border:'1px solid #E2E8F0',background:'transparent',cursor:'pointer',color:B.mid}}>Mi perfil</button>}
          {!isMobile && <button onClick={()=>{setMe(null);localStorage.removeItem('rcrm_session')}} style={{fontSize:12,padding:'4px 10px',borderRadius:8,border:'none',background:'transparent',cursor:'pointer',color:'#9ca3af'}}>Salir</button>}
          {isMobile && (
            <button onClick={()=>setMobileMenuOpen(v=>!v)}
              style={{width:38,height:38,borderRadius:10,border:'none',background:B.light,cursor:'pointer',color:B.primary,fontSize:20,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginLeft:4}}>
              ☰
            </button>
          )}
        </div>
      </div>

      {/* Mobile slide menu */}
      {isMobile && mobileMenuOpen && (
        <div style={{position:'fixed',inset:0,zIndex:200}} onClick={()=>setMobileMenuOpen(false)}>
          <div style={{position:'absolute',top:0,left:0,width:'75%',maxWidth:280,height:'100%',background:'#fff',boxShadow:'4px 0 24px rgba(0,0,0,0.15)',padding:'16px',display:'flex',flexDirection:'column',gap:4,overflowY:'auto'}}
            onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,paddingBottom:12,borderBottom:'1px solid #f0f4ff'}}>
              <AV name={me.name} size={36} src={me.avatar_url||null}/>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:'#0F172A'}}>{me.name}</div>
                <div style={{fontSize:11,color:'#9ca3af'}}>{me.role}</div>
              </div>
            </div>
            {NAV.map(n => {
              const icons = {broker_home:'🏠',dashboard:'📊',kanban:'📋',lista:'📝',mis_notas:'📓',usuarios:'👥',ranking:'🏆',finanzas:'💰',ia:'🤖',conversaciones:'💬',rabito_interno:'🐰',operaciones:'🧩',finanzas_360:'🏦',condiciones:'📋',visitas:'📅',mis_visitas:'📅',agenda:'📅','mi agenda':'📅',etapas:'⚙️',importar:'📥',extraer:'🧠',marketplace:'🏪',pool:'🌐',comisiones:'💰','mis comisiones':'💵','portal_broker':'💵','team_dashboard':'👥','nuevo lead':'➕',dashboard_finanzas:'📊'}
              return (
                <button key={n} onClick={()=>{setNav(n);setMobileMenuOpen(false)}}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderRadius:10,border:'none',background:nav===n?B.light:'transparent',cursor:'pointer',color:nav===n?B.primary:'#374151',fontWeight:nav===n?700:400,fontSize:14,textAlign:'left',width:'100%'}}>
                  <span style={{fontSize:18}}>{icons[n]||'•'}</span>
                  {navLabel(n)}
                </button>
              )
            })}
            <div style={{marginTop:16,paddingTop:12,borderTop:'1px solid #f0f4ff',display:'flex',flexDirection:'column',gap:6}}>
              <button onClick={()=>{setEditP({name:me.name,phone:me.phone||'',email:me.email||'',avatar_url:me.avatar_url||''});setPinF({cur:'',n1:'',n2:''});setPinErr('');setProfErr('');setModal('profile');setMobileMenuOpen(false)}} style={{padding:'10px 14px',borderRadius:8,border:'1px solid #E2E8F0',background:'transparent',cursor:'pointer',color:B.mid,fontSize:13,textAlign:'left'}}>👤 Mi perfil</button>
              {installPrompt ? (
                <button onClick={async()=>{
                  installPrompt.prompt()
                  const {outcome} = await installPrompt.userChoice
                  setInstallPrompt(null); setShowInstallBanner(false); setMobileMenuOpen(false)
                }} style={{padding:'10px 14px',borderRadius:8,border:'1px solid #2563EB',background:'#EFF6FF',cursor:'pointer',color:'#2563EB',fontSize:13,textAlign:'left',fontWeight:600}}>
                  📲 Instalar app en este celular
                </button>
              ) : (
                <div style={{borderRadius:10,background:'#EFF6FF',border:'1px solid #BFDBFE',padding:'10px 14px'}}>
                  <div style={{fontWeight:700,fontSize:12,color:'#1D4ED8',marginBottom:8}}>📲 Instalar app</div>
                  <div style={{fontSize:12,color:'#1D4ED8',fontWeight:600,marginBottom:2}}>🤖 Android Chrome:</div>
                  <div style={{fontSize:12,color:'#475569',marginBottom:8}}>Tres puntos ⋮ → "Añadir a pantalla de inicio"</div>
                  <div style={{fontSize:12,color:'#1D4ED8',fontWeight:600,marginBottom:2}}>🍎 iPhone Safari:</div>
                  <div style={{fontSize:12,color:'#475569'}}>Botón compartir ↑ → "Añadir a pantalla de inicio"</div>
                </div>
              )}
              <button onClick={()=>{setMe(null);localStorage.removeItem('rcrm_session')}} style={{padding:'10px 14px',borderRadius:8,border:'none',background:'#FEF2F2',cursor:'pointer',color:'#991b1b',fontSize:13,textAlign:'left',fontWeight:600}}>🚪 Cerrar sesión</button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom navigation for agents */}
      {isMobile && isAgent && (
        <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',borderTop:'2px solid #dce8ff',display:'flex',zIndex:100,boxShadow:'0 -2px 12px rgba(27,79,200,0.08)'}}>
          {[
            {n:'broker_home', icon:'🏠', label:'Inicio'},
            {n:'kanban',      icon:'📋', label:'Leads'},
            {n:'portal_broker', icon:'💵', label:'Comisiones'},
            {n:'nuevo lead',  icon:'➕', label:'Nuevo'},
          ].map(({n,icon,label})=>(
            <button key={n} onClick={()=>setNav(n)}
              style={{flex:1,padding:'8px 4px',border:'none',background:'transparent',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:2,
                color:nav===n?B.primary:'#9ca3af'}}>
              <span style={{fontSize:20}}>{icon}</span>
              <span style={{fontSize:10,fontWeight:nav===n?700:400}}>{label}</span>
              {nav===n&&<div style={{width:20,height:2,background:B.primary,borderRadius:99}}/>}
            </button>
          ))}
        </div>
      )}

      {adminSideNav && (
        <aside style={{position:'fixed',top:68,left:14,width:190,maxHeight:'calc(100vh - 86px)',overflowY:'auto',background:'#fff',border:'1px solid #E2E8F0',borderRadius:16,padding:10,boxShadow:'0 8px 24px rgba(27,79,200,0.10)',zIndex:80}}>
          <div style={{fontSize:11,fontWeight:900,color:B.primary,textTransform:'uppercase',letterSpacing:.5,margin:'4px 8px 8px'}}>{isAdmin?'Admin':isPartner?'Partner':isOps?'Operaciones':isFinanzas?'Finanzas':'Mi menú'}</div>
          {NAV.map(n => {
            const icons = {dashboard:'📊',kanban:'📋',lista:'📝',operaciones:'🧩',finanzas_360:'🏦',usuarios:'👥',ranking:'🏆',finanzas:'💰',ia:'🤖',rabito_interno:'🐰',conversaciones:'💬',agenda:'📅','mi agenda':'📅',etapas:'⚙️',importar:'📥',extraer:'🧠',marketplace:'🏪',pool:'🌐','portal_broker':'💵','team_dashboard':'👥','condiciones':'📋','mis comisiones':'💵','nuevo lead':'➕','mi perfil':'👤',comisiones:'💰'}
            return <button key={n} onClick={()=>setNav(n)} style={{width:'100%',display:'flex',alignItems:'center',gap:9,textAlign:'left',fontSize:13,padding:'9px 10px',borderRadius:10,border:'none',background:nav===n?B.light:'transparent',cursor:'pointer',color:nav===n?B.primary:'#475569',fontWeight:nav===n?800:500,marginBottom:2}}>
              <span>{icons[n]||'•'}</span><span>{navLabel(n)}</span>
            </button>
          })}
        </aside>
      )}

      <div style={{padding:isMobile?'10px 8px':'16px',paddingLeft:adminSideNav?220:(isMobile?'8px':'16px'),paddingRight:isMobile?'8px':'16px',paddingBottom:isMobile&&isAgent?'80px':'16px'}}>

        {/* BROKER HOME */}
        {nav==='broker_home' && isAgent && (
          <BrokerHomeView
            leads={leads} users={users} stages={stages}
            commissions={commissions} indicators={indicators}
            me={me} setSel={setSel} setNav={setNav} setModal={setModal}
            dbReady={dbReady} supabase={supabase} setLeads={setLeads}
          />
        )}

        {/* KANBAN */}
        {(nav==='kanban'||nav==='pool') && (
          <div>
            <div style={{display:'flex',alignItems:isMobile?'flex-start':'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8,flexDirection:isMobile?'column':'row'}}>
              <div style={{display:'flex',gap:isMobile?6:8,flexWrap:'wrap',alignItems:'center'}}>
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
                {isAgent && (
                  <input
                    value={brokerSearch}
                    onChange={e=>setBrokerSearch(e.target.value)}
                    placeholder="🔍 Buscar por nombre, teléfono, email, RUT..."
                    style={{...sty.sel,width:260,padding:'6px 10px',fontSize:12}}
                  />
                )}
                {isAgent && brokerSearch && (
                  <button onClick={()=>setBrokerSearch('')} style={{...sty.btn,fontSize:11,padding:'4px 8px'}}>✕ Limpiar</button>
                )}
                <span style={{fontSize:12,color:B.mid,fontWeight:500}}>{(vL||[]).length} leads</span>
              </div>
              <div style={{display:'flex',gap:8}}>
                {isAdmin && <button onClick={exportCSV} style={sty.btnO}>Exportar CSV</button>}
                {(isAdmin||isAgent) && <button onClick={()=>setModal('newLead')} style={sty.btnP}>+ Nuevo lead</button>}
              </div>
            </div>
            {/* Scroll controls */}
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6}}>
              <button
                onClick={()=>{ const el=document.getElementById('kanban-scroll'); if(el) el.scrollBy({left:-280,behavior:'smooth'}) }}
                style={{padding:'4px 12px',borderRadius:8,border:'1px solid #E2E8F0',background:'#fff',cursor:'pointer',fontSize:16,color:'#1B4FC8',fontWeight:700,lineHeight:1}}>
                ‹
              </button>
              <button
                onClick={()=>{ const el=document.getElementById('kanban-scroll'); if(el) el.scrollBy({left:280,behavior:'smooth'}) }}
                style={{padding:'4px 12px',borderRadius:8,border:'1px solid #E2E8F0',background:'#fff',cursor:'pointer',fontSize:16,color:'#1B4FC8',fontWeight:700,lineHeight:1}}>
                ›
              </button>
            </div>
            <div id="kanban-scroll" style={{display:'flex',gap:10,overflowX:'auto',overflowY:'auto',alignItems:'flex-start',WebkitOverflowScrolling:'touch',scrollbarWidth:'thin',scrollbarColor:'#A8C0F0 #f0f4ff',height:'calc(100vh - '+(isMobile?'130px':'170px')+')',paddingBottom:8}}>
              {(isOps ? stages.filter(s=>OPS_STAGES.includes(s.id)) : isFinanzas ? stages.filter(s=>['firma','escritura','ganado'].includes(s.id)) : stages).map(st => {
                const cols = (vL||[]).filter(l=>l.stage===st.id)
                return (
                  <div key={st.id} style={{minWidth:200,flexShrink:0,display:'flex',flexDirection:'column'}}>
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
          <div style={{overflowX:isMobile?'auto':'visible'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,gap:8,flexWrap:'wrap'}}>
              {isAgent && (
                <div style={{fontSize:12,color:'#64748B'}}>
                  <span style={{fontWeight:700,color:'#0F172A'}}>{(vL||[]).filter(l=>daysIn(l)>=3&&!OPS_LOCKED_STAGES.includes(l.stage)).length}</span> leads necesitan atención ·{' '}
                  <span style={{fontWeight:700,color:B.primary}}>{(vL||[]).length}</span> total
                </div>
              )}
              {isAdmin && <button onClick={exportCSV} style={sty.btnO}>Exportar CSV</button>}
            </div>
            <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,overflow:'auto'}}>
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
                  {(isAgent
                    ? [...(vL||[])].sort((a,b) => {
                        // urgentes primero (no bloqueados, >=3d), luego el resto por días desc
                        const aUrgent = !OPS_LOCKED_STAGES.includes(a.stage) && daysIn(a)>=3 && !['ganado','perdido','desistio'].includes(a.stage)
                        const bUrgent = !OPS_LOCKED_STAGES.includes(b.stage) && daysIn(b)>=3 && !['ganado','perdido','desistio'].includes(b.stage)
                        if (aUrgent && !bUrgent) return -1
                        if (!aUrgent && bUrgent) return 1
                        return daysIn(b) - daysIn(a)
                      })
                    : (vL||[])
                  ).map(lead => {
                    const st = stages.find(x=>x.id===lead.stage)||stages[0]
                    const ag = (users||[]).find(u=>u.id===lead.assigned_to)
                    const cal = CAL[lead.calificacion]
                    const dias = daysIn(lead)
                    const isUrgent = isAgent && !OPS_LOCKED_STAGES.includes(lead.stage) && dias>=3 && !['ganado','perdido','desistio'].includes(lead.stage)
                    const rowBg = isUrgent ? (dias>=7?'#FFF8F8':'#FFFDF5') : 'transparent'
                    return (
                      <tr key={lead.id} onClick={()=>{setSel(lead);setModal('lead')}}
                        style={{borderBottom:'1px solid #f0f4ff',cursor:'pointer',background:rowBg,
                          borderLeft: isUrgent ? `3px solid ${dias>=7?'#dc2626':'#d97706'}` : '3px solid transparent'}}>
                        <td style={{padding:'9px 10px'}}><div style={{display:'flex',alignItems:'center',gap:7}}><AV name={lead.nombre} size={26}/><span style={{fontWeight:600,color:'#0F172A',maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.nombre}</span></div></td>
                        <td style={{padding:'9px 10px',whiteSpace:'nowrap'}}><WaLink phone={lead.telefono}/></td>
                        <td style={{padding:'9px 10px',color:'#6b7280',whiteSpace:'nowrap'}}>{lead.renta}</td>
                        <td style={{padding:'9px 10px'}}><Tag tag={lead.tag||'lead'} sm/></td>
                        <td style={{padding:'9px 10px'}}><span style={{fontSize:11,padding:'2px 8px',borderRadius:99,background:st.bg,color:st.col,fontWeight:600,whiteSpace:'nowrap'}}>{st.label}</span></td>
                        <td style={{padding:'9px 10px',fontSize:11,color:'#9ca3af',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{lead.loss_reason||'—'}</td>
                        <td style={{padding:'9px 10px'}}><Days d={dias}/></td>
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
        {nav==='usuarios' && (isAdmin||isOps) && (()=>{
          const [busqU, setBusqU] = React.useState('')
          const [selU,  setSelU]  = React.useState(null)
          const RC = {admin:[B.light,B.primary],agent:['#EFF6FF','#1d4ed8'],team_leader:['#F0FDF4','#7c3aed'],partner:['#F5F3FF','#5b21b6'],operaciones:['#FEF9C3','#713f12'],finanzas:['#F0FDF4','#166534']}
          const ROLE_LABEL = {admin:'Admin',agent:'Agente',team_leader:'Team Leader',operaciones:'Operaciones',finanzas:'Finanzas',partner:'Partner'}

          const filtrados = (users||[]).filter(u =>
            !busqU ||
            u.name?.toLowerCase().includes(busqU.toLowerCase()) ||
            u.username?.toLowerCase().includes(busqU.toLowerCase()) ||
            u.email?.toLowerCase().includes(busqU.toLowerCase()) ||
            u.role?.toLowerCase().includes(busqU.toLowerCase())
          )

          const uSelLeads   = selU ? leads.filter(l=>l.assigned_to===selU.id) : []
          const uSelSessions = selU ? sessions.filter(s=>s.user_id===selU.id) : []
          const now = new Date()
          const startOfMonth = new Date(now.getFullYear(),now.getMonth(),1)
          const selLastLogin = uSelSessions[0]?.logged_at ? new Date(uSelSessions[0].logged_at) : null
          const selMinsAgo   = selLastLogin ? Math.floor((now-selLastLogin)/60000) : null
          const selIsOnline  = selMinsAgo !== null && selMinsAgo < 30
          const selSessMonth = uSelSessions.filter(s=>new Date(s.logged_at)>=startOfMonth).length

          return (
            <div style={{display:'flex',gap:16,alignItems:'flex-start'}}>

              {/* ── Lista ── */}
              <div style={{flex:1,minWidth:0}}>
                {/* Header */}
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                  marginBottom:12,flexWrap:'wrap',gap:8}}>
                  <span style={{fontSize:14,fontWeight:700,color:B.primary}}>
                    {filtrados.length} de {(users||[]).length} usuarios
                  </span>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>setModal('importUsers')} style={{...sty.btnO,fontSize:12}}>📥 Importar masivo</button>
                    <button onClick={()=>setModal('newUser')} style={sty.btnP}>+ Nuevo usuario</button>
                  </div>
                </div>

                {/* Buscador */}
                <input
                  value={busqU} onChange={e=>setBusqU(e.target.value)}
                  placeholder="🔍 Buscar por nombre, usuario, email o rol..."
                  style={{...sty.inp,marginBottom:10,background:'#fff'}}
                />

                {/* Tabla */}
                <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,overflow:'hidden'}}>
                  {/* Cabecera */}
                  <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 2fr 80px 60px',
                    padding:'8px 14px',background:B.light,borderBottom:'1px solid #dce8ff',
                    fontSize:11,fontWeight:700,color:B.primary}}>
                    <span>Nombre</span>
                    <span>Rol</span>
                    <span>Email</span>
                    <span>Leads</span>
                    <span></span>
                  </div>

                  {filtrados.length === 0 && (
                    <div style={{padding:'32px',textAlign:'center',color:'#9ca3af',fontSize:13}}>
                      Sin resultados para "{busqU}"
                    </div>
                  )}

                  {filtrados.map((u, i) => {
                    const uL = leads.filter(l=>l.assigned_to===u.id)
                    const uSess = sessions.filter(s=>s.user_id===u.id)
                    const lastL = uSess[0]?.logged_at ? new Date(uSess[0].logged_at) : null
                    const minsA = lastL ? Math.floor((now-lastL)/60000) : null
                    const online = minsA !== null && minsA < 30
                    const [rb,rc] = RC[u.role]||RC.agent
                    const isSelected = selU?.id === u.id
                    return (
                      <div key={u.id}
                        onClick={()=>setSelU(isSelected?null:u)}
                        style={{
                          display:'grid',gridTemplateColumns:'2fr 1fr 2fr 80px 60px',
                          padding:'10px 14px',cursor:'pointer',
                          borderBottom: i<filtrados.length-1?'1px solid #f0f4ff':'none',
                          background: isSelected?B.light:'transparent',
                          transition:'background .1s'
                        }}>
                        {/* Nombre */}
                        <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
                          <div style={{position:'relative',flexShrink:0}}>
                            <AV name={u.name} size={30}/>
                            <div style={{position:'absolute',bottom:0,right:0,width:8,height:8,
                              borderRadius:'50%',background:online?'#22c55e':'#d1d5db',border:'2px solid #fff'}}/>
                          </div>
                          <div style={{minWidth:0}}>
                            <div style={{fontWeight:600,fontSize:13,color:'#0F172A',
                              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                              {u.name}
                            </div>
                            <div style={{fontSize:11,color:'#9ca3af'}}>@{u.username}
                              {u.mustChange && <span style={{marginLeft:6,color:'#d97706',fontWeight:600}}>⚠ clave temporal</span>}
                            </div>
                          </div>
                        </div>
                        {/* Rol */}
                        <div style={{display:'flex',alignItems:'center'}}>
                          <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,
                            background:rb,color:rc,fontWeight:700}}>
                            {ROLE_LABEL[u.role]||u.role}
                          </span>
                        </div>
                        {/* Email */}
                        <div style={{display:'flex',alignItems:'center',minWidth:0}}>
                          <span style={{fontSize:12,color:'#6b7280',overflow:'hidden',
                            textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.email||'—'}</span>
                        </div>
                        {/* Leads */}
                        <div style={{display:'flex',alignItems:'center'}}>
                          <span style={{fontSize:12,color:B.primary,fontWeight:600}}>{uL.length}</span>
                        </div>
                        {/* Acciones rápidas */}
                        <div style={{display:'flex',alignItems:'center',gap:4}}
                          onClick={e=>e.stopPropagation()}>
                          {u.id!==me.id && (
                            <button onClick={()=>deleteUser(u.id)}
                              style={{fontSize:10,padding:'2px 6px',borderRadius:5,
                                border:'1px solid #fca5a5',background:'#FEF2F2',
                                color:'#991b1b',cursor:'pointer'}}>✕</button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ── Tarjeta lateral ── */}
              {selU && (()=>{
                const [rb,rc] = RC[selU.role]||RC.agent
                return (
                  <div style={{width:isMobile?'100%':320,flexShrink:0,
                    background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,
                    padding:20,position:'sticky',top:16,
                    boxShadow:'0 4px 24px rgba(27,79,200,0.08)'}}>

                    {/* Header tarjeta */}
                    <div style={{display:'flex',justifyContent:'space-between',
                      alignItems:'flex-start',marginBottom:16}}>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{position:'relative'}}>
                          <AV name={selU.name} size={44}/>
                          <div style={{position:'absolute',bottom:0,right:0,width:12,height:12,
                            borderRadius:'50%',background:selIsOnline?'#22c55e':'#d1d5db',
                            border:'2px solid #fff'}}/>
                        </div>
                        <div>
                          <div style={{fontWeight:800,fontSize:15,color:'#0F172A'}}>{selU.name}</div>
                          <div style={{fontSize:11,color:'#9ca3af'}}>@{selU.username}</div>
                          <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,
                            background:rb,color:rc,fontWeight:700,marginTop:3,display:'inline-block'}}>
                            {ROLE_LABEL[selU.role]||selU.role}
                          </span>
                        </div>
                      </div>
                      <button onClick={()=>setSelU(null)}
                        style={{background:'none',border:'none',cursor:'pointer',
                          fontSize:18,color:'#9ca3af',lineHeight:1}}>×</button>
                    </div>

                    {/* Datos */}
                    <div style={{borderTop:'1px solid #f0f4ff',paddingTop:12,marginBottom:12}}>
                      {[
                        ['📞 Teléfono', selU.phone],
                        ['✉️ Email',    selU.email],
                        ['🪪 RUT',      selU.rut],
                      ].filter(([,v])=>v).map(([k,v])=>(
                        <div key={k} style={{display:'flex',justifyContent:'space-between',
                          marginBottom:6,fontSize:12}}>
                          <span style={{color:'#9ca3af'}}>{k}</span>
                          <span style={{color:'#374151',fontWeight:500,maxWidth:170,
                            textAlign:'right',overflow:'hidden',textOverflow:'ellipsis',
                            whiteSpace:'nowrap'}}>{v}</span>
                        </div>
                      ))}
                      {selU.mustChange && (
                        <div style={{background:'#FFFBEB',border:'1px solid #fcd34d',
                          borderRadius:6,padding:'6px 10px',fontSize:11,color:'#92400e',marginTop:6}}>
                          ⚠️ Tiene clave temporal pendiente de cambio
                        </div>
                      )}
                    </div>

                    {/* Stats */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:14}}>
                      {[
                        ['Leads activos', uSelLeads.filter(l=>!['ganado','perdido','desistio'].includes(l.stage)).length, B.primary],
                        ['Leads ganados', uSelLeads.filter(l=>l.stage==='ganado').length, '#14532d'],
                        ['Sesiones mes', selSessMonth, '#5b21b6'],
                        ['Última conexión',
                          selLastLogin
                            ? selMinsAgo < 60 ? selMinsAgo+'m atrás'
                              : selMinsAgo < 1440 ? Math.floor(selMinsAgo/60)+'h atrás'
                              : selLastLogin.toLocaleDateString('es-CL',{day:'2-digit',month:'short'})
                            : 'Nunca',
                          selIsOnline?'#166534':'#9ca3af'
                        ],
                      ].map(([label,val,col])=>(
                        <div key={label} style={{background:'#f9fbff',borderRadius:8,
                          padding:'8px 10px',textAlign:'center'}}>
                          <div style={{fontSize:18,fontWeight:800,color:col}}>{val}</div>
                          <div style={{fontSize:10,color:'#9ca3af',marginTop:1}}>{label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Acciones */}
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      <button onClick={()=>{setEditUser({...selU});setSelU(null)}}
                        style={{...sty.btnP,width:'100%',fontSize:12}}>
                        ✏️ Editar usuario
                      </button>
                      {/* Resetear clave */}
                      <button onClick={async()=>{
                        const tempPin = genTempPin(8)
                        const patch = {pin:tempPin, mustChange:true}
                        const nextUsers = users.map(u => u.id===selU.id ? {...u,...patch} : u)
                        setUsers(nextUsers); setSelU(p=>({...p,...patch}))
                        if (dbReady) await supabase.from('crm_users').update(patch).eq('id', selU.id)
                        if (selU.email) {
                          try {
                            await fetch('/api/notify', {
                              method:'POST', headers:{'Content-Type':'application/json'},
                              body: JSON.stringify({
                                type:'reset_password', to:selU.email,
                                agentName:selU.name, adminName:me.name,
                                username:selU.username, tempPin, phone:selU.phone||''
                              })
                            })
                          } catch(e) {}
                        }
                        msg(`✅ Clave temporal enviada a ${selU.name}`)
                      }} style={{...sty.btn,width:'100%',fontSize:12,
                        background:'#FFFBEB',borderColor:'#fcd34d',color:'#92400e'}}>
                        🔑 Resetear clave
                      </button>
                      {selU.id !== me.id && (
                        <button onClick={()=>{deleteUser(selU.id);setSelU(null)}}
                          style={{...sty.btnD,width:'100%',fontSize:12}}>
                          🗑️ Eliminar usuario
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          )
        })()}

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
            <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,overflow:'hidden',marginBottom:16}}>
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
                      style={{flex:1,fontSize:13,padding:'4px 8px',borderRadius:6,border:'1px solid #A8C0F0',background:'#F8FAFC',color:'#0F172A'}}
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
                    style={{fontSize:11,padding:'3px 6px',borderRadius:6,border:'1px solid #E2E8F0',background:'#fff',color:'#374151',cursor:'pointer'}}
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
                      <button onClick={()=>{setEditStageId(st.id);setEditStageLabel(st.label)}} style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px solid #E2E8F0',background:'transparent',color:B.mid,cursor:'pointer'}}>Renombrar</button>
                    )}
                    <button onClick={()=>moveStageUp(idx)} disabled={idx===0} style={{fontSize:12,padding:'3px 7px',borderRadius:6,border:'1px solid #E2E8F0',background:'transparent',color:idx===0?'#e5e7eb':B.mid,cursor:idx===0?'not-allowed':'pointer'}}>↑</button>
                    <button onClick={()=>moveStageDown(idx)} disabled={idx===stages.length-1} style={{fontSize:12,padding:'3px 7px',borderRadius:6,border:'1px solid #E2E8F0',background:'transparent',color:idx===stages.length-1?'#e5e7eb':B.mid,cursor:idx===stages.length-1?'not-allowed':'pointer'}}>↓</button>
                    <button onClick={()=>deleteStage(st.id)} style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px solid #fca5a5',background:'#FEF2F2',color:'#991b1b',cursor:'pointer'}}>Eliminar</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add new stage */}
            <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px'}}>
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
              enProceso: agLeads.filter(l => !['solicitud_promesa','firma','escritura','perdido'].includes(l.stage)).length,
              convRate: agLeads.length > 0 ? Math.round((agGanados/agLeads.length)*100) : 0
            }
          }).sort((a,b) => b.total - a.total)

          // Leads por etiqueta (filtrados)
          const byTag = ['lead','referido','pool'].map(tag => ({
            tag, count: filteredLeads.filter(l => l.tag === tag).length
          }))

          // Leads estancados (filtrados)
          const stancados = filteredLeads.filter(l => {
            if (['solicitud_promesa','firma','escritura','perdido'].includes(l.stage)) return false
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
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,flexWrap:'wrap',padding:'10px 14px',background:'#fff',border:'1px solid #E2E8F0',borderRadius:12}}>
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
              <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(auto-fill,minmax(150px,1fr))',gap:10,marginBottom:20}}>
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

              {/* ── Monitor de brokers ── */}
              <BrokerMonitorPanel
                leads={leads} users={users} stages={stages}
                sessions={sessions} setSel={setSel} setModal={setModal}
              />

              <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:16,marginBottom:16}}>

                {/* Pipeline por etapa */}
                <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Pipeline por etapa</p>
                  {byStage.map(st => (
                    <div key={st.id} style={{marginBottom:10}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                        <span style={{fontSize:12,color:'#374151',fontWeight:500}}>{st.label}</span>
                        <span style={{fontSize:12,fontWeight:700,color:st.col}}>{st.count} <span style={{fontSize:10,color:'#9ca3af',fontWeight:400}}>({st.pct}%)</span></span>
                      </div>
                      <div style={{height:6,background:'#F8FAFC',borderRadius:99,overflow:'hidden'}}>
                        <div style={{height:'100%',width:st.pct+'%',background:st.col,borderRadius:99,transition:'width .4s ease',minWidth:st.count>0?8:0}}/>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Rendimiento por agente — con urgencia integrada */}
                <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Rendimiento por agente</p>
                  {byAgent.length === 0 && <p style={{fontSize:12,color:'#9ca3af'}}>Sin agentes registrados</p>}
                  {byAgent.map(ag => {
                    const agAllLeads = (leads||[]).filter(l => l.assigned_to === ag.id)
                    const agActive   = agAllLeads.filter(l => !['ganado','perdido','desistio'].includes(l.stage))
                    const agCrit     = agActive.filter(l => !OPS_LOCKED_STAGES.includes(l.stage) && daysIn(l) >= 7).length
                    const agUrg      = agActive.filter(l => !OPS_LOCKED_STAGES.includes(l.stage) && daysIn(l) >= 3 && daysIn(l) < 7).length
                    return (
                      <div key={ag.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,paddingBottom:12,borderBottom:'1px solid #f0f4ff'}}>
                        <AV name={ag.name} size={32}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:'#0F172A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ag.name}</div>
                          <div style={{display:'flex',gap:6,marginTop:3,flexWrap:'wrap'}}>
                            <span style={{fontSize:11,color:'#6b7280'}}>{ag.total} leads</span>
                            <span style={{fontSize:11,color:'#166534',fontWeight:600}}>{ag.ganados} cierre</span>
                            {agCrit > 0 && <span style={{fontSize:11,color:'#991b1b',fontWeight:700}}>🔴{agCrit}</span>}
                            {agUrg > 0 && <span style={{fontSize:11,color:'#92400e',fontWeight:700}}>🟡{agUrg}</span>}
                          </div>
                          <div style={{height:4,background:'#F8FAFC',borderRadius:99,marginTop:5,overflow:'hidden'}}>
                            <div style={{height:'100%',width:(leads.length>0?Math.round((ag.total/leads.length)*100):0)+'%',background:B.primary,borderRadius:99}}/>
                          </div>
                        </div>
                        <div style={{textAlign:'right',flexShrink:0}}>
                          <div style={{fontSize:16,fontWeight:800,color:ag.convRate>=30?'#166534':ag.convRate>=15?'#92400e':'#374151'}}>{ag.convRate}%</div>
                          <div style={{fontSize:10,color:'#9ca3af'}}>conv.</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?10:16}}>

                {/* Por etiqueta */}
                <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px'}}>
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
                        <div style={{height:6,background:'#F8FAFC',borderRadius:99,overflow:'hidden'}}>
                          <div style={{height:'100%',width:pct+'%',background:t.col,borderRadius:99,opacity:.7}}/>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Leads estancados */}
                <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Leads estancados {stancados>0&&<span style={{fontSize:11,padding:'2px 8px',borderRadius:99,background:'#FFF7ED',color:'#9a3412',fontWeight:600,marginLeft:4}}>+7 días</span>}</p>
                  {leads.filter(l=>!['solicitud_promesa','firma','escritura','perdido'].includes(l.stage)&&daysIn(l)>7).length===0
                    ? <p style={{fontSize:12,color:'#9ca3af'}}>Sin leads estancados. ¡Todo fluye bien!</p>
                    : leads.filter(l=>!['solicitud_promesa','firma','escritura','perdido'].includes(l.stage)&&daysIn(l)>7)
                        .sort((a,b)=>daysIn(b)-daysIn(a))
                        .slice(0,6)
                        .map(l => {
                          const st = stages.find(x=>x.id===l.stage)||stages[0]||{}
                          const ag = (users||[]).find(u=>u.id===l.assigned_to)
                          return (
                            <div key={l.id} onClick={()=>{setSel(l);setModal('lead')}} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,padding:'6px 8px',borderRadius:8,background:'#FFF7ED',border:'1px solid #fdba74',cursor:'pointer'}}>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:12,fontWeight:600,color:'#0F172A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.nombre}</div>
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
          const poolEnProceso  = poolLeads.filter(l => !['solicitud_promesa','firma','escritura','perdido'].includes(l.stage)).length
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
              enProceso: agLeads.filter(l => !['solicitud_promesa','firma','escritura','perdido'].includes(l.stage)).length,
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
                  <div style={{fontSize:isMobile?15:16,fontWeight:800,color:B.primary}}>Dashboard Pool</div>
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
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,flexWrap:'wrap',padding:'10px 14px',background:'#fff',border:'1px solid #E2E8F0',borderRadius:12}}>
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
                        <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{fontSize:11,padding:'4px 7px',borderRadius:6,border:'1px solid #c5d5f5',background:'#fff',color:'#0F172A'}}/>
                        <span style={{fontSize:11,color:'#9ca3af'}}>→</span>
                        <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{fontSize:11,padding:'4px 7px',borderRadius:6,border:'1px solid #c5d5f5',background:'#fff',color:'#0F172A'}}/>
                      </div>
                    )}
                    <span style={{marginLeft:'auto',fontSize:12,color:B.mid,fontWeight:600,flexShrink:0}}>{poolLeads.length} leads pool</span>
                  </div>
                )
              })()}

              {/* KPIs */}
              <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(auto-fill,minmax(140px,1fr))',gap:10,marginBottom:20}}>
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

              <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:16,marginBottom:16}}>

                {/* Pipeline pool por etapa */}
                <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Pipeline pool por etapa</p>
                  {byStage.length === 0
                    ? <p style={{fontSize:12,color:'#9ca3af'}}>Sin leads pool aún</p>
                    : byStage.map(st => (
                      <div key={st.id} style={{marginBottom:10}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                          <span style={{fontSize:12,color:'#374151',fontWeight:500}}>{st.label}</span>
                          <span style={{fontSize:12,fontWeight:700,color:st.col}}>{st.count} <span style={{fontSize:10,color:'#9ca3af',fontWeight:400}}>({st.pct}%)</span></span>
                        </div>
                        <div style={{height:6,background:'#F8FAFC',borderRadius:99,overflow:'hidden'}}>
                          <div style={{height:'100%',width:st.pct+'%',background:st.col,borderRadius:99,minWidth:st.count>0?8:0}}/>
                        </div>
                      </div>
                    ))
                  }
                </div>

                {/* Calificación */}
                <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Calificación de pool</p>
                  {byCal.map(({cal,count,pct}) => {
                    const c = CAL[cal] || {bg:'#F9FAFB',col:'#374151'}
                    return (
                      <div key={cal} style={{marginBottom:12}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                          <span style={{fontSize:12,padding:'2px 10px',borderRadius:99,background:c.bg,color:c.col,fontWeight:600}}>{cal}</span>
                          <span style={{fontSize:12,fontWeight:700,color:c.col}}>{count} <span style={{fontSize:10,color:'#9ca3af',fontWeight:400}}>({pct}%)</span></span>
                        </div>
                        <div style={{height:6,background:'#F8FAFC',borderRadius:99,overflow:'hidden'}}>
                          <div style={{height:'100%',width:pct+'%',background:c.col,borderRadius:99,opacity:.7}}/>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?10:16}}>

                {/* Brokers asignados */}
                <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Brokers asignados</p>
                  {byAgent.length === 0
                    ? <p style={{fontSize:12,color:'#9ca3af'}}>Sin leads asignados a brokers</p>
                    : byAgent.map(ag => (
                      <div key={ag.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,paddingBottom:12,borderBottom:'1px solid #f0f4ff'}}>
                        <AV name={ag.name} size={34}/>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,color:'#0F172A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ag.name}</div>
                          <div style={{display:'flex',gap:8,marginTop:2}}>
                            <span style={{fontSize:11,color:'#6b7280'}}>{ag.total} leads</span>
                            <span style={{fontSize:11,color:'#166534',fontWeight:600}}>{ag.ganados} en cierre</span>
                            <span style={{fontSize:11,color:'#92400e'}}>{ag.enProceso} en proceso</span>
                          </div>
                          <div style={{height:4,background:'#F8FAFC',borderRadius:99,marginTop:5,overflow:'hidden'}}>
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
                <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Últimos leads pool</p>
                  {poolLeads.length === 0
                    ? <p style={{fontSize:12,color:'#9ca3af'}}>Sin leads pool registrados</p>
                    : [...poolLeads].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0,7).map(l => {
                        const st = stages.find(x=>x.id===l.stage)||stages[0]||{}
                        const ag = (users||[]).find(u=>u.id===l.assigned_to)
                        const cal = CAL[l.calificacion]
                        return (
                          <div key={l.id} onClick={()=>{setSel(l);setModal('lead')}} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,padding:'7px 10px',borderRadius:8,background:'#f9fbff',border:'1px solid #E2E8F0',cursor:'pointer'}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:12,fontWeight:600,color:'#0F172A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.nombre}</div>
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
                  <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?8:10,marginBottom:12}}>
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
                  <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:10,overflow:'auto',maxHeight:280,marginBottom:12}}>
                    <table className='rcrm-table' style={{width:'100%',borderCollapse:'collapse',fontSize:isMobile?11:12}}>
                      <thead>
                        <tr style={{background:B.light,position:'sticky',top:0}}>
                          {['#','Nombre','Teléfono','Email','Renta'].map(h=><th key={h} style={{padding:'7px 10px',textAlign:'left',fontWeight:700,color:B.primary,whiteSpace:'nowrap'}}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((r,i)=>(
                          <tr key={i} style={{borderBottom:'1px solid #f0f4ff'}}>
                            <td style={{padding:'6px 10px',color:'#9ca3af'}}>{r._row}</td>
                            <td style={{padding:'6px 10px',fontWeight:600,color:'#0F172A'}}>{r.nombre}</td>
                            <td style={{padding:'6px 10px'}}><WaLink phone={r.telefono}/></td>
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
                <div style={{background:'#DCFCE7',border:'1px solid #86efac',borderRadius:10,padding:isMobile?'12px':'16px 20px',textAlign:'center'}}>
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
                  <div style={{fontSize:isMobile?15:16,fontWeight:800,color:B.primary}}>Ranking de Asesores</div>
                  <div style={{fontSize:12,color:B.mid}}>UF acumuladas en Firma Promesa y Firma Escritura</div>
                </div>
                {grandTotalUF > 0 && <div style={{textAlign:'right'}}>
                  <div style={{fontSize:11,color:B.mid}}>Total período</div>
                  <div style={{fontSize:18,fontWeight:800,color:B.primary}}>UF {grandTotalUF.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                </div>}
              </div>

              {/* Period filter */}
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16,padding:'10px 14px',background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,flexWrap:'wrap'}}>
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
                    <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} style={{fontSize:11,padding:'4px 7px',borderRadius:6,border:'1px solid #c5d5f5',background:'#fff',color:'#0F172A'}}/>
                    <span style={{fontSize:11,color:'#9ca3af'}}>→</span>
                    <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} style={{fontSize:11,padding:'4px 7px',borderRadius:6,border:'1px solid #c5d5f5',background:'#fff',color:'#0F172A'}}/>
                  </div>
                )}
              </div>

              {/* Summary cards */}
              <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(3,1fr)',gap:10,marginBottom:16}}>
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
                        <div style={{fontSize:15,fontWeight:700,color:'#0F172A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ag.name}</div>
                        <div style={{fontSize:11,color:'#6b7280',marginTop:2,display:'flex',gap:10,flexWrap:'wrap'}}>
                          <span>{ag.leadsCount} leads</span>
                          <span>{ag.propCount} propiedades</span>
                          <span style={{color:'#166534',fontWeight:600}}>Mes: UF {ag.ufMonth.toLocaleString('es-CL',{minimumFractionDigits:0,maximumFractionDigits:0})}</span>
                          <span style={{color:'#92400e',fontWeight:600}}>{qName}: UF {ag.ufQ.toLocaleString('es-CL',{minimumFractionDigits:0,maximumFractionDigits:0})}</span>
                        </div>
                        {ranked[0]?.totalUF > 0 && (
                          <div style={{marginTop:6}}>
                            <div style={{height:7,background:'#F8FAFC',borderRadius:99,overflow:'hidden'}}>
                              <div style={{height:'100%',width:(ag.totalUF/ranked[0].totalUF*100)+'%',background:isTop3?B.primary:'#93c5fd',borderRadius:99,transition:'width .5s ease'}}/>
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        <div style={{fontSize:11,color:'#9ca3af',marginBottom:2}}>Período seleccionado</div>
                        <div style={{fontSize:isMobile?20:22,fontWeight:800,color:isTop3?B.primary:'#374151'}}>
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
          const isCob = p => (p.oc_estado==='pagado_broker') || p.comm.cobrado
          const cobradoUF     = allProps.filter(p=>p.moneda==='UF' && isCob(p) && p.comisTotal>0).reduce((s,p)=>s+p.comisTotal,0)
          const pendienteUF   = allProps.filter(p=>p.moneda==='UF' && !isCob(p) && p.comisTotal>0).reduce((s,p)=>s+p.comisTotal,0)
          const vencidoUF     = allProps.filter(p=>p.moneda==='UF' && p.isVencido && p.comisTotal>0).reduce((s,p)=>s+p.comisTotal,0)
          const proximoUF     = allProps.filter(p=>p.moneda==='UF' && p.isProximo && p.comisTotal>0).reduce((s,p)=>s+p.comisTotal,0)
          const totalComisUSD = allProps.filter(p=>p.moneda==='USD'&& p.comisTotal>0).reduce((s,p)=>s+p.comisTotal,0)
          const cobradoUSD    = allProps.filter(p=>p.moneda==='USD'&& isCob(p) && p.comisTotal>0).reduce((s,p)=>s+p.comisTotal,0)
          const pendienteUSD  = allProps.filter(p=>p.moneda==='USD'&& !isCob(p) && p.comisTotal>0).reduce((s,p)=>s+p.comisTotal,0)
          const dolarHoy      = indicators.dolar ? parseFloat(indicators.dolar.split('.').join('').replace(',','.')) : null
          const ufHoyD        = indicators.uf    ? parseFloat(indicators.uf.split('.').join('').replace(',','.'))    : null
          // CLP separated by currency — never mix UF and USD in same box
          const cobradoCLP      = allProps.filter(p=>p.moneda==='UF' &&  isCob(p) && p.comisTotal>0).reduce((s,p)=>s+Math.round(p.comisTotal*(p.ufRef||ufHoyD||0)),0)
          const pendienteCLP    = allProps.filter(p=>p.moneda==='UF' && !isCob(p) && p.comisTotal>0).reduce((s,p)=>s+Math.round(p.comisTotal*(p.ufRef||ufHoyD||0)),0)
          const totalUFclp      = cobradoCLP + pendienteCLP
          const cobradoUSDclp   = allProps.filter(p=>p.moneda==='USD'&&  isCob(p) && p.comisTotal>0).reduce((s,p)=>s+Math.round(p.comisTotal*(dolarHoy||0)),0)
          const pendienteUSDclp = allProps.filter(p=>p.moneda==='USD'&& !isCob(p) && p.comisTotal>0).reduce((s,p)=>s+Math.round(p.comisTotal*(dolarHoy||0)),0)

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

          // By inmobiliaria — track UF and USD separately
          const byInmob = {}
          allProps.filter(p=>p.comisTotal>0).forEach(p => {
            if (!byInmob[p.inmob]) byInmob[p.inmob] = {totalUF:0,cobradoUF:0,pendienteUF:0,totalUSD:0,cobradoUSD:0,pendienteUSD:0,vencido:0,count:0}
            byInmob[p.inmob].count++
            const c = isCob(p)
            if (p.moneda==='UF') {
              byInmob[p.inmob].totalUF += p.comisTotal
              if (c) byInmob[p.inmob].cobradoUF += p.comisTotal
              else byInmob[p.inmob].pendienteUF += p.comisTotal
              if (p.isVencido) byInmob[p.inmob].vencido += p.comisTotal
            } else if (p.moneda==='USD') {
              byInmob[p.inmob].totalUSD += p.comisTotal
              if (c) byInmob[p.inmob].cobradoUSD += p.comisTotal
              else byInmob[p.inmob].pendienteUSD += p.comisTotal
            }
          })

          // By broker (what we owe them)
          const byBroker = {}
          allProps.filter(p=>p.pagoAsesor>0).forEach(p => {
            if (!byBroker[p.agName]) byBroker[p.agName] = {totalUF:0,cobradoUF:0,pendienteUF:0,totalUSD:0,cobradoUSD:0,pendienteUSD:0}
            const c = isCob(p)
            if (p.moneda==='UF') {
              byBroker[p.agName].totalUF += p.pagoAsesor
              if (c) byBroker[p.agName].cobradoUF += p.pagoAsesor
              else byBroker[p.agName].pendienteUF += p.pagoAsesor
            } else if (p.moneda==='USD') {
              byBroker[p.agName].totalUSD += p.pagoAsesor
              if (c) byBroker[p.agName].cobradoUSD += p.pagoAsesor
              else byBroker[p.agName].pendienteUSD += p.pagoAsesor
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
                  <div style={{fontSize:isMobile?15:16,fontWeight:800,color:B.primary}}>Dashboard Finanzas</div>
                  <div style={{fontSize:12,color:B.mid}}>Control de comisiones, cobros y flujo de pagos</div>
                </div>
              </div>

              {/* KPI Row */}
              <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(auto-fill,minmax(155px,1fr))',gap:10,marginBottom:20}}>
                {[
                  {l:'Comisiones total (UF)',   v:'UF '+fmt2(totalComisUF),   sub:totalUFclp>0?'$'+totalUFclp.toLocaleString('es-CL')+' CLP':null,     bg:B.light,   col:B.primary},
                  {l:'✅ Broker pagado (UF)',    v:'UF '+fmt2(cobradoUF),      sub:cobradoCLP>0?'$'+cobradoCLP.toLocaleString('es-CL')+' CLP':null,   bg:'#DCFCE7', col:'#14532d'},
                  {l:'⏳ Pendiente cobro (UF)', v:'UF '+fmt2(pendienteUF),    sub:pendienteCLP>0?'$'+pendienteCLP.toLocaleString('es-CL')+' CLP':null, bg:'#FFFBEB', col:'#92400e'},
                  {l:'⚠️ Vencido',              v:'UF '+fmt2(vencidoUF),      sub:null, bg:vencidoUF>0?'#FEF2F2':'#F9FAFB', col:vencidoUF>0?'#991b1b':'#9ca3af'},
                  {l:'⏰ Próx. 30 días',        v:'UF '+fmt2(proximoUF),      sub:null, bg:'#F5F3FF', col:'#5b21b6'},
                  {l:'Margen Rabbitts (UF)',    v:'UF '+fmt2(margenTotalUF),  sub:null, bg:'#E8EFFE', col:B.primary},
                  {l:'Pago brokers (UF)',       v:'UF '+fmt2(totalBrokerUF),  sub:null, bg:'#F0FDF4', col:'#166534'},
                  ...(totalComisUSD>0?[
                    {l:'Margen Rabbitts (USD)',    v:'USD '+fmt2(allProps.filter(p=>p.moneda==='USD'&&p.margen>0).reduce((s,p)=>s+p.margen,0)), sub:null, bg:'#E8EFFE', col:B.primary},
                    {l:'Pago brokers (USD)',       v:'USD '+fmt2(allProps.filter(p=>p.moneda==='USD'&&p.pagoAsesor>0).reduce((s,p)=>s+p.pagoAsesor,0)), sub:null, bg:'#F0FDF4', col:'#166534'},
                  ]:[]),
                  ...(totalComisUSD>0?[
                    {l:'Comisiones (USD)',         v:'USD '+fmt2(totalComisUSD),  sub:(cobradoUSDclp+pendienteUSDclp)>0?'$'+(cobradoUSDclp+pendienteUSDclp).toLocaleString('es-CL')+' CLP':null, bg:'#F0FDF4', col:'#166534'},
                    {l:'✅ Broker pagado (USD)',    v:'USD '+fmt2(cobradoUSD),     sub:cobradoUSDclp>0?'$'+cobradoUSDclp.toLocaleString('es-CL')+' CLP':null,   bg:'#DCFCE7', col:'#14532d'},
                    {l:'⏳ Pendiente cobro (USD)', v:'USD '+fmt2(pendienteUSD),   sub:pendienteUSDclp>0?'$'+pendienteUSDclp.toLocaleString('es-CL')+' CLP':null, bg:'#FFFBEB', col:'#92400e'},
                  ]:[]),
                ].map((k,i) => (
                  <div key={i} style={{background:k.bg,borderRadius:10,padding:'10px 14px',border:'1px solid '+k.col+'33'}}>
                    <div style={{fontSize:11,color:k.col,fontWeight:600,marginBottom:4,opacity:.8}}>{k.l}</div>
                    <div style={{fontSize:15,fontWeight:800,color:k.col,lineHeight:1.2}}>{k.v}</div>
                    {k.sub&&<div style={{fontSize:10,color:k.col,opacity:.7,marginTop:2}}>{k.sub}</div>}
                  </div>
                ))}
              </div>

              <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:16,marginBottom:16}}>

                {/* Monthly flow */}
                <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px'}}>
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
                            <div style={{height:8,background:'#F8FAFC',borderRadius:99,overflow:'hidden'}}>
                              <div style={{height:'100%',width:pct+'%',background:isPast?'#ef4444':B.primary,borderRadius:99}}/>
                            </div>
                          </div>
                        )
                      })
                  }
                </div>

                {/* By inmobiliaria */}
                <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Estado cobros por inmobiliaria</p>
                  {Object.entries(byInmob).sort((a,b)=>(b[1].pendienteUF+b[1].pendienteUSD)-(a[1].pendienteUF+a[1].pendienteUSD)).map(([inmob, d]) => (
                    <div key={inmob} style={{marginBottom:12,paddingBottom:12,borderBottom:'1px solid #f0f4ff'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:5}}>
                        <span style={{fontWeight:700,fontSize:13,color:'#0F172A'}}>{inmob}</span>
                        {d.vencido>0&&<span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:'#FEF2F2',color:'#991b1b',fontWeight:600}}>⚠ UF {fmt2(d.vencido)} vencido</span>}
                      </div>
                      {d.totalUF>0&&(
                        <div style={{marginBottom:4}}>
                          <div style={{display:'flex',gap:10,fontSize:11,marginBottom:3}}>
                            <span style={{color:'#6b7280'}}>UF total: {fmt2(d.totalUF)}</span>
                            <span style={{color:'#166534',fontWeight:600}}>✅ {fmt2(d.cobradoUF)}</span>
                            <span style={{color:'#92400e',fontWeight:600}}>⏳ {fmt2(d.pendienteUF)}</span>
                          </div>
                          <div style={{height:5,background:'#F8FAFC',borderRadius:99,overflow:'hidden'}}>
                            <div style={{height:'100%',width:d.totalUF>0?(d.cobradoUF/d.totalUF*100)+'%':'0%',background:'#22c55e',borderRadius:99}}/>
                          </div>
                        </div>
                      )}
                      {d.totalUSD>0&&(
                        <div style={{marginBottom:2}}>
                          <div style={{display:'flex',gap:10,fontSize:11,marginBottom:3}}>
                            <span style={{color:'#6b7280'}}>USD total: {fmt2(d.totalUSD)}</span>
                            <span style={{color:'#166534',fontWeight:600}}>✅ {fmt2(d.cobradoUSD)}</span>
                            <span style={{color:'#92400e',fontWeight:600}}>⏳ {fmt2(d.pendienteUSD)}</span>
                          </div>
                          <div style={{height:5,background:'#F8FAFC',borderRadius:99,overflow:'hidden'}}>
                            <div style={{height:'100%',width:d.totalUSD>0?(d.cobradoUSD/d.totalUSD*100)+'%':'0%',background:'#3b82f6',borderRadius:99}}/>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?10:16}}>

                {/* By broker - what we owe */}
                <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px'}}>
                  <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>Pago pendiente a brokers</p>
                  {Object.entries(byBroker).sort((a,b)=>(b[1].pendienteUF+b[1].pendienteUSD)-(a[1].pendienteUF+a[1].pendienteUSD)).map(([agName, d]) => (
                    <div key={agName} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,paddingBottom:10,borderBottom:'1px solid #f0f4ff'}}>
                      <AV name={agName} size={32}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:'#0F172A'}}>{agName}</div>
                        {d.totalUF>0&&<div style={{fontSize:11,color:'#6b7280'}}>UF: Total {fmt2(d.totalUF)} · ✅ {fmt2(d.cobradoUF)}</div>}
                        {d.totalUSD>0&&<div style={{fontSize:11,color:'#6b7280'}}>USD: Total {fmt2(d.totalUSD)} · ✅ {fmt2(d.cobradoUSD)}</div>}
                      </div>
                      <div style={{textAlign:'right'}}>
                        {d.pendienteUF>0&&<div style={{fontSize:13,fontWeight:700,color:'#9a3412'}}>⏳ UF {fmt2(d.pendienteUF)}</div>}
                        {d.pendienteUSD>0&&<div style={{fontSize:13,fontWeight:700,color:'#9a3412'}}>⏳ USD {fmt2(d.pendienteUSD)}</div>}
                        {d.pendienteUF===0&&d.pendienteUSD===0&&<div style={{fontSize:13,fontWeight:700,color:'#166534'}}>✅ Al día</div>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Vencidos alert */}
                <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px'}}>
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



        {nav==='ia' && isAdmin && (
          <IAConfigView iaConfig={iaConfig} setIaConfig={setIaConfig} users={users} leads={leads} supabase={supabase} dbReady={dbReady}/>
        )}

        {/* MARKETPLACE */}
        {/* CONDICIONES COMERCIALES */}


        {nav==='marketplace' && (isAdmin||isAgent||isPartner) && (
          <MarketplaceView
            config={marketplaceConfig}
            setConfig={setMarketplaceConfig}
            isAdmin={isAdmin}
            supabase={supabase}
            dbReady={dbReady}
            me={me}
          />
        )}

        {/* CONVERSACIONES */}
        {nav==='conversaciones' && isAdmin && (
          <ConversacionesView
            conversations={conversations}
            convMessages={convMessages}
            activeConv={activeConv}
            setActiveConv={setActiveConv}
            loadConvMessages={loadConvMessages}
            upsertConversation={upsertConversation}
            saveConvMessage={saveConvMessage}
            iaConfig={iaConfig}
            users={users}
            leads={leads}
            setLeads={setLeads}
            supabase={supabase}
            dbReady={dbReady}
            me={me}
            setConversations={setConversations}
            deleteConversation={deleteConversation}
            setIaConfig={setIaConfig}
          />
        )}

        {/* AGENDA EQUIPO — admin config */}
        {nav==='agenda' && isAdmin && (
          <AgendaEquipoView users={users} setUsers={setUsers} saveUsers={saveUsers} supabase={supabase} dbReady={dbReady} agendaSettings={agendaSettings} setAgendaSettings={setAgendaSettings}/>
        )}

        {/* MI AGENDA — broker availability config */}
        {nav==='mi agenda' && isAgent && (
          <MiAgendaView me={me} users={users} setUsers={setUsers} saveUsers={saveUsers} supabase={supabase} dbReady={dbReady}/>
        )}

        {/* OPERACIONES 360 */}
        {nav==='operaciones' && (isAdmin||isOps) && (
          <Operaciones360View leads={leads} users={users} stages={stages} commissions={commissions} indicators={indicators} savePropField={savePropField} setSel={setSel} setModal={setModal} me={me} setLeads={setLeads} supabase={supabase} dbReady={dbReady}/>
        )}

        {/* FINANZAS 360 */}
        {nav==='finanzas_360' && (isAdmin||isFinanzas) && (
          <Finanzas360View leads={leads} users={users} stages={stages} commissions={commissions} indicators={indicators} savePropField={savePropField} saveCommission={saveCommission} setCommissions={setCommissions}/>
        )}

        {/* PORTAL BROKER */}

        {/* MI EQUIPO — Team Leader */}
        {nav==='mi_equipo' && isTeamLeader && (
          <TeamLeaderView leads={leads} users={users} me={me} stages={stages} supabase={supabase} dbReady={dbReady} setLeads={setLeads} leads_all={leads}/>
        )}

        {nav==='portal_broker' && isAgent && (
          <PortalBrokerView leads={leads} users={users} stages={stages} commissions={commissions} indicators={indicators} me={me}/>
        )}

        {nav==='mis_notas' && isAgent && (
          <NotebookView me={me}/>
        )}

        {/* RABITO INTERNO */}


        {/* VISITAS — Gestión operaciones */}


        {nav==='rabito_interno' && (isAdmin||isOps||isFinanzas) && (
          <RabitoInternoView leads={leads} users={users} stages={stages} commissions={commissions} indicators={indicators}/>
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
        {/* ── TEAM DASHBOARD ─────────────────────────────── */}
        {nav==='team_dashboard' && isTeamLeader && (
          <TeamDashboardView
            me={me}
            leads={leads}
            users={users}
            stages={stages}
            isAdmin={isAdmin}
            setSel={setSel}
            setModal={setModal}
            assignLead={assignLead}
          />
        )}

        {/* ── CONDICIONES COMERCIALES ─────────────────────── */}
        {/* VISITAS — Operaciones/Admin gestiona, agente ve las suyas */}
        {nav==='visitas' && (isAdmin||isOps) && (
          <VisitasGestionView
            leads={leads} users={users} setLeads={setLeads}
            supabase={supabase} dbReady={dbReady} me={me}
          />
        )}
        {nav==='mis_visitas' && isAgent && (
          <MisVisitasView leads={leads} me={me} users={users}/>
        )}

        {nav==='condiciones' && (isAdmin||isOps||isAgent) && (
          <CondicionesComView
            condiciones={condiciones}
            setCondiciones={setCondiciones}
            supabase={supabase}
            dbReady={dbReady}
            isAdmin={isAdmin}
            isOps={isOps}
          />
        )}

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

          {/* ── Barra acción rápida (solo agentes) ── */}
          {isAgent && (() => {
            const tel = sel.telefono&&sel.telefono!=='—' ? sel.telefono.replace(/[^0-9+]/g,'').replace(/^\+/,'') : ''
            const dias = daysIn(sel)
            const isLocked = OPS_LOCKED_STAGES.includes(sel.stage)
            return (
              <div style={{background: isLocked?'#FDF4FF':dias>=7?'#FEF2F2':dias>=3?'#FFFBEB':'#F0FDF4',
                border:`1px solid ${isLocked?'#d8b4fe':dias>=7?'#fca5a5':dias>=3?'#fcd34d':'#86efac'}`,
                borderRadius:10,padding:'10px 12px',marginBottom:14,
                display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <span style={{fontSize:12,fontWeight:700,color:isLocked?'#7e22ce':dias>=7?'#991b1b':dias>=3?'#92400e':'#166534',flex:1}}>
                  {isLocked ? '🔒 En gestión de Operaciones' : dias>=7 ? `🔥 Sin actividad hace ${dias} días` : dias>=3 ? `⏱ ${dias} días sin actividad` : '✅ Al día'}
                </span>
                {!isLocked && tel && (
                  <a href={`https://wa.me/${tel}`} target="_blank" rel="noopener noreferrer"
                    style={{fontSize:12,padding:'6px 14px',borderRadius:8,border:'1px solid #25D366',
                      background:'#F0FDF4',color:'#166534',fontWeight:700,textDecoration:'none',
                      display:'flex',alignItems:'center',gap:4}}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    WhatsApp
                  </a>
                )}
                {!isLocked && (
                  <ModalContactInput
                    sel={sel} leads={leads} setLeads={setLeads} setSel={setSel}
                    me={me} dbReady={dbReady} supabase={supabase} msg={msg} B={B}
                  />
                )}
              </div>
            )
          })()}

          <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
            {(()=>{const st=stages.find(x=>x.id===sel.stage)||stages[0];return<span style={{fontSize:11,padding:'3px 10px',borderRadius:99,background:st.bg,color:st.col,fontWeight:600}}>{st.label}</span>})()}
            <Tag tag={sel.tag||'lead'}/>
            {CAL[sel.calificacion]&&<span style={{fontSize:11,padding:'3px 10px',borderRadius:99,background:CAL[sel.calificacion].bg,color:CAL[sel.calificacion].col,fontWeight:600}}>Cal. {sel.calificacion}</span>}
            <Days d={daysIn(sel)}/>
            {sel.stage==='perdido'&&sel.loss_reason&&<span style={{fontSize:11,padding:'3px 10px',borderRadius:99,background:'#FEF2F2',color:'#991b1b'}}>Motivo: {sel.loss_reason}</span>}
          </div>
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:8,marginBottom:12}}>
            {[['Email',sel.email],['RUT',sel.rut||'—'],['Renta',sel.renta],['Origen',sel.origen||'—'],['Creado',fmt(sel.fecha)],['Agente',((users||[]).find(u=>u.id===sel.assigned_to)||{}).name||'Sin asignar']].map(([k,v])=>(
              <div key={k} style={{background:B.light,padding:'8px 10px',borderRadius:8,border:'1px solid #E2E8F0'}}>
                <div style={{fontSize:11,color:B.mid,marginBottom:2,fontWeight:600}}>{k}</div>
                <div style={{fontSize:13,color:'#0F172A'}}>{v}</div>
              </div>
            ))}
            <div style={{background:B.light,padding:'8px 10px',borderRadius:8,border:'1px solid #E2E8F0'}}>
              <div style={{fontSize:11,color:B.mid,marginBottom:2,fontWeight:600}}>Teléfono</div>
              <WaLink phone={sel.telefono} label={sel.telefono}/>
            </div>
          </div>
          {/* Resumen — solo admin puede editar */}
          <div style={{marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
              <span style={{fontSize:12,fontWeight:600,color:B.mid}}>Resumen del cliente</span>
              {isAdmin && <button onClick={()=>setEditResumen(sel.resumen||'')} style={{fontSize:11,color:B.primary,background:'none',border:'none',cursor:'pointer',fontWeight:600}}>✏️ Editar</button>}
            </div>
            {editResumen!==null && isAdmin ? (
              <div>
                <textarea value={editResumen} onChange={e=>setEditResumen(e.target.value)}
                  style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid #1B4FC8',fontSize:13,minHeight:72,resize:'vertical',boxSizing:'border-box'}}/>
                <div style={{display:'flex',gap:6,marginTop:6}}>
                  <button onClick={async()=>{
                    const ls=leads.map(l=>l.id===sel.id?{...l,resumen:editResumen}:l)
                    setLeads(ls);setSel(ls.find(l=>l.id===sel.id))
                    if(dbReady)await supabase.from('crm_leads').update({resumen:editResumen}).eq('id',sel.id)
                    setEditResumen(null);msg('Resumen actualizado')
                  }} style={{...sty.btnP,fontSize:12}}>Guardar</button>
                  <button onClick={()=>setEditResumen(null)} style={{...sty.btn,fontSize:12}}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div style={{background:B.light,padding:'10px 12px',borderRadius:8,fontSize:13,color:'#374151',lineHeight:1.6,border:'1px solid #E2E8F0'}}>{sel.resumen||'Sin resumen'}</div>
            )}
          </div>

          {/* Comentario Venta — puede escribir el broker, la IA lo lee */}
          <div style={{marginBottom:12}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
              <span style={{fontSize:12,fontWeight:600,color:B.mid}}>💼 Comentario Venta</span>
              <span style={{fontSize:10,color:'#9ca3af'}}>(la IA de Rabito puede leer esto)</span>
            </div>
            <textarea
              value={sel.comentario_venta||''}
              onChange={async e=>{
                const val=e.target.value
                const ls=leads.map(l=>l.id===sel.id?{...l,comentario_venta:val}:l)
                setLeads(ls);setSel(ls.find(l=>l.id===sel.id))
                clearTimeout(window._cvTimer)
                window._cvTimer=setTimeout(async()=>{
                  if(dbReady)await supabase.from('crm_leads').update({comentario_venta:val}).eq('id',sel.id)
                },1000)
              }}
              placeholder="Escribe aquí lo que sabes del cliente, sus intereses, objeciones, próximos pasos..."
              style={{width:'100%',padding:'8px 10px',borderRadius:8,border:'1px solid #E2E8F0',fontSize:12,minHeight:60,resize:'vertical',boxSizing:'border-box',lineHeight:1.5}}
            />
          </div>

          {/* Análisis IA del broker — solo visible para admin */}
          {isAdmin && (() => {
            const agBroker = (users||[]).find(u=>u.id===sel.assigned_to)
            return (
              <div style={{marginBottom:12}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <span style={{fontSize:12,fontWeight:600,color:'#5b21b6'}}>🤖 Análisis IA del broker</span>
                  <button onClick={async()=>{
                    if(!agBroker) return msg('Lead sin agente asignado')
                    const brokerLeads = leads.filter(l=>l.assigned_to===agBroker.id)
                    const prompt = `Analiza el desempeño del broker "${agBroker.name}" en este lead y en general.
Lead actual: ${sel.nombre} | Etapa: ${sel.stage} | Renta: ${sel.renta||'no indicada'}
Comentario venta: ${sel.comentario_venta||'sin comentarios'}
Historial de etapas: ${(sel.stage_history||[]).map(h=>h.stage).join(' → ')}
Medio de contacto: ${sel.contacto_medio||'no registrado'}
Total leads del broker: ${brokerLeads.length} | En firma/escritura: ${brokerLeads.filter(l=>['firma','escritura','ganado'].includes(l.stage)).length}

Genera un análisis breve (4-6 líneas) con:
1. Qué está haciendo bien este broker con este lead
2. Qué puede mejorar (seguimiento, documentación, velocidad)
3. Una recomendación concreta para avanzar este lead específico
Responde en español, directo, sin formalismos.`
                    try {
                      const r = await fetch('/api/agent', {
                        method:'POST', headers:{'Content-Type':'application/json'},
                        body: JSON.stringify({message: prompt, iaConfig:{}, action:'summary'})
                      })
                      const d = await r.json()
                      const summary = d.reply || d.text || ''
                      if (!summary) return msg('No se pudo generar el análisis')
                      const ls = leads.map(l=>l.id===sel.id?{...l,ia_broker_summary:summary}:l)
                      setLeads(ls); setSel(ls.find(l=>l.id===sel.id))
                      if(dbReady) await supabase.from('crm_leads').update({ia_broker_summary:summary}).eq('id',sel.id)
                      msg('Análisis generado')
                    } catch(e) { msg('Error generando análisis') }
                  }} style={{fontSize:11,padding:'3px 10px',borderRadius:6,border:'1px solid #c4b5fd',background:'#F5F3FF',color:'#5b21b6',cursor:'pointer',fontWeight:600}}>
                    ✨ Generar
                  </button>
                </div>
                {sel.ia_broker_summary ? (
                  <div style={{background:'#F5F3FF',border:'1px solid #c4b5fd',borderRadius:8,padding:'10px 12px'}}>
                    <div style={{fontSize:12,color:'#374151',lineHeight:1.6,whiteSpace:'pre-wrap'}}>{sel.ia_broker_summary}</div>
                    <div style={{fontSize:10,color:'#9ca3af',marginTop:4}}>Solo visible para admin</div>
                  </div>
                ) : (
                  <div style={{fontSize:12,color:'#9ca3af',fontStyle:'italic'}}>Presiona "Generar" para que Rabito analice al broker en este lead.</div>
                )}
              </div>
            )
          })()}
          {(sel.stage_history||[]).length>1&&(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:600,color:B.mid,marginBottom:6}}>Historial de etapas</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                {(sel.stage_history||[]).map((h,i)=>{const st=stages.find(x=>x.id===h.stage)||stages[0];return<div key={i} style={{fontSize:11,padding:'3px 8px',borderRadius:8,background:st.bg,color:st.col}}>{st.label} <span style={{opacity:.65}}>{fmt(h.date)}</span></div>})}
              </div>
            </div>
          )}
          {!isPartner && !isFinanzas && <>
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
            {(isAdmin||isTeamLeader) && <Fld label="Asignar a agente">
              <select value={sel.assigned_to||''} onChange={e=>assignLead(sel.id,e.target.value)} style={sty.sel}>
                <option value="">Sin asignar</option>
                {isTeamLeader ? (
                  // Team leader solo asigna a su equipo
                  (users||[]).filter(u=>u.team_leader_id===me.id).map(u=><option key={u.id} value={u.id}>{u.name}</option>)
                ) : (()=>{
                  const tls=(users||[]).filter(u=>u.role==='team_leader')
                  const free=(users||[]).filter(u=>u.role==='agent'&&!u.team_leader_id)
                  return <>
                    {free.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                    {tls.map(tl=>{
                      const team=(users||[]).filter(u=>u.team_leader_id===tl.id)
                      if(!team.length) return null
                      return <optgroup key={tl.id} label={`👥 Equipo ${tl.name}`}>{team.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</optgroup>
                    })}
                  </>
                })()}
              </select>
            </Fld>}
            {!isPartner && !isFinanzas && (
              <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
                <button onClick={()=>setEditLead({nombre:sel.nombre,telefono:sel.telefono,email:sel.email,renta:sel.renta,resumen:sel.resumen})} style={{...sty.btnO,flex:1}}>Editar datos</button>
                {isAdmin && <button onClick={()=>deleteLead(sel.id)} style={{...sty.btnD,flex:1}}>Eliminar lead</button>}
              </div>
            )}
            {/* Solicitar visita a propiedad */}
            {isAgent && (
              <div style={{marginBottom:12}}>
                <button onClick={()=>{setVisitaForm({fecha:new Date().toISOString().slice(0,10),hora:'10:00',proyecto:'',comentario:''});setVisitaModal(sel.id);setModal(null)}}
                  style={{width:'100%',padding:'9px 14px',borderRadius:8,border:'none',background:'#059669',color:'#fff',cursor:'pointer',fontWeight:600,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                  🏠 Solicitar visita a propiedad
                </button>
                {(sel.visitas||[]).length > 0 && (sel.visitas||[]).map((v,vi)=>(
                  <div key={vi} style={{fontSize:11,padding:'5px 10px',borderRadius:6,marginTop:4,fontWeight:600,
                    background:v.estado==='confirmada'?'#DCFCE7':v.estado==='rechazada'?'#FEF2F2':'#EFF6FF',
                    color:v.estado==='confirmada'?'#14532d':v.estado==='rechazada'?'#991b1b':'#1d4ed8'}}>
                    🏠 {v.fecha} {v.hora} · {v.proyecto||'Sin proyecto'} · {v.estado==='confirmada'?'✅ Confirmada':v.estado==='rechazada'?'❌ Rechazada':'⏳ Solicitada'}
                  </div>
                ))}
              </div>
            )}

            {/* Google Calendar — agendar reunión */}
            <div style={{marginBottom:14}}>
              <button onClick={()=>{setGcalForm({fecha:'',hora:'09:00',duracion:60,notas:sel.resumen||''});setGcalModal(sel);setModal(null)}}
                style={{width:'100%',padding:'9px 14px',borderRadius:8,border:'none',background:'#1a73e8',color:'#fff',cursor:'pointer',fontWeight:600,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                📅 Agendar reunión en Google Calendar
              </button>
              {sel.meeting_date && (
                <div style={{marginTop:6,fontSize:11,padding:'6px 10px',borderRadius:6,background:'#DCFCE7',color:'#14532d',fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
                  📅 Reunión agendada: {new Date(sel.meeting_date).toLocaleDateString('es-CL',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
                  {sel.meeting_link&&<a href={sel.meeting_link} target="_blank" rel="noopener noreferrer" style={{color:'#1a73e8',fontSize:11,marginLeft:4}}>→ Meet</a>}
                </div>
              )}
            </div>
          </>}
          {isPartner && <div style={{padding:'10px 12px',background:B.light,borderRadius:8,fontSize:12,color:B.primary,marginBottom:12}}>Vista de solo lectura — socio comercial</div>}
          {isFinanzas && <div style={{padding:'10px 12px',background:'#F0FDF4',borderRadius:8,fontSize:12,color:'#166534',fontWeight:600,marginBottom:12,border:'1px solid #86efac'}}>👁 Vista de solo lectura — Finanzas</div>}

          {/* Properties section — visible to all; broker can upload docs while in Reserva */}
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
          {(isAdmin||isOps||(isAgent&&sel.stage==='reserva')) && (RESTRICTED_STAGES.includes(sel.stage)||sel.stage==='reserva'||(sel.propiedades||[]).length>0) && (
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
                <span style={{fontSize:12,fontWeight:600,color:'#0F172A'}}>{c.author_name}</span>
                <span style={{fontSize:11,color:'#9ca3af',marginLeft:'auto'}}>{fmt(c.date)}</span>
              </div>
              <div style={{fontSize:13,color:'#6b7280',lineHeight:1.5,paddingLeft:28}}>{c.text}</div>
            </div>
          ))}
          {!isPartner && <div style={{display:'flex',gap:8,marginTop:8}}>
            {!isFinanzas && <input value={comment} onChange={e=>setComment(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addComment(sel.id)} placeholder="Escribe un comentario..." style={{...sty.inp,flex:1}}/>}
            {!isFinanzas && <button onClick={()=>addComment(sel.id)} disabled={!comment.trim()} style={{...sty.btnP,opacity:!comment.trim()?0.5:1}}>Enviar</button>}
          </div>}
        </Modal>
      )}


      {/* PROPIEDADES MODAL */}
      {propModal && (
        <Modal title={pendingStage?.stageId==='solicitud_promesa'?'Solicitud de promesa':'Propiedades del cliente'} onClose={()=>{setPropModal(null);setPendingStage(null);setEditingProps([])}} wide>
          <p style={{margin:'0 0 12px',fontSize:12,color:B.mid,lineHeight:1.45}}>
            {pendingStage?.stageId==='reserva' ? 'En Reserva se registra la operación y sus condiciones comerciales. Los documentos se cargan recién en Solicitud de Promesa.' : pendingStage?.stageId==='solicitud_promesa' ? 'Carga los documentos esenciales para pedir la promesa a la inmobiliaria. Al guardar, el lead quedará en Solicitud de promesa.' : pendingStage ? 'Al guardar, el lead pasará a '+stages.find(s=>s.id===pendingStage.stageId)?.label+'.' : 'Registra o actualiza los datos de la operación.'}
          </p>

          {editingProps.map((p, idx) => {
            const calculated = p.bono_pie ? Math.round((parseFloat(p.precio)||0) * (1 - (parseFloat(p.bono_pct)||0)/100) * 100)/100 : (parseFloat(p.precio)||0)
            return (
              <div key={p.id||idx} style={{background:'#FFFBEB',border:'1px solid #fcd34d',borderRadius:10,padding:'12px 14px',marginBottom:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <span style={{fontSize:13,fontWeight:700,color:'#713f12'}}>Propiedad {idx+1}</span>
                  {editingProps.length > 1 && <button onClick={()=>setEditingProps(prev=>prev.filter((_,i)=>i!==idx))} style={{fontSize:11,padding:'2px 8px',borderRadius:6,border:'1px solid #fca5a5',background:'#FEF2F2',color:'#991b1b',cursor:'pointer'}}>Eliminar</button>}
                </div>
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:8,marginBottom:8}}>
                  <Fld label="Inmobiliaria *">
                    <input value={p.inmobiliaria} onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,inmobiliaria:e.target.value}:x))} placeholder="Nombre inmobiliaria" style={sty.inp}/>
                  </Fld>
                  <Fld label="Proyecto *">
                    <input value={p.proyecto} onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,proyecto:e.target.value}:x))} placeholder="Nombre proyecto" style={sty.inp}/>
                  </Fld>
                </div>
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:8,marginBottom:8}}>
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
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:8,marginBottom:8}}>
                  <Fld label="Fecha reserva / handoff">
                    <input type="date" value={p.fecha_reserva||''} onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,fecha_reserva:e.target.value}:x))} style={sty.inp}/>
                  </Fld>
                  <Fld label="Fecha escritura (opcional)">
                    <input type="date" value={p.fecha_escritura||''} onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,fecha_escritura:e.target.value}:x))} style={sty.inp}/>
                  </Fld>
                </div>
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:8,marginBottom:8}}>
                  <Fld label="Ejecutivo inmobiliaria">
                    <input value={p.ejecutivo_inmobiliaria||''} onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,ejecutivo_inmobiliaria:e.target.value}:x))} placeholder="Nombre / teléfono" style={sty.inp}/>
                  </Fld>
                  <Fld label="Forma pago pie">
                    <input value={p.forma_pago_pie||''} onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,forma_pago_pie:e.target.value}:x))} placeholder="Ej: 48 cuotas / contado / bono pie" style={sty.inp}/>
                  </Fld>
                </div>
                <Fld label="Condiciones especiales prometidas al cliente">
                  <textarea value={p.condiciones_especiales||''} onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,condiciones_especiales:e.target.value}:x))} placeholder="Descuentos, regalos, renta garantizada, plazos, acuerdos especiales..." style={{...sty.inp,minHeight:54,resize:'vertical'}}/>
                </Fld>
                {(pendingStage?.stageId==='solicitud_promesa' || (leads.find(l=>l.id===propModal)?.stage==='solicitud_promesa')) && (
                  <div>
                    <Fld label="📅 Fecha solicitud de promesa *">
                      <input type="date"
                        value={p.solicitud_promesa_fecha || new Date().toISOString().slice(0,10)}
                        onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,solicitud_promesa_fecha:e.target.value}:x))}
                        style={{...sty.inp,fontWeight:600,color:B.primary}}
                      />
                      <div style={{fontSize:11,color:'#6b7280',marginTop:3}}>Fecha en que se solicita la promesa a la inmobiliaria.</div>
                    </Fld>
                    <PromiseDocsPanel
                      p={p}
                      idx={idx}
                      setEditingProps={setEditingProps}
                      me={me}
                      isReviewer={isAdmin||isOps}
                    />
                  </div>
                )}
                <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:8,marginBottom:8}}>
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
                  <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:8,marginTop:8}}>
                    <Fld label="Porcentaje bono pie (1-20%)">
                      <input type="number" min="1" max="20" value={p.bono_pct} onChange={e=>setEditingProps(prev=>prev.map((x,i)=>i===idx?{...x,bono_pct:Math.min(20,Math.max(1,parseInt(e.target.value)||1))}:x))} style={sty.inp}/>
                    </Fld>
                    <Fld label={'Precio sin bono pie ('+p.moneda+')'}>
                      <div style={{...sty.inp,background:'#F8FAFC',color:B.primary,fontWeight:700,display:'flex',alignItems:'center'}}>
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
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?8:10}}>
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
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?8:10}}>
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
          </div>
          <Fld label="Rol">
            <select value={editUser.role} onChange={e=>setEditUser(p=>({...p,role:e.target.value}))} style={sty.sel}>
              <option value="agent">Agente / Vendedor</option>
              <option value="team_leader">Team Leader</option>
              <option value="operaciones">Operaciones</option>
              <option value="finanzas">Finanzas</option>
              <option value="partner">Socio Comercial</option>
              <option value="admin">Administrador</option>
            </select>
          </Fld>

          {/* Asignar a Team Leader (solo para agentes) */}
          {(editUser.role==='agent') && (() => {
            const tls = (users||[]).filter(u=>u.role==='team_leader')
            if (!tls.length) return null
            return (
              <Fld label="Team Leader (supervisor)">
                <select value={editUser.team_leader_id||''} onChange={e=>setEditUser(p=>({...p,team_leader_id:e.target.value||null}))} style={sty.sel}>
                  <option value="">Sin team leader (agente independiente)</option>
                  {tls.map(tl=><option key={tl.id} value={tl.id}>{tl.name}</option>)}
                </select>
              </Fld>
            )
          })()}

          {/* Resetear clave */}
          <div style={{background:'#FFFBEB',border:'1px solid #fcd34d',borderRadius:8,
            padding:'12px 14px',marginTop:8,display:'flex',alignItems:'center',
            justifyContent:'space-between',gap:10}}>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:'#92400e'}}>Resetear clave</div>
              <div style={{fontSize:11,color:'#b45309'}}>
                {editUser.mustChange ? '⚠️ Tiene clave temporal pendiente de cambio' : 'Genera una clave temporal y la envía por email y WhatsApp'}
              </div>
            </div>
            <button onClick={async()=>{
              const tempPin = genTempPin(8)
              const patch = {pin:tempPin, mustChange:true}
              const nextUsers = users.map(u => u.id===editUser.id ? {...u,...patch} : u)
              setUsers(nextUsers)
              setEditUser(p=>({...p,...patch}))
              if (dbReady) await supabase.from('crm_users').update(patch).eq('id', editUser.id)
              const u = users.find(x=>x.id===editUser.id)
              if (u?.email) {
                try {
                  await fetch('/api/notify', {
                    method:'POST', headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({
                      type:'reset_password', to:u.email,
                      agentName:u.name, adminName:me.name,
                      username:u.username, tempPin, phone:u.phone||''
                    })
                  })
                } catch(e) {}
              }
              msg(`✅ Clave temporal enviada a ${u?.name || 'usuario'}`)
            }} style={{fontSize:11,padding:'6px 12px',borderRadius:8,border:'1px solid #fcd34d',
              background:'#fff',color:'#92400e',cursor:'pointer',fontWeight:700,flexShrink:0}}>
              🔑 Resetear
            </button>
          </div>

          <div style={{display:'flex',gap:8,marginTop:10}}>
            <button
              onClick={()=>{
                const fields = {
                  name:editUser.name, rut:editUser.rut, phone:editUser.phone,
                  email:editUser.email, username:editUser.username, role:editUser.role,
                  agenda_config: editUser.agenda_config || null,
                  team_leader_id: editUser.team_leader_id || null
                }
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
      
      {/* MODAL: Solicitar visita a propiedad */}
      {visitaModal && (
        <Modal title="🏠 Solicitar visita a propiedad" onClose={()=>setVisitaModal(null)}>
          <p style={{fontSize:12,color:'#6b7280',marginBottom:14}}>Completa los datos. Operaciones recibirá un aviso y confirmará la visita.</p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
            <Fld label="Fecha *">
              <input type="date" value={visitaForm.fecha} onChange={e=>setVisitaForm(p=>({...p,fecha:e.target.value}))} style={sty.inp}/>
            </Fld>
            <Fld label="Hora *">
              <input type="time" value={visitaForm.hora} onChange={e=>setVisitaForm(p=>({...p,hora:e.target.value}))} style={sty.inp}/>
            </Fld>
          </div>
          <Fld label="Proyecto / Inmobiliaria *">
            <input value={visitaForm.proyecto} onChange={e=>setVisitaForm(p=>({...p,proyecto:e.target.value}))} placeholder="Ej: Inmobiliaria XYZ — Torre Norte" style={sty.inp}/>
          </Fld>
          <Fld label="Comentario adicional">
            <textarea value={visitaForm.comentario} onChange={e=>setVisitaForm(p=>({...p,comentario:e.target.value}))} placeholder="Información adicional para operaciones..." style={{...sty.inp,minHeight:56,resize:'vertical'}}/>
          </Fld>
          <button
            disabled={!visitaForm.fecha||!visitaForm.hora||!visitaForm.proyecto}
            onClick={async()=>{
              const lead = leads.find(l=>l.id===visitaModal)
              const nuevaVisita = {
                id:'v-'+Date.now(), fecha:visitaForm.fecha, hora:visitaForm.hora,
                proyecto:visitaForm.proyecto, comentario:visitaForm.comentario,
                estado:'solicitada', broker_id:me.id, broker_name:me.name,
                created_at:new Date().toISOString()
              }
              const visitas = [...(lead?.visitas||[]), nuevaVisita]
              const ls = leads.map(l=>l.id===visitaModal?{...l,visitas}:l)
              setLeads(ls)
              if(dbReady) await supabase.from('crm_leads').update({visitas}).eq('id',visitaModal)
              // Notify
              const opsUsers = (users||[]).filter(u=>u.role==='operaciones'||u.role==='admin')
              fetch('/api/notify',{method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({
                  type:'visita_solicitada',
                  brokerName:me.name, brokerEmail:me.email, brokerPhone:me.phone,
                  leadNombre:lead?.nombre||'', fecha:visitaForm.fecha, hora:visitaForm.hora,
                  proyecto:visitaForm.proyecto, comentario:visitaForm.comentario,
                  opsEmails:opsUsers.map(u=>u.email).filter(Boolean),
                  opsPhones:opsUsers.map(u=>u.phone).filter(Boolean)
                })
              }).catch(()=>{})
              setVisitaModal(null)
              setVisitaForm({fecha:'',hora:'10:00',proyecto:'',comentario:''})
              msg('✅ Visita solicitada — Operaciones recibirá un aviso')
              setModal('lead') // reopen lead modal
            }}
            style={{width:'100%',padding:'11px',borderRadius:8,border:'none',fontWeight:700,fontSize:13,cursor:'pointer',
              background:!visitaForm.fecha||!visitaForm.hora||!visitaForm.proyecto?'#e5e7eb':'#059669',
              color:!visitaForm.fecha||!visitaForm.hora||!visitaForm.proyecto?'#9ca3af':'#fff'}}>
            Enviar solicitud de visita
          </button>
        </Modal>
      )}

      {/* MODAL: Cómo se contactó al lead */}
      {contactModal && (
        <Modal title="¿Cómo contactaste a este lead?" onClose={()=>{setContactModal(null);setContactMethod('')}}>
          <p style={{fontSize:13,color:'#6b7280',marginBottom:16}}>Antes de mover a Contactado, indica el medio que usaste.</p>
          <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:20}}>
            {['📞 Llamada telefónica','💬 WhatsApp','📱 SMS','📧 Email','🤝 Presencial'].map(method => (
              <label key={method} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',border:`2px solid ${contactMethod===method?'#1B4FC8':'#E2E8F0'}`,borderRadius:10,cursor:'pointer',background:contactMethod===method?'#EEF2FF':'#fff',fontWeight:contactMethod===method?700:400,fontSize:13}}>
                <input type="radio" name="contactMethod" value={method} checked={contactMethod===method} onChange={()=>setContactMethod(method)} style={{accentColor:'#1B4FC8'}}/>
                {method}
              </label>
            ))}
          </div>
          <button
            disabled={!contactMethod}
            onClick={async ()=>{
              const lid = contactModal.leadId
              await moveStage(lid, 'contactado', null)
              // Save contact method to lead comments
              const lead = leads.find(l=>l.id===lid)
              const note = {id:'c-'+Date.now(), text:`Medio de contacto: ${contactMethod}`, author_name:me.name, date:new Date().toISOString(), system:true}
              const updated = leads.map(l => l.id===lid ? {...l, contacto_medio:contactMethod, comments:[...(l.comments||[]),note]} : l)
              const updLead = updated.find(l=>l.id===lid)
              setLeads(updated)
              if (sel?.id===lid) setSel(updLead)
              if (dbReady) await supabase.from('crm_leads').update({contacto_medio:contactMethod, comments:updLead.comments}).eq('id',lid)
              setContactModal(null); setContactMethod(''); msg('Lead movido a Contactado')
            }}
            style={{width:'100%',padding:'11px',borderRadius:8,border:'none',background:contactMethod?'#1B4FC8':'#e5e7eb',color:contactMethod?'#fff':'#9ca3af',fontWeight:700,fontSize:14,cursor:contactMethod?'pointer':'not-allowed'}}>
            Confirmar y mover a Contactado
          </button>
        </Modal>
      )}

      {/* MODAL: Solicitar visita */}


      
      {/* MODAL: Solicitar visita */}

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
      {modal==='importUsers' && (
        <ImportUsuariosModal
          onClose={()=>setModal(null)}
          users={users}
          saveUsers={saveUsers}
          me={me}
          genTempPin={genTempPin}
          dbReady={dbReady}
          supabase={supabase}
        />
      )}

      {modal==='newUser' && (isAdmin||isOps) && (
        <Modal title="Nuevo usuario" onClose={()=>{setModal(null);setNu(EU)}} wide>
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?8:12}}>
            {[['Nombre completo *','name','text','Juan Pérez'],['RUT *','rut','text','12.345.678-9'],['Teléfono *','phone','text','+56 9 1234 5678'],['Email *','email','email','juan@email.com'],['Usuario (login) *','username','text','juan.perez']].map(([lbl,key,type,ph])=>(
              <Fld key={key} label={lbl}><input type={type} value={nu[key]} onChange={e=>setNu(p=>({...p,[key]:e.target.value}))} placeholder={ph} style={sty.inp}/></Fld>
            ))}
          </div>
          <Fld label="Rol">
            <select value={nu.role} onChange={e=>setNu(p=>({...p,role:e.target.value}))} style={sty.sel}>
              <option value="agent">Agente / Vendedor</option>
              <option value="team_leader">Team Leader</option>
              <option value="operaciones">Operaciones</option>
              <option value="finanzas">Finanzas</option>
              <option value="partner">Socio Comercial</option>
              {isAdmin && <option value="admin">Administrador</option>}
            </select>
          </Fld>
          <div style={{fontSize:11,color:'#9ca3af',marginBottom:10}}>
            🔑 Se generará una clave temporal automáticamente y se enviará al email{nu.phone?' y WhatsApp':''}
          </div>
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
          {/* Avatar upload */}
          <div style={{display:'flex',alignItems:'center',gap:14,marginBottom:16,padding:'12px',background:'#f9fbff',borderRadius:10,border:'1px solid #E2E8F0'}}>
            <div style={{position:'relative',flexShrink:0}}>
              {editP.avatar_url
                ? <img src={editP.avatar_url} alt="avatar" style={{width:64,height:64,borderRadius:'50%',objectFit:'cover',border:'2px solid '+B.border}}/>
                : <AV name={me.name} size={64}/>
              }
              <label htmlFor="avatar-upload" style={{position:'absolute',bottom:-2,right:-2,width:22,height:22,borderRadius:'50%',background:B.primary,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:12,boxShadow:'0 1px 4px rgba(0,0,0,0.2)'}}>
                ✎
              </label>
              <input id="avatar-upload" type="file" accept="image/*" style={{display:'none'}}
                onChange={async e => {
                  const file = e.target.files[0]
                  if (!file) return
                  if (file.size > 2*1024*1024) { setProfErr('La imagen debe ser menor a 2MB'); return }
                  const reader = new FileReader()
                  reader.onload = ev => setEditP(p=>({...p, avatar_url: ev.target.result}))
                  reader.readAsDataURL(file)
                }}/>
            </div>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:'#0F172A'}}>{me.name}</div>
              <div style={{fontSize:12,color:'#6b7280',marginTop:2}}>{me.role}</div>
              <div style={{fontSize:11,color:B.mid,marginTop:4}}>Toca el lápiz para cambiar tu foto</div>
            </div>
          </div>
          <div style={{fontSize:12,fontWeight:700,color:B.mid,marginBottom:10}}>Datos personales</div>
          <Fld label="Nombre completo"><input value={editP.name} onChange={e=>setEditP(p=>({...p,name:e.target.value}))} placeholder="Tu nombre" style={sty.inp}/></Fld>
          <Fld label="Teléfono WhatsApp"><input value={editP.phone} onChange={e=>setEditP(p=>({...p,phone:e.target.value}))} placeholder="+56 9 ..." style={sty.inp}/></Fld>
          <Fld label="Email"><input value={editP.email} onChange={e=>setEditP(p=>({...p,email:e.target.value}))} placeholder="tu@email.com" style={sty.inp}/></Fld>
          {profErr&&<p style={{margin:'0 0 8px',fontSize:12,color:'#991b1b'}}>{profErr}</p>}
          <button onClick={saveProfile} style={{...sty.btnP,width:'100%',marginBottom:4}}>Guardar datos</button>
          <HR/>
          <HR/>
          {/* Google Calendar */}
          <div style={{fontSize:12,fontWeight:700,color:B.mid,marginBottom:10}}>Google Calendar</div>
          {me.google_tokens ? (
            <div style={{padding:'10px 12px',background:'#DCFCE7',borderRadius:8,fontSize:12,marginBottom:8}}>
              <div style={{fontWeight:700,color:'#14532d',marginBottom:2}}>✅ Google Calendar conectado</div>
              <div style={{color:'#166534'}}>{me.google_tokens.email}</div>
              <button onClick={()=>window.location.href=`/api/auth?action=login&userId=${me.id}`}
                style={{marginTop:6,fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid #86efac',background:'#fff',color:'#14532d',cursor:'pointer'}}>
                Reconectar
              </button>
            </div>
          ) : (
            <div style={{marginBottom:8}}>
              <div style={{fontSize:11,color:'#6b7280',marginBottom:8}}>Conecta tu Google Calendar para agendar reuniones directamente desde el CRM y enviar invitaciones automáticas a los clientes.</div>
              <button onClick={()=>window.location.href=`/api/auth?action=login&userId=${me.id}`}
                style={{width:'100%',padding:'9px 14px',borderRadius:8,border:'none',background:'#1a73e8',color:'#fff',cursor:'pointer',fontWeight:600,fontSize:13,display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Conectar Google Calendar
              </button>
            </div>
          )}
          <HR/>
          <div style={{fontSize:12,fontWeight:700,color:B.mid,marginBottom:10}}>Cambiar clave</div>
          <Fld label="Clave actual"><input type="password" value={pinF.cur} onChange={e=>setPinF(p=>({...p,cur:e.target.value}))} placeholder="••••" style={sty.inp}/></Fld>
          <Fld label="Nueva clave"><input type="password" value={pinF.n1} onChange={e=>setPinF(p=>({...p,n1:e.target.value}))} placeholder="Mínimo 6 caracteres, letras y números" style={sty.inp}/></Fld>
          <Fld label="Repetir nueva clave"><input type="password" value={pinF.n2} onChange={e=>setPinF(p=>({...p,n2:e.target.value}))} placeholder="••••" style={sty.inp}/></Fld>
          <div style={{fontSize:11,color:'#6b7280',marginBottom:8,background:'#EFF6FF',padding:'6px 10px',borderRadius:6}}>
            Entre 6 y 12 caracteres · debe tener letras y números (ej: Rb4xK2mP)
          </div>
          {pinErr&&<p style={{margin:'0 0 8px',fontSize:12,color:'#991b1b'}}>{pinErr}</p>}
          <button onClick={changePin} style={{...sty.btnO,width:'100%'}}>Actualizar PIN</button>
        </Modal>
      )}
    </div>
  )
}

// ─── Operación 360 / Finanzas / Portal Broker ───────────────────────────────
const OP_STATUS = {
  handoff_pendiente: {l:'Handoff pendiente', bg:'#FEF2F2', col:'#991b1b'},
  docs_incompletos: {l:'Docs incompletos', bg:'#FFFBEB', col:'#92400e'},
  en_revision: {l:'En revisión', bg:'#EFF6FF', col:'#1d4ed8'},
  solicitud_promesa: {l:'Solicitud de promesa', bg:'#ECFEFF', col:'#155e75'},
  promesa: {l:'Promesa', bg:'#FFF7ED', col:'#9a3412'},
  credito: {l:'Crédito', bg:'#F5F3FF', col:'#5b21b6'},
  escritura: {l:'Escritura', bg:'#FEF9C3', col:'#713f12'},
  entregado: {l:'Entregado', bg:'#DCFCE7', col:'#14532d'},
}
const FIN_STATUS = {
  no_devengado: {l:'No devengado', bg:'#F9FAFB', col:'#374151'},
  solicitar_oc: {l:'Solicitar OC', bg:'#FFFBEB', col:'#92400e'},
  oc_recibida: {l:'OC recibida', bg:'#EFF6FF', col:'#1d4ed8'},
  facturado: {l:'Facturado Rabbitts', bg:'#F5F3FF', col:'#5b21b6'},
  cobrado_inmob: {l:'Cobrado inmobiliaria', bg:'#FEF9C3', col:'#713f12'},
  broker_facturar: {l:'Broker debe facturar', bg:'#FFF7ED', col:'#9a3412'},
  broker_pagado: {l:'Broker pagado', bg:'#DCFCE7', col:'#14532d'},
}
const PROMESA_DOCS = [
  {key:'cedula', label:'Cédula / Pasaporte'},
  {key:'comprobante_reserva', label:'Comprobante de reserva'},
  {key:'preaprobacion', label:'Preaprobación / evaluación hipotecaria'},
  {key:'renta', label:'Liquidaciones / respaldo de renta'},
  {key:'carpeta_tributaria', label:'Carpeta tributaria'},
  {key:'condiciones_comerciales', label:'Condiciones comerciales / pie'}
]
const DOCS_360 = ['Cédula/Pasaporte','Comprobante reserva','Preaprobación','Liquidaciones','Carpeta tributaria','Promesa','Comprobante pie','Escritura','Factura Rabbitts','Factura broker','Administración','Tributación']
function nnum(v){ return parseFloat(String(v||'').replace(/\./g,'').replace(',','.')) || 0 }
function fmt360(v){ return (parseFloat(v)||0).toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2}) }
function days360(iso){ if(!iso) return 9999; return Math.floor((Date.now()-new Date(iso).getTime())/86400000) }
function docsPromesaProgress(d){ const docs=d.docs_promesa||{}; const ok=PROMESA_DOCS.filter(x=>docs[x.key]?.data_url||docs[x.key]?.estado==='aprobado'||docs[x.key]?.estado==='recibido').length; return {ok,total:PROMESA_DOCS.length,pct:PROMESA_DOCS.length?Math.round(ok*100/PROMESA_DOCS.length):0} }
function docsProgress360(d){ const states=d.docs_estado||{}; const legacyOk=DOCS_360.filter(x=>states[x]==='aprobado'||states[x]==='recibido').length; const prom=docsPromesaProgress(d); const total=DOCS_360.length+prom.total; const ok=legacyOk+prom.ok; return {ok,total,pct:total?Math.round(ok*100/total):0,promesa:prom} }
function inferOpStatus360(p){ if(p.entrega_propiedad||p.estado_operativo==='entregado') return 'entregado'; if(p.escritura_firmada||p.inscripcion_cbr||p.estado_operativo==='escritura') return 'escritura'; if(p.aprobacion_final||p.estado_operativo==='credito') return 'credito'; if(p.promesa_firmada||p.estado_operativo==='promesa') return 'promesa'; if(p.solicitud_promesa_fecha||p.estado_operativo==='solicitud_promesa') return 'solicitud_promesa'; if(docsProgress360(p).pct<45) return 'docs_incompletos'; return p.estado_operativo||'en_revision' }
function inferFinStatus360(p){ if(p.broker_pago_fecha||p.estado_financiero==='broker_pagado'||p.oc_estado==='pagado_broker') return 'broker_pagado'; if(p.inmob_pago_fecha||p.estado_financiero==='broker_facturar'||p.oc_estado==='broker_factura') return 'broker_facturar'; if(p.factura_fecha||p.estado_financiero==='facturado'||p.oc_estado==='factura_rabbitts') return 'facturado'; if(p.oc_fecha_recepcion||p.estado_financiero==='oc_recibida'||p.oc_estado==='oc_recibida') return 'oc_recibida'; if(p.estado_financiero==='solicitar_oc'||p.oc_estado==='pendiente_oc') return 'solicitar_oc'; return p.estado_financiero||'no_devengado' }
function slaAlerts360(d){
  const rules = [
    {l:'Reserva sin handoff completo', d:2, test:x=>!x.fecha_reserva||!x.ejecutivo_inmobiliaria||!x.condiciones_especiales},
    {l:'Reserva sin promesa firmada', d:7, test:x=>!x.promesa_firmada&&!['escritura','entregado'].includes(x.estado_operativo)},
    {l:'Documentos incompletos', d:5, test:x=>(x.estado_operativo||'')==='docs_incompletos'||x.docProgress.pct<45},
    {l:'OC pendiente', d:10, test:x=>x.estado_financiero==='solicitar_oc'||(x.oc_estado==='pendiente_oc'&&['firma','escritura','ganado'].includes(x.leadStage))},
    {l:'Factura Rabbitts pendiente', d:15, test:x=>x.estado_financiero==='oc_recibida'||x.oc_estado==='oc_recibida'},
    {l:'Cobro inmobiliaria atrasado', d:30, test:x=>x.estado_financiero==='facturado'||x.oc_estado==='factura_rabbitts'},
    {l:'Broker pendiente de factura/pago', d:7, test:x=>x.estado_financiero==='broker_facturar'||x.oc_estado==='broker_factura'},
  ]
  return rules.filter(r=>d.days>=r.d&&r.test(d)).map(r=>r.l)
}
function buildDeals360(leads=[], users=[], stages=[], commissions={}, indicators={}){
  const uf = indicators.uf ? nnum(indicators.uf) : 0
  const usd = indicators.dolar ? nnum(indicators.dolar) : 0
  return (leads||[]).flatMap(l=>(l.propiedades||[]).map((p,pi)=>{
    const key=l.id+'-'+(p.id||('idx'+pi)); const comm=commissions[key]||{pctComision:'',pctBroker:'',cobrado:false}; const base=nnum(p.bono_pie?p.precio_sin_bono:p.precio)
    const comisionTotal=base*nnum(comm.pctComision)/100; const comisionBroker=comisionTotal*nnum(comm.pctBroker)/100
    const clp=p.moneda==='UF'&&uf?Math.round(comisionBroker*uf):p.moneda==='USD'&&usd?Math.round(comisionBroker*usd):0
    const ag=users.find(u=>u.id===l.assigned_to)||{}; const st=stages.find(s=>s.id===l.stage)||{}; const created=p.fecha_reserva||l.stage_moved_at||l.fecha
    const d={...p,key,leadId:l.id,propId:p.id,idx:pi,leadNombre:l.nombre,leadTelefono:l.telefono,leadEmail:l.email,leadStage:l.stage,leadStageLabel:st.label||l.stage,brokerId:l.assigned_to,brokerName:ag.name||'Sin broker',brokerPhone:ag.phone||'',created,days:days360(created),comm,base,comisionTotal,comisionBroker,comisionClp:clp}
    d.estado_operativo=d.estado_operativo||inferOpStatus360(d); d.estado_financiero=d.estado_financiero||inferFinStatus360(d); d.docProgress=docsProgress360(d); d.alerts=slaAlerts360(d); d.health=d.riesgo_caida==='alto'||d.alerts.length>=3?'alto':d.alerts.length>=1||d.riesgo_caida==='medio'?'medio':'bajo'
    return d
  }))
}
function Chip360({children, styleMap, value}){ const s=(styleMap&&styleMap[value])||{l:value,bg:'#F9FAFB',col:'#374151'}; return <span style={{fontSize:11,padding:'4px 10px',borderRadius:99,background:s.bg,color:s.col,fontWeight:800,whiteSpace:'nowrap'}}>{children||s.l}</span> }
function Kpi360({label,value,sub,bg='#fff',col=B.primary}){ return <div style={{background:bg,border:'1px solid #E2E8F0',borderRadius:14,padding:'14px 16px'}}><div style={{fontSize:11,color:'#64748B',fontWeight:800,textTransform:'uppercase',letterSpacing:.4}}>{label}</div><div style={{fontSize:24,fontWeight:900,color:col,marginTop:4}}>{value}</div>{sub&&<div style={{fontSize:11,color:'#64748B',marginTop:2}}>{sub}</div>}</div> }
function Field360({label, children}){ return <div><div style={{fontSize:11,color:'#64748B',fontWeight:800,marginBottom:4}}>{label}</div>{children}</div> }
function Select360({value,onChange,children}){ return <select value={value||''} onChange={e=>onChange(e.target.value)} style={{...sty.sel,fontSize:12,padding:'7px 10px'}}>{children}</select> }
function Text360({value,onChange,placeholder=''}){ return <input value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{...sty.inp,fontSize:12,padding:'7px 10px'}}/> }

function Operaciones360View({leads, users, stages, commissions, indicators, savePropField, setSel, setModal, setLeads, supabase, dbReady}){
  const [q,setQ]=React.useState(''); const [status,setStatus]=React.useState('all'); const [risk,setRisk]=React.useState('all'); const [expanded,setExpanded]=React.useState({})
  const deals=buildDeals360(leads,users,stages,commissions,indicators).filter(d=>['reserva','solicitud_promesa','firma','escritura','ganado','desistio'].includes(d.leadStage)||d.fecha_reserva||d.estado_operativo!=='handoff_pendiente')
  const filtered=deals.filter(d=>{const txt=(d.leadNombre+' '+d.brokerName+' '+d.inmobiliaria+' '+d.proyecto+' '+d.depto).toLowerCase(); if(q&&!txt.includes(q.toLowerCase()))return false; if(status!=='all'&&d.estado_operativo!==status)return false; if(risk!=='all'&&d.health!==risk)return false; return true})
  const alerts=deals.flatMap(d=>d.alerts.map(a=>({a,d}))); const update=(d,fields,label='Operaciones 360')=>savePropField&&savePropField(d.leadId,d.propId,fields,label)
  return <div><div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:14}}><div><div style={{fontSize:20,fontWeight:900,color:B.primary}}>🧩 Operaciones 360</div><div style={{fontSize:12,color:B.mid}}>Control post reserva: documentos, promesa, crédito, escritura, entrega y trazabilidad.</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar cliente, broker, proyecto..." style={{...sty.inp,width:260}}/><Select360 value={status} onChange={setStatus}><option value="all">Todos los estados</option>{Object.entries(OP_STATUS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</Select360><Select360 value={risk} onChange={setRisk}><option value="all">Todo riesgo</option><option value="alto">Riesgo alto</option><option value="medio">Riesgo medio</option><option value="bajo">Riesgo bajo</option></Select360></div></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginBottom:14}}><Kpi360 label="Operaciones" value={deals.length}/><Kpi360 label="Alertas SLA" value={alerts.length} bg="#FEF2F2" col="#991b1b"/><Kpi360 label="Docs promedio" value={(deals.length?Math.round(deals.reduce((s,d)=>s+d.docProgress.pct,0)/deals.length):0)+'%'}/><Kpi360 label="Riesgo alto" value={deals.filter(d=>d.health==='alto').length} bg="#FFF7ED" col="#9a3412"/></div>
    {alerts.length>0&&<div style={{background:'#fff',border:'1px solid #FCA5A5',borderRadius:14,padding:14,marginBottom:14}}><div style={{fontWeight:900,color:'#991b1b',fontSize:13,marginBottom:8}}>🚨 Alertas que requieren acción</div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:8}}>{alerts.slice(0,8).map((x,i)=><div key={i} style={{fontSize:12,padding:10,borderRadius:10,background:'#FEF2F2',color:'#7f1d1d'}}><strong>{x.d.leadNombre}</strong> · {x.d.proyecto}<br/>{x.a} · {x.d.days} días</div>)}</div></div>}
    <div style={{display:'grid',gap:10}}>{filtered.map(d=>{const open=!!expanded[d.key]; return <div key={d.key} style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,overflow:'hidden'}}><div style={{padding:14,display:'flex',gap:12,alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap'}}><div style={{minWidth:260,flex:1}}><div style={{fontWeight:900,color:'#0F172A',fontSize:14}}>{d.leadNombre} · {d.proyecto}{d.depto?' · '+d.depto:''}</div><div style={{fontSize:12,color:'#64748B',marginTop:3}}>Broker: <strong>{d.brokerName}</strong> · {d.inmobiliaria} · {d.moneda} {fmt360(d.base)}</div><div style={{marginTop:8,display:'flex',gap:6,flexWrap:'wrap'}}><Chip360 styleMap={OP_STATUS} value={d.estado_operativo}/><Chip360 styleMap={{alto:{l:'Riesgo alto',bg:'#FEF2F2',col:'#991b1b'},medio:{l:'Riesgo medio',bg:'#FFFBEB',col:'#92400e'},bajo:{l:'Riesgo bajo',bg:'#DCFCE7',col:'#14532d'}}} value={d.health}/><span style={{fontSize:11,color:'#64748B',fontWeight:800,padding:'4px 10px'}}>Docs {d.docProgress.pct}%</span></div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button onClick={()=>setExpanded(e=>({...e,[d.key]:!open}))} style={sty.btnO}>{open?'Cerrar':'Gestionar'}</button><button onClick={()=>{const lead=leads.find(l=>l.id===d.leadId); if(lead){setSel(lead);setModal('lead')}}} style={sty.btn}>Ver lead</button></div></div>{open&&<div style={{borderTop:'1px solid #E2E8F0',padding:14,background:'#F8FAFC'}}><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10,marginBottom:12}}><Field360 label="Estado operativo"><Select360 value={d.estado_operativo} onChange={v=>update(d,{estado_operativo:v},'Cambio estado operativo')}>{Object.entries(OP_STATUS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</Select360></Field360><Field360 label="Riesgo de caída"><Select360 value={d.riesgo_caida||'medio'} onChange={v=>update(d,{riesgo_caida:v},'Cambio riesgo operación')}><option value="bajo">Bajo</option><option value="medio">Medio</option><option value="alto">Alto</option></Select360></Field360><Field360 label="Ejecutivo inmobiliaria"><Text360 value={d.ejecutivo_inmobiliaria} onChange={v=>update(d,{ejecutivo_inmobiliaria:v},'Actualiza ejecutivo inmobiliaria')} placeholder="Nombre / WhatsApp"/></Field360><Field360 label="Forma pago pie"><Text360 value={d.forma_pago_pie} onChange={v=>update(d,{forma_pago_pie:v},'Actualiza pago pie')} placeholder="Ej: 48 cuotas"/></Field360></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10,marginBottom:12}}>{[['Fecha reserva','fecha_reserva'],['Promesa enviada','promesa_enviada'],['Promesa firmada','promesa_firmada'],['Pie confirmado','pie_confirmado'],['Preaprobación','preaprobacion'],['Aprobación final','aprobacion_final'],['Escritura firmada','escritura_firmada'],['Entrega propiedad','entrega_propiedad']].map(([lbl,k])=><Field360 key={k} label={lbl}><input type="date" value={d[k]||''} onChange={e=>update(d,{[k]:e.target.value},'Actualiza '+lbl)} style={{...sty.inp,fontSize:12,padding:'7px 10px'}}/></Field360>)}</div><Field360 label="Condiciones especiales prometidas al cliente"><textarea value={d.condiciones_especiales||''} onChange={e=>update(d,{condiciones_especiales:e.target.value},'Actualiza condiciones especiales')} style={{...sty.inp,minHeight:60,resize:'vertical'}} placeholder="Aquí debe quedar todo lo prometido por el broker o la inmobiliaria."/></Field360><div style={{marginTop:12,background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:12}}><div style={{fontWeight:900,color:B.primary,fontSize:13,marginBottom:8}}>📎 Documentos por operación</div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:8}}>{DOCS_360.map(doc=>{const val=(d.docs_estado||{})[doc]||'pendiente'; return <div key={doc} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,fontSize:12,padding:8,border:'1px solid #E2E8F0',borderRadius:10}}><span>{doc}</span><select value={val} onChange={e=>update(d,{docs_estado:{...(d.docs_estado||{}),[doc]:e.target.value}},'Actualiza documento '+doc)} style={{fontSize:11,border:'1px solid #E2E8F0',borderRadius:7,padding:'4px 6px'}}><option value="pendiente">Pendiente</option><option value="recibido">Recibido</option><option value="aprobado">Aprobado</option><option value="rechazado">Rechazado</option></select></div>})}</div></div>{(d.operational_log||[]).length>0&&<div style={{marginTop:12,fontSize:11,color:'#64748B'}}>Última trazabilidad: {(d.operational_log||[]).slice(-3).reverse().map((x,i)=><span key={i} style={{display:'block'}}>• {fmt(x.at)} · {x.by}: {x.action}</span>)}</div>}
{/* ── Visitas solicitadas ── */}
{(()=>{const lead=leads.find(l=>l.id===d.leadId); const visitas=lead?.visitas||[]; if(!visitas.length) return null; return(
<div style={{marginTop:12,background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:12}}>
  <div style={{fontWeight:900,color:B.primary,fontSize:13,marginBottom:8}}>🏠 Solicitudes de visita</div>
  {visitas.map((v,vi)=>(
    <div key={vi} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:8,marginBottom:4,background:v.estado==='confirmada'?'#F0FDF4':v.estado==='rechazada'?'#FEF2F2':'#EFF6FF',border:'1px solid '+(v.estado==='confirmada'?'#86efac':v.estado==='rechazada'?'#fca5a5':'#bfdbfe')}}>
      <div style={{flex:1,fontSize:12}}>
        <strong>{v.fecha} {v.hora}</strong> · {v.proyecto} · {v.broker_name}
        {v.comentario&&<div style={{color:'#6b7280',fontSize:11}}>{v.comentario}</div>}
      </div>
      <select value={v.estado} onChange={async e=>{
        const newEstado=e.target.value
        const newVisitas=visitas.map((x,xi)=>xi===vi?{...x,estado:newEstado,confirmado_por:me?.name||'Operaciones',confirmado_at:new Date().toISOString()}:x)
        if(supabase&&dbReady) await supabase.from('crm_leads').update({visitas:newVisitas}).eq('id',d.leadId)
        if(setLeads) setLeads(ls=>ls.map(l=>l.id===d.leadId?{...l,visitas:newVisitas}:l))
      }} style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'1px solid #E2E8F0',fontWeight:700,
        background:v.estado==='confirmada'?'#DCFCE7':v.estado==='rechazada'?'#FEF2F2':'#EFF6FF',
        color:v.estado==='confirmada'?'#14532d':v.estado==='rechazada'?'#991b1b':'#1d4ed8'}}>
        <option value="solicitada">⏳ Solicitada</option>
        <option value="confirmada">✅ Confirmada</option>
        <option value="rechazada">❌ Rechazada</option>
      </select>
    </div>
  ))}
</div>
)})()} 
</div>}</div>})}</div>{filtered.length===0&&<div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,padding:30,textAlign:'center',color:'#94a3b8'}}>Sin operaciones con este filtro.</div>}</div>
}

function Finanzas360View({leads, users, stages, commissions, indicators, savePropField, saveCommission, setCommissions}){
  const [f,setF]=React.useState('all')
  const [moneda,setMoneda]=React.useState('all')
  const deals=buildDeals360(leads,users,stages,commissions,indicators).filter(d=>['reserva','solicitud_promesa','firma','escritura','ganado','desistio'].includes(d.leadStage)||d.fecha_reserva)
  const filtered=deals.filter(d=>{
    if(f!=='all' && d.estado_financiero!==f) return false
    if(moneda!=='all' && d.moneda!==moneda) return false
    return true
  })
  const byCurrency = cur => filtered.filter(d=>d.moneda===cur)
  const sum = (arr, field) => arr.reduce((s,d)=>s+(parseFloat(d[field])||0),0)
  const ufDeals=byCurrency('UF'), usdDeals=byCurrency('USD')
  const totalUF=sum(ufDeals,'comisionTotal'), brokerUF=sum(ufDeals,'comisionBroker'), margenUF=totalUF-brokerUF
  const totalUSD=sum(usdDeals,'comisionTotal'), brokerUSD=sum(usdDeals,'comisionBroker'), margenUSD=totalUSD-brokerUSD
  const update=(d,fields,label='Finanzas 360')=>savePropField&&savePropField(d.leadId,d.propId,fields,label)
  const setComm=(d,field,val)=>{const next={...(commissions[d.key]||{}),[field]:val}; setCommissions(prev=>({...prev,[d.key]:next})); saveCommission&&saveCommission(d.key,next)}
  const MoneyKpi = ({cur,total,broker,margen,count,bg='#fff',col=B.primary}) => <div style={{background:bg,border:'1px solid #E2E8F0',borderRadius:14,padding:14}}><div style={{fontSize:11,color:'#64748B',fontWeight:900,textTransform:'uppercase'}}>{cur} · {count} operaciones</div><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginTop:8}}><div><div style={{fontSize:10,color:'#64748B',fontWeight:800}}>Por cobrar</div><div style={{fontSize:18,fontWeight:950,color:col}}>{cur} {fmt360(total)}</div></div><div><div style={{fontSize:10,color:'#64748B',fontWeight:800}}>Broker</div><div style={{fontSize:18,fontWeight:950,color:'#166534'}}>{cur} {fmt360(broker)}</div></div><div><div style={{fontSize:10,color:'#64748B',fontWeight:800}}>Margen</div><div style={{fontSize:18,fontWeight:950,color:'#7c3aed'}}>{cur} {fmt360(margen)}</div></div></div></div>
  const renderTable = cur => {
    const rows = filtered.filter(d=>d.moneda===cur)
    return <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,overflow:'hidden',marginTop:12}}><div style={{padding:'10px 12px',background:cur==='UF'?'#FFFBEB':'#F0FDF4',fontWeight:950,color:cur==='UF'?'#92400e':'#166534'}}>Operaciones en {cur}</div><table className="rcrm-table" style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr style={{background:'#F8FAFC',color:'#334155',textAlign:'left'}}>{['Cliente / operación','Broker','Estado financiero','% comisión','% broker','Por cobrar','Por pagar broker','Fechas clave'].map(h=><th key={h} style={{padding:10}}>{h}</th>)}</tr></thead><tbody>{rows.map(d=><tr key={d.key} style={{borderTop:'1px solid #E2E8F0'}}><td style={{padding:10,fontWeight:800}}>{d.leadNombre}<div style={{fontWeight:500,color:'#64748B'}}>{d.inmobiliaria} · {d.proyecto} · {cur} {fmt360(d.base)}</div></td><td style={{padding:10}}>{d.brokerName}</td><td style={{padding:10}}><Select360 value={d.estado_financiero} onChange={v=>update(d,{estado_financiero:v},'Cambio estado financiero')}>{Object.entries(FIN_STATUS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</Select360></td><td style={{padding:10,width:110}}><input value={d.comm.pctComision||''} onChange={e=>setComm(d,'pctComision',e.target.value)} placeholder="4" style={{...sty.inp,padding:6,fontSize:12}}/></td><td style={{padding:10,width:110}}><input value={d.comm.pctBroker||''} onChange={e=>setComm(d,'pctBroker',e.target.value)} placeholder="60" style={{...sty.inp,padding:6,fontSize:12}}/></td><td style={{padding:10,fontWeight:950,color:B.primary}}>{cur} {fmt360(d.comisionTotal)}</td><td style={{padding:10,fontWeight:950,color:'#166534'}}>{cur} {fmt360(d.comisionBroker)}{d.comisionClp?<div style={{fontSize:10,color:'#64748B'}}>${d.comisionClp.toLocaleString('es-CL')} CLP ref.</div>:null}</td><td style={{padding:10,minWidth:210}}><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>{[['OC','oc_fecha_recepcion'],['Fact. R.','factura_fecha'],['Pagó Inmob.','inmob_pago_fecha'],['Pagó Broker','broker_pago_fecha']].map(([lbl,k])=><label key={k} style={{fontSize:10,color:'#64748B',fontWeight:700}}>{lbl}<input type="date" value={d[k]||''} onChange={e=>update(d,{[k]:e.target.value},'Actualiza '+lbl)} style={{...sty.inp,padding:5,fontSize:11}}/></label>)}</div></td></tr>)}</tbody></table>{rows.length===0&&<div style={{padding:22,textAlign:'center',color:'#94a3b8'}}>Sin operaciones en {cur} con este filtro.</div>}</div>
  }
  return <div><div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',marginBottom:14}}><div><div style={{fontSize:20,fontWeight:900,color:B.primary}}>🏦 Finanzas 360</div><div style={{fontSize:12,color:B.mid}}>Control único de finanzas: cobro inmobiliaria, pago broker y margen. UF y USD siempre separados.</div></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Select360 value={f} onChange={setF}><option value="all">Todos los estados financieros</option>{Object.entries(FIN_STATUS).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</Select360><Select360 value={moneda} onChange={setMoneda}><option value="all">UF + USD separados</option><option value="UF">Solo UF</option><option value="USD">Solo USD</option></Select360></div></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:10,marginBottom:12}}>{(moneda==='all'||moneda==='UF')&&<MoneyKpi cur="UF" total={totalUF} broker={brokerUF} margen={margenUF} count={ufDeals.length} bg="#FFFBEB" col="#92400e"/>}{(moneda==='all'||moneda==='USD')&&<MoneyKpi cur="USD" total={totalUSD} broker={brokerUSD} margen={margenUSD} count={usdDeals.length} bg="#F0FDF4" col="#166534"/>}</div>{(moneda==='all'||moneda==='UF')&&renderTable('UF')}{(moneda==='all'||moneda==='USD')&&renderTable('USD')}</div>
}

function PortalBrokerView({leads, users, stages, commissions, indicators, me}){
  const deals=buildDeals360(leads,users,stages,commissions,indicators).filter(d=>d.brokerId===me.id)
  const activos=deals.filter(d=>d.estado_financiero!=='broker_pagado')
  const pagados=deals.filter(d=>d.estado_financiero==='broker_pagado')
  const sumCur = (arr, cur) => arr.filter(d=>d.moneda===cur).reduce((s,d)=>s+(parseFloat(d.comisionBroker)||0),0)
  const ufTotal=sumCur(deals,'UF'), usdTotal=sumCur(deals,'USD'), ufPend=sumCur(activos,'UF'), usdPend=sumCur(activos,'USD')
  return <div><div style={{fontSize:20,fontWeight:900,color:B.primary,marginBottom:4}}>🧑‍💼 Portal Broker</div><div style={{fontSize:12,color:B.mid,marginBottom:14}}>Tus operaciones, pendientes post reserva, comisiones proyectadas y pagos. UF y USD se muestran separados.</div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginBottom:14}}><Kpi360 label="Operaciones activas" value={activos.length}/><Kpi360 label="Comisión UF" value={'UF '+fmt360(ufTotal)} bg="#FFFBEB" col="#92400e"/><Kpi360 label="Comisión USD" value={'USD '+fmt360(usdTotal)} bg="#F0FDF4" col="#166534"/><Kpi360 label="Pendiente UF" value={'UF '+fmt360(ufPend)} bg="#FFF7ED" col="#9a3412"/><Kpi360 label="Pendiente USD" value={'USD '+fmt360(usdPend)} bg="#ECFDF5" col="#047857"/><Kpi360 label="Pagadas" value={pagados.length} bg="#DCFCE7" col="#14532d"/></div><div style={{display:'grid',gap:10}}>{deals.map(d=><div key={d.key} style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,padding:14}}><div style={{display:'flex',justifyContent:'space-between',gap:10,flexWrap:'wrap'}}><div><div style={{fontWeight:900,color:'#0F172A'}}>{d.leadNombre} · {d.proyecto}{d.depto?' · '+d.depto:''}</div><div style={{fontSize:12,color:'#64748B'}}>{d.inmobiliaria} · {d.moneda} {fmt360(d.base)} · Etapa {d.leadStageLabel}</div></div><div style={{textAlign:'right'}}><div style={{fontSize:11,color:'#64748B',fontWeight:800}}>Mi comisión</div><div style={{fontSize:20,fontWeight:900,color:d.moneda==='UF'?'#92400e':'#166534'}}>{d.moneda} {fmt360(d.comisionBroker)}</div>{d.comisionClp?<div style={{fontSize:11,color:'#64748B'}}>${d.comisionClp.toLocaleString('es-CL')} CLP ref.</div>:null}</div></div><div style={{marginTop:10,display:'flex',gap:6,flexWrap:'wrap'}}><Chip360 styleMap={OP_STATUS} value={d.estado_operativo}/><Chip360 styleMap={FIN_STATUS} value={d.estado_financiero}/><span style={{fontSize:11,color:'#64748B',fontWeight:800,padding:'4px 10px'}}>Docs {d.docProgress.pct}%</span>{d.alerts.length>0&&<span style={{fontSize:11,padding:'4px 10px',borderRadius:99,background:'#FEF2F2',color:'#991b1b',fontWeight:800}}>⚠ {d.alerts.length} pendiente(s)</span>}</div>{d.estado_financiero==='broker_facturar'&&<div style={{marginTop:10,padding:10,borderRadius:10,background:'#FFF7ED',color:'#9a3412',fontSize:12,fontWeight:700}}>La inmobiliaria ya pagó. Debes enviar tu factura/boleta a Rabbitts para liberar pago.</div>}</div>)}</div>{deals.length===0&&<div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,padding:30,textAlign:'center',color:'#94a3b8'}}>Aún no tienes operaciones post reserva registradas.</div>}</div>
}

function RabitoInternoView({leads, users, stages, commissions, indicators}){
  const [ask,setAsk]=React.useState('operaciones atrasadas')
  const deals=buildDeals360(leads,users,stages,commissions,indicators)
  const atrasadas=deals.filter(d=>d.alerts.length>0).sort((a,b)=>b.alerts.length-a.alerts.length)
  const brokerPend=deals.filter(d=>d.estado_financiero==='broker_facturar')
  const ocPend=deals.filter(d=>['solicitar_oc','oc_recibida','facturado'].includes(d.estado_financiero)&&!d.inmob_pago_fecha)
  const docsPend=deals.filter(d=>d.docProgress?.promesa?.pct < 100)
  const opciones = [
    {id:'operaciones atrasadas', label:'Operaciones atrasadas'},
    {id:'documentos promesa', label:'Documentos para promesa'},
    {id:'oc inmobiliaria', label:'OC / cobros inmobiliaria'},
    {id:'broker pagar', label:'Brokers por pagar'}
  ]
  const respuesta=(()=>{
    const q=ask.toLowerCase()
    if(q.includes('broker')||q.includes('pagar')) return brokerPend.length?'Hay '+brokerPend.length+' operación(es) donde el broker debe facturar o Finanzas debe pagar. Prioridad: '+brokerPend.slice(0,5).map(d=>d.leadNombre+' / '+d.brokerName).join(', ')+'.':'No veo pagos a broker bloqueados ahora.'
    if(q.includes('oc')||q.includes('cobrar')||q.includes('inmobiliaria')) return ocPend.length?'Hay '+ocPend.length+' cuenta(s) por cobrar o por gestionar con inmobiliarias. Revisa primero: '+ocPend.slice(0,5).map(d=>d.inmobiliaria+' / '+d.leadNombre).join(', ')+'.':'No veo OC/cobros críticos pendientes.'
    if(q.includes('document')) return docsPend.length?'Hay '+docsPend.length+' operación(es) sin documentos esenciales completos para solicitud de promesa. Primeras: '+docsPend.slice(0,5).map(d=>d.leadNombre+' '+(d.docProgress.promesa?.pct||0)+'%').join(', ')+'.':'Los documentos esenciales para promesa se ven completos.'
    return atrasadas.length?'Hay '+atrasadas.length+' operación(es) atrasadas. Prioridad: '+atrasadas.slice(0,6).map(d=>d.leadNombre+' ('+d.alerts[0]+')').join(', ')+'.':'No veo operaciones atrasadas según las reglas SLA configuradas.'
  })()
  return <div><div style={{fontSize:20,fontWeight:900,color:B.primary,marginBottom:4}}>🐰 Rabito Interno</div><div style={{fontSize:12,color:B.mid,marginBottom:14}}>Asistente operativo basado en datos del CRM. Usa consultas rápidas para evitar preguntas editables o ambiguas.</div><div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,padding:16,marginBottom:14}}><Field360 label="Consulta rápida"><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{opciones.map(o=><button key={o.id} onClick={()=>setAsk(o.id)} style={{fontSize:12,padding:'8px 12px',borderRadius:10,border:ask===o.id?'2px solid '+B.primary:'1px solid #E2E8F0',background:ask===o.id?B.light:'#fff',color:ask===o.id?B.primary:'#475569',fontWeight:ask===o.id?800:600,cursor:'pointer'}}>{o.label}</button>)}</div></Field360><div style={{marginTop:14,padding:14,borderRadius:12,background:B.light,color:'#0F172A',lineHeight:1.55,fontSize:14}}><strong>Rabito:</strong> {respuesta}</div></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10}}><Kpi360 label="Operaciones con alerta" value={atrasadas.length} bg="#FEF2F2" col="#991b1b"/><Kpi360 label="Docs promesa incompletos" value={docsPend.length} bg="#FFFBEB" col="#92400e"/><Kpi360 label="Brokers por facturar/pagar" value={brokerPend.length} bg="#FFF7ED" col="#9a3412"/><Kpi360 label="Cobros inmobiliaria pendientes" value={ocPend.length} bg="#FFFBEB" col="#92400e"/></div></div>
}


function PromiseDocsPanel({p, idx, setEditingProps, me, isReviewer}) {
  const progress = docsPromesaProgress(p)
  const setDoc = (docKey, patch) => {
    setEditingProps(prev => prev.map((x,i) => i===idx ? {
      ...x,
      docs_promesa: {
        ...(x.docs_promesa || {}),
        [docKey]: { ...(((x.docs_promesa || {})[docKey]) || {}), ...patch }
      }
    } : x))
  }
  const upload = (docKey, file) => {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { alert('Archivo máximo 2MB para esta versión'); return }
    const reader = new FileReader()
    reader.onload = ev => setDoc(docKey, {
      file_name: file.name,
      data_url: ev.target.result,
      estado: 'recibido',
      uploaded_at: new Date().toISOString(),
      uploaded_by: me?.name || ''
    })
    reader.readAsDataURL(file)
  }
  const statusStyle = estado => estado==='aprobado'
    ? {bg:'#DCFCE7', col:'#14532d', label:'Aprobado'}
    : estado==='rechazado'
      ? {bg:'#FEF2F2', col:'#991b1b', label:'Rechazado'}
      : estado==='recibido'
        ? {bg:'#EFF6FF', col:'#1d4ed8', label:'Recibido'}
        : {bg:'#F8FAFC', col:'#64748B', label:'Pendiente'}
  return (
    <div style={{background:'#fff',border:'1px solid #DBEAFE',borderRadius:16,padding:14,margin:'10px 0 12px',boxShadow:'0 8px 22px rgba(37,99,235,.06)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,marginBottom:12,flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:15,fontWeight:950,color:B.primary}}>📎 Documentos para Solicitud de Promesa</div>
          <div style={{fontSize:12,color:'#64748B',lineHeight:1.45,marginTop:3}}>Esta etapa es el control operativo: aquí se cargan los respaldos, Operaciones/Admin los revisa y luego el negocio puede avanzar a Firma Promesa.</div>
        </div>
        <div style={{minWidth:130}}>
          <div style={{fontSize:11,fontWeight:900,color:progress.pct===100?'#14532d':'#92400e',marginBottom:5,textAlign:'right'}}>{progress.ok}/{progress.total} · {progress.pct}% completo</div>
          <div style={{height:8,background:'#E2E8F0',borderRadius:99,overflow:'hidden'}}><div style={{height:'100%',width:progress.pct+'%',background:progress.pct===100?'#22c55e':'#2563EB',borderRadius:99}}/></div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(230px,1fr))',gap:10}}>
        {PROMESA_DOCS.map(doc => {
          const item = (p.docs_promesa || {})[doc.key] || {}
          const st = statusStyle(item.estado)
          const inputId = 'promesa-doc-'+idx+'-'+doc.key
          return (
            <div key={doc.key} style={{border:'1px solid #E2E8F0',borderRadius:14,padding:12,background:item.file_name?'#F8FAFC':'#FFFFFF'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'flex-start',marginBottom:8}}>
                <div style={{fontSize:13,fontWeight:900,color:'#0F172A',lineHeight:1.25}}>{doc.label}</div>
                <span style={{fontSize:10,padding:'3px 7px',borderRadius:99,background:st.bg,color:st.col,fontWeight:900,whiteSpace:'nowrap'}}>{st.label}</span>
              </div>
              {item.file_name ? (
                <div style={{fontSize:12,color:'#166534',fontWeight:800,background:'#DCFCE7',border:'1px solid #BBF7D0',borderRadius:10,padding:'8px 10px',marginBottom:8,wordBreak:'break-word'}}>✓ {item.file_name}</div>
              ) : (
                <div style={{fontSize:12,color:'#94A3B8',background:'#F8FAFC',border:'1px dashed #CBD5E1',borderRadius:10,padding:'8px 10px',marginBottom:8}}>Sin archivo cargado</div>
              )}
              <input id={inputId} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{display:'none'}} onChange={e=>upload(doc.key, e.target.files?.[0])}/>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <label htmlFor={inputId} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,padding:'8px 10px',borderRadius:10,border:'1px solid #2563EB',background:'#EFF6FF',color:'#1d4ed8',fontSize:12,fontWeight:900,cursor:'pointer'}}>{item.file_name?'Reemplazar':'Subir archivo'}</label>
                {item.data_url && <a href={item.data_url} target="_blank" rel="noreferrer" style={{display:'inline-flex',alignItems:'center',padding:'8px 10px',borderRadius:10,border:'1px solid #E2E8F0',background:'#fff',color:'#475569',fontSize:12,fontWeight:800,textDecoration:'none'}}>Ver</a>}
              </div>
              {isReviewer && (
                <select value={item.estado||''} onChange={e=>setDoc(doc.key,{estado:e.target.value,reviewed_at:new Date().toISOString(),reviewed_by:me?.name||''})} style={{...sty.sel,marginTop:8,padding:'7px 9px',fontSize:12}}>
                  <option value="">Pendiente</option>
                  <option value="recibido">Recibido</option>
                  <option value="aprobado">Aprobado</option>
                  <option value="rechazado">Rechazado</option>
                </select>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Broker Home View ────────────────────────────────────────────────────────
function BrokerHomeView({ leads, users, stages, commissions, indicators, me, setSel, setNav, setModal, dbReady, supabase, setLeads }) {
  const isMob = typeof window !== 'undefined' && window.innerWidth < 768
  const [saving, setSaving]     = React.useState({})
  const [noteText, setNoteText] = React.useState({})   // {leadId: texto}
  const [padText, setPadText]   = React.useState(() => {
    try { return localStorage.getItem('rabbitts_pad_' + (me?.id||'')) || '' } catch { return '' }
  })
  const [padSaved, setPadSaved] = React.useState(false)
  const misLeads = (leads||[]).filter(l => l.assigned_to === me?.id)

  // Leads activos (no terminales, no bloqueados por ops)
  const activos = misLeads.filter(l =>
    !['ganado','perdido','desistio'].includes(l.stage)
  )
  // Necesitan contacto urgente
  const sinActividad = activos
    .filter(l => !OPS_LOCKED_STAGES.includes(l.stage) && daysIn(l) >= 3)
    .sort((a,b) => daysIn(b) - daysIn(a))
  // Al día
  const alDia = activos
    .filter(l => !OPS_LOCKED_STAGES.includes(l.stage) && daysIn(l) < 3)
  // En gestión ops (no puede mover)
  const enOps = activos.filter(l => OPS_LOCKED_STAGES.includes(l.stage))

  // Comisiones pipeline
  const deals = buildDeals360(leads||[], users||[], stages, commissions, indicators).filter(d => d.brokerId === me?.id)
  const enCurso = deals.filter(d => d.estado_financiero !== 'broker_pagado')
  const ufPend = enCurso.filter(d=>d.moneda==='UF').reduce((s,d)=>s+(parseFloat(d.comisionBroker)||0),0)
  const ganados = misLeads.filter(l=>l.stage==='ganado').length

  // Visitas hoy y mañana
  const hoy = new Date().toISOString().slice(0,10)
  const manana = new Date(Date.now()+86400000).toISOString().slice(0,10)
  const visitasHoy = activos.flatMap(l =>
    (l.visitas||[]).filter(v => v.fecha === hoy).map(v=>({...v, lead:l}))
  )
  const visitasManana = activos.flatMap(l =>
    (l.visitas||[]).filter(v => v.fecha === manana).map(v=>({...v, lead:l}))
  )

  // Pipeline por etapa
  const pipelineSummary = stages
    .filter(s=>!['ganado','perdido','desistio'].includes(s.id))
    .map(s=>({...s, count: misLeads.filter(l=>l.stage===s.id).length}))
    .filter(s=>s.count>0)

  // Saludo
  const hora = new Date().getHours()
  const saludo = hora<12?'Buenos días':hora<19?'Buenas tardes':'Buenas noches'
  const nombre = (me?.name||'').split(' ')[0]

  // Guardar nota de contacto (requiere texto)
  const guardarNota = async (lead, texto) => {
    if (!texto.trim()) return
    setSaving(p=>({...p,[lead.id]:true}))
    const now = new Date().toISOString()
    const c = {id:'c-'+Date.now(), text:'📞 '+texto.trim(), author_name:me.name, date:now}
    const newComments = [...(lead.comments||[]), c]
    if (dbReady) {
      await supabase.from('crm_leads').update({comments:newComments, stage_moved_at:now}).eq('id',lead.id)
      setLeads(prev=>prev.map(l=>l.id===lead.id?{...l,comments:newComments,stage_moved_at:now}:l))
    }
    setNoteText(p=>({...p,[lead.id]:''}))
    setSaving(p=>({...p,[lead.id]:false}))
  }

  // Guardar bloc de notas en localStorage
  const savePad = (txt) => {
    setPadText(txt)
    setPadSaved(false)
    clearTimeout(window._padTimer)
    window._padTimer = setTimeout(() => {
      try { localStorage.setItem('rabbitts_pad_' + (me?.id||''), txt); setPadSaved(true) } catch {}
      setTimeout(()=>setPadSaved(false), 1500)
    }, 600)
  }

  const urgBg  = d => d>=7?'#FEF2F2':d>=3?'#FFFBEB':'#F0FDF4'
  const urgCol = d => d>=7?'#991b1b':d>=3?'#92400e':'#166534'

  const LeadRow = ({l, showAction=true}) => {
    const dias  = daysIn(l)
    const stage = stages.find(s=>s.id===l.stage)
    const tel   = l.telefono&&l.telefono!=='—'?l.telefono.replace(/[^0-9+]/g,'').replace(/^\+/,''):'';
    const nota  = noteText[l.id] || ''
    // Último comentario del broker (excluye los del sistema)
    const comments = (l.comments||[]).filter(c => !c.system && c.text && !c.text.startsWith('[Sistema]'))
    const lastC = comments.length > 0 ? comments[comments.length - 1] : null
    const lastCDate = lastC ? new Date(lastC.date) : null
    const lastCAge = lastCDate ? Math.floor((Date.now() - lastCDate.getTime()) / 86400000) : null
    const lastCText = lastC ? lastC.text.replace(/^📞\s*/,'') : null

    return (
      <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'11px 14px',marginBottom:6}}>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:160}}>
            <div style={{fontWeight:700,fontSize:13,color:'#0F172A',marginBottom:3}}>{l.nombre}</div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap',alignItems:'center'}}>
              {stage && <span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:stage.bg,color:stage.col,fontWeight:700}}>{stage.label}</span>}
              {dias>0 && <span style={{fontSize:10,padding:'2px 7px',borderRadius:99,background:urgBg(dias),color:urgCol(dias),fontWeight:700}}>⏱ {dias}d</span>}
              {l.renta&&l.renta!=='—'&&<span style={{fontSize:10,color:'#64748B'}}>{l.renta}</span>}
            </div>
            {/* Último comentario */}
            {lastCText && (
              <div style={{marginTop:4,fontSize:11,color:'#64748B',fontStyle:'italic',
                overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:240}}>
                💬 {lastCText}
                {lastCAge !== null && <span style={{color:'#94a3b8',marginLeft:4}}>
                  {lastCAge===0?'hoy':lastCAge===1?'ayer':lastCAge+'d atrás'}
                </span>}
              </div>
            )}
          </div>
          <div style={{display:'flex',gap:5,flexShrink:0}}>
            {tel && (
              <a href={`https://wa.me/${tel}`} target="_blank" rel="noopener noreferrer"
                style={{fontSize:11,padding:'5px 10px',borderRadius:8,border:'1px solid #25D366',
                  background:'#F0FDF4',color:'#166534',fontWeight:700,textDecoration:'none',
                  display:'flex',alignItems:'center',gap:3}}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WA
              </a>
            )}
            <button onClick={()=>{setSel(l);setModal('lead')}}
              style={{fontSize:11,padding:'5px 10px',borderRadius:8,border:`1px solid ${B.primary}`,
                background:B.light,color:B.primary,fontWeight:700,cursor:'pointer'}}>
              Abrir
            </button>
          </div>
        </div>
        {showAction && (
          <>
            {/* Comentario para Rabito — expandible */}
            <div style={{marginTop:8}}>
              {!l.comentario_venta ? (
                <button
                  onClick={()=>setNoteText(p=>({...p,['cv_open_'+l.id]:true}))}
                  style={{fontSize:11,color:'#94a3b8',background:'none',border:'none',
                    cursor:'pointer',padding:0,textDecoration:'underline',textDecorationStyle:'dotted'}}>
                  + Agregar contexto para Rabito
                </button>
              ) : (
                <div style={{fontSize:11,color:'#5b21b6',background:'#F5F3FF',
                  borderRadius:6,padding:'4px 8px',display:'inline-block',maxWidth:'100%',
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',cursor:'pointer'}}
                  onClick={()=>setNoteText(p=>({...p,['cv_open_'+l.id]:true}))}
                  title="Clic para editar">
                  🧠 {l.comentario_venta}
                </div>
              )}
              {noteText['cv_open_'+l.id] && (
                <div style={{marginTop:5}}>
                  <textarea
                    autoFocus
                    defaultValue={l.comentario_venta||''}
                    onChange={e=>{
                      const val = e.target.value
                      clearTimeout(window['_cv_'+l.id])
                      window['_cv_'+l.id] = setTimeout(async()=>{
                        setLeads(prev=>prev.map(x=>x.id===l.id?{...x,comentario_venta:val}:x))
                        if(dbReady)await supabase.from('crm_leads').update({comentario_venta:val}).eq('id',l.id)
                      }, 800)
                    }}
                    onBlur={()=>setNoteText(p=>({...p,['cv_open_'+l.id]:false}))}
                    placeholder="Intereses, objeciones, próximos pasos... Rabito lee esto antes de responder al cliente"
                    style={{width:'100%',padding:'6px 10px',borderRadius:8,border:'1px solid #c4b5fd',
                      fontSize:12,minHeight:52,resize:'none',boxSizing:'border-box',
                      background:'#FAFAFF',outline:'none',lineHeight:1.5,fontFamily:'inherit'}}
                  />
                  <div style={{fontSize:10,color:'#9ca3af',marginTop:2}}>
                    🧠 Rabito lee esto · se guarda solo · clic fuera para cerrar
                  </div>
                </div>
              )}
            </div>

            {/* Nota de contacto */}
            <div style={{display:'flex',gap:6,marginTop:6,alignItems:'center'}}>
              <input
                value={nota}
                onChange={e=>setNoteText(p=>({...p,[l.id]:e.target.value}))}
                onKeyDown={e=>{if(e.key==='Enter'&&nota.trim())guardarNota(l,nota)}}
                placeholder="¿Qué pasó en el contacto? Escribe y presiona Enter..."
                style={{flex:1,padding:'6px 10px',borderRadius:8,border:'1px solid #dce8ff',
                  fontSize:12,background:'#F8FAFC',outline:'none',minWidth:0}}
              />
              <button
                onClick={()=>guardarNota(l,nota)}
                disabled={!nota.trim()||saving[l.id]}
                style={{fontSize:11,padding:'6px 12px',borderRadius:8,fontWeight:700,flexShrink:0,
                  border:'none',cursor:nota.trim()?'pointer':'not-allowed',
                  background:nota.trim()?B.primary:'#e5e7eb',
                  color:nota.trim()?'#fff':'#9ca3af'}}>
                {saving[l.id]?'...':'Guardar'}
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div style={{maxWidth:800,margin:'0 auto'}}>
      {/* Saludo */}
      <div style={{marginBottom:18}}>
        <div style={{fontSize:isMob?18:22,fontWeight:900,color:'#0F172A'}}>
          {saludo}, {nombre} 👋
        </div>
        <div style={{fontSize:12,color:'#64748B',marginTop:2}}>
          {new Date().toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'})}
        </div>
      </div>

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:isMob?'1fr 1fr':'repeat(4,1fr)',gap:8,marginBottom:20}}>
        {[
          {label:'Activos',   value:activos.length,        sub:'en pipeline',           bg:'#EFF6FF',col:B.primary},
          {label:'Urgentes',  value:sinActividad.length,   sub:'sin actividad ≥3d',     bg:sinActividad.length>0?'#FEF2F2':'#F0FDF4', col:sinActividad.length>0?'#991b1b':'#166534'},
          {label:'Pipeline',  value:`UF ${fmt360(ufPend)}`,sub:`${enCurso.length} op.`, bg:'#FFFBEB',col:'#92400e'},
          {label:'Ganados',   value:ganados,               sub:'total histórico',        bg:'#DCFCE7',col:'#14532d'},
        ].map(k=>(
          <div key={k.label} style={{background:k.bg,border:'1px solid #E2E8F0',borderRadius:12,padding:'13px 14px'}}>
            <div style={{fontSize:10,color:'#64748B',fontWeight:800,textTransform:'uppercase',letterSpacing:.4}}>{k.label}</div>
            <div style={{fontSize:isMob?18:22,fontWeight:900,color:k.col,marginTop:2,lineHeight:1.1}}>{k.value}</div>
            <div style={{fontSize:10,color:'#64748B',marginTop:2}}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Visitas hoy */}
      {visitasHoy.length>0 && (
        <div style={{background:'#F5F3FF',border:'1px solid #c4b5fd',borderRadius:12,padding:14,marginBottom:16}}>
          <div style={{fontWeight:900,color:'#5b21b6',marginBottom:8,fontSize:13}}>📅 Visitas hoy ({visitasHoy.length})</div>
          {visitasHoy.map((v,i)=>(
            <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
              <div>
                <span style={{fontWeight:700,fontSize:13,color:'#0F172A'}}>{v.lead.nombre}</span>
                <span style={{fontSize:12,color:'#5b21b6',marginLeft:8}}>{v.hora} — {v.proyecto}</span>
              </div>
              <button onClick={()=>{setSel(v.lead);setModal('lead')}} style={{fontSize:11,padding:'4px 10px',borderRadius:8,border:'1px solid #c4b5fd',background:'#fff',cursor:'pointer',color:'#5b21b6',fontWeight:600}}>Ver</button>
            </div>
          ))}
        </div>
      )}
      {visitasManana.length>0 && (
        <div style={{background:'#F0FDF4',border:'1px solid #86efac',borderRadius:12,padding:14,marginBottom:16}}>
          <div style={{fontWeight:900,color:'#166534',marginBottom:8,fontSize:13}}>📅 Visitas mañana ({visitasManana.length})</div>
          {visitasManana.map((v,i)=>(
            <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
              <div>
                <span style={{fontWeight:700,fontSize:13,color:'#0F172A'}}>{v.lead.nombre}</span>
                <span style={{fontSize:12,color:'#166534',marginLeft:8}}>{v.hora} — {v.proyecto}</span>
              </div>
              <button onClick={()=>{setSel(v.lead);setModal('lead')}} style={{fontSize:11,padding:'4px 10px',borderRadius:8,border:'1px solid #86efac',background:'#fff',cursor:'pointer',color:'#166534',fontWeight:600}}>Ver</button>
            </div>
          ))}
        </div>
      )}

      {/* Necesitan acción */}
      {sinActividad.length>0 && (
        <div style={{marginBottom:20}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
            <span style={{fontSize:14,fontWeight:900,color:'#0F172A'}}>🔥 Necesitan tu atención</span>
            <span style={{fontSize:11,background:'#FEF2F2',color:'#991b1b',padding:'2px 9px',borderRadius:99,fontWeight:800}}>{sinActividad.length}</span>
          </div>
          {sinActividad.slice(0,8).map(l=><LeadRow key={l.id} l={l}/>)}
          {sinActividad.length>8&&(
            <button onClick={()=>setNav('kanban')} style={{fontSize:12,color:B.primary,background:'transparent',border:'none',cursor:'pointer',fontWeight:700,padding:'4px 0'}}>
              Ver {sinActividad.length-8} más en el Kanban →
            </button>
          )}
        </div>
      )}

      {/* Al día */}
      {alDia.length>0 && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:14,fontWeight:900,color:'#0F172A',marginBottom:10}}>
            ✅ Al día <span style={{fontSize:12,color:'#64748B',fontWeight:500}}>({alDia.length})</span>
          </div>
          {alDia.slice(0,5).map(l=><LeadRow key={l.id} l={l} showAction={false}/>)}
          {alDia.length>5&&(
            <button onClick={()=>setNav('kanban')} style={{fontSize:12,color:B.primary,background:'transparent',border:'none',cursor:'pointer',fontWeight:700,padding:'4px 0'}}>
              Ver todos en el Kanban →
            </button>
          )}
        </div>
      )}

      {/* En gestión Ops */}
      {enOps.length>0 && (
        <div style={{marginBottom:20}}>
          <div style={{fontSize:14,fontWeight:900,color:'#0F172A',marginBottom:10}}>
            🔒 En gestión Operaciones <span style={{fontSize:12,color:'#64748B',fontWeight:500}}>({enOps.length})</span>
          </div>
          {enOps.slice(0,4).map(l=>{
            const stage = stages.find(s=>s.id===l.stage)
            return (
              <div key={l.id} style={{background:'#FDF4FF',border:'1px solid #d8b4fe',borderRadius:10,padding:'10px 14px',marginBottom:5,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <span style={{fontWeight:700,fontSize:13,color:'#0F172A'}}>{l.nombre}</span>
                  {stage&&<span style={{fontSize:10,marginLeft:8,padding:'2px 7px',borderRadius:99,background:stage.bg,color:stage.col,fontWeight:700}}>{stage.label}</span>}
                </div>
                <button onClick={()=>{setSel(l);setModal('lead')}} style={{fontSize:11,padding:'4px 10px',borderRadius:8,border:'1px solid #d8b4fe',background:'#fff',cursor:'pointer',color:'#7e22ce',fontWeight:600}}>Ver</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Pipeline visual */}
      {pipelineSummary.length>0 && (
        <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:14,marginBottom:20}}>
          <div style={{fontSize:13,fontWeight:900,color:'#0F172A',marginBottom:10}}>Tu pipeline</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {pipelineSummary.map(s=>(
              <div key={s.id} onClick={()=>setNav('kanban')} title={s.label}
                style={{padding:'7px 12px',borderRadius:10,background:s.bg,cursor:'pointer',
                  display:'flex',alignItems:'center',gap:5,border:`1px solid ${s.dot}20`}}>
                <span style={{width:7,height:7,borderRadius:'50%',background:s.dot,flexShrink:0,display:'inline-block'}}/>
                <span style={{fontSize:11,fontWeight:700,color:s.col,maxWidth:100,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.label}</span>
                <span style={{fontSize:13,fontWeight:900,color:s.col}}>{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {misLeads.length===0 && (
        <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,padding:40,textAlign:'center',marginTop:20}}>
          <div style={{fontSize:36,marginBottom:8}}>🎯</div>
          <div style={{fontWeight:700,color:'#0F172A',marginBottom:6}}>Aún no tienes leads asignados</div>
          <div style={{color:'#64748B',fontSize:13,marginBottom:16}}>Cuando tengas leads asignados, aparecerán aquí ordenados por prioridad.</div>
          <button onClick={()=>setNav('nuevo lead')} style={{padding:'10px 22px',borderRadius:10,background:B.primary,color:'#fff',border:'none',cursor:'pointer',fontWeight:700,fontSize:13}}>+ Crear mi primer lead</button>
        </div>
      )}
    </div>
  )
}

// ─── Mis Notas — Bloc de cuaderno ────────────────────────────────────────────
function NotebookView({ me }) {
  const key = 'rabbitts_pad_' + (me?.id||'anon')
  const [text, setText] = React.useState(() => {
    try { return localStorage.getItem(key) || '' } catch { return '' }
  })
  const [saved, setSaved] = React.useState(false)

  const onChange = (val) => {
    setText(val)
    setSaved(false)
    clearTimeout(window._nbTimer)
    window._nbTimer = setTimeout(() => {
      try { localStorage.setItem(key, val); setSaved(true) } catch {}
      setTimeout(() => setSaved(false), 1500)
    }, 500)
  }

  const lineCount = Math.max(30, text.split('\n').length + 5)
  const lineHeight = 28 // px por línea — igual al background-size

  return (
    <div style={{maxWidth:720, margin:'0 auto', padding:'8px 0'}}>
      {/* Cabecera */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
        <div>
          <div style={{fontSize:20,fontWeight:900,color:'#0F172A'}}>📓 Mis Notas</div>
          <div style={{fontSize:12,color:'#94a3b8',marginTop:1}}>
            Solo tú las ves · se guardan automático en este dispositivo
          </div>
        </div>
        {saved && (
          <span style={{marginLeft:'auto',fontSize:11,color:'#166534',background:'#F0FDF4',
            padding:'3px 10px',borderRadius:99,border:'1px solid #86efac',fontWeight:600}}>
            ✓ Guardado
          </span>
        )}
      </div>

      {/* Hoja de cuaderno */}
      <div style={{
        background:'#fff',
        borderRadius:4,
        boxShadow:'2px 2px 8px rgba(0,0,0,0.10), -1px 0 0 #e0e0e0',
        border:'1px solid #e8e8e8',
        position:'relative',
        overflow:'hidden',
      }}>
        {/* Margen izquierdo rojo */}
        <div style={{
          position:'absolute', top:0, left:48, bottom:0, width:2,
          background:'#ff9999', zIndex:1, pointerEvents:'none'
        }}/>
        {/* Espiral simulada */}
        <div style={{
          position:'absolute', top:0, left:0, bottom:0, width:48,
          background:'#F0F0F0', borderRight:'1px solid #ddd',
          display:'flex', flexDirection:'column', alignItems:'center',
          gap:20, paddingTop:18, zIndex:1, pointerEvents:'none'
        }}>
          {Array.from({length:Math.ceil(lineCount/3)}).map((_,i)=>(
            <div key={i} style={{
              width:18, height:18, borderRadius:'50%',
              border:'3px solid #b0bec5', background:'#fff',
              flexShrink:0
            }}/>
          ))}
        </div>

        {/* Área de escritura con líneas de cuaderno */}
        <textarea
          value={text}
          onChange={e => onChange(e.target.value)}
          placeholder="Escribe aquí tus notas, recordatorios, pendientes..."
          spellCheck={true}
          style={{
            display:'block',
            width:'100%',
            minHeight: lineCount * lineHeight + 'px',
            padding:`16px 20px 20px 64px`,
            boxSizing:'border-box',
            border:'none',
            outline:'none',
            resize:'none',
            fontSize:15,
            lineHeight: lineHeight + 'px',
            fontFamily:"'Georgia', 'Times New Roman', serif",
            color:'#1a1a2e',
            background:`repeating-linear-gradient(
              transparent,
              transparent ${lineHeight - 1}px,
              #d4e8f7 ${lineHeight - 1}px,
              #d4e8f7 ${lineHeight}px
            )`,
            backgroundAttachment:'local',
            caretColor:'#2563EB',
          }}
        />
      </div>

      <div style={{fontSize:11,color:'#cbd5e1',textAlign:'right',marginTop:6}}>
        {text.length > 0 ? `${text.split('\n').filter(l=>l.trim()).length} líneas con contenido` : 'Cuaderno vacío'}
      </div>
    </div>
  )
}

// ─── Broker Monitor Panel (Admin Dashboard) ──────────────────────────────────
function BrokerMonitorPanel({ leads, users, stages, sessions, setSel, setModal }) {
  const [expanded, setExpanded] = React.useState({})

  const agents = (users||[]).filter(u => u.role === 'agent' || u.role === 'team_leader')

  const agentData = agents.map(ag => {
    const myLeads   = (leads||[]).filter(l => l.assigned_to === ag.id)
    const active    = myLeads.filter(l => !['ganado','perdido','desistio'].includes(l.stage))
    const critical  = active.filter(l => !OPS_LOCKED_STAGES.includes(l.stage) && daysIn(l) >= 7)
    const urgent    = active.filter(l => !OPS_LOCKED_STAGES.includes(l.stage) && daysIn(l) >= 3 && daysIn(l) < 7)
    const stale     = [...critical, ...urgent].sort((a,b) => daysIn(b) - daysIn(a))
    const ganados   = myLeads.filter(l => l.stage === 'ganado').length
    const convRate  = myLeads.length > 0 ? Math.round((ganados / myLeads.length) * 100) : 0

    const agSess   = (sessions||[]).filter(s => s.user_id === ag.id)
    const lastLogin = agSess[0]?.logged_at ? new Date(agSess[0].logged_at) : null
    const minsAgo   = lastLogin ? Math.floor((Date.now() - lastLogin.getTime()) / 60000) : null
    const isOnline  = minsAgo !== null && minsAgo < 30
    const health    = critical.length >= 2 ? 'critico' : critical.length >= 1 ? 'urgente' : urgent.length >= 3 ? 'atencion' : 'bien'

    return { ...ag, myLeads, active, critical, urgent, stale, ganados, convRate, lastLogin, minsAgo, isOnline, health }
  }).sort((a,b) => {
    const score = x => x.critical.length * 10 + x.urgent.length
    return score(b) - score(a)
  })

  const HEALTH = {
    critico:  { dot:'#dc2626', border:'#fca5a5', headerBg:'#FFF5F5' },
    urgente:  { dot:'#d97706', border:'#fcd34d', headerBg:'#FFFDF5' },
    atencion: { dot:'#f59e0b', border:'#fde68a', headerBg:'#FFFEEF' },
    bien:     { dot:'#16a34a', border:'#86efac', headerBg:'#F0FDF4' },
  }

  const totalCrit = agentData.reduce((s,a) => s + a.critical.length, 0)
  const totalUrg  = agentData.reduce((s,a) => s + a.urgent.length,   0)
  const isMob = typeof window !== 'undefined' && window.innerWidth < 768

  const loginStr = ag => {
    if (ag.isOnline) return { txt: '● En línea', col: '#16a34a' }
    if (ag.minsAgo === null) return { txt: 'Sin sesiones', col: '#9ca3af' }
    if (ag.minsAgo < 60)    return { txt: `Hace ${ag.minsAgo}m`, col: '#64748B' }
    if (ag.minsAgo < 1440)  return { txt: `Hace ${Math.floor(ag.minsAgo/60)}h`, col: '#64748B' }
    if (ag.minsAgo < 10080) return { txt: `Hace ${Math.floor(ag.minsAgo/1440)}d`, col: ag.minsAgo > 4320 ? '#d97706' : '#64748B' }
    return { txt: ag.lastLogin.toLocaleDateString('es-CL',{day:'2-digit',month:'short'}), col: '#991b1b' }
  }

  if (agents.length === 0) return null

  return (
    <div style={{marginBottom:20}}>
      {/* Panel header */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,flexWrap:'wrap'}}>
        <div>
          <span style={{fontSize:15,fontWeight:900,color:'#0F172A'}}>🎯 Monitor de brokers</span>
          <span style={{fontSize:12,color:'#64748B',marginLeft:8}}>en tiempo real</span>
        </div>
        <div style={{display:'flex',gap:6,marginLeft:'auto',flexWrap:'wrap'}}>
          {totalCrit > 0 && (
            <span style={{fontSize:11,padding:'4px 10px',borderRadius:99,background:'#FEF2F2',color:'#991b1b',fontWeight:700}}>
              🔴 {totalCrit} críticos (+7d)
            </span>
          )}
          {totalUrg > 0 && (
            <span style={{fontSize:11,padding:'4px 10px',borderRadius:99,background:'#FFFBEB',color:'#92400e',fontWeight:700}}>
              🟡 {totalUrg} urgentes (3-7d)
            </span>
          )}
          {totalCrit === 0 && totalUrg === 0 && (
            <span style={{fontSize:11,padding:'4px 10px',borderRadius:99,background:'#F0FDF4',color:'#166534',fontWeight:700}}>
              🟢 Todos los brokers al día
            </span>
          )}
        </div>
      </div>

      <div style={{display:'grid',gap:8}}>
        {agentData.map(ag => {
          const h    = HEALTH[ag.health]
          const open = expanded[ag.id]
          const ls   = loginStr(ag)

          return (
            <div key={ag.id} style={{background:'#fff',borderRadius:12,overflow:'hidden',
              border:`1px solid ${h.border}`,borderLeft:`4px solid ${h.dot}`}}>

              {/* Agent row */}
              <div style={{padding:'11px 14px',display:'flex',alignItems:'center',gap:10,
                background: open ? h.headerBg : '#fff', flexWrap:'wrap'}}>

                {/* Avatar + online dot */}
                <div style={{position:'relative',flexShrink:0}}>
                  <AV name={ag.name} size={36}/>
                  <div style={{position:'absolute',bottom:0,right:0,width:10,height:10,borderRadius:'50%',border:'2px solid #fff',
                    background: ag.isOnline ? '#22c55e' : ag.minsAgo && ag.minsAgo < 1440 ? '#f59e0b' : '#d1d5db'}}/>
                </div>

                {/* Name + last login */}
                <div style={{flex:1,minWidth:100}}>
                  <div style={{fontSize:13,fontWeight:700,color:'#0F172A'}}>{ag.name}</div>
                  <div style={{fontSize:11,color:ls.col,marginTop:1,fontWeight: ag.isOnline ? 600 : 400}}>{ls.txt}</div>
                </div>

                {/* Counters */}
                <div style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
                  <span style={{fontSize:11,padding:'3px 9px',borderRadius:99,background:'#F1F5FF',color:'#1B4FC8',fontWeight:600}}>
                    {ag.active.length} activos
                  </span>
                  {ag.critical.length > 0 && (
                    <span style={{fontSize:11,padding:'3px 9px',borderRadius:99,background:'#FEF2F2',color:'#991b1b',fontWeight:800}}>
                      🔴 {ag.critical.length}
                    </span>
                  )}
                  {ag.urgent.length > 0 && (
                    <span style={{fontSize:11,padding:'3px 9px',borderRadius:99,background:'#FFFBEB',color:'#92400e',fontWeight:800}}>
                      🟡 {ag.urgent.length}
                    </span>
                  )}
                  {ag.critical.length === 0 && ag.urgent.length === 0 && (
                    <span style={{fontSize:11,padding:'3px 9px',borderRadius:99,background:'#F0FDF4',color:'#166534',fontWeight:600}}>✅</span>
                  )}
                  <span style={{fontSize:11,padding:'3px 9px',borderRadius:99,background:'#DCFCE7',color:'#14532d',fontWeight:600}}>
                    {ag.ganados}🏆 {ag.convRate}%
                  </span>
                </div>

                {/* Expand */}
                {ag.stale.length > 0 && (
                  <button onClick={() => setExpanded(e => ({...e, [ag.id]: !open}))}
                    style={{fontSize:11,padding:'5px 12px',borderRadius:8,border:'1px solid #E2E8F0',
                      background:'transparent',cursor:'pointer',color:'#64748B',fontWeight:600,flexShrink:0,
                      whiteSpace:'nowrap'}}>
                    {open ? '▲ Cerrar' : `▼ ${ag.stale.length} leads`}
                  </button>
                )}
              </div>

              {/* Expanded stale leads */}
              {open && ag.stale.length > 0 && (
                <div style={{borderTop:'1px solid #F1F5F9',background:'#F8FAFC',padding:'10px 14px'}}>
                  <div style={{fontSize:10,color:'#94a3b8',fontWeight:700,letterSpacing:.5,
                    textTransform:'uppercase',marginBottom:8}}>
                    Leads sin actividad — intervenir antes de que se pierdan
                  </div>
                  <div style={{display:'grid',gap:5}}>
                    {ag.stale.map(l => {
                      const dias  = daysIn(l)
                      const stage = stages.find(s=>s.id===l.stage)
                      const tel   = l.telefono && l.telefono!=='—'
                        ? l.telefono.replace(/[^0-9+]/g,'').replace(/^\+/,'') : ''
                      return (
                        <div key={l.id} style={{background:'#fff',borderRadius:8,padding:'8px 12px',
                          display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',
                          border:`1px solid ${dias>=7?'#fca5a580':'#fcd34d80'}`}}>
                          <div style={{flex:1,minWidth:100}}>
                            <div style={{fontSize:12,fontWeight:700,color:'#0F172A'}}>{l.nombre}</div>
                            <div style={{display:'flex',gap:5,marginTop:2,flexWrap:'wrap',alignItems:'center'}}>
                              {stage && <span style={{fontSize:10,padding:'1px 6px',borderRadius:99,
                                background:stage.bg,color:stage.col,fontWeight:600}}>{stage.label}</span>}
                              <span style={{fontSize:10,padding:'1px 6px',borderRadius:99,fontWeight:700,
                                background:dias>=7?'#FEF2F2':'#FFFBEB',
                                color:dias>=7?'#991b1b':'#92400e'}}>
                                ⏱ {dias}d
                              </span>
                              {l.renta&&l.renta!=='—'&&<span style={{fontSize:10,color:'#9ca3af'}}>{l.renta}</span>}
                            </div>
                          </div>
                          <div style={{display:'flex',gap:5,flexShrink:0}}>
                            {tel && (
                              <a href={`https://wa.me/${tel}`} target="_blank" rel="noopener noreferrer"
                                style={{fontSize:11,padding:'4px 9px',borderRadius:7,textDecoration:'none',
                                  border:'1px solid #25D366',background:'#F0FDF4',color:'#166534',fontWeight:700}}>
                                WA
                              </a>
                            )}
                            <button onClick={() => { setSel(l); setModal('lead') }}
                              style={{fontSize:11,padding:'4px 9px',borderRadius:7,cursor:'pointer',fontWeight:700,
                                border:`1px solid ${B.primary}`,background:B.light,color:B.primary}}>
                              Abrir
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Lead Form ────────────────────────────────────────────────────────────────
function LeadForm({data, onChange, onSubmit}) {
  const sI = {width:'100%',padding:'8px 12px',borderRadius:8,border:'1px solid #c5d5f5',background:'#fff',color:'#0F172A',fontSize:13}
  return (
    <div>
      <Fld label="Nombre completo *"><input value={data.nombre} onChange={e=>onChange(p=>({...p,nombre:e.target.value}))} placeholder="María González" style={sI}/></Fld>
      <Fld label="Teléfono *"><input value={data.telefono} onChange={e=>onChange(p=>({...p,telefono:e.target.value}))} placeholder="+56 9 8765 4321" style={sI}/></Fld>
      <Fld label="Email"><input value={data.email} onChange={e=>onChange(p=>({...p,email:e.target.value}))} placeholder="maria@email.com" style={sI}/></Fld>
      <Fld label="RUT (opcional)"><input value={data.rut||''} onChange={e=>onChange(p=>({...p,rut:e.target.value}))} placeholder="12.345.678-9" style={sI}/></Fld>
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
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
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
          <div style={{fontSize:isMobile?15:16,fontWeight:800,color:B.primary}}>Control de Comisiones</div>
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
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',padding:'10px 12px',background:'#fff',border:'1px solid #E2E8F0',borderRadius:10}}>
        <span style={{fontSize:12,fontWeight:600,color:B.primary,alignSelf:'center'}}>Filtrar:</span>
        <select value={filterAgent} onChange={e=>setFilterAgent(e.target.value)} style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid #E2E8F0',background:'#fff',cursor:'pointer'}}>
          <option value="all">Todos los brokers</option>
          {allAgents.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={filterInmob} onChange={e=>setFilterInmob(e.target.value)} style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid #E2E8F0',background:'#fff',cursor:'pointer'}}>
          <option value="all">Todas las inmobiliarias</option>
          {allInmobs.map(im=><option key={im} value={im}>{im}</option>)}
        </select>
        <select value={filterOC} onChange={e=>setFilterOC(e.target.value)} style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid #E2E8F0',background:'#fff',cursor:'pointer'}}>
          <option value="all">Todos los estados OC</option>
          {OC_ESTADOS.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid #E2E8F0',background:'#fff',cursor:'pointer'}}>
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
          <div key={agId} style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,marginBottom:16,overflow:'hidden'}}>
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
                        <div style={{fontWeight:600,fontSize:13,color:'#0F172A'}}>{p.inmobiliaria} — {p.proyecto}{p.depto?' · '+p.depto:''}</div>
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
                          style={{width:52,fontSize:11,padding:'4px 6px',border:'1px solid #E2E8F0',borderRadius:5,background:'#f9fbff'}}/>
                        <span style={{fontSize:10,color:'#9ca3af'}}>/</span>
                        <input type="number" min="0" max="100" step="0.1" value={comm.pctBroker}
                          onChange={e=>setComm(p._key,'pctBroker',e.target.value)}
                          placeholder="% b" title="% Para el broker"
                          style={{width:52,fontSize:11,padding:'4px 6px',border:'1px solid #E2E8F0',borderRadius:5,background:'#f9fbff'}}/>
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
                        <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(auto-fill,minmax(190px,1fr))',gap:10,marginBottom:14}}>
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
                        <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(auto-fill,minmax(190px,1fr))',gap:10,marginBottom:14}}>
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
                        <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(auto-fill,minmax(190px,1fr))',gap:10,marginBottom:12}}>
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
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const now = new Date()
  const [fStatus, setFStatus]   = useState('all')   // all | pendiente | cobrado
  const [fInmob,  setFInmob]    = useState('all')
  const [fPeriod, setFPeriod]   = useState('all')   // all | this_year | last_year | q1..q4 | this_month

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
      return {
        ...p, key, comm, base, ufRef, comisTotal, miComision, clp,
        leadNombre: l.nombre, stage: l.stage,
        fechaPromesa: l.stage_moved_at,
        fechaDate: l.stage_moved_at ? new Date(l.stage_moved_at) : null
      }
    })
  )

  // Filter helpers
  const isCobrado = p => (p.oc_estado==='pagado_broker') || p.comm.cobrado
  const allInmobsAgent = [...new Set(myProps.map(p=>p.inmobiliaria).filter(Boolean))].sort()

  const inPeriod = p => {
    if (fPeriod==='all') return true
    const d = p.fechaDate
    if (!d) return fPeriod==='all'
    const y = now.getFullYear(), m = now.getMonth()
    if (fPeriod==='this_year')  return d.getFullYear()===y
    if (fPeriod==='last_year')  return d.getFullYear()===y-1
    if (fPeriod==='this_month') return d.getFullYear()===y && d.getMonth()===m
    if (fPeriod==='q1') return d.getFullYear()===y && d.getMonth()<=2
    if (fPeriod==='q2') return d.getFullYear()===y && d.getMonth()>=3 && d.getMonth()<=5
    if (fPeriod==='q3') return d.getFullYear()===y && d.getMonth()>=6 && d.getMonth()<=8
    if (fPeriod==='q4') return d.getFullYear()===y && d.getMonth()>=9
    return true
  }

  const filteredProps = myProps.filter(p => {
    if (fInmob!=='all' && p.inmobiliaria!==fInmob) return false
    if (!inPeriod(p)) return false
    const cob = isCobrado(p)
    if (fStatus==='cobrado'  && !cob) return false
    if (fStatus==='pendiente' && cob) return false
    return true
  })

  const activeFilters = (fStatus!=='all'?1:0)+(fInmob!=='all'?1:0)+(fPeriod!=='all'?1:0)

  // KPIs
  const totalUFVendida = closedLeads.reduce((s,l) =>
    s + (l.propiedades||[]).filter(p=>p.moneda==='UF').reduce((a,p)=>a+(parseFloat(p.bono_pie?p.precio_sin_bono:p.precio)||0),0), 0)

  const totalMiComisionUF = myProps.filter(p=>p.moneda==='UF').reduce((s,p)=>s+p.miComision,0)
  const totalMiComisionUSD = myProps.filter(p=>p.moneda==='USD').reduce((s,p)=>s+p.miComision,0)
  const totalClp    = myProps.filter(p=>p.moneda==='UF').reduce((s,p)=>s+(p.clp||0),0)
  const totalClpUSD = myProps.filter(p=>p.moneda==='USD').reduce((s,p)=>s+(p.clp||0),0)

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
      <div style={{background:'linear-gradient(135deg,#1B4FC8 0%,#3b82f6 100%)',borderRadius:16,padding:isMobile?'12px':'20px 24px',marginBottom:20,color:'#fff',position:'relative',overflow:'hidden'}}>
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
        <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(auto-fill,minmax(140px,1fr))',gap:10}}>
          {[
            {l:'UF total vendida',      v:'UF '+fmt2(totalUFVendida),    sub:closedLeads.length+' cierres'},
            {l:'Mi comisión total (UF)', v:'UF '+fmt2(totalMiComisionUF), sub:totalClp>0?'$'+totalClp.toLocaleString('es-CL')+' CLP':null},
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
        <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px',marginBottom:16}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
            <span style={{fontSize:13,fontWeight:700,color:B.primary}}>Progreso de cobros</span>
            <span style={{fontSize:12,color:'#6b7280'}}>{Math.round(cobradoUF/totalMiComisionUF*100)}% cobrado</span>
          </div>
          <div style={{height:12,background:'#F8FAFC',borderRadius:99,overflow:'hidden',marginBottom:8}}>
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

      {/* Filter bar */}
      {myProps.length > 0 && (
        <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:10,padding:'10px 14px',marginBottom:14,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:12,fontWeight:700,color:B.primary}}>🔍 Filtrar:</span>
          <select value={fStatus} onChange={e=>setFStatus(e.target.value)} style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid #E2E8F0',background:'#fff',cursor:'pointer'}}>
            <option value="all">Todos los estados</option>
            <option value="pendiente">⏳ Pendiente de cobro</option>
            <option value="cobrado">✅ Cobrado</option>
          </select>
          <select value={fInmob} onChange={e=>setFInmob(e.target.value)} style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid #E2E8F0',background:'#fff',cursor:'pointer'}}>
            <option value="all">Todas las inmobiliarias</option>
            {allInmobsAgent.map(im=><option key={im} value={im}>{im}</option>)}
          </select>
          <select value={fPeriod} onChange={e=>setFPeriod(e.target.value)} style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid #E2E8F0',background:'#fff',cursor:'pointer'}}>
            <option value="all">Todo el tiempo</option>
            <option value="this_month">Este mes</option>
            <option value="q1">Q1 (Ene-Mar)</option>
            <option value="q2">Q2 (Abr-Jun)</option>
            <option value="q3">Q3 (Jul-Sep)</option>
            <option value="q4">Q4 (Oct-Dic)</option>
            <option value="this_year">Este año</option>
            <option value="last_year">Año anterior</option>
          </select>
          {activeFilters>0 && (
            <button onClick={()=>{setFStatus('all');setFInmob('all');setFPeriod('all')}}
              style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid #fca5a5',background:'#FEF2F2',color:'#991b1b',cursor:'pointer',fontWeight:600}}>
              ✕ Limpiar ({activeFilters})
            </button>
          )}
          <span style={{fontSize:11,color:'#9ca3af',marginLeft:'auto'}}>{filteredProps.length} de {myProps.length} propiedades</span>
        </div>
      )}

      {myProps.length === 0 ? (
        <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'40px',textAlign:'center'}}>
          <div style={{fontSize:40,marginBottom:12}}>🚀</div>
          <div style={{fontSize:15,fontWeight:700,color:B.primary,marginBottom:6}}>¡A cerrar negocios!</div>
          <div style={{fontSize:13,color:'#6b7280'}}>Cuando tengas propiedades en Firma Promesa o Firma Escritura aparecerán aquí con el detalle de tus comisiones.</div>
        </div>
      ) : (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <span style={{fontSize:14,fontWeight:700,color:B.primary}}>
              💼 {filteredProps.length===myProps.length?'Mis negocios en curso':'Resultados filtrados'} — {filteredProps.length} {filteredProps.length===1?'propiedad':'propiedades'}
            </span>
          </div>
          {filteredProps.length===0 && <div style={{padding:'24px',textAlign:'center',color:'#9ca3af',fontSize:13,background:'#fff',borderRadius:10,border:'1px solid #E2E8F0'}}>Sin propiedades con estos filtros</div>}
          {filteredProps.map((p,i) => {
            const ocInfo = OC_LABEL[p.oc_estado||'pendiente_oc']||OC_LABEL.pendiente_oc
            const stLab = (stages||[]).find(s=>s&&s.id===p.stage)?.label||(p.stage||'—')
            const needsBrokerInvoice = p.oc_estado==='broker_factura'

            return (
              <div key={p.key} style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,marginBottom:10,overflow:'hidden'}}>
                <div style={{display:'flex',alignItems:'stretch',gap:0}}>
                  {/* Left accent bar based on OC state */}
                  <div style={{width:5,flexShrink:0,background:ocInfo.col,borderRadius:'12px 0 0 12px'}}/>

                  <div style={{flex:1,padding:'14px 16px'}}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
                      {/* Deal info */}
                      <div style={{flex:1,minWidth:180}}>
                        <div style={{fontWeight:700,fontSize:14,color:'#0F172A'}}>{p.inmobiliaria} — {p.proyecto}{p.depto?' · '+p.depto:''}</div>
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
                        <div style={{background:'#f9fbff',border:'1px solid #E2E8F0',borderRadius:10,padding:'10px 14px',textAlign:'center',flexShrink:0}}>
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
        <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px',marginTop:16}}>
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

// ─── WhatsApp Multi-Number Panel (Evolution API / QR) ────────────────────────
function WhatsAppNumerosPanel({iaConfig, upd, supabase, dbReady}) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const [numeros, setNumeros]       = React.useState([])
  const [loading, setLoading]       = React.useState(true)
  const [showForm, setShowForm]     = React.useState(false)
  const [testing, setTesting]       = React.useState(null)
  const [qrData, setQrData]         = React.useState(null)
  const [connecting, setConnecting] = React.useState(false)
  const [newName, setNewName]       = React.useState('')
  const [newTipo, setNewTipo]       = React.useState('cliente')  // 'cliente' | 'interno'
  const [statusMsg, setStatusMsg]   = React.useState(null)

  const EVO_URL = 'https://wa.rabbittscapital.com'
  const EVO_KEY = 'rabbitts2024'
  const WEBHOOK_URL = typeof window !== 'undefined' ? `${window.location.origin}/api/whatsapp` : 'https://crm.rabbittscapital.com/api/whatsapp'
  const REQUIRED_WEBHOOK_EVENTS = ['MESSAGES_UPSERT','MESSAGES_UPDATE','CONNECTION_UPDATE','QRCODE_UPDATED']

  const evoHeaders = { 'Content-Type': 'application/json', 'apikey': EVO_KEY }

  const ensureWebhook = async (instanceName) => {
    if (!instanceName) return false
    const payload = {
      url: WEBHOOK_URL,
      enabled: true,
      webhookByEvents: true,
      events: REQUIRED_WEBHOOK_EVENTS
    }
    try {
      const r = await fetch(`${EVO_URL}/webhook/set/${instanceName}`, {
        method: 'POST', headers: evoHeaders, body: JSON.stringify(payload)
      })
      if (r.ok) return true
    } catch(_) {}
    try {
      const r2 = await fetch(`${EVO_URL}/webhook/set/${instanceName}`, {
        method: 'POST', headers: evoHeaders, body: JSON.stringify({ webhook: payload })
      })
      return r2.ok
    } catch(_) { return false }
  }

  React.useEffect(() => { loadNumeros() }, [dbReady])

  const loadNumeros = async () => {
    if (!dbReady || !supabase) return
    setLoading(true)
    try {
      const { data } = await supabase.from('crm_settings').select('value').eq('key','wa_numeros').single()
      const list = data?.value || []
      setNumeros(list)
      // Repara automáticamente webhooks de números ya conectados.
      // Esto evita que números antiguos queden conectados pero sin crear conversaciones nuevas.
      list.filter(n => n?.instanceName && n.activo !== false).slice(0, 10).forEach(n => {
        ensureWebhook(n.instanceName).catch(() => {})
      })
    } catch(_) { setNumeros([]) }
    setLoading(false)
  }

  const saveNumeros = async (list) => {
    if (!dbReady || !supabase) return
    await supabase.from('crm_settings').upsert({ key: 'wa_numeros', value: list })
    setNumeros(list)
  }

  // ── Conectar nuevo número via QR ──────────────────────────────────────────
  const conectarNumero = async () => {
    if (!newName.trim()) { setStatusMsg({type:'error', text:'Ingresa un nombre para este número'}); return }
    setConnecting(true)
    setStatusMsg({type:'loading', text:'Creando instancia...'})
    setQrData(null)

    const instanceName = 'rabbitts_' + Date.now()
    try {
      // 1. Crear instancia
      const createRes = await fetch(`${EVO_URL}/instance/create`, {
        method: 'POST', headers: evoHeaders,
        body: JSON.stringify({ instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true })
      })
      const createData = await createRes.json()
      if (!createData.instance) throw new Error('No se pudo crear la instancia')

      // 2. Abrir manager para escanear QR
      setStatusMsg({type:'info', text:'Abriendo panel de conexión...'})
      await new Promise(r => setTimeout(r, 1000))
      
      // Abrir manager en nueva pestaña
      const managerUrl = `${EVO_URL}/manager`
      window.open(managerUrl, '_blank')
      
      setQrData({ instanceName, qr: null, nombre: newName.trim(), tipo: newTipo, managerUrl })
      setStatusMsg({type:'info', text:`Instancia creada. Escanea el QR en el panel que se abrió → busca "${instanceName}" → "Get QR Code"`})

      // 3. Polling para detectar conexión
      let attempts = 0
      const poll = setInterval(async () => {
        attempts++
        if (attempts > 30) { clearInterval(poll); setConnecting(false); return }
        try {
          const stateRes = await fetch(`${EVO_URL}/instance/connectionState/${instanceName}`, { headers: evoHeaders })
          const stateData = await stateRes.json()
          const state = stateData?.instance?.state || stateData?.state || stateData?.connectionStatus
          if (state === 'open') {
            clearInterval(poll)
            // Obtener número conectado
            const infoRes = await fetch(`${EVO_URL}/instance/fetchInstances?instanceName=${instanceName}`, { headers: evoHeaders })
            const infoData = await infoRes.json()
            const instanceInfo = Array.isArray(infoData) ? infoData[0] : infoData
            const phone = instanceInfo?.ownerJid?.split('@')[0] || instanceInfo?.owner?.split('@')[0] || instanceName

            const newNum = {
              id: 'wa-' + Date.now(),
              nombre: newName.trim(),
              numero: phone ? '+' + phone : '',
              instanceName,
              evoUrl: EVO_URL,
              evoKey: EVO_KEY,
              activo: true,
              tipo: qrData?.tipo || newTipo || 'cliente',
              createdAt: new Date().toISOString()
            }
            await saveNumeros([...numeros, newNum])
            setQrData(null)
            setNewName('')
            setShowForm(false)
            setConnecting(false)
            // Configurar webhook AUTOMÁTICAMENTE al conectar
            const whOk = await ensureWebhook(instanceName)
            setStatusMsg({type: whOk ? 'success' : 'error', text: whOk ? `✅ ${newNum.nombre} conectado y webhook configurado automáticamente` : `⚠️ ${newNum.nombre} conectado, pero no pude confirmar el webhook. Vuelve a probar conexión.`})
          }
        } catch(_) {}
      }, 3000)

    } catch(err) {
      setConnecting(false)
      setStatusMsg({type:'error', text:'Error: ' + err.message})
    }
  }

  // ── Refrescar QR ─────────────────────────────────────────────────────────
  const refreshQr = async () => {
    if (!qrData?.instanceName) return
    try {
      const qrRes = await fetch(`${EVO_URL}/instance/connect/${qrData.instanceName}`, { headers: evoHeaders })
      const qrJson = await qrRes.json()
      const qrBase64 = qrJson?.base64 || qrJson?.qrcode?.base64
      if (qrBase64) setQrData(prev => ({...prev, qr: qrBase64}))
    } catch(_) {}
  }

  const eliminarNumero = async (num) => {
    if (!confirm(`¿Eliminar "${num.nombre}"?`)) return
    try {
      await fetch(`${EVO_URL}/instance/delete/${num.instanceName}`, { method: 'DELETE', headers: evoHeaders })
    } catch(_) {}
    await saveNumeros(numeros.filter(n => n.id !== num.id))
  }

  const toggleActivo = async (id) => {
    const next = numeros.map(n => n.id === id ? {...n, activo: !n.activo} : n)
    await saveNumeros(next)
    const num = next.find(n => n.id === id)
    if (num?.activo && num?.instanceName) {
      const ok = await ensureWebhook(num.instanceName)
      setStatusMsg({type: ok ? 'success' : 'error', text: ok ? 'Webhook reactivado automáticamente.' : 'No pude confirmar el webhook. Revisa Evolution API.'})
    }
  }

  const testConnection = async (num) => {
    setTesting(num.id)
    try {
      const r = await fetch(`${EVO_URL}/instance/connectionState/${num.instanceName}`, { headers: evoHeaders })
      const d = await r.json()
      const state = d?.instance?.state
      if (state === 'open') {
        const whOk = await ensureWebhook(num.instanceName)
        alert(`✅ Conectado\nNúmero: ${num.numero}\nEstado: Activo\nWebhook: ${whOk ? 'OK' : 'No confirmado'}`)
      }
      else alert(`⚠️ Estado: ${state || 'desconectado'}`)
    } catch(e) { alert('Error: ' + e.message) }
    setTesting(null)
  }

  return (
    <div>
      {/* Acciones WhatsApp */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap',marginBottom:12}}>
        <div>
          <div style={{fontSize:13,fontWeight:800,color:B.primary}}>📱 Números WhatsApp conectados</div>
          <div style={{fontSize:11,color:'#6b7280',marginTop:2}}>Conecta uno o más números de WhatsApp Business para Rabito IA y el CRM.</div>
        </div>
        <button
          onClick={()=>{setShowForm(true);setStatusMsg(null)}}
          disabled={showForm || connecting || !!qrData}
          style={{...sty.btnP,fontSize:12,opacity:showForm || connecting || !!qrData ? 0.55 : 1,cursor:showForm || connecting || !!qrData ? 'not-allowed' : 'pointer'}}
        >
          {showForm ? 'Formulario abierto' : '➕ Conectar número'}
        </button>
      </div>

      {/* Mensaje de estado */}
      {statusMsg && (
        <div style={{
          padding:'10px 14px', borderRadius:8, marginBottom:12, fontSize:12, fontWeight:600,
          background: statusMsg.type==='success'?'#F0FDF4': statusMsg.type==='error'?'#FEF2F2': statusMsg.type==='loading'?'#EFF6FF':'#FFFBEB',
          color: statusMsg.type==='success'?'#14532d': statusMsg.type==='error'?'#991b1b': statusMsg.type==='loading'?'#1e40af':'#92400e',
          border:`1px solid ${statusMsg.type==='success'?'#86efac':statusMsg.type==='error'?'#fca5a5':statusMsg.type==='loading'?'#93c5fd':'#fcd34d'}`
        }}>
          {statusMsg.type==='loading' && '⏳ '}{statusMsg.text}
          <button onClick={()=>setStatusMsg(null)} style={{float:'right',background:'none',border:'none',cursor:'pointer',fontSize:12,color:'#6b7280'}}>✕</button>
        </div>
      )}

      {/* Lista números */}
      {loading && <div style={{padding:'20px',textAlign:'center',color:'#9ca3af',fontSize:13}}>Cargando...</div>}

      {!loading && numeros.length === 0 && !showForm && (
        <div style={{padding:'24px',textAlign:'center',color:'#9ca3af',fontSize:13,border:'2px dashed #E2E8F0',borderRadius:10,marginBottom:12}}>
          <div style={{fontSize:32,marginBottom:8}}>📱</div>
          Sin números conectados. Conecta tu primer WhatsApp.
        </div>
      )}

      {numeros.map(num => (
        <div key={num.id} style={{background:num.activo?'#fff':'#f9fafb',border:'1px solid '+(num.activo?'#E2E8F0':'#f0f0f0'),borderRadius:10,padding:'12px 14px',marginBottom:8}}>
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:num.activo?'#22c55e':'#9ca3af',flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                <div style={{fontWeight:700,fontSize:13,color:'#0F172A'}}>{num.nombre}</div>
                {/* Badge tipo */}
                <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,fontWeight:700,
                  background: num.tipo==='interno' ? '#FEF3C7' : '#DCFCE7',
                  color: num.tipo==='interno' ? '#92400e' : '#14532d',
                  border: `1px solid ${num.tipo==='interno'?'#fcd34d':'#86efac'}`}}>
                  {num.tipo==='interno' ? '🤖 Jefe de ventas' : '💬 Clientes'}
                </span>
              </div>
              <div style={{fontSize:11,color:'#6b7280',marginTop:1}}>
                {num.numero && <span style={{marginRight:8}}>📞 {num.numero}</span>}
                <span style={{fontFamily:'monospace',fontSize:10}}>{num.instanceName?.slice(0,20)}...</span>
              </div>
            </div>
            <div style={{display:'flex',gap:6,flexShrink:0,alignItems:'center',flexWrap:'wrap'}}>
              {/* Toggle tipo */}
              <button onClick={async()=>{
                const next = numeros.map(n => n.id===num.id ? {...n, tipo: n.tipo==='interno'?'cliente':'interno'} : n)
                await saveNumeros(next)
              }} style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid #E2E8F0',
                background:'#F8FAFC',color:'#475569',cursor:'pointer',fontWeight:600}}>
                {num.tipo==='interno' ? '→ Clientes' : '→ Jefe ventas'}
              </button>
              <button onClick={()=>toggleActivo(num.id)}
                style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'none',cursor:'pointer',fontWeight:700,
                  background:num.activo?'#DCFCE7':'#F3F4F6',color:num.activo?'#14532d':'#6b7280'}}>
                {num.activo?'Activo':'Inactivo'}
              </button>
              <button onClick={()=>testConnection(num)} disabled={testing===num.id}
                style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid #E2E8F0',background:'#fff',cursor:'pointer',color:B.primary,fontWeight:600}}>
                {testing===num.id?'...':'Probar'}
              </button>
              <button onClick={()=>eliminarNumero(num)}
                style={{fontSize:11,padding:'4px 8px',borderRadius:6,border:'1px solid #fca5a5',background:'#FEF2F2',color:'#991b1b',cursor:'pointer'}}>✕</button>
            </div>
          </div>
        </div>
      ))}

      {/* QR Display */}
      {qrData && (
        <div style={{background:'#fff',border:'2px solid #25D366',borderRadius:12,padding:'20px',marginBottom:12,textAlign:'center'}}>
          <div style={{fontWeight:700,fontSize:13,color:'#14532d',marginBottom:12}}>
            📱 Escanea con WhatsApp Business — {qrData.nombre}
          </div>
          {qrData.qr ? (
            <>
              <img src={qrData.qr} alt="QR WhatsApp" style={{width:220,height:220,borderRadius:8,border:'1px solid #E2E8F0',display:'block',margin:'0 auto 12px'}}/>
              <div style={{fontSize:12,color:'#6b7280'}}>
                WhatsApp Business → ⋮ → Dispositivos vinculados → Vincular dispositivo
              </div>
            </>
          ) : (
            <div style={{padding:'20px',color:'#6b7280',fontSize:13}}>⏳ Generando QR...</div>
          )}
          <div style={{display:'flex',gap:8,justifyContent:'center',marginTop:12}}>
            <button onClick={refreshQr} style={{...sty.btn,fontSize:12}}>🔄 Actualizar QR</button>
            <button onClick={()=>{setQrData(null);setConnecting(false);setStatusMsg(null)}} style={{...sty.btn,fontSize:12}}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Formulario nuevo número */}
      {showForm && !qrData && (
        <div style={{background:'#f9fbff',border:'1px solid #dce8ff',borderRadius:10,padding:'14px 16px',marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:13,color:B.primary,marginBottom:12}}>📱 Conectar nuevo número</div>
          <Fld label="Nombre descriptivo *">
            <input value={newName} onChange={e=>setNewName(e.target.value)} style={sty.inp} placeholder="Ej: Rabbitts Chile +56 9 6629 9729"/>
          </Fld>
          <div style={{marginTop:10}}>
            <div style={{fontSize:11,fontWeight:600,color:'#374151',marginBottom:6}}>Tipo de número</div>
            <div style={{display:'flex',gap:8}}>
              {[
                {val:'cliente', label:'💬 Clientes', sub:'Atiende leads y califica clientes', bg:'#DCFCE7', col:'#14532d', border:'#86efac'},
                {val:'interno', label:'🤖 Jefe de ventas', sub:'Asiste a brokers, resúmenes, consultas', bg:'#FEF3C7', col:'#92400e', border:'#fcd34d'},
              ].map(op => (
                <div key={op.val} onClick={()=>setNewTipo(op.val)}
                  style={{flex:1,padding:'10px 12px',borderRadius:10,cursor:'pointer',
                    border:`2px solid ${newTipo===op.val ? op.border : '#E2E8F0'}`,
                    background: newTipo===op.val ? op.bg : '#fff',
                    transition:'all .15s'}}>
                  <div style={{fontWeight:700,fontSize:12,color:newTipo===op.val?op.col:'#374151'}}>{op.label}</div>
                  <div style={{fontSize:10,color:'#6b7280',marginTop:2}}>{op.sub}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{display:'flex',gap:8,marginTop:10}}>
            <button onClick={conectarNumero} disabled={connecting||!newName.trim()}
              style={{...sty.btnP,flex:1,opacity:connecting||!newName.trim()?0.6:1}}>
              {connecting ? '⏳ Generando QR...' : '📲 Generar QR'}
            </button>
            <button onClick={()=>{setShowForm(false);setStatusMsg(null)}} style={{...sty.btn,flex:1}}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}


// ─── IA Config View ───────────────────────────────────────────────────────────
// ─── Diagnostic Panel ────────────────────────────────────────────────────────
function DiagnosticoRabito() {
  const [diag, setDiag] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const B = {primary:'#5b21b6', light:'#F5F3FF'}
  return (
    <div style={{background:B.light,border:'1px solid #c4b5fd',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
      <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <span style={{fontWeight:700,fontSize:13,color:B.primary}}>🔍 Diagnóstico Rabito</span>
        <button onClick={async()=>{
          setLoading(true)
          try {
            const r = await fetch('/api/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'diagnostico'})})
            setDiag(await r.json())
          } catch(e){ setDiag({error:e.message}) }
          setLoading(false)
        }} style={{padding:'4px 12px',borderRadius:6,border:'none',background:'#7c3aed',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>
          {loading?'⏳ Verificando...':'▶ Verificar configuración'}
        </button>
      </div>
      {diag && (
        <div style={{marginTop:10,fontSize:12,fontFamily:'monospace',background:'#1e1b4b',color:'#e0e7ff',padding:'10px',borderRadius:8,lineHeight:1.8}}>
          {Object.entries(diag).map(([k,v])=>(
            <div key={k}><span style={{color:'#a5b4fc'}}>{k}:</span> {String(Array.isArray(v)?v.join(', '):v)}</div>
          ))}
        </div>
      )}
    </div>
  )
}


// ─── Rabito Stage Tester (Monitor tab) ───────────────────────────────────────
const STAGE_INFO_TESTER = {
  bienvenida:  {label:'Bienvenida',     bg:'#EFF6FF', col:'#1d4ed8', dot:'#93c5fd'},
  calificacion:{label:'Calificación',   bg:'#FFF7ED', col:'#9a3412', dot:'#fdba74'},
  perfil:      {label:'Perfil',         bg:'#F5F3FF', col:'#5b21b6', dot:'#c4b5fd'},
  interes:     {label:'Interés',        bg:'#FFFBEB', col:'#92400e', dot:'#fcd34d'},
  agenda:      {label:'Agenda',         bg:'#F0FDF4', col:'#166534', dot:'#86efac'},
  calificado:  {label:'✅ Calificado',  bg:'#DCFCE7', col:'#14532d', dot:'#4ade80'},
  no_califica: {label:'❌ No califica', bg:'#FEF2F2', col:'#991b1b', dot:'#fca5a5'},
}
const STAGE_ORDER = ['bienvenida','calificacion','perfil','interes','agenda','calificado']

function RabitoStageTester({ iaConfig, sty }) {
  const [msgs,    setMsgs]    = useState([])
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const [stage,   setStage]   = useState('bienvenida')
  const [action,  setAction]  = useState('')
  const endRef = useRef(null)
  const BP = '#2563EB'

  useEffect(() => { endRef.current?.scrollIntoView({behavior:'smooth'}) }, [msgs])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    const newMsgs = [...msgs, {role:'user', content:text}]
    setMsgs(newMsgs); setInput(''); setLoading(true)
    try {
      const r = await fetch('/api/agent', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          message: text,
          conversationHistory: newMsgs.slice(0,-1).map(m=>({role:m.role,content:m.content})),
          iaConfig, leadData: {}
        })
      })
      const data = await r.json()
      const stageR  = data.stage  || 'bienvenida'
      const actionR = data.action || 'conversando'
      setMsgs(p => [...p, {
        role:'assistant', content: data.reply || '(sin respuesta)',
        stage: stageR, action: actionR, leadUpdate: data.leadUpdate
      }])
      setStage(stageR); setAction(actionR)
    } catch(e) {
      setMsgs(p => [...p, {role:'assistant', content:'⚠️ Error: '+e.message, stage:'bienvenida', action:'error'}])
    }
    setLoading(false)
  }

  const si = STAGE_INFO_TESTER[stage] || STAGE_INFO_TESTER.bienvenida

  return (
    <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px',marginBottom:14}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12,flexWrap:'wrap'}}>
        <p style={{margin:0,fontSize:13,fontWeight:700,color:BP}}>🧪 Tester de conversación</p>
        <span style={{fontSize:11,color:'#64748B'}}>Prueba cómo responde Rabito antes de activarlo en producción</span>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
          <span style={{fontSize:10,color:'#64748B',fontWeight:700}}>ETAPA:</span>
          <span style={{fontSize:11,padding:'3px 10px',borderRadius:99,background:si.bg,color:si.col,fontWeight:700,border:`1px solid ${si.dot}80`}}>
            {si.label}
          </span>
          {action && action !== 'conversando' && (
            <span style={{fontSize:11,padding:'3px 10px',borderRadius:99,fontWeight:700,
              background: action==='calificado'?'#DCFCE7':action==='no_califica'?'#FEF2F2':'#F5F3FF',
              color: action==='calificado'?'#14532d':action==='no_califica'?'#991b1b':'#5b21b6'}}>
              {action}
            </span>
          )}
        </div>
      </div>

      {/* Embudo visual */}
      <div style={{display:'flex',gap:2,marginBottom:12,alignItems:'center',overflowX:'auto',paddingBottom:4}}>
        {STAGE_ORDER.map((s, i, arr) => {
          const inf      = STAGE_INFO_TESTER[s]
          const isCur    = s === stage
          const idx      = arr.indexOf(stage)
          const isPast   = i < idx
          return (
            <React.Fragment key={s}>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2,flexShrink:0}}>
                <div style={{width:10,height:10,borderRadius:'50%',
                  background: isCur?inf.col : isPast?'#22c55e':'#d1d5db',
                  border: isCur?`2px solid ${inf.col}`:'none',
                  boxShadow: isCur?`0 0 0 3px ${inf.dot}60`:''}}/>
                <span style={{fontSize:9,whiteSpace:'nowrap',fontWeight:isCur?700:400,
                  color: isCur?inf.col : isPast?'#22c55e':'#9ca3af'}}>
                  {inf.label}
                </span>
              </div>
              {i < arr.length-1 && (
                <div style={{flex:1,height:1,background:isPast?'#22c55e':'#e5e7eb',minWidth:8,marginBottom:10}}/>
              )}
            </React.Fragment>
          )
        })}
      </div>

      {/* Chat */}
      <div style={{background:'#F8FAFC',borderRadius:10,padding:'10px',minHeight:200,maxHeight:300,overflowY:'auto',marginBottom:10,border:'1px solid #E2E8F0'}}>
        {msgs.length===0 && (
          <div style={{textAlign:'center',color:'#94a3b8',fontSize:12,paddingTop:40}}>
            <div style={{fontSize:28,marginBottom:6}}>💬</div>
            Escribe un mensaje para ver cómo responde Rabito y en qué etapa lo detecta
          </div>
        )}
        {msgs.map((m,i) => (
          <div key={i} style={{marginBottom:8,display:'flex',flexDirection:'column',alignItems:m.role==='user'?'flex-end':'flex-start'}}>
            {m.role==='assistant' && m.stage && (
              <span style={{fontSize:9,color:'#94a3b8',marginBottom:2,marginLeft:4}}>
                etapa: {STAGE_INFO_TESTER[m.stage]?.label||m.stage}
                {m.action&&m.action!=='conversando' ? ` · ${m.action}` : ''}
              </span>
            )}
            <div style={{
              maxWidth:'80%',padding:'8px 12px',fontSize:12,lineHeight:1.5,
              borderRadius: m.role==='user'?'12px 12px 2px 12px':'12px 12px 12px 2px',
              background: m.role==='user'?BP:'#fff',
              color: m.role==='user'?'#fff':'#0F172A',
              border: m.role==='assistant'?'1px solid #E2E8F0':'none',
              boxShadow:'0 1px 3px rgba(0,0,0,0.06)'
            }}>
              {m.content}
            </div>
            {m.role==='assistant' && m.leadUpdate && Object.keys(m.leadUpdate).length>0 && (
              <div style={{fontSize:9,color:'#166534',background:'#F0FDF4',padding:'2px 8px',borderRadius:6,marginTop:3,border:'1px solid #86efac'}}>
                📥 Capturado: {Object.entries(m.leadUpdate).map(([k,v])=>`${k}: ${v}`).join(' · ')}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{display:'flex',marginBottom:8}}>
            <div style={{padding:'8px 14px',borderRadius:'12px 12px 12px 2px',background:'#fff',border:'1px solid #E2E8F0',fontSize:12,color:'#94a3b8'}}>
              ✍️ Rabito está escribiendo...
            </div>
          </div>
        )}
        <div ref={endRef}/>
      </div>

      {/* Input */}
      <div style={{display:'flex',gap:8}}>
        <input value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}}
          placeholder="Escribe como si fueras un cliente por WhatsApp..."
          style={{...sty.inp, flex:1, fontSize:13}}/>
        <button onClick={send} disabled={loading||!input.trim()}
          style={{padding:'8px 18px',borderRadius:8,border:'none',fontWeight:700,fontSize:13,flexShrink:0,
            background: loading||!input.trim()?'#e5e7eb':BP,
            color: loading||!input.trim()?'#9ca3af':'#fff',
            cursor: loading||!input.trim()?'not-allowed':'pointer'}}>
          Enviar
        </button>
        {msgs.length>0 && (
          <button onClick={()=>{setMsgs([]);setStage('bienvenida');setAction('')}}
            style={{padding:'8px 14px',borderRadius:8,border:'1px solid #E2E8F0',background:'#fff',cursor:'pointer',fontSize:12,color:'#64748B'}}>
            Limpiar
          </button>
        )}
      </div>

      <p style={{fontSize:10,color:'#9ca3af',margin:'8px 0 0'}}>
        💡 El tester usa la configuración guardada actualmente. Guarda antes de probar.
        {iaConfig && !iaConfig.activo && <span style={{color:'#d97706',fontWeight:600}}> · ⚠️ IA apagada — en producción no responderá.</span>}
      </p>
    </div>
  )
}

// ─── Jefe de Ventas Panel ────────────────────────────────────────────────────
function JefeVentasPanel({ iaConfig, upd, supabase, dbReady }) {
  const B = { primary:'#2563EB', light:'#EFF6FF', mid:'#64748B' }
  const sty = { inp:{padding:'7px 10px',borderRadius:8,border:'1px solid #E2E8F0',fontSize:13,width:'100%',boxSizing:'border-box'} }

  const [config, setConfig]   = React.useState({})
  const [saving, setSaving]   = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [numeros, setNumeros] = React.useState([])
  const [msg, setMsg]         = React.useState(null)

  React.useEffect(() => {
    if (!dbReady || !supabase) return
    supabase.from('crm_settings').select('value').eq('key','jefe_ventas_config').single()
      .then(({data}) => { if (data?.value) setConfig(data.value) }).catch(()=>{})
    supabase.from('crm_settings').select('value').eq('key','wa_numeros').single()
      .then(({data}) => { setNumeros(data?.value || []) }).catch(()=>{})
  }, [dbReady])

  const save = async (patch) => {
    const next = { ...config, ...patch }
    setConfig(next)
    setSaving(true)
    if (dbReady && supabase) await supabase.from('crm_settings').upsert({key:'jefe_ventas_config', value:next})
    setSaving(false)
  }

  const testCron = async () => {
    setTesting(true); setMsg(null)
    try {
      const r = await fetch('/api/whatsapp?action=cron&secret=rabbitts2024')
      const d = await r.json()
      setMsg({ ok: d.ok, txt: d.ok ? `✅ Enviado a ${d.enviados} brokers` : '❌ Error: ' + JSON.stringify(d) })
    } catch(e) { setMsg({ ok: false, txt: '❌ Error: ' + e.message }) }
    setTesting(false)
  }

  const instanciaInterna = numeros.find(n => n.tipo === 'interno' && n.activo !== false)
  const instanciasInternas = numeros.filter(n => n.tipo === 'interno')
  const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>

      {/* Estado instancia interna */}
      <div style={{gridColumn:'1/-1',padding:'12px 16px',borderRadius:12,
        background: instanciaInterna ? '#F0FDF4' : '#FEF3C7',
        border: `1px solid ${instanciaInterna ? '#86efac' : '#fcd34d'}`}}>
        {instanciaInterna ? (
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:20}}>🟢</span>
            <div>
              <div style={{fontWeight:700,fontSize:13,color:'#14532d'}}>Número interno conectado</div>
              <div style={{fontSize:12,color:'#166534'}}>{instanciaInterna.nombre} · {instanciaInterna.numero}</div>
            </div>
          </div>
        ) : (
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:20}}>⚠️</span>
            <div>
              <div style={{fontWeight:700,fontSize:13,color:'#92400e'}}>Sin número interno</div>
              <div style={{fontSize:12,color:'#78350f'}}>Ve a la pestaña Configuración → Números WhatsApp → Conectar número → Tipo: Jefe de ventas</div>
            </div>
          </div>
        )}
      </div>

      {/* Toggle principal */}
      <div style={{gridColumn:'1/-1',background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:16}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:'#0F172A'}}>🤖 Rabito Jefe de Ventas</div>
            <div style={{fontSize:12,color:B.mid,marginTop:2}}>
              Resúmenes diarios automáticos, seguimiento de brokers y consultas de proyectos por WhatsApp
            </div>
          </div>
          <button onClick={()=>save({activo:!config.activo})}
            style={{width:44,height:24,borderRadius:99,border:'none',cursor:'pointer',
              background:config.activo?B.primary:'#e5e7eb',position:'relative',transition:'background .2s',flexShrink:0}}>
            <div style={{position:'absolute',top:2,left:config.activo?22:2,width:20,height:20,
              borderRadius:'50%',background:'#fff',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
          </button>
        </div>
      </div>

      {/* Resumen diario */}
      <div style={{gridColumn:'1/-1',background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:16}}>
        <p style={{margin:'0 0 14px',fontSize:13,fontWeight:700,color:B.primary}}>📅 Resumen diario automático</p>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
          <div>
            <label style={{fontSize:11,fontWeight:600,color:'#374151',display:'block',marginBottom:4}}>Hora de envío</label>
            <input type="time" value={config.horaEnvio||'08:30'}
              onChange={e=>save({horaEnvio:e.target.value})}
              style={sty.inp}/>
          </div>
          <div>
            <label style={{fontSize:11,fontWeight:600,color:'#374151',display:'block',marginBottom:4}}>Días de envío</label>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              {DIAS.map((d,i) => {
                const dias = config.diasEnvio || [1,2,3,4,5]
                const activo = dias.includes(i)
                return (
                  <button key={i} onClick={()=>{
                    const next = activo ? dias.filter(x=>x!==i) : [...dias,i]
                    save({diasEnvio:next})
                  }} style={{fontSize:10,padding:'3px 7px',borderRadius:6,cursor:'pointer',fontWeight:700,
                    border:activo?`1px solid ${B.primary}`:'1px solid #E2E8F0',
                    background:activo?B.light:'#fff',color:activo?B.primary:'#6b7280'}}>
                    {d.slice(0,3)}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div>
          <label style={{fontSize:11,fontWeight:600,color:'#374151',display:'block',marginBottom:4}}>
            Mensaje de cierre del resumen
          </label>
          <textarea value={config.mensajeCierre||''}
            onChange={e=>save({mensajeCierre:e.target.value})}
            placeholder="¡Mucho éxito hoy! Cualquier consulta sobre proyectos o estrategias, escríbeme acá 🐰"
            style={{...sty.inp,minHeight:60,resize:'vertical',fontSize:12}}/>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10,marginTop:12}}>
          <button onClick={testCron} disabled={testing||!instanciaInterna}
            style={{padding:'7px 16px',borderRadius:8,border:'none',cursor:instanciaInterna?'pointer':'not-allowed',
              fontWeight:700,fontSize:12,
              background:instanciaInterna?B.primary:'#e5e7eb',
              color:instanciaInterna?'#fff':'#9ca3af'}}>
            {testing ? '⏳ Enviando...' : '▶ Probar ahora'}
          </button>
          {saving && <span style={{fontSize:11,color:B.mid}}>Guardando...</span>}
          {msg && <span style={{fontSize:12,fontWeight:600,color:msg.ok?'#14532d':'#991b1b'}}>{msg.txt}</span>}
        </div>
      </div>

      {/* Comportamiento Rabito interno */}
      <div style={{gridColumn:'1/-1',background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:16}}>
        <p style={{margin:'0 0 4px',fontSize:13,fontWeight:700,color:B.primary}}>🧠 Comportamiento de Rabito interno</p>
        <p style={{margin:'0 0 12px',fontSize:11,color:B.mid}}>
          Rabito interno tiene acceso al Cerebro Rabito completo. Lee documentos, condiciones comerciales y entrenamiento para responder consultas de brokers.
        </p>
        <div style={{marginBottom:10}}>
          <label style={{fontSize:11,fontWeight:600,color:'#374151',display:'block',marginBottom:4}}>
            Instrucciones del jefe de ventas
          </label>
          <textarea value={config.instrucciones||''}
            onChange={e=>save({instrucciones:e.target.value})}
            placeholder="Ej: Responde como un jefe de ventas experimentado. Cuando te consulten proyectos con bono pie, busca en las condiciones comerciales y lista los que aplican. Motiva a los brokers a contactar sus leads urgentes."
            style={{...sty.inp,minHeight:80,resize:'vertical',fontSize:12}}/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',
            borderRadius:8,background:'#F8FAFC',border:'1px solid #E2E8F0'}}>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:'#0F172A'}}>Leer condiciones comerciales</div>
              <div style={{fontSize:10,color:B.mid}}>Responde consultas de proyectos y condiciones</div>
            </div>
            <button onClick={()=>save({leerCondiciones:!config.leerCondiciones})}
              style={{width:40,height:22,borderRadius:99,border:'none',cursor:'pointer',
                background:config.leerCondiciones!==false?B.primary:'#e5e7eb',position:'relative'}}>
              <div style={{position:'absolute',top:2,left:config.leerCondiciones!==false?20:2,
                width:18,height:18,borderRadius:'50%',background:'#fff',transition:'left .2s',
                boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
            </button>
          </div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 12px',
            borderRadius:8,background:'#F8FAFC',border:'1px solid #E2E8F0'}}>
            <div>
              <div style={{fontSize:12,fontWeight:600,color:'#0F172A'}}>Alertar leads críticos</div>
              <div style={{fontSize:10,color:B.mid}}>Menciona en el resumen leads +7 días</div>
            </div>
            <button onClick={()=>save({alertarCriticos:!config.alertarCriticos})}
              style={{width:40,height:22,borderRadius:99,border:'none',cursor:'pointer',
                background:config.alertarCriticos!==false?B.primary:'#e5e7eb',position:'relative'}}>
              <div style={{position:'absolute',top:2,left:config.alertarCriticos!==false?20:2,
                width:18,height:18,borderRadius:'50%',background:'#fff',transition:'left .2s',
                boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
            </button>
          </div>
        </div>
      </div>

      {/* URL del cron */}
      <div style={{gridColumn:'1/-1',background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:12,padding:14}}>
        <p style={{margin:'0 0 8px',fontSize:12,fontWeight:700,color:'#374151'}}>⏰ Configurar horario automático</p>
        <p style={{margin:'0 0 8px',fontSize:11,color:B.mid}}>
          Para que el resumen se envíe automáticamente a la hora configurada, agrega esta URL en un servicio de cron job gratuito como cron-job.org:
        </p>
        <div style={{background:'#1e1b4b',color:'#e0e7ff',padding:'10px 14px',borderRadius:8,
          fontSize:12,fontFamily:'monospace',display:'flex',alignItems:'center',gap:10,justifyContent:'space-between'}}>
          <span>{typeof window!=='undefined'?window.location.origin:'https://crm.rabbittscapital.com'}/api/whatsapp?action=cron&secret=rabbitts2024</span>
          <button onClick={()=>{
            navigator.clipboard.writeText(`${window.location.origin}/api/whatsapp?action=cron&secret=rabbitts2024`)
            setMsg({ok:true,txt:'✅ Copiado'})
            setTimeout(()=>setMsg(null),2000)
          }} style={{fontSize:11,padding:'3px 8px',borderRadius:6,border:'none',background:'#4c1d95',
            color:'#e0e7ff',cursor:'pointer',flexShrink:0}}>
            📋 Copiar
          </button>
        </div>
        <p style={{margin:'8px 0 0',fontSize:10,color:'#94a3b8'}}>
          En cron-job.org: crear cuenta gratis → New Job → pegar URL → Schedule: todos los días a las {config.horaEnvio||'08:30'} → Save
        </p>
      </div>
    </div>
  )
}

function IAConfigView({iaConfig, setIaConfig, users, leads, supabase, dbReady}) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const [tab, setTab] = useState('config')
  const [testMsg, setTestMsg] = useState('')
  const [testEvento, setTestEvento] = useState('asignacion')
  const [testBroker, setTestBroker] = useState('')
  const [editIdx, setEditIdx] = useState(null)
  const [newPair, setNewPair] = useState({pregunta:'',respuesta:''})
  const [previewPlant, setPreviewPlant] = useState(null)
  const [driveSyncing, setDriveSyncing] = useState(false)
  const [driveResults, setDriveResults] = useState(null)
  const [newDocUrl, setNewDocUrl] = useState('')
  const [newFolderUrl, setNewFolderUrl] = useState('')
  const [driveMode, setDriveMode] = useState('folder') // 'folder' | 'docs'
  const [showScriptGuide, setShowScriptGuide] = useState(false)

  const agents = (users||[]).filter(u=>u.role==='agent')
  const upd = (path, val) => {
    setIaConfig(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      path.reduce((o,k,i) => i===path.length-1 ? (o[k]=val,o) : o[k], next)
      return next
    })
  }

  const previewTemplate = (key) => {
    const tpl = iaConfig.plantillas[key]||''
    const broker = agents[0]?.name||'Iván Orellana'
    const filled = tpl
      .replace('{broker}',broker)
      .replace('{cliente}','Juan Pérez')
      .replace('{proyecto}','Borde Vivo')
      .replace('{etapa}','Firma Promesa')
      .replace('{inmobiliaria}','Norte Verde')
      .replace('{n}','3')
      .replace('{dias}',iaConfig.eventos.diasInactividad||7)
    setPreviewPlant({key, filled})
  }

  // Stats
  const closingLeads = (leads||[]).filter(l=>['firma','escritura'].includes(l.stage))
  const inactive = (leads||[]).filter(l => {
    if (['ganado','perdido','desistio'].includes(l.stage)) return false
    const d = l.fecha ? (Date.now()-new Date(l.fecha).getTime())/86400000 : 0
    return d > (iaConfig.eventos.diasInactividad||7)
  })

  const TABS = [
    {id:'config',    label:'⚙️ Configuración'},
    {id:'cerebro',   label:'🧠 Cerebro Rabito'},
    {id:'jefe',      label:'🤖 Jefe de Ventas'},
    {id:'eventos',   label:'🔔 Eventos'},
    {id:'plantillas',label:'💬 Plantillas'},
    {id:'entrena',   label:'✏️ Entrenamiento'},
    {id:'monitor',   label:'📊 Monitor'},
  ]

  const TONOS = ['profesional','amigable','formal','motivador']
  const EVENTOS_LIST = [
    {k:'asignacion',  l:'Nuevo lead asignado al broker',      tpl:'asignacion'},
    {k:'cambioEtapa', l:'Lead avanza a Firma Promesa/Escritura', tpl:'firma'},
    {k:'ocRecibida',  l:'OC recibida de inmobiliaria',        tpl:'ocRecibida'},
    {k:'brokerPagar', l:'Listo para pagar al broker',         tpl:'brokerPagar'},
    {k:'inactividad', l:'Leads sin actividad',                tpl:'inactividad'},
  ]

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,paddingBottom:12,borderBottom:'2px solid #E8EFFE',flexWrap:'wrap'}}>
        <div style={{fontSize:32}}>🤖</div>
        <div style={{flex:1}}>
          <div style={{fontSize:isMobile?15:16,fontWeight:800,color:B.primary}}>Centro de IA — Configuración y Entrenamiento</div>
          <div style={{fontSize:12,color:B.mid}}>Todo se guarda automáticamente · Personaliza cómo Rabito se comunica</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
          <span style={{fontSize:11,color:'#9ca3af'}}>💾 Guardado automático</span>
          <span style={{fontSize:12,color:B.mid}}>IA activa:</span>
          <button onClick={()=>upd(['activo'],!iaConfig.activo)}
            style={{padding:'6px 16px',borderRadius:99,border:'none',cursor:'pointer',fontWeight:700,fontSize:12,
              background:iaConfig.activo?'#DCFCE7':'#F3F4F6',color:iaConfig.activo?'#14532d':'#6b7280'}}>
            {iaConfig.activo?'🟢 ON':'⚪ OFF'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'2px solid #f0f4ff',flexWrap:'wrap'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:'8px 14px',borderRadius:'8px 8px 0 0',border:'none',cursor:'pointer',fontSize:12,fontWeight:600,
              background:tab===t.id?'#fff':'transparent',color:tab===t.id?B.primary:'#6b7280',
              borderBottom:tab===t.id?'2px solid '+B.primary:'2px solid transparent',marginBottom:-2}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: CONFIG */}
      {tab==='config' && (
        <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?10:16}}>
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px'}}>
            <p style={{margin:'0 0 14px',fontSize:13,fontWeight:700,color:B.primary}}>🤖 Identidad del bot</p>
            <Fld label="Nombre del bot"><input value={iaConfig.nombre} onChange={e=>upd(['nombre'],e.target.value)} style={sty.inp} placeholder="Ej: RabbittsBot"/></Fld>
            <div style={{marginTop:10}}>
              <Fld label="Tono de comunicación">
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {TONOS.map(t=>(
                    <button key={t} onClick={()=>upd(['tono'],t)}
                      style={{fontSize:11,padding:'5px 12px',borderRadius:99,cursor:'pointer',fontWeight:600,
                        border:iaConfig.tono===t?`2px solid ${B.primary}`:'1px solid #dce8ff',
                        background:iaConfig.tono===t?B.light:'transparent',color:iaConfig.tono===t?B.primary:'#6b7280'}}>
                      {t.charAt(0).toUpperCase()+t.slice(1)}
                    </button>
                  ))}
                </div>
              </Fld>
            </div>
          </div>

          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px'}}>
            <p style={{margin:'0 0 14px',fontSize:13,fontWeight:700,color:B.primary}}>⏰ Horario de envío</p>
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?8:10}}>
              <Fld label="Desde"><input type="time" value={iaConfig.horarioDesde} onChange={e=>upd(['horarioDesde'],e.target.value)} style={sty.inp}/></Fld>
              <Fld label="Hasta"><input type="time" value={iaConfig.horarioHasta} onChange={e=>upd(['horarioHasta'],e.target.value)} style={sty.inp}/></Fld>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10,marginTop:10,padding:'10px 12px',background:iaConfig.siempreActivo?'#DCFCE7':'#FFF7ED',borderRadius:8,border:'1px solid '+(iaConfig.siempreActivo?'#86efac':'#fdba74')}}>
              <div style={{flex:1,fontSize:11,color:iaConfig.siempreActivo?'#14532d':'#92400e'}}>
                {iaConfig.siempreActivo ? '🟢 Rabito responde 24/7 sin restriccion de horario.' : '⏰ Los mensajes fuera de horario se envian al dia siguiente.'}
              </div>
              <button onClick={()=>upd(['siempreActivo'],!iaConfig.siempreActivo)}
                style={{padding:'5px 14px',borderRadius:99,border:'none',cursor:'pointer',fontWeight:700,fontSize:12,flexShrink:0,
                  background:iaConfig.siempreActivo?'#DCFCE7':'#F3F4F6',color:iaConfig.siempreActivo?'#14532d':'#6b7280'}}>
                {iaConfig.siempreActivo?'🟢 24/7':'⏰ Con horario'}
              </button>
            </div>
          </div>

          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px',gridColumn:'1/-1'}}>
            <WhatsAppNumerosPanel iaConfig={iaConfig} upd={upd} supabase={supabase} dbReady={dbReady}/>
          </div>

          {/* Calificación */}
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px',gridColumn:'1/-1'}}>
            <p style={{margin:'0 0 4px',fontSize:13,fontWeight:700,color:B.primary}}>🎯 Criterios de calificación</p>
            <p style={{margin:'0 0 12px',fontSize:11,color:B.mid}}>Rabito usa estos valores para decidir si un cliente califica o se cierra amablemente.</p>
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr 1fr',gap:10}}>
              <Fld label="Renta mínima individual ($)">
                <input type="number" value={iaConfig.rentaMinima||1500000} onChange={e=>upd(['rentaMinima'],parseInt(e.target.value))} style={sty.inp}/>
              </Fld>
              <Fld label="Renta mínima con pareja ($)">
                <input type="number" value={iaConfig.rentaMinimaPareja||2000000} onChange={e=>upd(['rentaMinimaPareja'],parseInt(e.target.value))} style={sty.inp}/>
              </Fld>
              <Fld label="Link de agenda (Calendly u otro)">
                <input value={iaConfig.calendlyLink||''} onChange={e=>upd(['calendlyLink'],e.target.value)} placeholder="https://calendly.com/..." style={sty.inp}/>
              </Fld>
            </div>
            <div style={{marginTop:10}}>
              <Fld label="Criterio extra de calificación (opcional)">
                <input value={iaConfig.criterioCalificacion||''} onChange={e=>upd(['criterioCalificacion'],e.target.value)}
                  placeholder="Ej: Solo personas con crédito preaprobado o con pie disponible" style={sty.inp}/>
              </Fld>
            </div>
          </div>

          {/* Propuesta de valor */}
          <div style={{background:'#fff',border:`2px solid ${B.primary}30`,borderRadius:12,padding:'16px',gridColumn:'1/-1'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
              <p style={{margin:0,fontSize:13,fontWeight:700,color:B.primary}}>💡 Propuesta de valor</p>
              <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:'#DCFCE7',color:'#14532d',fontWeight:700}}>⚡ IMPACTO DIRECTO EN VENTAS</span>
            </div>
            <p style={{margin:'0 0 10px',fontSize:11,color:B.mid}}>Qué ofrece Rabbitts Capital exactamente. Rabito usa esto para convencer al cliente de por qué Rabbitts es su mejor opción. Sé específico: proyectos, beneficios, diferenciadores.</p>
            <textarea value={iaConfig.propuestaValor||''} onChange={e=>upd(['propuestaValor'],e.target.value)}
              placeholder="Ej: En Rabbitts Capital te ayudamos a invertir en departamentos nuevos usando el multicrédito hipotecario, recuperar el IVA de la construcción y pagar menos impuestos con estrategias tributarias legales. Trabajamos con las mejores inmobiliarias de Chile y tenemos proyectos desde 2.500 UF en Ñuñoa, Providencia y Las Condes."
              style={{...sty.inp,minHeight:90,resize:'vertical',fontSize:12}}/>
          </div>

          {/* Personalidad */}
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px',gridColumn:'1/-1'}}>
            <p style={{margin:'0 0 4px',fontSize:13,fontWeight:700,color:B.primary}}>🧬 Personalidad del agente</p>
            <p style={{margin:'0 0 10px',fontSize:11,color:B.mid}}>Cómo habla Rabito: tono, estilo, límites de carácter. No pongas proyectos ni precios aquí — eso va en Propuesta de valor y Cerebro Rabito.</p>
            <textarea value={iaConfig.personalidad||''} onChange={e=>upd(['personalidad'],e.target.value)}
              style={{...sty.inp,minHeight:80,resize:'vertical',fontSize:12,fontFamily:'monospace'}}/>
          </div>

          {/* Guion */}
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
              <p style={{margin:0,fontSize:13,fontWeight:700,color:B.primary}}>📋 Guion de ventas</p>
              <span style={{fontSize:10,padding:'2px 8px',borderRadius:99,background:B.light,color:B.primary,fontWeight:600}}>complementa el embudo automático</span>
            </div>
            <p style={{margin:'0 0 10px',fontSize:11,color:B.mid}}>El embudo Bienvenida → Calificación → Perfil → Interés → Agenda ya está incorporado al agente. Aquí puedes agregar instrucciones adicionales específicas de tu negocio.</p>
            <textarea value={iaConfig.guion||''} onChange={e=>upd(['guion'],e.target.value)}
              style={{...sty.inp,minHeight:80,resize:'vertical',fontSize:12,fontFamily:'monospace'}}/>
          </div>

          {/* Reglas duras */}
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px'}}>
            <p style={{margin:'0 0 4px',fontSize:13,fontWeight:700,color:B.primary}}>🚫 Reglas inamovibles</p>
            <p style={{margin:'0 0 10px',fontSize:11,color:B.mid}}>Cosas que Rabito NUNCA debe hacer o decir bajo ninguna circunstancia.</p>
            <textarea value={iaConfig.reglasDuras||''} onChange={e=>upd(['reglasDuras'],e.target.value)}
              placeholder="Ej: Nunca mencionar competidores. Nunca dar precios exactos sin consultar. Nunca decir que está ocupado o que llamará después."
              style={{...sty.inp,minHeight:70,resize:'vertical',fontSize:12}}/>
          </div>

          {/* Instrucciones extra - full width */}
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px',gridColumn:'1/-1'}}>
            <p style={{margin:'0 0 4px',fontSize:13,fontWeight:700,color:B.primary}}>📌 Instrucciones extra</p>
            <p style={{margin:'0 0 10px',fontSize:11,color:B.mid}}>Cualquier otro comportamiento específico que no encaje en los campos anteriores.</p>
            <textarea value={iaConfig.instrucciones||''} onChange={e=>upd(['instrucciones'],e.target.value)}
              placeholder="Ej: Si el cliente pregunta por proyectos en Antofagasta, decirle que por ahora solo tenemos en Santiago."
              style={{...sty.inp,minHeight:60,resize:'vertical',fontSize:12}}/>
          </div>

          {/* Ajustes de comportamiento */}
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px',gridColumn:'1/-1'}}>
            <p style={{margin:'0 0 14px',fontSize:13,fontWeight:700,color:B.primary}}>⚙️ Ajustes de comportamiento</p>
            <div style={{display:'flex',flexDirection:'column',gap:0}}>

              {/* Pausar al intervenir */}
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',padding:'14px 0',borderBottom:'1px solid #f0f4ff'}}>
                <div style={{flex:1,paddingRight:16}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#0F172A'}}>Pausar respuestas de Rabito al intervenir</div>
                  <div style={{fontSize:11,color:'#6b7280',marginTop:3}}>Cuando un humano intervenga en la conversación, el contacto pasará a etapa humana y Rabito se detendrá. Si está desactivada, Rabito seguirá respondiendo aunque un humano intervenga.</div>
                </div>
                <button onClick={()=>upd(['pausarAlIntervenir'],!iaConfig.pausarAlIntervenir)}
                  style={{flexShrink:0,width:44,height:24,borderRadius:99,border:'none',cursor:'pointer',
                    background:iaConfig.pausarAlIntervenir?B.primary:'#e5e7eb',position:'relative',transition:'background .2s'}}>
                  <div style={{position:'absolute',top:2,left:iaConfig.pausarAlIntervenir?22:2,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
                </button>
              </div>

              {/* Rabito respondiendo global */}
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',padding:'14px 0',borderBottom:'1px solid #f0f4ff'}}>
                <div style={{flex:1,paddingRight:16}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#0F172A'}}>Rabito respondiendo</div>
                  <div style={{fontSize:11,color:'#6b7280',marginTop:3}}>Si está activada, Rabito responderá a todos los mensajes en tus canales conectados. Si está desactivada, Rabito no responderá ningún mensaje.</div>
                </div>
                <button onClick={()=>upd(['activo'],!iaConfig.activo)}
                  style={{flexShrink:0,width:44,height:24,borderRadius:99,border:'none',cursor:'pointer',
                    background:iaConfig.activo?B.primary:'#e5e7eb',position:'relative',transition:'background .2s'}}>
                  <div style={{position:'absolute',top:2,left:iaConfig.activo?22:2,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
                </button>
              </div>

              {/* Tiempo de espera */}
              <div style={{padding:'14px 0',borderBottom:'1px solid #f0f4ff'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:'#0F172A'}}>Tiempo de espera de mensajes</div>
                    <div style={{fontSize:11,color:'#6b7280',marginTop:2}}>El tiempo que Rabito esperará antes de responder, por si el cliente envía varios mensajes seguidos.</div>
                  </div>
                  <span style={{fontSize:13,fontWeight:700,color:B.primary,flexShrink:0,marginLeft:16}}>{iaConfig.tiempoEspera||7} segundos</span>
                </div>
                <input type="range" min="1" max="30" value={iaConfig.tiempoEspera||7}
                  onChange={e=>upd(['tiempoEspera'],parseInt(e.target.value))}
                  style={{width:'100%',accentColor:B.primary}}/>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#9ca3af',marginTop:2}}>
                  <span>1 seg</span><span>30 seg</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notificaciones */}
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px'}}>
            <p style={{margin:'0 0 14px',fontSize:13,fontWeight:700,color:B.primary}}>🔔 Canales de notificación</p>
            <p style={{margin:'0 0 10px',fontSize:11,color:B.mid}}>Elige dónde recibir notificaciones cuando un lead pasa a etapa humana</p>
            {[
              {k:'notifApp',   l:'Aplicación',          sub:'En el CRM (campana)'},
              {k:'notifEmail', l:'Correo electrónico',  sub:'Notificaciones por email'},
            ].map(({k,l,sub})=>(
              <div key={k} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid #f0f4ff'}}>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:'#0F172A'}}>{l}</div>
                  <div style={{fontSize:11,color:'#6b7280'}}>{sub}</div>
                </div>
                <button onClick={()=>upd([k],!iaConfig[k])}
                  style={{flexShrink:0,width:44,height:24,borderRadius:99,border:'none',cursor:'pointer',
                    background:iaConfig[k]?B.primary:'#e5e7eb',position:'relative',transition:'background .2s'}}>
                  <div style={{position:'absolute',top:2,left:iaConfig[k]?22:2,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
                </button>
              </div>
            ))}
          </div>

          {/* Tipos de notificación */}
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px'}}>
            <p style={{margin:'0 0 14px',fontSize:13,fontWeight:700,color:B.primary}}>🔔 Tipos de notificación</p>
            <p style={{margin:'0 0 10px',fontSize:11,color:B.mid}}>Selecciona cuándo recibir notificaciones de etapa humana</p>
            {[
              {k:'notifEntradaHumano', l:'Entrada a etapa humana', sub:'Cuando un contacto entra a etapa humana'},
              {k:'notifMensajeHumano', l:'Mensajes nuevos',        sub:'Cuando recibes un mensaje en etapa humana'},
            ].map(({k,l,sub})=>(
              <div key={k} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid #f0f4ff'}}>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:'#0F172A'}}>{l}</div>
                  <div style={{fontSize:11,color:'#6b7280'}}>{sub}</div>
                </div>
                <button onClick={()=>upd([k],!iaConfig[k])}
                  style={{flexShrink:0,width:44,height:24,borderRadius:99,border:'none',cursor:'pointer',
                    background:iaConfig[k]?B.primary:'#e5e7eb',position:'relative',transition:'background .2s'}}>
                  <div style={{position:'absolute',top:2,left:iaConfig[k]?22:2,width:20,height:20,borderRadius:'50%',background:'#fff',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
                </button>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* TAB: JEFE DE VENTAS */}
      {tab==='jefe' && (
        <JefeVentasPanel iaConfig={iaConfig} upd={upd} supabase={supabase} dbReady={dbReady}/>
      )}

      {/* TAB: CEREBRO DE RABITO */}
      {tab==='cerebro' && (
        <CerebroRabito supabase={supabase} dbReady={dbReady} iaConfig={iaConfig} upd={upd}/>
      )}

      {/* TAB: EVENTOS */}
      {tab==='eventos' && (
        <div>
          {/* Built-in events */}
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px',marginBottom:12}}>
            <p style={{margin:'0 0 14px',fontSize:13,fontWeight:700,color:B.primary}}>🔔 Eventos del sistema</p>
            <div style={{display:'flex',flexDirection:'column',gap:0}}>
              {EVENTOS_LIST.map((ev,i)=>(
                <div key={ev.k} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 0',borderBottom:i<EVENTOS_LIST.length-1?'1px solid #f0f4ff':'none'}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:'#0F172A'}}>{ev.l}</div>
                    {ev.k==='inactividad' && iaConfig.eventos[ev.k] && (
                      <div style={{display:'flex',alignItems:'center',gap:8,marginTop:5}}>
                        <span style={{fontSize:11,color:'#6b7280'}}>Avisar después de</span>
                        <input type="number" min="1" max="30" value={iaConfig.eventos.diasInactividad||7}
                          onChange={e=>upd(['eventos','diasInactividad'],parseInt(e.target.value))}
                          style={{width:50,fontSize:11,padding:'3px 6px',border:'1px solid #E2E8F0',borderRadius:5}}/>
                        <span style={{fontSize:11,color:'#6b7280'}}>días sin actividad</span>
                      </div>
                    )}
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                    <button onClick={()=>upd(['eventos',ev.k],!iaConfig.eventos[ev.k])}
                      style={{padding:'5px 14px',borderRadius:99,border:'none',cursor:'pointer',fontWeight:700,fontSize:12,
                        background:iaConfig.eventos[ev.k]?'#DCFCE7':'#F3F4F6',
                        color:iaConfig.eventos[ev.k]?'#14532d':'#6b7280'}}>
                      {iaConfig.eventos[ev.k]?'🟢 ON':'⚪ OFF'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Custom events */}
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px',marginBottom:12}}>
            <p style={{margin:'0 0 14px',fontSize:13,fontWeight:700,color:B.primary}}>➕ Crear evento personalizado</p>
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?8:10,marginBottom:10}}>
              <Fld label="Nombre del evento">
                <input id="nuevo_evento_nombre" style={sty.inp} placeholder="Ej: Recordatorio escritura"/>
              </Fld>
              <Fld label="Descripción">
                <input id="nuevo_evento_desc" style={sty.inp} placeholder="Ej: Avisar al broker 3 días antes"/>
              </Fld>
            </div>
            <Fld label="Mensaje a enviar">
              <textarea id="nuevo_evento_msg" style={{...sty.inp,minHeight:52,resize:'vertical'}} placeholder="Hola {broker}, recuerda que {cliente} tiene escritura en 3 días..."/>
            </Fld>
            <button onClick={()=>{
              const nombre = document.getElementById('nuevo_evento_nombre')?.value
              const desc = document.getElementById('nuevo_evento_desc')?.value
              const msg = document.getElementById('nuevo_evento_msg')?.value
              if (!nombre||!msg) return
              const key = 'custom_'+Date.now()
              const newEventos = {...iaConfig.eventos, [key]: false}
              const newPlantillas = {...iaConfig.plantillas, [key]: msg}
              const newCustomEvs = [...(iaConfig.customEventos||[]), {k:key, l:nombre, desc, tpl:key}]
              upd(['eventos'], newEventos)
              upd(['plantillas'], newPlantillas)
              upd(['customEventos'], newCustomEvs)
              if (document.getElementById('nuevo_evento_nombre')) document.getElementById('nuevo_evento_nombre').value=''
              if (document.getElementById('nuevo_evento_desc')) document.getElementById('nuevo_evento_desc').value=''
              if (document.getElementById('nuevo_evento_msg')) document.getElementById('nuevo_evento_msg').value=''
            }} style={{...sty.btnP,marginTop:8,fontSize:12}}>Crear evento</button>
          </div>

          {/* Custom events list */}
          {(iaConfig.customEventos||[]).length > 0 && (
            <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px'}}>
              <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>📋 Eventos personalizados</p>
              {(iaConfig.customEventos||[]).map((ev,i)=>(
                <div key={ev.k} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:i<(iaConfig.customEventos||[]).length-1?'1px solid #f0f4ff':'none'}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:'#0F172A'}}>{ev.l}</div>
                    {ev.desc&&<div style={{fontSize:11,color:'#6b7280',marginTop:2}}>{ev.desc}</div>}
                    <div style={{fontSize:11,color:B.mid,marginTop:2,fontStyle:'italic'}}>{iaConfig.plantillas[ev.k]?.slice(0,60)}...</div>
                  </div>
                  <div style={{display:'flex',gap:6,flexShrink:0}}>
                    <button onClick={()=>upd(['eventos',ev.k],!iaConfig.eventos[ev.k])}
                      style={{padding:'5px 12px',borderRadius:99,border:'none',cursor:'pointer',fontWeight:700,fontSize:11,
                        background:iaConfig.eventos[ev.k]?'#DCFCE7':'#F3F4F6',color:iaConfig.eventos[ev.k]?'#14532d':'#6b7280'}}>
                      {iaConfig.eventos[ev.k]?'🟢 ON':'⚪ OFF'}
                    </button>
                    <button onClick={()=>{
                      const newCust = (iaConfig.customEventos||[]).filter(e=>e.k!==ev.k)
                      const newEv = {...iaConfig.eventos}; delete newEv[ev.k]
                      const newPl = {...iaConfig.plantillas}; delete newPl[ev.k]
                      upd(['customEventos'],newCust); upd(['eventos'],newEv); upd(['plantillas'],newPl)
                    }} style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid #fca5a5',background:'#FEF2F2',cursor:'pointer',color:'#991b1b'}}>
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: PLANTILLAS */}
      {tab==='plantillas' && (
        <div style={{display:'flex',flexDirection:'column',gap:isMobile?8:12}}>
          <div style={{padding:'10px 14px',background:B.light,borderRadius:8,fontSize:12,color:B.primary}}>
            💡 Variables disponibles: <code style={{background:'#fff',padding:'1px 4px',borderRadius:3}}>{'{broker}'}</code> <code style={{background:'#fff',padding:'1px 4px',borderRadius:3}}>{'{cliente}'}</code> <code style={{background:'#fff',padding:'1px 4px',borderRadius:3}}>{'{proyecto}'}</code> <code style={{background:'#fff',padding:'1px 4px',borderRadius:3}}>{'{etapa}'}</code> <code style={{background:'#fff',padding:'1px 4px',borderRadius:3}}>{'{inmobiliaria}'}</code> <code style={{background:'#fff',padding:'1px 4px',borderRadius:3}}>{'{n}'}</code> <code style={{background:'#fff',padding:'1px 4px',borderRadius:3}}>{'{dias}'}</code>
          </div>
          {[
            {k:'asignacion',  l:'Nuevo lead asignado'},
            {k:'firma',       l:'Avance a Firma Promesa / Escritura'},
            {k:'ocRecibida',  l:'OC recibida — listo para facturar'},
            {k:'brokerPagar', l:'Inmobiliaria pagó — broker debe facturar'},
            {k:'inactividad', l:'Recordatorio de inactividad'},
          ].map(({k,l})=>(
            <div key={k} style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <span style={{fontSize:12,fontWeight:700,color:B.primary}}>{l}</span>
                <button onClick={()=>previewTemplate(k)}
                  style={{fontSize:11,padding:'4px 12px',borderRadius:6,border:`1px solid ${B.primary}`,background:B.light,color:B.primary,cursor:'pointer',fontWeight:600}}>
                  👁 Vista previa
                </button>
              </div>
              <textarea value={iaConfig.plantillas[k]||''}
                onChange={e=>upd(['plantillas',k],e.target.value)}
                style={{...sty.inp,minHeight:64,resize:'vertical',fontSize:12}}/>
              {previewPlant?.key===k && (
                <div style={{marginTop:8,padding:'10px 14px',background:'#F0FDF4',border:'1px solid #86efac',borderRadius:8}}>
                  <div style={{fontSize:10,color:'#166534',fontWeight:600,marginBottom:4}}>📱 Vista previa (datos de ejemplo):</div>
                  <div style={{fontSize:12,color:'#0F172A',whiteSpace:'pre-wrap'}}>{previewPlant.filled}</div>
                </div>
              )}
            </div>
          ))}

          {/* Custom plantillas */}
          {(iaConfig.customEventos||[]).map(ev=>(
            <div key={ev.k} style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px',position:'relative'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                <span style={{fontSize:12,fontWeight:700,color:B.primary}}>{ev.l} <span style={{fontSize:10,color:'#9ca3af',fontWeight:400}}>(personalizado)</span></span>
              </div>
              <textarea value={iaConfig.plantillas[ev.k]||''}
                onChange={e=>upd(['plantillas',ev.k],e.target.value)}
                style={{...sty.inp,minHeight:60,resize:'vertical',fontSize:12}}/>
            </div>
          ))}

          {/* Crear nueva plantilla */}
          <div style={{background:'#f9fbff',border:'2px dashed #dce8ff',borderRadius:12,padding:'14px 16px'}}>
            <p style={{margin:'0 0 10px',fontSize:12,fontWeight:700,color:B.mid}}>➕ Nueva plantilla personalizada</p>
            <Fld label="Nombre">
              <input id="nueva_plant_nombre" style={sty.inp} placeholder="Ej: Bienvenida nueva campaña"/>
            </Fld>
            <div style={{marginTop:8}}>
              <Fld label="Texto del mensaje">
                <textarea id="nueva_plant_msg" style={{...sty.inp,minHeight:60,resize:'vertical'}} placeholder="Hola {broker}, ..."/>
              </Fld>
            </div>
            <button onClick={()=>{
              const nombre = document.getElementById('nueva_plant_nombre')?.value
              const msg = document.getElementById('nueva_plant_msg')?.value
              if (!nombre||!msg) return
              const key = 'custom_plant_'+Date.now()
              upd(['plantillas',key],msg)
              upd(['customEventos'],[...(iaConfig.customEventos||[]),{k:key,l:nombre,desc:'',tpl:key}])
              upd(['eventos',key],false)
              if (document.getElementById('nueva_plant_nombre')) document.getElementById('nueva_plant_nombre').value=''
              if (document.getElementById('nueva_plant_msg')) document.getElementById('nueva_plant_msg').value=''
            }} style={{...sty.btnP,marginTop:8,fontSize:12}}>Crear plantilla</button>
          </div>
        </div>
      )}

      {/* TAB: ENTRENAMIENTO */}
      {tab==='entrena' && (
        <div>
          <div style={{padding:'12px 14px',background:B.light,borderRadius:10,fontSize:12,color:B.primary,marginBottom:14}}>
            🧠 Entrena a la IA con preguntas frecuentes de tus brokers. Cuando alguien pregunte algo similar, la IA responderá con tu respuesta personalizada.
          </div>

          {/* Add new pair */}
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
            <p style={{margin:'0 0 10px',fontSize:13,fontWeight:700,color:B.primary}}>➕ Agregar nueva pregunta</p>
            <Fld label="Pregunta del broker"><input value={newPair.pregunta} onChange={e=>setNewPair(p=>({...p,pregunta:e.target.value}))} placeholder="Ej: ¿Cuándo me pagan mi comisión?" style={sty.inp}/></Fld>
            <div style={{marginTop:8}}>
              <Fld label="Respuesta de la IA">
                <textarea value={newPair.respuesta} onChange={e=>setNewPair(p=>({...p,respuesta:e.target.value}))}
                  placeholder="Ej: El pago se realiza 30 días después de emitir la factura..." style={{...sty.inp,minHeight:60,resize:'vertical'}}/>
              </Fld>
            </div>
            <button onClick={()=>{
              if (!newPair.pregunta||!newPair.respuesta) return
              upd(['entrenamiento'],[...iaConfig.entrenamiento,{...newPair}])
              setNewPair({pregunta:'',respuesta:''})
            }} style={{...sty.btnP,marginTop:8,fontSize:12}}>Guardar respuesta</button>
          </div>

          {/* Existing pairs */}
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {(iaConfig.entrenamiento||[]).map((par,idx)=>(
              <div key={idx} style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:10,padding:'12px 14px'}}>
                {editIdx===idx ? (
                  <div>
                    <Fld label="Pregunta"><input value={par.pregunta} onChange={e=>{ const t=[...iaConfig.entrenamiento]; t[idx]={...t[idx],pregunta:e.target.value}; upd(['entrenamiento'],t) }} style={sty.inp}/></Fld>
                    <div style={{marginTop:6}}>
                      <Fld label="Respuesta"><textarea value={par.respuesta} onChange={e=>{ const t=[...iaConfig.entrenamiento]; t[idx]={...t[idx],respuesta:e.target.value}; upd(['entrenamiento'],t) }} style={{...sty.inp,minHeight:60,resize:'vertical'}}/></Fld>
                    </div>
                    <button onClick={()=>setEditIdx(null)} style={{...sty.btnP,fontSize:11,marginTop:6}}>Guardar</button>
                  </div>
                ) : (
                  <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:700,color:'#0F172A',marginBottom:3}}>❓ {par.pregunta}</div>
                      <div style={{fontSize:12,color:'#6b7280'}}>💬 {par.respuesta}</div>
                    </div>
                    <div style={{display:'flex',gap:4,flexShrink:0}}>
                      <button onClick={()=>setEditIdx(idx)} style={{fontSize:11,padding:'3px 8px',borderRadius:5,border:'1px solid #E2E8F0',background:'#f9fbff',cursor:'pointer',color:B.primary}}>Editar</button>
                      <button onClick={()=>{ const t=[...iaConfig.entrenamiento]; t.splice(idx,1); upd(['entrenamiento'],t) }} style={{fontSize:11,padding:'3px 8px',borderRadius:5,border:'1px solid #fca5a5',background:'#FEF2F2',cursor:'pointer',color:'#991b1b'}}>Eliminar</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: MONITOR */}
      {tab==='monitor' && (
        <div>
          {/* Diagnóstico API */}
          <DiagnosticoRabito/>

          {/* Stats */}
          <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(auto-fill,minmax(160px,1fr))',gap:10,marginBottom:16}}>
            {[
              {l:'Leads en cierre',   v:closingLeads.length, bg:B.light,   col:B.primary},
              {l:'Leads inactivos',   v:inactive.length,      bg:'#FFF7ED', col:'#92400e'},
              {l:'Brokers activos',   v:agents.length,        bg:'#DCFCE7', col:'#14532d'},
              {l:'Entrenamiento',     v:(iaConfig.entrenamiento||[]).length+' pares', bg:'#F5F3FF', col:'#5b21b6'},
            ].map((k,i)=>(
              <div key={i} style={{background:k.bg,borderRadius:10,padding:'10px 14px',border:'1px solid '+k.col+'33'}}>
                <div style={{fontSize:11,color:k.col,fontWeight:600,marginBottom:4}}>{k.l}</div>
                <div style={{fontSize:isMobile?18:20,fontWeight:800,color:k.col}}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* ── Tester de embudo por etapas ── */}
          <RabitoStageTester iaConfig={iaConfig} sty={sty}/>

          {/* Inactive leads */}
          {inactive.length > 0 && (
            <div style={{background:'#FFF7ED',border:'1px solid #fdba74',borderRadius:12,padding:'14px 16px',marginBottom:14}}>
              <p style={{margin:'0 0 10px',fontSize:13,fontWeight:700,color:'#92400e'}}>⚠️ Leads inactivos (+{iaConfig.eventos.diasInactividad||7} días)</p>
              {inactive.slice(0,5).map(l=>{
                const ag = agents.find(u=>u.id===l.assigned_to)
                const dias = Math.floor((Date.now()-new Date(l.fecha).getTime())/86400000)
                return (
                  <div key={l.id} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #fcd34d',fontSize:12}}>
                    <span><strong>{l.nombre}</strong> → {ag?.name||'Sin asignar'}</span>
                    <span style={{color:'#9a3412',fontWeight:600}}>{dias}d</span>
                  </div>
                )
              })}
              {inactive.length>5&&<p style={{fontSize:11,color:'#9ca3af',margin:'6px 0 0'}}>...y {inactive.length-5} más</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ─── Rabito Chat Test ────────────────────────────────────────────────────────


function CerebroRabito({ supabase, dbReady, iaConfig, upd }) {
  const [docs, setDocs] = React.useState([])
  const [uploading, setUploading] = React.useState(false)
  const [msg, setMsg] = React.useState(null)
  const fileRef = React.useRef(null)
  const B = { primary:'#4F46E5', light:'#EEF2FF', mid:'#6b7280', border:'#E8EFFE' }

  React.useEffect(() => {
    try {
      const saved = Array.isArray(iaConfig?.cerebroDocs) ? iaConfig.cerebroDocs : []
      setDocs(saved)
    } catch(e) { setDocs([]) }
  }, [iaConfig?.cerebroDocs])

  const toBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

  const readFileText = async (file) => {
    const name = file.name.toLowerCase()
    if (name.endsWith('.pdf') || name.endsWith('.docx') || name.endsWith('.doc')) {
      const base64 = await toBase64(file)
      const isPdf = name.endsWith('.pdf')
      const mediaType = isPdf
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      // Extraer via servidor (evita CORS con Anthropic API)
      const r = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extract', file: base64, mediaType, fileName: file.name })
      })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data.error || 'Error extrayendo texto')
      return data.text || ''
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsText(file, 'UTF-8')
    })
  }

  const uploadFiles = async (files) => {
    if (!files || !files.length) return
    setUploading(true)
    setMsg(null)
    const newDocs = []
    for (const file of Array.from(files)) {
      try {
        setMsg({ type: 'info', text: `Leyendo ${file.name}...` })
        const text = await readFileText(file)
        const clean = text.replace(/[\x00-\x08\x0B\x0E-\x1F]/g, '').trim()
        if (clean.length < 10) { setMsg({ type: 'error', text: `${file.name}: vacío o no legible` }); continue }
        newDocs.push({
          id: 'doc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
          nombre: file.name,
          content: clean.slice(0, 15000),
          chars: clean.length,
          truncado: clean.length > 15000,
          fecha: new Date().toISOString()
        })
      } catch (e) {
        setMsg({ type: 'error', text: `Error con ${file.name}: ${e.message}` })
      }
    }
    if (newDocs.length) {
      const allDocs = [...docs, ...newDocs]
      setDocs(allDocs)
      const driveContent = {
        files: allDocs.map(d => ({ name: d.nombre, content: d.content })),
        synced_at: new Date().toISOString(),
        source: 'manual_upload'
      }
      try {
        if (dbReady && supabase) {
          await supabase.from('crm_settings').upsert({ key: 'drive_content', value: driveContent })
          if (upd) { upd(['cerebroDocs'], allDocs); upd(['driveConectado'], true) }
        }
        setMsg({ type: 'success', text: `✅ ${newDocs.length} documento(s) cargado(s). Rabito ya puede leerlos.` })
      } catch (e) {
        setMsg({ type: 'error', text: 'Error guardando: ' + e.message })
      }
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const deleteDoc = async (docId) => {
    const updated = docs.filter(d => d.id !== docId)
    setDocs(updated)
    const driveContent = {
      files: updated.map(d => ({ name: d.nombre, content: d.content })),
      synced_at: new Date().toISOString()
    }
    try {
      if (dbReady && supabase) {
        await supabase.from('crm_settings').upsert({ key: 'drive_content', value: driveContent })
        if (upd) { upd(['cerebroDocs'], updated); upd(['driveConectado'], updated.length > 0) }
      }
    } catch(e) {}
    setMsg({ type: 'success', text: 'Documento eliminado' })
  }

  const totalChars = docs.reduce((s, d) => s + (Number(d.chars) || d.content?.length || 0), 0)

  return (
    <div style={{display:'flex', flexDirection:'column', gap:16}}>
      <div style={{background:B.light, border:'1px solid '+B.border, borderRadius:12, padding:'16px'}}>
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:6}}>
          <span style={{fontSize:24}}>🧠</span>
          <div>
            <div style={{fontWeight:800, fontSize:15, color:B.primary}}>Cerebro de Rabito</div>
            <div style={{fontSize:12, color:B.mid}}>Sube documentos y Rabito los leerá en cada conversación</div>
          </div>
          {docs.length > 0 && (
            <span style={{marginLeft:'auto', fontSize:11, padding:'4px 12px', borderRadius:20, background:'#DCFCE7', color:'#14532d', fontWeight:700}}>
              ✅ {docs.length} doc(s) · {(totalChars/1000).toFixed(1)}k caracteres
            </span>
          )}
        </div>
        <div style={{fontSize:12, color:'#6b7280', padding:'8px 12px', background:'#fff', borderRadius:8, border:'1px solid #e5e7eb'}}>
          💡 Sube: personalidad, guión de ventas, proyectos, precios, preguntas frecuentes.<br/>
          Formatos: <strong>PDF, Word (.docx), TXT, MD, CSV</strong>
        </div>
      </div>

      <div
        onClick={() => fileRef.current && fileRef.current.click()}
        onDragOver={e => { e.preventDefault(); e.currentTarget.style.background='#EEF2FF' }}
        onDragLeave={e => { e.currentTarget.style.background='#f9fafb' }}
        onDrop={e => { e.preventDefault(); uploadFiles(e.dataTransfer.files); e.currentTarget.style.background='#f9fafb' }}
        style={{border:'2px dashed '+B.border, borderRadius:12, padding:'32px', textAlign:'center', cursor:'pointer', background:'#f9fafb', transition:'background .2s'}}
      >
        <div style={{fontSize:32, marginBottom:8}}>📂</div>
        <div style={{fontWeight:700, fontSize:14, color:B.primary, marginBottom:4}}>
          {uploading ? '⏳ Procesando...' : 'Haz clic o arrastra archivos aquí'}
        </div>
        <div style={{fontSize:12, color:B.mid}}>PDF, DOCX, TXT, MD, CSV</div>
        <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.doc,.txt,.md,.csv,.html"
          style={{display:'none'}}
          onChange={e => uploadFiles(e.target.files)}
        />
      </div>

      {msg && (
        <div style={{padding:'10px 14px', borderRadius:8, fontSize:13, fontWeight:600,
          background: msg.type==='error'?'#FEF2F2': msg.type==='info'?'#EEF2FF':'#DCFCE7',
          color: msg.type==='error'?'#991b1b': msg.type==='info'?'#1B4FC8':'#14532d'}}>
          {msg.text}
        </div>
      )}

      {docs.length > 0 && (
        <div style={{background:'#fff', border:'1px solid #E2E8F0', borderRadius:12, padding:'16px'}}>
          <div style={{fontWeight:700, fontSize:13, color:B.primary, marginBottom:12}}>
            📚 Documentos en el cerebro ({docs.length})
          </div>
          {docs.map(doc => (
            <div key={doc.id} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8, border:'1px solid #f0f4ff', marginBottom:6, background:'#f9fbff'}}>
              <span style={{fontSize:20}}>
                {doc.nombre?.endsWith('.pdf') ? '📕' : doc.nombre?.endsWith('.docx')||doc.nombre?.endsWith('.doc') ? '📘' : '📄'}
              </span>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontWeight:600, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{doc.nombre}</div>
                <div style={{fontSize:11, color:B.mid}}>
                  {((Number(doc.chars)||doc.content?.length||0)/1000).toFixed(1)}k caracteres
                  {doc.truncado && <span style={{color:'#f59e0b', fontWeight:600}}> · truncado a 15k</span>}
                  {' · '}{doc.fecha ? new Date(doc.fecha).toLocaleDateString('es-CL') : ''}
                </div>
              </div>
              <button onClick={() => deleteDoc(doc.id)}
                style={{padding:'4px 10px', borderRadius:6, border:'1px solid #fca5a5', background:'#FEF2F2', color:'#991b1b', cursor:'pointer', fontSize:11, fontWeight:600, flexShrink:0}}>
                🗑️
              </button>
            </div>
          ))}
        </div>
      )}

      {docs.length === 0 && !uploading && (
        <div style={{textAlign:'center', color:B.mid, fontSize:13, padding:'24px'}}>
          Sin documentos aún. Sube tus primeros archivos para que Rabito aprenda.
        </div>
      )}
    </div>
  )
}


// ─── Condiciones Comerciales View ────────────────────────────────────────────
function CondicionesComView({ condiciones=[], setCondiciones, supabase, dbReady, isAdmin, isOps }) {
  const B = {primary:'#1B4FC8',light:'#EEF2FF',mid:'#6b7280'}
  const sty = { inp:{padding:'7px 10px',borderRadius:8,border:'1px solid #E2E8F0',fontSize:13,width:'100%',boxSizing:'border-box'} }

  const canEdit = isAdmin || isOps

  const [mes, setMes]           = React.useState(new Date().toISOString().slice(0,7))
  const [uploading, setUploading] = React.useState(false)
  const [notif, setNotif]       = React.useState(null)
  const [search, setSearch]     = React.useState('')
  const [colFilters, setColFilters] = React.useState({})  // {col: value}
  const [page, setPage]         = React.useState(1)
  const [visible, setVisible]   = React.useState(true)    // admin toggle
  const [savingVis, setSavingVis] = React.useState(false)
  const fileRef = React.useRef()
  const PAGE_SIZE = 50

  const lista = Array.isArray(condiciones) ? condiciones : []
  const meses = [...new Set(lista.map(x=>x.mes))].sort().reverse()
  const actuales = lista.filter(x=>x.mes===mes)

  // Load visibility setting from Supabase on mount
  React.useEffect(() => {
    if (!dbReady || !supabase) return
    supabase.from('crm_settings').select('value').eq('key','condiciones_visible').single()
      .then(({data}) => { if (data?.value !== undefined) setVisible(data.value !== false) })
      .catch(()=>{})
  }, [dbReady])

  const toggleVisible = async () => {
    const next = !visible
    setVisible(next)
    setSavingVis(true)
    if (dbReady && supabase) await supabase.from('crm_settings').upsert({key:'condiciones_visible', value:next})
    setSavingVis(false)
  }

  const uploadExcel = async (file) => {
    if (!file) return
    setUploading(true); setNotif(null)
    try {
      if (!window.XLSX) {
        await new Promise((res,rej)=>{
          const s = document.createElement('script')
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
          s.onload = res; s.onerror = rej
          document.head.appendChild(s)
        })
      }
      const ab = await file.arrayBuffer()
      const wb = window.XLSX.read(ab, {type:'array'})
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = window.XLSX.utils.sheet_to_json(ws, {defval:''})
      if (!rows.length) { setNotif({ok:false,txt:'Archivo vacío'}); setUploading(false); return }
      const entry = {
        id: 'cc-'+Date.now(), mes, nombre: file.name,
        rows, columnas: Object.keys(rows[0]),
        fecha: new Date().toISOString()
      }
      const updated = [...lista.filter(x=>!(x.mes===mes&&x.nombre===file.name)), entry]
      setCondiciones(updated)
      if (dbReady && supabase) await supabase.from('crm_settings').upsert({key:'condiciones_comerciales',value:updated})
      setNotif({ok:true, txt:`✅ ${rows.length} filas cargadas para ${mes}`})
      setSearch(''); setColFilters({}); setPage(1)
    } catch(e) {
      setNotif({ok:false, txt:'Error: '+e.message})
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Si no está visible y no es admin/ops → pantalla de actualización
  if (!visible && !canEdit) {
    return (
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
        minHeight:340,textAlign:'center',padding:40}}>
        <div style={{fontSize:48,marginBottom:16}}>🔄</div>
        <div style={{fontSize:20,fontWeight:800,color:'#0F172A',marginBottom:8}}>
          Actualizando condiciones comerciales
        </div>
        <div style={{fontSize:14,color:'#64748B',maxWidth:340}}>
          Estamos actualizando las condiciones y proyectos disponibles. Vuelve a revisar en unos minutos.
        </div>
      </div>
    )
  }

  return (
    <div style={{maxWidth:1200}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,paddingBottom:12,
        borderBottom:'2px solid #E8EFFE',flexWrap:'wrap'}}>
        <span style={{fontSize:26}}>📋</span>
        <div style={{flex:1}}>
          <div style={{fontSize:16,fontWeight:800,color:B.primary}}>Condiciones Comerciales</div>
          <div style={{fontSize:12,color:B.mid}}>
            {actuales[0] ? `${(actuales[0].rows||[]).length} proyectos · mes ${mes}` : 'Sube el Excel con condiciones por mes'}
          </div>
        </div>

        {/* Toggle visibilidad — solo admin/ops */}
        {canEdit && (
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:12,color:B.mid,fontWeight:600}}>
              {visible ? '👁️ Visible para todos' : '🚫 Oculto para brokers'}
            </span>
            <button onClick={toggleVisible} disabled={savingVis}
              style={{width:44,height:24,borderRadius:99,border:'none',cursor:'pointer',
                background:visible?B.primary:'#e5e7eb',position:'relative',transition:'background .2s',
                flexShrink:0}}>
              <div style={{position:'absolute',top:2,left:visible?22:2,width:20,height:20,
                borderRadius:'50%',background:'#fff',transition:'left .2s',
                boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
            </button>
          </div>
        )}

        {/* Selector mes */}
        {meses.length > 0 && (
          <select value={mes} onChange={e=>{setMes(e.target.value);setSearch('');setColFilters({});setPage(1)}}
            style={{padding:'6px 10px',borderRadius:8,border:'1px solid #E2E8F0',fontSize:13}}>
            {meses.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <input type="month" value={mes} onChange={e=>{setMes(e.target.value);setPage(1)}}
          style={{padding:'6px 10px',borderRadius:8,border:'1px solid #E2E8F0',fontSize:13}}/>
      </div>

      {/* Upload — solo admin/ops */}
      {canEdit && (
        <div onClick={()=>fileRef.current?.click()} onDragOver={e=>e.preventDefault()}
          onDrop={e=>{e.preventDefault(); e.dataTransfer.files[0] && uploadExcel(e.dataTransfer.files[0])}}
          style={{background:B.light,border:'2px dashed #A8C0F0',borderRadius:12,padding:'20px',
            textAlign:'center',marginBottom:14,cursor:'pointer'}}>
          <div style={{fontSize:26,marginBottom:4}}>📊</div>
          <div style={{fontWeight:700,color:B.primary,marginBottom:2}}>
            {uploading ? '⏳ Procesando...' : 'Arrastra o haz clic para subir Excel'}
          </div>
          <div style={{fontSize:12,color:B.mid}}>
            Mes: <strong>{mes}</strong> · Formatos: .xlsx, .xls · Soporta 300+ filas
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}}
            onChange={e=>e.target.files[0] && uploadExcel(e.target.files[0])}/>
        </div>
      )}

      {notif && (
        <div style={{padding:'10px 14px',borderRadius:8,fontSize:13,fontWeight:600,marginBottom:12,
          background:notif.ok?'#DCFCE7':'#FEF2F2', color:notif.ok?'#14532d':'#991b1b'}}>
          {notif.txt}
          <button onClick={()=>setNotif(null)}
            style={{float:'right',background:'none',border:'none',cursor:'pointer',fontWeight:700}}>×</button>
        </div>
      )}

      {actuales.length === 0 ? (
        <div style={{textAlign:'center',color:B.mid,padding:'40px 20px',fontSize:13,
          background:'#fff',border:'1px solid #E2E8F0',borderRadius:12}}>
          {lista.length === 0
            ? 'Aún no hay condiciones cargadas. Sube un archivo Excel arriba.'
            : `Sin condiciones para ${mes}. Selecciona otro mes o sube un archivo.`}
        </div>
      ) : actuales.map(entry => {
        const cols = entry.columnas || []
        const rows = entry.rows || []

        // Aplicar filtros
        const filtered = rows.filter(row => {
          const matchSearch = !search || cols.some(c =>
            String(row[c]??'').toLowerCase().includes(search.toLowerCase())
          )
          const matchCols = Object.entries(colFilters).every(([c,v]) =>
            !v || String(row[c]??'').toLowerCase().includes(v.toLowerCase())
          )
          return matchSearch && matchCols
        })

        const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
        const pageRows   = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)
        const hasFilters = search || Object.values(colFilters).some(Boolean)

        return (
          <div key={entry.id} style={{background:'#fff',border:'1px solid #E2E8F0',
            borderRadius:12,marginBottom:16,overflow:'hidden'}}>

            {/* Entry header */}
            <div style={{padding:'12px 16px',background:B.light,display:'flex',
              alignItems:'center',gap:10,borderBottom:'1px solid #E2E8F0',flexWrap:'wrap'}}>
              <span style={{fontSize:18}}>📊</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:B.primary,fontSize:14}}>{entry.nombre}</div>
                <div style={{fontSize:11,color:B.mid}}>
                  Mes: <strong>{entry.mes}</strong> · {rows.length} proyectos · {new Date(entry.fecha).toLocaleDateString('es-CL')}
                  {hasFilters && <span style={{color:B.primary,fontWeight:700}}> · {filtered.length} resultados</span>}
                </div>
              </div>
              {canEdit && (
                <button onClick={async()=>{
                  const updated = lista.filter(x=>x.id!==entry.id)
                  setCondiciones(updated)
                  if (dbReady&&supabase) await supabase.from('crm_settings').upsert({key:'condiciones_comerciales',value:updated})
                }}
                  style={{fontSize:11,padding:'3px 10px',borderRadius:6,border:'1px solid #fca5a5',
                    background:'#FEF2F2',color:'#991b1b',cursor:'pointer',fontWeight:600}}>
                  🗑️ Eliminar
                </button>
              )}
            </div>

            {/* Barra de filtros */}
            <div style={{padding:'10px 14px',borderBottom:'1px solid #f0f4ff',
              background:'#FAFBFF',display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
              {/* Búsqueda global */}
              <div style={{position:'relative',flex:'0 0 220px'}}>
                <span style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',
                  fontSize:13,color:'#94a3b8'}}>🔍</span>
                <input
                  value={search}
                  onChange={e=>{setSearch(e.target.value);setPage(1)}}
                  placeholder="Buscar en todos los campos..."
                  style={{...sty.inp,paddingLeft:28,fontSize:12}}
                />
              </div>

              {/* Filtros por columna — solo las primeras 5 columnas más útiles */}
              {cols.slice(0,5).map(col=>(
                <div key={col} style={{flex:'0 0 150px'}}>
                  <input
                    value={colFilters[col]||''}
                    onChange={e=>{setColFilters(p=>({...p,[col]:e.target.value}));setPage(1)}}
                    placeholder={col.length>14?col.slice(0,14)+'…':col}
                    title={col}
                    style={{...sty.inp,fontSize:11,padding:'5px 8px'}}
                  />
                </div>
              ))}

              {/* Limpiar filtros */}
              {hasFilters && (
                <button onClick={()=>{setSearch('');setColFilters({});setPage(1)}}
                  style={{fontSize:11,padding:'5px 10px',borderRadius:8,border:'1px solid #E2E8F0',
                    background:'#fff',color:'#64748B',cursor:'pointer',fontWeight:600,flexShrink:0}}>
                  ✕ Limpiar
                </button>
              )}
            </div>

            {/* Tabla con columnas fijas */}
            {(()=>{
              // Las primeras 2 columnas quedan fijas al hacer scroll horizontal
              const FROZEN = 2
              // Ancho estimado por columna según contenido típico
              const colWidth = (col) => {
                const c = col.toLowerCase()
                if (c.includes('condicion') || c.includes('financiamiento') || c.includes('nota')) return 320
                if (c.includes('proyecto') || c.includes('nombre')) return 160
                if (c.includes('inmob') || c.includes('empresa')) return 120
                if (c.includes('comuna') || c.includes('ciudad') || c.includes('sector')) return 110
                if (c.includes('entrega') || c.includes('plazo') || c.includes('fecha')) return 130
                if (c.includes('precio') || c.includes('valor') || c.includes('uf') || c.includes('monto')) return 100
                if (c.includes('comision') || c.includes('%')) return 90
                return 110
              }
              // Calcular offsets para columnas fijas
              const frozenOffsets = cols.slice(0, FROZEN).reduce((acc, col, i) => {
                acc.push(i === 0 ? 0 : acc[i-1] + colWidth(cols[i-1]))
                return acc
              }, [])

              return (
                <div style={{overflowX:'auto', maxHeight:'65vh', overflowY:'auto',
                  borderTop:'1px solid #E2E8F0'}}>
                  <table style={{borderCollapse:'collapse', fontSize:12, tableLayout:'fixed',
                    width: cols.reduce((s,c)=>s+colWidth(c),0)+'px'}}>
                    <colgroup>
                      {cols.map(col=><col key={col} style={{width:colWidth(col)+'px'}}/>)}
                    </colgroup>
                    <thead>
                      <tr style={{background:'#F0F4FF'}}>
                        {cols.map((col,ci)=>{
                          const frozen = ci < FROZEN
                          return (
                            <th key={col} style={{
                              padding:'8px 10px', textAlign:'left', fontWeight:700,
                              color:'#1B4FC8', fontSize:11, whiteSpace:'nowrap',
                              borderBottom:'2px solid #dce8ff',
                              borderRight: frozen && ci === FROZEN-1 ? '2px solid #A8C0F0' : '1px solid #E2E8F0',
                              position: frozen ? 'sticky' : 'static',
                              left: frozen ? frozenOffsets[ci]+'px' : 'auto',
                              zIndex: frozen ? 3 : 1,
                              background: frozen ? '#E8EFFE' : '#F0F4FF',
                              boxShadow: frozen && ci === FROZEN-1 ? '3px 0 6px rgba(27,79,200,0.1)' : 'none',
                            }}>
                              {col}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.length === 0 ? (
                        <tr>
                          <td colSpan={cols.length} style={{padding:32,textAlign:'center',
                            color:'#94a3b8',fontSize:13}}>
                            Sin resultados para los filtros aplicados
                          </td>
                        </tr>
                      ) : pageRows.map((row,ri)=>(
                        <tr key={ri} style={{borderBottom:'1px solid #f0f4ff',
                          background:ri%2===0?'#fff':'#fafbff'}}>
                          {cols.map((col,ci)=>{
                            const val   = String(row[col]??'')
                            const frozen = ci < FROZEN
                            const wide  = colWidth(col) >= 200
                            // Resaltar búsqueda
                            let content
                            if (search && val.toLowerCase().includes(search.toLowerCase())) {
                              const idx = val.toLowerCase().indexOf(search.toLowerCase())
                              content = (
                                <span title={val}>
                                  {val.slice(0,idx)}
                                  <mark style={{background:'#fef08a',borderRadius:2,padding:0}}>
                                    {val.slice(idx,idx+search.length)}
                                  </mark>
                                  {val.slice(idx+search.length)}
                                </span>
                              )
                            } else {
                              content = <span title={val}>{val}</span>
                            }
                            return (
                              <td key={col} style={{
                                padding:'6px 10px', color:'#0F172A',
                                maxWidth: colWidth(col)+'px',
                                overflow:'hidden', textOverflow:'ellipsis',
                                whiteSpace: wide ? 'normal' : 'nowrap',
                                lineHeight: wide ? 1.4 : 'inherit',
                                borderRight: frozen && ci === FROZEN-1 ? '2px solid #A8C0F0' : '1px solid #f0f4ff',
                                position: frozen ? 'sticky' : 'static',
                                left: frozen ? frozenOffsets[ci]+'px' : 'auto',
                                zIndex: frozen ? 2 : 'auto',
                                background: frozen
                                  ? (ri%2===0 ? '#F5F8FF' : '#EEF3FF')
                                  : (ri%2===0 ? '#fff' : '#fafbff'),
                                boxShadow: frozen && ci === FROZEN-1 ? '3px 0 6px rgba(27,79,200,0.07)' : 'none',
                                fontWeight: frozen ? 600 : 400,
                              }}>
                                {content}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}

            {/* Paginación */}
            {totalPages > 1 && (
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
                padding:'10px 16px',borderTop:'1px solid #f0f4ff',background:'#FAFBFF',flexWrap:'wrap',gap:8}}>
                <span style={{fontSize:12,color:B.mid}}>
                  Mostrando {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,filtered.length)} de {filtered.length}
                </span>
                <div style={{display:'flex',gap:4}}>
                  <button onClick={()=>setPage(1)} disabled={page===1}
                    style={{padding:'3px 8px',borderRadius:6,border:'1px solid #E2E8F0',fontSize:12,
                      background:page===1?'#f9f9f9':'#fff',cursor:page===1?'default':'pointer',color:'#475569'}}>
                    «
                  </button>
                  <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
                    style={{padding:'3px 8px',borderRadius:6,border:'1px solid #E2E8F0',fontSize:12,
                      background:page===1?'#f9f9f9':'#fff',cursor:page===1?'default':'pointer',color:'#475569'}}>
                    ‹
                  </button>
                  {Array.from({length:Math.min(5,totalPages)},(_,i)=>{
                    let p = page <= 3 ? i+1 : page >= totalPages-2 ? totalPages-4+i : page-2+i
                    if (p<1||p>totalPages) return null
                    return (
                      <button key={p} onClick={()=>setPage(p)}
                        style={{padding:'3px 9px',borderRadius:6,fontSize:12,fontWeight:page===p?700:400,
                          border:`1px solid ${page===p?B.primary:'#E2E8F0'}`,
                          background:page===p?B.primary:'#fff',
                          color:page===p?'#fff':'#475569',cursor:'pointer'}}>
                        {p}
                      </button>
                    )
                  })}
                  <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
                    style={{padding:'3px 8px',borderRadius:6,border:'1px solid #E2E8F0',fontSize:12,
                      background:page===totalPages?'#f9f9f9':'#fff',cursor:page===totalPages?'default':'pointer',color:'#475569'}}>
                    ›
                  </button>
                  <button onClick={()=>setPage(totalPages)} disabled={page===totalPages}
                    style={{padding:'3px 8px',borderRadius:6,border:'1px solid #E2E8F0',fontSize:12,
                      background:page===totalPages?'#f9f9f9':'#fff',cursor:page===totalPages?'default':'pointer',color:'#475569'}}>
                    »
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}


function TeamDashboardView({ me, leads, users, stages, isAdmin, setSel, setModal }) {
  const B = { primary:'#1B4FC8', light:'#EEF2FF', mid:'#6b7280' }
  const [selBroker, setSelBroker] = React.useState(null)
  const myTeam = (users||[]).filter(u => u.team_leader_id===me.id)
  const RANK_STAGES = ['firma','escritura','ganado']
  const ranked = myTeam.map(ag=>{
    const agl = (leads||[]).filter(l=>l.assigned_to===ag.id)
    const ufTotal = agl.filter(l=>RANK_STAGES.includes(l.stage))
      .reduce((s,l)=>s+(l.propiedades||[]).filter(p=>p.moneda==='UF')
      .reduce((ss,p)=>ss+(parseFloat(p.bono_pie?p.precio_sin_bono:p.precio)||0),0),0)
    return { ag, ufTotal, activos:agl.filter(l=>!['perdido','ganado'].includes(l.stage)).length, total:agl.length }
  }).sort((a,b)=>b.ufTotal-a.ufTotal)
  const medals = {0:'🥇',1:'🥈',2:'🥉'}
  const brokerLeads = selBroker ? (leads||[]).filter(l=>l.assigned_to===selBroker) : []

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,paddingBottom:12,borderBottom:'2px solid #dce8ff'}}>
        <span style={{fontSize:26}}>👥</span>
        <div style={{flex:1}}>
          <div style={{fontSize:16,fontWeight:800,color:B.primary}}>Mi Equipo</div>
          <div style={{fontSize:12,color:B.mid}}>{myTeam.length} broker(s) bajo tu supervisión · ranking de tu equipo</div>
        </div>
      </div>
      {myTeam.length===0 && (
        <div style={{textAlign:'center',color:B.mid,padding:'40px 20px',background:'#fff',borderRadius:12,border:'1px solid #E2E8F0',fontSize:13}}>
          No tienes brokers asignados aún. El administrador debe asignarte brokers desde Usuarios.
        </div>
      )}
      <div style={{display:'grid',gap:8}}>
        {ranked.map(({ag,ufTotal,activos,total},i)=>(
          <div key={ag.id}
            onClick={()=>setSelBroker(selBroker===ag.id?null:ag.id)}
            style={{background:selBroker===ag.id?B.light:'#fff',
              border:'1px solid '+(selBroker===ag.id?B.primary:'#E2E8F0'),
              borderRadius:12,padding:'12px 16px',cursor:'pointer'}}>
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <span style={{fontSize:22,minWidth:32,textAlign:'center'}}>{medals[i]||'🏅'}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:'#0F172A'}}>{ag.name}</div>
                <div style={{fontSize:11,color:B.mid}}>{activos} activos · {total} totales</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:18,fontWeight:900,color:B.primary}}>
                  UF {ufTotal.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2})}
                </div>
                <div style={{fontSize:10,color:B.mid}}>en cierre/ganado</div>
              </div>
            </div>
            {selBroker===ag.id && (
              <div style={{marginTop:10,borderTop:'1px solid #dce8ff',paddingTop:8}}>
                <div style={{fontSize:12,fontWeight:700,color:B.primary,marginBottom:6}}>
                  Leads de {ag.name}
                </div>
                {brokerLeads.length===0 && <div style={{fontSize:12,color:B.mid}}>Sin leads asignados.</div>}
                {brokerLeads.slice(0,12).map(l=>{
                  const st=(stages||[]).find(s=>s.id===l.stage)||{label:l.stage,bg:'#f0f4ff',col:B.primary}
                  return (
                    <div key={l.id}
                      style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:8,marginBottom:3,background:'#f9fbff',cursor:'pointer'}}
                      onClick={e=>{e.stopPropagation();setSel(l);setModal('lead')}}>
                      <span style={{fontSize:10,padding:'2px 6px',borderRadius:99,background:st.bg,color:st.col,fontWeight:600,whiteSpace:'nowrap'}}>{st.label}</span>
                      <span style={{flex:1,fontSize:12,fontWeight:500,color:'#0F172A'}}>{l.nombre}</span>
                      <span style={{fontSize:11,color:B.mid}}>{l.telefono}</span>
                    </div>
                  )
                })}
                {brokerLeads.length>12 && <div style={{fontSize:11,color:B.mid,textAlign:'center',marginTop:4}}>+{brokerLeads.length-12} más</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}


function ConversacionesView({conversations, convMessages, activeConv, setActiveConv, loadConvMessages, upsertConversation, saveConvMessage, iaConfig, setIaConfig, users, leads, setLeads, supabase, dbReady, me, setConversations, deleteConversation}) {
  const [winWidth, setWinWidth] = React.useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  React.useEffect(() => {
    const handle = () => setWinWidth(window.innerWidth)
    window.addEventListener('resize', handle)
    return () => window.removeEventListener('resize', handle)
  }, [])
  const isMobile = winWidth < 480   // solo teléfonos ocultan el panel izquierdo
  const isNarrow = winWidth < 768   // tablets usan panel izquierdo más angosto
  const [tab, setTab] = useState('bandeja')       // bandeja | masivo
  const [newMsg, setNewMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [newConvPhone, setNewConvPhone] = useState('')
  const [newConvName, setNewConvName] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterMode, setFilterMode] = useState('all') // all | ia | humano
  const [search, setSearch] = useState('')
  const [selectedConvs, setSelectedConvs] = useState([])
  const [masivo, setMasivo] = useState({msg:'', plantilla:'asignacion'})
  const [masivoSending, setMasivoSending] = useState(false)
  const [masivoResult, setMasivoResult] = useState(null)
  const [trainModal, setTrainModal] = useState(null) // {original, corrected, razon, msgIdx}
  const [masivoTarget, setMasivoTarget] = useState('leads')
  const [selectedUsers, setSelectedUsers] = useState([])

  const sendMasivoEquipo = async () => {
    if (!masivo.msg.trim() || selectedUsers.length===0) return
    const teamUsers = (users||[]).filter(u=>u.role!=='partner')
    const withPhone = selectedUsers.map(id=>teamUsers.find(u=>u.id===id)).filter(u=>u?.phone)
    const noPhone   = selectedUsers.map(id=>teamUsers.find(u=>u.id===id)).filter(u=>!u?.phone)
    if (withPhone.length===0) {
      alert('Ningún usuario seleccionado tiene número de WhatsApp. Agrégalo en Usuarios → editar.')
      return
    }
    const META_CONFIGURED = !!(iaConfig?.metaToken && iaConfig?.metaPhoneId)
    if (META_CONFIGURED) {
      setMasivoSending(true)
      let sent=0, failed=0
      for (const u of withPhone) {
        try {
          await fetch('/api/whatsapp', {method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({to:u.phone, mensaje:masivo.msg.replace('{nombre}',u.name||'')})})
          sent++
        } catch(_) { failed++ }
      }
      setMasivoResult({sent, failed:failed+noPhone.length})
      setMasivoSending(false)
    } else {
      withPhone.forEach((u,i) => {
        const msg = encodeURIComponent(masivo.msg.replace('{nombre}',u.name||''))
        const phone = u.phone.replace(/[^0-9]/g,'')
        setTimeout(()=>window.open('https://wa.me/'+phone+'?text='+msg,'_blank'), i*800)
      })
      setMasivoResult({sent:withPhone.length, failed:noPhone.length, waLinks:true})
    }
    setSelectedUsers([])
  }
  const messagesEndRef = useRef(null)
  const agents = (users||[]).filter(u=>u.role==='agent')

  // Une conversaciones duplicadas por el mismo teléfono.
  // Evolution puede enviar eventos paralelos del mismo número; sin esto el CRM muestra 2 filas
  // y al abrir una de ellas puede parecer "sin mensajes".
  const phoneKey = (value='') => String(value || '').replace(/[^0-9]/g, '')
  const mergeConversationsByPhone = (items=[]) => {
    const groups = new Map()
    for (const c of items || []) {
      const key = phoneKey(c.telefono) || String(c.id || '')
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(c)
    }
    return Array.from(groups.values()).map(group => {
      const sorted = [...group].sort((a,b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
      const withRealLast = sorted.find(c => cleanVisibleLastMessage(c.last_message) && c.last_message !== '[mensaje]' && c.last_message !== '[mensaje multimedia]')
      const base = withRealLast || sorted[0]
      const mergedIds = sorted.map(c => c.id).filter(Boolean)
      return {
        ...base,
        _mergedIds: mergedIds,
        _duplicateCount: mergedIds.length,
        nombre: base.nombre || sorted.find(c => c.nombre)?.nombre || base.telefono,
        last_message: cleanVisibleLastMessage(base.last_message) || cleanVisibleLastMessage(sorted.find(c => cleanVisibleLastMessage(c.last_message))?.last_message) || ''
      }
    }).sort((a,b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
  }

  // Load messages when conversation selected
  useEffect(() => {
    if (activeConv) loadConvMessages(activeConv.id)
  }, [activeConv])

  // Auto-seleccionar la primera conversación al entrar a la bandeja
  useEffect(() => {
    if (!activeConv && conversations.length > 0 && tab === 'bandeja') {
      const first = conversations[0]
      setActiveConv(first)
    }
  }, [conversations, tab])

  // Polling automático cada 5 segundos para nuevas conversaciones y mensajes
  useEffect(() => {
    if (!supabase || !dbReady) return
    const interval = setInterval(async () => {
      try {
        const { data: convs } = await supabase
          .from('crm_conversations')
          .select('*')
          .order('updated_at', {ascending: false})
          .limit(200)
        if (convs) setConversations(mergeConversationsByPhone(convs))
        // Si hay conversación activa, recargar sus mensajes también
        if (activeConv) loadConvMessages(activeConv.id)
      } catch(_) {}
    }, 5000)
    return () => clearInterval(interval)
  }, [supabase, dbReady, activeConv])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({behavior:'smooth'})
  }, [convMessages, activeConv])

  const msgs = activeConv ? (convMessages[activeConv.id]||[])
    .map(m => ({...m, content: extractVisibleMessageContent(m.content)}))
    .filter(m => !m.internal && m.content && !isInternalSystemContent(m.content)) : []

  const filtered = conversations.filter(c => {
    if (filterStatus!=='all' && c.status!==filterStatus) return false
    if (filterMode==='ia' && c.mode!=='ia') return false
    if (filterMode==='humano' && c.mode!=='humano') return false
    if (search && !c.nombre?.toLowerCase().includes(search.toLowerCase()) && !c.telefono?.includes(search)) return false
    return true
  })

  const updateConversationStatus = async (conv, status) => {
    if (!conv) return
    const now = new Date().toISOString()
    const ids = Array.from(new Set([conv.id, ...((conv && conv._mergedIds) || [])].filter(Boolean)))
    const update = { status, updated_at: now }

    // Actualización optimista: el estado cambia al tiro en pantalla.
    setConversations(prev => prev.map(c => ids.includes(c.id) || c.id === conv.id ? { ...c, ...update } : c))
    setActiveConv(prev => prev && (ids.includes(prev.id) || prev.id === conv.id) ? { ...prev, ...update } : prev)

    if (!dbReady) return
    try {
      const { error } = ids.length > 1
        ? await supabase.from('crm_conversations').update(update).in('id', ids)
        : await supabase.from('crm_conversations').update(update).eq('id', conv.id)
      if (error) throw error
    } catch(e) {
      console.warn('Status save failed:', e.message || e)
      alert('No se pudo guardar el estado. Revisa Supabase.')
    }
  }

  const toggleMode = async conv => {
    const newMode = conv.mode==='ia' ? 'humano' : 'ia'
    await upsertConversation({...conv, mode:newMode, updated_at:new Date().toISOString()})
    if (newMode==='humano') {
      // Send email notification
      try {
        await fetch('/api/notify', {method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({type:'escalation', to: me.email||'luis.conejeros@rabbittscapital.com',
            lead:{nombre:conv.nombre, telefono:conv.telefono, renta:conv.renta||'No indicada', notes: conv.notes||''}})})
      } catch(_) {}
    }
    if (activeConv?.id===conv.id) setActiveConv({...conv, mode:newMode})
  }

  const sendMessage = async () => {
    if (!newMsg.trim()||!activeConv||sending) return
    setSending(true)
    const msgText = newMsg.trim()
    const msg = {role:'assistant', content:msgText, created_at:new Date().toISOString(), manual:true}

    // 1. Guardar en Supabase
    await saveConvMessage(activeConv.id, msg)
    await upsertConversation({...activeConv, last_message:msgText, updated_at:new Date().toISOString()})

    // 2. Enviar por WhatsApp via Evolution API
    try {
      const EVO_URL = 'https://wa.rabbittscapital.com'
      const EVO_KEY = 'rabbitts2024'
      // Obtener instanceName: del conv o del primer número conectado
      let instance = activeConv.instanceName
      if (!instance) {
        const { data: numData } = await supabase.from('crm_settings').select('value').eq('key','wa_numeros').single()
        const nums = numData?.value || []
        instance = nums.find(n=>n.status==='open')?.instanceName || nums[0]?.instanceName
      }
      if (instance) {
        const phone = activeConv.telefono?.replace(/[^0-9]/g,'') || ''
        const r = await fetch(`${EVO_URL}/message/sendText/${instance}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
          body: JSON.stringify({ number: phone, text: msgText, delay: 300 })
        })
        console.log('[CRM sendWA]', r.status, instance, phone)
      } else {
        console.warn('[CRM sendWA] No hay instancia conectada')
      }
    } catch(e) { console.error('[CRM sendWA] error:', e.message) }

    setNewMsg('')
    setSending(false)
  }

  const savePersistentTraining = async (learningItem) => {
    if (!learningItem) return null
    const now = new Date().toISOString()
    const normalizedItem = {
      id: learningItem.id || ('train-' + Date.now()),
      type: learningItem.type || 'correccion',
      source: learningItem.source || 'feedback_modal',
      active: learningItem.active !== false,
      created_at: learningItem.created_at || now,
      updated_at: now,
      original: learningItem.original || '',
      improved: learningItem.improved || '',
      reason: learningItem.reason || '',
      context: learningItem.context || '',
      conversation_id: learningItem.conversation_id || '',
      message_index: learningItem.message_index ?? null
    }

    try {
      const local = JSON.parse(localStorage.getItem('rabito_agent_training') || '[]')
      localStorage.setItem('rabito_agent_training', JSON.stringify([normalizedItem, ...local].slice(0, 200)))
    } catch (_) {}

    if (!dbReady || !supabase) return normalizedItem

    try {
      const { data } = await supabase.from('crm_settings').select('value').eq('key','agent_training').single()
      const prevItems = Array.isArray(data?.value?.items) ? data.value.items : []
      const nextItems = [normalizedItem, ...prevItems.filter(x => x.id !== normalizedItem.id)].slice(0, 300)
      const value = {
        version: 2,
        source: 'crm_feedback_training',
        updated_at: now,
        items: nextItems
      }
      await supabase.from('crm_settings').upsert({ key:'agent_training', value })
      window.dispatchEvent(new CustomEvent('rabito-training-updated', { detail: value }))
      return normalizedItem
    } catch (e) {
      console.warn('agent_training save failed:', e)
      return normalizedItem
    }
  }

  const sendFeedback = async (msgIdx, feedback, correction='', razon='') => {
    if (!activeConv) return
    const msgs = convMessages[activeConv.id]||[]
    const msg = msgs[msgIdx]
    if (!msg) return

    const prevUser = [...msgs].slice(0, msgIdx).reverse().find(m=>m.role==='user')
    const pregunta = prevUser ? prevUser.content : msg.content
    const now = new Date().toISOString()
    const cleanCorrection = String(correction || '').trim()
    const cleanReason = String(razon || '').trim()

    try {
      if (dbReady && supabase) {
        await supabase.from('crm_conv_feedback').insert({
          conv_id: activeConv.id,
          msg_idx: msgIdx,
          msg_content: msg.content,
          feedback,
          correction: cleanCorrection,
          created_at: now
        })
      }

      if (feedback==='correccion' && (cleanCorrection || cleanReason)) {
        const learningItem = {
          id: 'train-' + Date.now(),
          type: 'correccion_respuesta',
          source: 'feedback_modal',
          active: true,
          created_at: now,
          original: msg.content,
          improved: cleanCorrection || msg.content,
          reason: cleanReason,
          context: pregunta,
          conversation_id: activeConv.id,
          message_index: msgIdx
        }

        await savePersistentTraining(learningItem)

        const nuevoPar = {
          pregunta,
          respuesta: cleanCorrection || msg.content,
          razon: cleanReason,
          fecha: now,
          fuente: 'feedback'
        }
        setIaConfig(prev => ({
          ...prev,
          entrenamiento: [nuevoPar, ...(Array.isArray(prev.entrenamiento) ? prev.entrenamiento : [])].slice(0, 120)
        }))

        alert('✅ Entrenamiento permanente guardado. Lo verás en Panel IA → Reglas → Aprendizajes desde feedback, y Rabito lo leerá antes de responder.')
      }
    } catch(e) {
      console.warn('feedback error', e)
      alert('No pude guardar el entrenamiento. Revisa Supabase o la consola del navegador.')
    }
  }

  const createLead = async () => {
    if (!activeConv) return
    if (activeConv.lead_id) { alert('Este contacto ya tiene un lead en el Kanban'); return }
    if (!dbReady) { alert('Base de datos no disponible'); return }
    const now = new Date().toISOString()
    const newLead = {
      id: 'l-'+Date.now(),
      fecha: now,
      stage_moved_at: now,
      stage: 'nuevo',
      assigned_to: null,
      nombre: activeConv.nombre || 'Lead WhatsApp',
      telefono: activeConv.telefono || '—',
      email: activeConv.email || '—',
      renta: activeConv.renta || '—',
      calificacion: '—',
      resumen: `Lead desde WhatsApp.${activeConv.renta?' Renta: '+activeConv.renta:''}.${activeConv.modelo?' Modelo: '+activeConv.modelo:''}`,
      tag: 'lead',
      origen: 'whatsapp',
      creado_por: me?.id || 'sistema',
      comments: [],
      stage_history: [{stage:'nuevo', date:now}]
    }
    try {
      const { error } = await supabase.from('crm_leads').upsert(newLead)
      if (error) { console.error('createLead:', error); alert('Error: ' + error.message); return }
      setLeads(prev => [newLead, ...prev])
      const updConv = {...activeConv, lead_id: newLead.id, status: 'calificado', updated_at: now}
      await upsertConversation(updConv)
      setActiveConv(updConv)
      alert('✅ Lead creado en el Kanban')
    } catch(e) { alert('Error: ' + e.message) }
  }

  const sendMasivo = async () => {
    if (!masivo.msg.trim()||selectedConvs.length===0) return
    setMasivoSending(true)
    let sent=0, failed=0
    const EVO_URL = 'https://wa.rabbittscapital.com'
    const EVO_KEY = 'rabbitts2024'
    // Obtener instancia activa
    let instance = null
    try {
      const { data: numData } = await supabase.from('crm_settings').select('value').eq('key','wa_numeros').single()
      const nums = numData?.value || []
      instance = nums.find(n=>n.activo)?.instanceName || nums[0]?.instanceName
    } catch(_) {}

    for (const convId of selectedConvs) {
      const conv = conversations.find(c=>c.id===convId)
      if (!conv) continue
      try {
        // 1. Guardar en Supabase
        const msg = {role:'assistant',content:masivo.msg,created_at:new Date().toISOString(),manual:true,masivo:true}
        await saveConvMessage(convId, msg)
        await upsertConversation({...conv,last_message:masivo.msg,updated_at:new Date().toISOString()})
        // 2. Enviar por WhatsApp
        if (instance && conv.telefono) {
          const phone = conv.telefono.replace(/[^0-9]/g,'')
          const r = await fetch(`${EVO_URL}/message/sendText/${instance}`, {
            method:'POST',
            headers:{'Content-Type':'application/json','apikey':EVO_KEY},
            body:JSON.stringify({number:phone, text:masivo.msg, delay:1500})
          })
          if (r.ok) sent++; else failed++
        } else { sent++ }
        await new Promise(r=>setTimeout(r,500)) // espera entre envíos
      } catch(_) { failed++ }
    }
    setMasivoResult({sent, failed})
    setMasivoSending(false)
    setSelectedConvs([])
  }

  const newConversation = async () => {
    if (!newConvPhone.trim()) return
    const conv = {
      id: 'conv-'+Date.now(), telefono: newConvPhone.trim(),
      nombre: newConvName||newConvPhone, mode:'ia', status:'activo',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      last_message: '', lead_id: null
    }
    const saved = await upsertConversation(conv)
    setActiveConv(saved||conv)
    setNewConvPhone(''); setNewConvName(''); setTab('bandeja')
  }

  const statusColor = s => s==='calificado'?['#DCFCE7','#14532d']:s==='no_interesado'?['#FEF2F2','#991b1b']:['#FFF7ED','#92400e']

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,paddingBottom:12,borderBottom:'2px solid #E8EFFE',flexWrap:'wrap'}}>
        <div style={{fontSize:28}}>💬</div>
        <div style={{flex:1}}>
          <div style={{fontSize:isMobile?15:16,fontWeight:800,color:B.primary}}>Conversaciones WhatsApp</div>
          <div style={{fontSize:12,color:B.mid}}>{conversations.length} conversaciones · {conversations.filter(c=>c.mode==='humano').length} en modo humano</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setTab('bandeja')} style={{fontSize:12,padding:'6px 14px',borderRadius:8,border:'none',cursor:'pointer',fontWeight:600,background:tab==='bandeja'?B.primary:'#f0f4ff',color:tab==='bandeja'?'#fff':B.primary}}>📋 Bandeja</button>
          <button onClick={()=>setTab('masivo')} style={{fontSize:12,padding:'6px 14px',borderRadius:8,border:'none',cursor:'pointer',fontWeight:600,background:tab==='masivo'?B.primary:'#f0f4ff',color:tab==='masivo'?'#fff':B.primary}}>📣 Mensaje masivo</button>
          <button onClick={()=>setTab('nuevo')} style={{fontSize:12,padding:'6px 14px',borderRadius:8,border:'none',cursor:'pointer',fontWeight:600,background:tab==='nuevo'?B.primary:'#f0f4ff',color:tab==='nuevo'?'#fff':B.primary}}>➕ Nueva</button>
        </div>
      </div>

      {/* TAB: BANDEJA */}
      {tab==='bandeja' && (
        <div style={{display:'flex',height:'calc(100vh - 185px)',border:'1px solid #E2E8F0',borderRadius:12,overflow:'hidden'}}>

          {/* ── LEFT PANEL: lista de conversaciones ─── */}
          <div style={{
            width: isMobile && activeConv ? 0 : (isNarrow ? 240 : 320),
            minWidth: isMobile && activeConv ? 0 : (isNarrow ? 240 : 320),
            maxWidth: isMobile && activeConv ? 0 : (isNarrow ? 240 : 320),
            overflow:'hidden',
            display:'flex', flexDirection:'column',
            borderRight:'1px solid #dce8ff',
            background:'#fff',
            transition:'width .2s, min-width .2s'
          }}>
            {/* Filters — fixed */}
            <div style={{flexShrink:0,padding:'10px 12px',borderBottom:'1px solid #f0f4ff',display:'flex',flexDirection:'column',gap:6}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nombre o teléfono..."
                style={{...sty.inp,fontSize:12}}/>
              <div style={{display:'flex',gap:4}}>
                {['all','ia','humano'].map(m=>(
                  <button key={m} onClick={()=>setFilterMode(m)}
                    style={{flex:1,fontSize:10,padding:'3px 0',borderRadius:6,border:'none',cursor:'pointer',fontWeight:600,
                      background:filterMode===m?B.primary:'#f0f4ff',color:filterMode===m?'#fff':B.mid}}>
                    {m==='all'?'Todos':m==='ia'?'🤖 IA':'👤 Humano'}
                  </button>
                ))}
              </div>
            </div>
            {/* List — scrollable */}
            <div style={{flex:1,overflowY:'auto',minHeight:0}}>
              {filtered.length===0 && <div style={{padding:'24px',textAlign:'center',color:'#9ca3af',fontSize:12}}>Sin conversaciones{search?' con ese filtro':' aún'}</div>}
              {filtered.map(conv=>{
                const isActive = activeConv?.id===conv.id
                const [sBg,sCol] = statusColor(conv.status)
                return (
                  <div key={conv.id} onClick={()=>setActiveConv(conv)}
                    style={{padding:'10px 14px',borderBottom:'1px solid #f0f4ff',cursor:'pointer',background:isActive?B.light:'#fff',transition:'background .15s'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:3}}>
                      <div style={{fontWeight:600,fontSize:13,color:'#0F172A',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'60%'}}>{conv.nombre||conv.telefono}{conv._duplicateCount>1 ? ` · ${conv._duplicateCount} registros unidos` : ''}</div>
                      <div style={{display:'flex',gap:4,alignItems:'center',flexShrink:0}}>
                        <span style={{fontSize:9,padding:'1px 5px',borderRadius:99,background:conv.mode==='ia'?'#E8EFFE':'#FEF9C3',color:conv.mode==='ia'?B.primary:'#713f12',fontWeight:700}}>
                          {conv.mode==='ia'?'🤖':'👤'}
                        </span>
                        {conv.status&&conv.status!=='activo'&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:99,background:sBg,color:sCol,fontWeight:700}}>{conv.status}</span>}
                      </div>
                    </div>
                    <div style={{fontSize:11,color:'#6b7280',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cleanVisibleLastMessage(conv.last_message)||'Sin mensajes'}</div>
                    <div style={{fontSize:10,color:'#9ca3af',marginTop:2}}><WaLink phone={conv.telefono}/>{conv.updated_at?' · '+new Date(conv.updated_at).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}):''}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── RIGHT PANEL: detalle conversación ─── */}
          <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>
          {activeConv ? (
            <div style={{display:'flex',flexDirection:'column',height:'100%',background:'#f9fbff'}}>
              {/* Header */}
              <div style={{flexShrink:0,padding:'10px 16px',borderBottom:'1px solid #dce8ff',background:'#fff',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                {isMobile && <button onClick={()=>setActiveConv(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'#6366f1',padding:'0 4px'}}>←</button>}
                <AV name={activeConv.nombre||activeConv.telefono} size={36}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14,color:'#0F172A'}}>{activeConv.nombre||activeConv.telefono}</div>
                  <div style={{fontSize:11,color:'#6b7280'}}><WaLink phone={activeConv.telefono}/>{activeConv.renta?' · Renta: '+activeConv.renta:''}{activeConv.modelo?' · '+activeConv.modelo:''}</div>
                </div>
                <div style={{display:'flex',gap:6,flexShrink:0,flexWrap:'wrap'}}>
                  <button onClick={()=>toggleMode(activeConv)}
                    style={{fontSize:11,padding:'5px 12px',borderRadius:99,border:'none',cursor:'pointer',fontWeight:700,
                      background:activeConv.mode==='ia'?'#E8EFFE':'#FEF9C3',
                      color:activeConv.mode==='ia'?B.primary:'#713f12'}}>
                    {activeConv.mode==='ia'?'🤖 IA':'👤 Humano'}
                  </button>
                  {!activeConv.lead_id && (
                    <button onClick={createLead}
                      style={{fontSize:11,padding:'5px 12px',borderRadius:8,border:`1px solid ${B.primary}`,background:B.light,color:B.primary,cursor:'pointer',fontWeight:600}}>
                      + Crear lead
                    </button>
                  )}
                  {activeConv.lead_id && <span style={{fontSize:11,padding:'5px 10px',borderRadius:8,background:'#DCFCE7',color:'#14532d',fontWeight:600}}>✅ Lead en CRM</span>}
                  <select value={activeConv.status||'activo'} onChange={e=>updateConversationStatus(activeConv, e.target.value)}
                    style={{fontSize:11,padding:'4px 8px',borderRadius:6,border:'1px solid #E2E8F0',background:'#fff',cursor:'pointer'}}>
                    <option value="activo">Activo</option>
                    <option value="calificado">Calificado</option>
                    <option value="no_interesado">No interesado</option>
                    <option value="frio">Frío</option>
                    <option value="requiere_revision">Requiere revisión</option>
                  </select>
                  <button onClick={()=>deleteConversation?.(activeConv)}
                    title="Borrar esta conversación del panel"
                    style={{fontSize:11,padding:'5px 10px',borderRadius:8,border:'1px solid #fecaca',background:'#fff5f5',color:'#991b1b',cursor:'pointer',fontWeight:700}}>
                    🗑 Borrar
                  </button>
                </div>
              </div>

              {/* Messages — scrollable */}
              <div style={{flex:1,overflowY:'auto',minHeight:0,padding:'12px 16px',display:'flex',flexDirection:'column',gap:8}}>
                {msgs.length===0 && <div style={{textAlign:'center',color:'#9ca3af',fontSize:12,padding:'20px'}}>Sin mensajes aún. Cuando conectes WhatsApp aparecerán aquí.</div>}
                {msgs.map((m,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-start':'flex-end',gap:6,alignItems:'flex-end'}}>
                    {m.role==='user'&&<div style={{width:24,height:24,borderRadius:'50%',background:'#e5e7eb',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10}}>👤</div>}
                    <div style={{maxWidth:'70%'}}>
                      <div style={{padding:'8px 12px',borderRadius:m.role==='user'?'12px 12px 12px 2px':'12px 12px 2px 12px',
                        background:m.role==='user'?'#fff':m.manual?'#E8EFFE':B.primary,
                        color:m.role==='user'?'#111827':m.manual?B.primary:'#fff',
                        border:m.role==='user'?'1px solid #e5e7eb':m.manual?`1px solid ${B.border}`:'none',
                        fontSize:12,lineHeight:1.5}}>
                        {m.content}
                      </div>
                      <div style={{display:'flex',gap:6,marginTop:3,justifyContent:m.role==='user'?'flex-start':'flex-end',alignItems:'center'}}>
                        <span style={{fontSize:9,color:'#9ca3af'}}>{m.created_at?new Date(m.created_at).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'}):''}</span>
                        {m.role==='assistant'&&!m.manual&&(
                          <>
                            <button onClick={()=>sendFeedback(i,'bueno')} title="Buena respuesta"
                              style={{background:'none',border:'none',cursor:'pointer',fontSize:11,padding:'1px 4px',borderRadius:4,color:'#9ca3af'}}>👍</button>
                            <button onClick={()=>setTrainModal({msgIdx:i, original:m.content, corrected:m.content, razon:''})} title="Sugerir mejora"
                              style={{background:'none',border:'none',cursor:'pointer',fontSize:11,padding:'1px 4px',borderRadius:4,color:'#9ca3af'}}>✏️</button>
                          </>
                        )}
                      </div>
                    </div>
                    {m.role==='assistant'&&<div style={{width:24,height:24,borderRadius:'50%',background:m.manual?'#E8EFFE':B.primary,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10}}>{m.manual?'👤':'🤖'}</div>}
                  </div>
                ))}
                <div ref={messagesEndRef}/>
              </div>

              {/* Input — fixed */}
              <div style={{flexShrink:0,padding:'10px 16px',borderTop:'1px solid #dce8ff',background:'#fff'}}>
                {activeConv.mode==='ia'&&<div style={{fontSize:11,color:B.mid,marginBottom:6,textAlign:'center'}}>🤖 Rabito está respondiendo automáticamente · <button onClick={()=>toggleMode(activeConv)} style={{background:'none',border:'none',color:B.primary,cursor:'pointer',fontSize:11,fontWeight:600,padding:0}}>Tomar control</button></div>}
                <div style={{display:'flex',gap:8}}>
                  <textarea value={newMsg} onChange={e=>setNewMsg(e.target.value)}
                    onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()} }}
                    placeholder={activeConv.mode==='ia'?"Escribe para intervenir manualmente...":"Escribe un mensaje..."}
                    style={{...sty.inp,flex:1,minHeight:40,maxHeight:100,resize:'none',fontSize:12}}/>
                  <button onClick={sendMessage} disabled={sending||!newMsg.trim()}
                    style={{...sty.btnP,opacity:sending||!newMsg.trim()?0.5:1,flexShrink:0,alignSelf:'flex-end'}}>Enviar</button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'#f9fbff',color:'#9ca3af'}}>
              <div style={{fontSize:40,marginBottom:12}}>💬</div>
              <div style={{fontSize:14,fontWeight:600}}>Selecciona una conversación</div>
              <div style={{fontSize:12,marginTop:4}}>Las conversaciones de WhatsApp aparecerán aquí</div>
            </div>
          )}
          </div>
        </div>
      )}

      {/* TAB: MASIVO */}
      {tab==='masivo' && (
          <div>
          {/* Target toggle */}
          <div style={{display:'flex',gap:8,marginBottom:16,padding:'10px 14px',background:'#fff',border:'1px solid #E2E8F0',borderRadius:10}}>
            <span style={{fontSize:12,fontWeight:600,color:B.primary,alignSelf:'center'}}>Enviar a:</span>
            <button onClick={()=>setMasivoTarget('leads')}
              style={{fontSize:12,padding:'6px 16px',borderRadius:8,border:'none',cursor:'pointer',fontWeight:600,
                background:masivoTarget==='leads'?B.primary:'#f0f4ff',color:masivoTarget==='leads'?'#fff':B.mid}}>
              📱 Leads / Contactos WhatsApp
            </button>
            <button onClick={()=>setMasivoTarget('equipo')}
              style={{fontSize:12,padding:'6px 16px',borderRadius:8,border:'none',cursor:'pointer',fontWeight:600,
                background:masivoTarget==='equipo'?B.primary:'#f0f4ff',color:masivoTarget==='equipo'?'#fff':B.mid}}>
              👥 Equipo interno ({(users||[]).filter(u=>u.role!=='partner').length})
            </button>
          </div>

          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:isMobile?10:16}}>
            {/* Message composer */}
            <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px'}}>
              <p style={{margin:'0 0 12px',fontSize:13,fontWeight:700,color:B.primary}}>
                {masivoTarget==='leads'?'📣 Mensaje masivo a leads':'📧 Mensaje al equipo'}
              </p>
              <Fld label="Plantilla base (opcional)">
                <select value={masivo.plantilla} onChange={e=>{
                  const tpl = iaConfig.plantillas?.[e.target.value]||''
                  setMasivo(prev=>({...prev, plantilla:e.target.value, msg:tpl}))
                }} style={sty.sel}>
                  <option value="">Sin plantilla</option>
                  {Object.entries(iaConfig.plantillas||{}).map(([k,v])=>(
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </Fld>
              <div style={{marginTop:10}}>
                <Fld label="Mensaje a enviar">
                  <textarea value={masivo.msg} onChange={e=>setMasivo(p=>({...p,msg:e.target.value}))}
                    placeholder="Escribe el mensaje o usa una plantilla..."
                    style={{...sty.inp,minHeight:100,resize:'vertical'}}/>
                </Fld>
              </div>
              <div style={{marginTop:10,padding:'8px 12px',background:B.light,borderRadius:8,fontSize:11,color:B.primary}}>
                💡 Variables: {'{nombre}'} se reemplaza con el nombre del contacto
              </div>
              {masivoResult && (
                <div style={{marginTop:10,padding:'8px 12px',background:'#DCFCE7',border:'1px solid #86efac',borderRadius:8,fontSize:12,color:'#14532d'}}>
                  {masivoResult.waLinks
                    ? <div><strong>✅ Se abrieron {masivoResult.sent} chats de WhatsApp</strong><br/><span style={{fontSize:11,fontWeight:400}}>Confirma el envío en cada ventana que se abrió.{masivoResult.failed>0?' · '+masivoResult.failed+' sin número':''}</span></div>
                    : <strong>✅ Enviado a {masivoResult.sent}{masivoResult.failed>0?' · '+masivoResult.failed+' fallaron':''}</strong>
                  }
                </div>
              )}
              {masivoTarget==='leads'
                ? <button onClick={sendMasivo} disabled={masivoSending||!masivo.msg.trim()||selectedConvs.length===0}
                    style={{...sty.btnP,marginTop:12,width:'100%',opacity:masivoSending||!masivo.msg.trim()||selectedConvs.length===0?0.5:1}}>
                    {masivoSending?'Enviando...':`Enviar a ${selectedConvs.length} seleccionados`}
                  </button>
                : <button onClick={sendMasivoEquipo} disabled={masivoSending||!masivo.msg.trim()||selectedUsers.length===0}
                    style={{...sty.btnP,marginTop:12,width:'100%',opacity:masivoSending||!masivo.msg.trim()||selectedUsers.length===0?0.5:1}}>
                    {masivoSending?'Enviando...':`Enviar a ${selectedUsers.length} del equipo`}
                  </button>
              }
            </div>

            {/* Selector panel */}
            {masivoTarget==='leads' ? (
              <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                  <p style={{margin:0,fontSize:13,fontWeight:700,color:B.primary}}>📱 Contactos WhatsApp</p>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>setSelectedConvs(conversations.map(c=>c.id))} style={{fontSize:11,padding:'3px 10px',borderRadius:6,border:`1px solid ${B.primary}`,background:B.light,color:B.primary,cursor:'pointer'}}>Todos</button>
                    <button onClick={()=>setSelectedConvs([])} style={{fontSize:11,padding:'3px 10px',borderRadius:6,border:'1px solid #E2E8F0',background:'#fff',color:'#6b7280',cursor:'pointer'}}>Ninguno</button>
                  </div>
                </div>
                <div style={{display:'flex',gap:4,marginBottom:8,flexWrap:'wrap'}}>
                  {[
                    {l:'Activos',f:()=>setSelectedConvs(conversations.filter(c=>c.status==='activo').map(c=>c.id))},
                    {l:'Calificados',f:()=>setSelectedConvs(conversations.filter(c=>c.status==='calificado').map(c=>c.id))},
                    {l:'Sin respuesta 24h',f:()=>setSelectedConvs(conversations.filter(c=>(Date.now()-new Date(c.updated_at||0).getTime())>86400000).map(c=>c.id))},
                    {l:'Fríos',f:()=>setSelectedConvs(conversations.filter(c=>c.status==='frio').map(c=>c.id))},
                  ].map(({l,f})=>(
                    <button key={l} onClick={f} style={{fontSize:10,padding:'3px 8px',borderRadius:6,border:'1px solid #E2E8F0',background:'#f9fbff',color:B.mid,cursor:'pointer'}}>{l}</button>
                  ))}
                </div>
                <div style={{maxHeight:280,overflowY:'auto',border:'1px solid #f0f4ff',borderRadius:8}}>
                  {conversations.map(c=>(
                    <div key={c.id} onClick={()=>setSelectedConvs(prev=>prev.includes(c.id)?prev.filter(id=>id!==c.id):[...prev,c.id])}
                      style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',borderBottom:'1px solid #f0f4ff',cursor:'pointer',background:selectedConvs.includes(c.id)?B.light:'#fff'}}>
                      <div style={{width:16,height:16,borderRadius:3,border:`2px solid ${selectedConvs.includes(c.id)?B.primary:'#dce8ff'}`,background:selectedConvs.includes(c.id)?B.primary:'#fff',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {selectedConvs.includes(c.id)&&<span style={{color:'#fff',fontSize:10,fontWeight:700}}>✓</span>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600}}>{c.nombre||c.telefono}</div>
                        <div style={{fontSize:10,color:'#9ca3af'}}>{c.telefono} · {c.status||'activo'}</div>
                      </div>
                    </div>
                  ))}
                  {conversations.length===0&&<div style={{padding:'16px',textAlign:'center',color:'#9ca3af',fontSize:12}}>Sin conversaciones</div>}
                </div>
                <div style={{marginTop:6,fontSize:11,color:B.mid,textAlign:'right'}}>{selectedConvs.length} seleccionados</div>
              </div>
            ) : (
              <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                  <p style={{margin:0,fontSize:13,fontWeight:700,color:B.primary}}>👥 Equipo interno</p>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>setSelectedUsers((users||[]).filter(u=>u.role!=='partner').map(u=>u.id))} style={{fontSize:11,padding:'3px 10px',borderRadius:6,border:`1px solid ${B.primary}`,background:B.light,color:B.primary,cursor:'pointer'}}>Todos</button>
                    <button onClick={()=>setSelectedUsers([])} style={{fontSize:11,padding:'3px 10px',borderRadius:6,border:'1px solid #E2E8F0',background:'#fff',color:'#6b7280',cursor:'pointer'}}>Ninguno</button>
                  </div>
                </div>
                <div style={{display:'flex',gap:4,marginBottom:8,flexWrap:'wrap'}}>
                  {['agent','operaciones','finanzas','admin'].map(role=>{
                    const ru = (users||[]).filter(u=>u.role===role)
                    if (!ru.length) return null
                    const label = {admin:'Admin',agent:'Asesor',operaciones:'Operaciones',finanzas:'Finanzas'}[role]||role
                    return (
                      <button key={role} onClick={()=>{
                        const ids=ru.map(u=>u.id)
                        setSelectedUsers(prev=>ids.every(id=>prev.includes(id))?prev.filter(id=>!ids.includes(id)):[...new Set([...prev,...ids])])
                      }} style={{fontSize:10,padding:'3px 10px',borderRadius:6,border:'1px solid #E2E8F0',background:'#f9fbff',color:B.mid,cursor:'pointer'}}>
                        {label} ({ru.length})
                      </button>
                    )
                  })}
                </div>
                <div style={{maxHeight:280,overflowY:'auto',border:'1px solid #f0f4ff',borderRadius:8}}>
                  {(users||[]).filter(u=>u.role!=='partner').map(u=>(
                    <div key={u.id} onClick={()=>setSelectedUsers(prev=>prev.includes(u.id)?prev.filter(id=>id!==u.id):[...prev,u.id])}
                      style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderBottom:'1px solid #f0f4ff',cursor:'pointer',background:selectedUsers.includes(u.id)?B.light:'#fff'}}>
                      <div style={{width:16,height:16,borderRadius:3,border:`2px solid ${selectedUsers.includes(u.id)?B.primary:'#dce8ff'}`,background:selectedUsers.includes(u.id)?B.primary:'#fff',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {selectedUsers.includes(u.id)&&<span style={{color:'#fff',fontSize:10,fontWeight:700}}>✓</span>}
                      </div>
                      <AV name={u.name} size={28}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600}}>{u.name}</div>
                        <div style={{fontSize:10,color:'#9ca3af'}}>{({admin:'Admin',agent:'Asesor',operaciones:'Operaciones',finanzas:'Finanzas'}[u.role]||u.role)}{u.phone?' · '+u.phone:' · Sin teléfono registrado'}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:6,fontSize:11,color:B.mid,textAlign:'right'}}>{selectedUsers.length} seleccionados</div>
                <div style={{marginTop:8,padding:'8px 12px',background:'#FFF7ED',borderRadius:8,fontSize:11,color:'#92400e'}}>
                  💡 Ahora abre WhatsApp Web por cada miembro. Cuando actives Meta Cloud API en la pestaña IA se enviará automáticamente.
                </div>
              </div>
            )}
          </div>
          </div>
      )}
      {/* TAB: NUEVA */}
      {tab==='nuevo' && (
        <div style={{maxWidth:400}}>
          <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px'}}>
            <p style={{margin:'0 0 14px',fontSize:13,fontWeight:700,color:B.primary}}>➕ Iniciar nueva conversación</p>
            <Fld label="Teléfono (con código país)">
              <input value={newConvPhone} onChange={e=>setNewConvPhone(e.target.value)} placeholder="+56912345678" style={sty.inp}/>
            </Fld>
            <div style={{marginTop:8}}>
              <Fld label="Nombre (opcional)">
                <input value={newConvName} onChange={e=>setNewConvName(e.target.value)} placeholder="Nombre del contacto" style={sty.inp}/>
              </Fld>
            </div>
            <button onClick={newConversation} disabled={!newConvPhone.trim()} style={{...sty.btnP,marginTop:12,width:'100%',opacity:!newConvPhone.trim()?0.5:1}}>
              Crear conversación
            </button>
            <div style={{marginTop:10,padding:'8px 12px',background:'#FFF7ED',borderRadius:8,fontSize:11,color:'#92400e'}}>
              💡 Cuando conectes WhatsApp, el primer mensaje se enviará automáticamente usando la plantilla de mensaje inicial configurada en la pestaña IA.
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Sugerir mensaje / Entrenar Rabito ─────────────────────── */}
      {trainModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 16px'}}>
          <div style={{background:'#fff',borderRadius:16,padding:'28px 32px',width:'100%',maxWidth:780,maxHeight:'90vh',overflowY:'auto',boxShadow:'0 8px 40px rgba(0,0,0,0.18)',border:'1px solid #E2E8F0'}}>
            {/* Header */}
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
              <div>
                <div style={{fontSize:20,fontWeight:800,color:'#0F172A',marginBottom:4}}>✏️ Sugerir un mensaje</div>
                <div style={{fontSize:13,color:'#6b7280'}}>Corrige la respuesta de Rabito para mejorar su entrenamiento.</div>
              </div>
              <button onClick={()=>setTrainModal(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:22,color:'#9ca3af',lineHeight:1,padding:'0 4px'}}>×</button>
            </div>

            {/* Two columns */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>
              {/* Left: original */}
              <div>
                <div style={{fontSize:12,fontWeight:700,color:'#374151',marginBottom:8}}>Mensaje a mejorar</div>
                <div style={{padding:'12px 14px',background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:10,fontSize:13,color:'#374151',lineHeight:1.6,minHeight:160,whiteSpace:'pre-wrap'}}>
                  {trainModal.original}
                </div>
              </div>
              {/* Right: editable corrected */}
              <div>
                <div style={{fontSize:12,fontWeight:700,color:'#374151',marginBottom:8}}>Mensaje mejorado</div>
                <textarea
                  value={trainModal.corrected}
                  onChange={e=>setTrainModal(p=>({...p,corrected:e.target.value}))}
                  style={{...sty.inp,width:'100%',minHeight:160,resize:'vertical',fontSize:13,lineHeight:1.6,boxSizing:'border-box'}}
                />
              </div>
            </div>

            {/* Explanation */}
            <div style={{marginBottom:24}}>
              <div style={{fontSize:12,fontWeight:700,color:'#374151',marginBottom:8}}>Explicación de por qué el mensaje es incorrecto</div>
              <textarea
                value={trainModal.razon}
                onChange={e=>setTrainModal(p=>({...p,razon:e.target.value}))}
                placeholder="Ej: Debería pedir la renta antes de proponer proyectos. El tono es demasiado largo."
                style={{...sty.inp,width:'100%',minHeight:80,resize:'vertical',fontSize:12,boxSizing:'border-box'}}
              />
            </div>

            {/* Actions */}
            <div style={{display:'flex',gap:12,justifyContent:'flex-end'}}>
              <button onClick={()=>setTrainModal(null)}
                style={{padding:'10px 20px',borderRadius:8,border:'1px solid #E2E8F0',background:'#fff',color:'#374151',fontSize:13,fontWeight:600,cursor:'pointer'}}>
                Cancelar
              </button>
              <button
                disabled={!trainModal.corrected.trim()||(!trainModal.razon.trim()&&trainModal.corrected===trainModal.original)}
                onClick={async ()=>{
                  await sendFeedback(trainModal.msgIdx,'correccion',trainModal.corrected,trainModal.razon)
                  setTrainModal(null)
                }}
                style={{padding:'10px 24px',borderRadius:8,border:'none',background:B.primary,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',
                  opacity:(!trainModal.corrected.trim()||(!trainModal.razon.trim()&&trainModal.corrected===trainModal.original))?0.4:1}}>
                🎓 Entrenar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ─── Cerebro Rabito: panel mínimo + conocimiento por chunks + prueba trazable ─────

function AgendaEquipoView({users, setUsers, saveUsers, supabase, dbReady, agendaSettings={}, setAgendaSettings}) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const todosAgentes = (users||[]).filter(u => u.role === 'agent')
  
  // Brokers que están en la agenda (tienen agenda_config.enAgenda = true)
  const [saving, setSaving] = React.useState(false)
  const [savedMsg, setSavedMsg] = React.useState('')
  const [localConfigs, setLocalConfigs] = React.useState(() => {
    const map = {}
    todosAgentes.forEach(u => {
      map[u.id] = u.agenda_config || {activa:false,enAgenda:false,peso:5,duracion:60,anticipacion:12,ingresos_categorias:['cualquiera'],dias:{},bookingSlug:''}
    })
    return map
  })
  const [editingId, setEditingId] = React.useState(null)

  // Sync localConfigs when users prop changes (e.g. on remount)
  React.useEffect(() => {
    setLocalConfigs(prev => {
      const next = {...prev}
      todosAgentes.forEach(u => {
        if (u.agenda_config && !prev[u.id]?.enAgenda && u.agenda_config.enAgenda) {
          next[u.id] = {...prev[u.id], ...u.agenda_config}
        }
      })
      return next
    })
  }, [users])

  const brokersEnAgenda = todosAgentes.filter(u => localConfigs[u.id]?.enAgenda)
  const brokersDisponibles = todosAgentes.filter(u => !localConfigs[u.id]?.enAgenda)

  const updConfig = (userId, field, val) =>
    setLocalConfigs(prev => ({...prev, [userId]: {...prev[userId], [field]: val}}))

  const agregarBroker = (userId) => updConfig(userId, 'enAgenda', true)
  const quitarBroker = (userId) => {
    updConfig(userId, 'enAgenda', false)
    updConfig(userId, 'activa', false)
  }

  const saveAll = async () => {
    setSaving(true)
    // Update users with merged agenda_config
    const updated = (users||[]).map(u => {
      if (u.role !== 'agent') return u
      const cfgRaw = {...(u.agenda_config||{}), ...localConfigs[u.id]}
      const cfg = {...cfgRaw, bookingSlug: bookingSlug(cfgRaw.bookingSlug || u.name)}
      return {...u, agenda_config: cfg}
    })
    await saveUsers(updated)
    // Also do individual PATCH for agenda_config to ensure it's saved
    if (dbReady && supabase) {
      for (const u of updated.filter(u=>u.role==='agent')) {
        try {
          await supabase.from('crm_users').update({ agenda_config: u.agenda_config }).eq('id', u.id)
        } catch(e) { console.warn('agenda_config patch failed', u.id, e) }
      }
    }
    setSavedMsg('✅ Guardado')
    setTimeout(()=>setSavedMsg(''), 2000)
    setSaving(false)
  }

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://crm.rabbittscapital.com'
  const agendaLink = `${baseUrl}/agenda`

  const agendaTeams = Array.isArray(agendaSettings?.teams) && agendaSettings.teams.length
    ? agendaSettings.teams
    : [{ id:'principal', nombre:'Equipo comercial', memberIds:[] }]
  const agendaEventTypes = Array.isArray(agendaSettings?.eventTypes) && agendaSettings.eventTypes.length
    ? agendaSettings.eventTypes
    : [{ id:'asesoria', nombre:agendaSettings?.titulo || 'Reunión de asesoría', duracion:60, descripcion:agendaSettings?.descripcion || '', modo:'round_robin', equipoId:'principal', anticipacionHoras:12, intervalo:30, bufferAntes:0, bufferDespues:0, activo:true }]

  const patchAgenda = (patch) => setAgendaSettings(prev => ({ ...prev, ...patch }))
  const patchTeam = (teamId, patch) => setAgendaSettings(prev => ({
    ...prev,
    teams: agendaTeams.map(t => t.id === teamId ? { ...t, ...patch } : t)
  }))
  const patchEventType = (eventId, patch) => setAgendaSettings(prev => ({
    ...prev,
    eventTypes: agendaEventTypes.map(e => e.id === eventId ? { ...e, ...patch } : e)
  }))
  const addEventType = () => setAgendaSettings(prev => ({
    ...prev,
    eventTypes: [
      ...agendaEventTypes,
      { id:'evento_' + Date.now(), nombre:'Nueva reunión', duracion:30, descripcion:'', modo:'round_robin', equipoId:agendaTeams[0]?.id || 'principal', anticipacionHoras:12, intervalo:30, bufferAntes:0, bufferDespues:0, activo:true }
    ]
  }))
  const removeEventType = (eventId) => setAgendaSettings(prev => ({
    ...prev,
    eventTypes: agendaEventTypes.length <= 1 ? agendaEventTypes : agendaEventTypes.filter(e => e.id !== eventId)
  }))

  const ingresosOptions = [
    {k:'cualquiera', l:'Cualquier ingreso', col:'#6b7280'},
    {k:'bajo',       l:'$1.5M – $2.5M',    col:'#0891b2'},
    {k:'medio',      l:'$2.5M – $5M',      col:'#7c3aed'},
    {k:'alto',       l:'$5M+',             col:'#059669'},
  ]

  const BrokerCard = ({u}) => {
    const cfg = localConfigs[u.id] || {}
    const isOpen = editingId === u.id
    const cats = cfg.ingresos_categorias || ['cualquiera']
    const diasActivos = Object.entries(cfg.dias||{}).filter(([,d])=>d.activo).length
    const directSlug = bookingSlug(cfg.bookingSlug || u.name)
    const directUrl = `${baseUrl}/reservar/${directSlug}`

    return (
      <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,overflow:'hidden',
        boxShadow:'0 1px 3px rgba(0,0,0,0.06)'}}>
        {/* Header row */}
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',flexWrap:'wrap'}}>
          <div style={{cursor:'pointer',display:'flex',alignItems:'center',gap:10,flex:1,minWidth:0}}
            onClick={()=>setEditingId(isOpen?null:u.id)}>
            <AV name={u.name} size={36} src={u.avatar_url||null}/>
            <div style={{minWidth:0}}>
              <div style={{fontWeight:700,fontSize:13,color:'#0F172A'}}>{u.name}</div>
              <div style={{fontSize:11,color:'#9ca3af',display:'flex',gap:6,flexWrap:'wrap',marginTop:1}}>
                {u.google_tokens ? <span style={{color:'#14532d',fontWeight:600}}>✅ Calendar</span> : <span>❌ Sin Calendar</span>}
                <span>· P:{cfg.peso||5} · {diasActivos}d · {cfg.duracion||60}min</span>
                <span style={{color:B.primary,fontWeight:800}}>· /reservar/{directSlug}</span>
              </div>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
            {/* Recibe reuniones toggle */}
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:11,color:B.mid}}>Activo</span>
              <button onClick={()=>updConfig(u.id,'activa',!cfg.activa)}
                style={{width:40,height:22,borderRadius:99,border:'none',cursor:'pointer',position:'relative',
                  background:cfg.activa?B.primary:'#CBD5E1',transition:'background .2s'}}>
                <div style={{position:'absolute',top:2,left:cfg.activa?20:2,width:18,height:18,borderRadius:'50%',
                  background:'#fff',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
              </button>
            </div>
            <button onClick={()=>navigator.clipboard?.writeText(directUrl).then(()=>{setSavedMsg('Link copiado');setTimeout(()=>setSavedMsg(''),1500)})}
              style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid #BFDBFE',background:'#EFF6FF',color:B.primary,cursor:'pointer',fontWeight:800}}>
              Copiar link
            </button>
            {/* Remove from agenda */}
            <button onClick={()=>quitarBroker(u.id)}
              style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid #fca5a5',
                background:'#FEF2F2',color:'#991b1b',cursor:'pointer',fontWeight:600}}>
              Quitar
            </button>
            <span style={{fontSize:12,color:'#9ca3af',cursor:'pointer'}} onClick={()=>setEditingId(isOpen?null:u.id)}>{isOpen?'▲':'▼'}</span>
          </div>
        </div>

        {/* Expanded config */}
        {isOpen && (
          <div style={{borderTop:'1px solid #f0f4ff',padding:'14px 16px',background:'#f9fbff'}}>
            <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr 1fr',gap:10,marginBottom:12}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'#374151',marginBottom:5}}>Prioridad (1-10)</div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <input type="range" min={1} max={10} value={cfg.peso||5}
                    onChange={e=>updConfig(u.id,'peso',parseInt(e.target.value))}
                    style={{flex:1,accentColor:B.primary}}/>
                  <span style={{fontWeight:800,fontSize:15,color:B.primary,minWidth:22,textAlign:'center'}}>{cfg.peso||5}</span>
                </div>
                <div style={{fontSize:10,color:'#9ca3af',marginTop:1}}>Mayor peso = más reuniones</div>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'#374151',marginBottom:5}}>Duración</div>
                <select value={cfg.duracion||60} onChange={e=>updConfig(u.id,'duracion',parseInt(e.target.value))} style={sty.sel}>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>1 hora</option>
                  <option value={90}>1.5 horas</option>
                </select>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'#374151',marginBottom:5}}>Anticipación mínima</div>
                <select value={cfg.anticipacion||12} onChange={e=>updConfig(u.id,'anticipacion',parseInt(e.target.value))} style={sty.sel}>
                  <option value={6}>6 horas</option>
                  <option value={12}>12 horas</option>
                  <option value={24}>24 horas</option>
                  <option value={48}>48 horas</option>
                </select>
              </div>
            </div>
            <div style={{marginBottom:12,padding:'10px 12px',border:'1px solid #DBEAFE',background:'#EFF6FF',borderRadius:10}}>
              <div style={{fontSize:11,fontWeight:900,color:B.primary,marginBottom:6}}>🔗 Link individual del broker</div>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <span style={{fontSize:12,color:'#64748B'}}>{baseUrl}/reservar/</span>
                <input value={cfg.bookingSlug || directSlug} onChange={e=>updConfig(u.id,'bookingSlug',bookingSlug(e.target.value))} style={{...sty.inp,flex:1,minWidth:180,padding:'7px 10px'}}/>
                <a href={directUrl} target="_blank" rel="noopener noreferrer" style={{...sty.btnP,fontSize:11,textDecoration:'none',padding:'7px 10px'}}>Ver</a>
              </div>
              <div style={{fontSize:10,color:'#64748B',marginTop:6}}>Este link agenda solo con este broker, cruzando su disponibilidad + Google Calendar.</div>
            </div>

            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:'#374151',marginBottom:6}}>💰 Ingresos que atiende</div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {ingresosOptions.map(({k,l,col})=>{
                  const sel = cats.includes(k)
                  return (
                    <button key={k} onClick={()=>{
                      let next = k==='cualquiera' ? ['cualquiera'] :
                        cats.includes('cualquiera') ? [k] :
                        sel ? (cats.filter(c=>c!==k)||['cualquiera']) :
                        [...cats.filter(c=>c!=='cualquiera'),k]
                      if (!next.length) next=['cualquiera']
                      updConfig(u.id,'ingresos_categorias',next)
                    }} style={{fontSize:11,padding:'5px 12px',borderRadius:99,cursor:'pointer',fontWeight:600,
                      border:sel?`2px solid ${col}`:'1px solid #E2E8F0',
                      background:sel?col+'18':'#fff',color:sel?col:'#6b7280'}}>
                      {l}
                    </button>
                  )
                })}
              </div>
            </div>
            <div style={{padding:'8px 12px',background:'#fff',border:'1px solid #E2E8F0',borderRadius:8,fontSize:11,color:'#6b7280'}}>
              <strong style={{color:'#374151'}}>Horario del broker: </strong>
              {diasActivos > 0
                ? Object.entries(cfg.dias||{}).filter(([,d])=>d.activo)
                    .map(([dk,d])=>`${dk} ${d.desde}–${d.hasta}`).join(' · ')
                : 'No ha configurado su horario aún'}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,paddingBottom:12,borderBottom:'2px solid #E2E8F0',flexWrap:'wrap'}}>
        <div style={{fontSize:28}}>📅</div>
        <div style={{flex:1}}>
          <div style={{fontSize:16,fontWeight:800,color:B.primary}}>Agenda del Equipo</div>
          <div style={{fontSize:12,color:B.mid}}>{brokersEnAgenda.filter(u=>localConfigs[u.id]?.activa).length} brokers activos recibiendo reuniones</div>
        </div>
        <button onClick={saveAll} disabled={saving}
          style={{...sty.btnP,minWidth:120,flexShrink:0}}>
          {savedMsg || (saving?'Guardando...':'💾 Guardar todo')}
        </button>
      </div>

      {/* Resumen ejecutivo */}
      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(4,1fr)',gap:10,marginBottom:16}}>
        {[
          {t:'Brokers activos',v:brokersEnAgenda.filter(u=>localConfigs[u.id]?.activa).length,sub:'reciben reuniones'},
          {t:'Google Calendar',v:brokersEnAgenda.filter(u=>u.google_tokens).length,sub:'conectados'},
          {t:'Links directos',v:brokersEnAgenda.length,sub:'por broker'},
          {t:'Distribución',v:(agendaSettings?.distributionMode||'round_robin')==='collective'?'Colectivo':'Round Robin',sub:'modo principal'}
        ].map((c,i)=>(
          <div key={i} style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:14,padding:'14px 16px',boxShadow:'0 1px 3px rgba(15,23,42,.04)'}}>
            <div style={{fontSize:11,fontWeight:900,color:'#94A3B8',textTransform:'uppercase',letterSpacing:'.06em'}}>{c.t}</div>
            <div style={{fontSize:22,fontWeight:950,color:'#0F172A',marginTop:4}}>{c.v}</div>
            <div style={{fontSize:12,color:B.mid,marginTop:2}}>{c.sub}</div>
          </div>
        ))}
      </div>
      {/* Link público */}
      <div style={{background:B.light,border:'1px solid #BFDBFE',borderRadius:12,padding:'12px 16px',marginBottom:16,display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:11,fontWeight:700,color:B.primary,marginBottom:2}}>🔗 Link público — comparte este link con los clientes o Rabito lo envía automáticamente</div>
          <div style={{fontSize:12,color:'#0F172A',wordBreak:'break-all'}}>{agendaLink}</div>
        </div>
        <div style={{display:'flex',gap:6,flexShrink:0}}>
          <button onClick={()=>navigator.clipboard?.writeText(agendaLink).then(()=>{setSavedMsg('Copiado!');setTimeout(()=>setSavedMsg(''),1500)})}
            style={{...sty.btn,fontSize:12}}>Copiar</button>
          <a href={agendaLink} target="_blank" rel="noopener noreferrer"
            style={{...sty.btnP,fontSize:12,textDecoration:'none',padding:'7px 12px'}}>Ver página</a>
        </div>
      </div>

      {/* ── Motor de agendamiento ── */}
      <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px',marginBottom:16}}>
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:14,flexWrap:'wrap'}}>
          <div>
            <div style={{fontWeight:800,fontSize:14,color:'#0F172A'}}>⚙️ Motor de agendamiento</div>
            <div style={{fontSize:12,color:B.mid,marginTop:2}}>Define tipos de reunión, equipos, distribución y reglas anti doble reserva.</div>
          </div>
          <span style={{fontSize:11,fontWeight:800,color:'#14532d',background:'#DCFCE7',padding:'6px 10px',borderRadius:999}}>Auto guardado</span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(4,1fr)',gap:10,marginBottom:14}}>
          <Fld label="Zona horaria">
            <input value={agendaSettings?.timezone || 'America/Santiago'} onChange={e=>patchAgenda({timezone:e.target.value})} style={sty.inp}/>
          </Fld>
          <Fld label="Intervalo de slots">
            <select value={agendaSettings?.slotInterval || 30} onChange={e=>patchAgenda({slotInterval:parseInt(e.target.value)})} style={sty.sel}>
              <option value={15}>Cada 15 min</option><option value={30}>Cada 30 min</option><option value={45}>Cada 45 min</option><option value={60}>Cada 60 min</option>
            </select>
          </Fld>
          <Fld label="Anticipación mínima">
            <select value={agendaSettings?.minNoticeHours || 12} onChange={e=>patchAgenda({minNoticeHours:parseInt(e.target.value)})} style={sty.sel}>
              <option value={1}>1 hora</option><option value={6}>6 horas</option><option value={12}>12 horas</option><option value={24}>24 horas</option><option value={48}>48 horas</option>
            </select>
          </Fld>
          <Fld label="Distribución por defecto">
            <select value={agendaSettings?.distributionMode || 'round_robin'} onChange={e=>patchAgenda({distributionMode:e.target.value})} style={sty.sel}>
              <option value="round_robin">Round Robin</option><option value="collective">Colectivo</option>
            </select>
          </Fld>
        </div>
        <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1.4fr',gap:14}}>
          <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:12,padding:14}}>
            <div style={{fontSize:12,fontWeight:900,color:'#0F172A',marginBottom:8}}>👥 Equipo principal</div>
            {agendaTeams.map(team => (
              <div key={team.id}>
                <input value={team.nombre || ''} onChange={e=>patchTeam(team.id,{nombre:e.target.value})} style={{...sty.inp,marginBottom:10}} placeholder="Nombre del equipo"/>
                <div style={{fontSize:11,fontWeight:800,color:'#64748B',marginBottom:6}}>Miembros que pueden recibir reuniones</div>
                <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:210,overflow:'auto'}}>
                  {todosAgentes.map(u => {
                    const members = Array.isArray(team.memberIds) ? team.memberIds : []
                    const checked = members.includes(u.id) || (!members.length && localConfigs[u.id]?.enAgenda)
                    return (
                      <label key={u.id} style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#334155',background:'#fff',border:'1px solid #E2E8F0',borderRadius:9,padding:'7px 9px'}}>
                        <input type="checkbox" checked={checked} onChange={e=>{
                          const base = members.length ? members : brokersEnAgenda.map(b=>b.id)
                          const next = e.target.checked ? [...new Set([...base,u.id])] : base.filter(id=>id!==u.id)
                          patchTeam(team.id,{memberIds:next})
                        }}/>
                        <span style={{fontWeight:700}}>{u.name}</span>
                        <span style={{marginLeft:'auto',fontSize:10,color:u.google_tokens?'#166534':'#9ca3af'}}>{u.google_tokens?'Calendar':'Sin Calendar'}</span>
                      </label>
                    )
                  })}
                </div>
                <div style={{fontSize:10,color:'#64748B',marginTop:8}}>Si no marcas miembros manualmente, se usan los asesores agregados y activos en la agenda.</div>
              </div>
            ))}
          </div>
          <div style={{background:'#F8FAFC',border:'1px solid #E2E8F0',borderRadius:12,padding:14}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:8}}>
              <div style={{fontSize:12,fontWeight:900,color:'#0F172A'}}>🧩 Tipos de evento</div>
              <button onClick={addEventType} style={{...sty.btn,fontSize:11,padding:'5px 10px'}}>+ Tipo</button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {agendaEventTypes.map(ev => (
                <div key={ev.id} style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:12}}>
                  <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1.3fr .8fr .8fr .8fr',gap:8,alignItems:'end'}}>
                    <Fld label="Nombre"><input value={ev.nombre || ''} onChange={e=>patchEventType(ev.id,{nombre:e.target.value})} style={sty.inp}/></Fld>
                    <Fld label="Duración"><select value={ev.duracion || 60} onChange={e=>patchEventType(ev.id,{duracion:parseInt(e.target.value)})} style={sty.sel}><option value={15}>15 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option><option value={90}>90 min</option></select></Fld>
                    <Fld label="Asignación"><select value={ev.modo || agendaSettings?.distributionMode || 'round_robin'} onChange={e=>patchEventType(ev.id,{modo:e.target.value})} style={sty.sel}><option value="round_robin">Round Robin</option><option value="collective">Colectivo</option></select></Fld>
                    <Fld label="Activo"><button onClick={()=>patchEventType(ev.id,{activo:ev.activo===false})} style={{...sty.btn,background:ev.activo===false?'#F1F5F9':'#DCFCE7',color:ev.activo===false?'#64748B':'#166534',borderColor:ev.activo===false?'#CBD5E1':'#BBF7D0'}}>{ev.activo===false?'No':'Sí'}</button></Fld>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(4,1fr)',gap:8,marginTop:8}}>
                    <Fld label="Anticipación"><select value={ev.anticipacionHoras || agendaSettings?.minNoticeHours || 12} onChange={e=>patchEventType(ev.id,{anticipacionHoras:parseInt(e.target.value)})} style={sty.sel}><option value={1}>1h</option><option value={6}>6h</option><option value={12}>12h</option><option value={24}>24h</option><option value={48}>48h</option></select></Fld>
                    <Fld label="Intervalo"><select value={ev.intervalo || agendaSettings?.slotInterval || 30} onChange={e=>patchEventType(ev.id,{intervalo:parseInt(e.target.value)})} style={sty.sel}><option value={15}>15m</option><option value={30}>30m</option><option value={60}>60m</option></select></Fld>
                    <Fld label="Buffer antes"><select value={ev.bufferAntes || 0} onChange={e=>patchEventType(ev.id,{bufferAntes:parseInt(e.target.value)})} style={sty.sel}><option value={0}>0m</option><option value={5}>5m</option><option value={10}>10m</option><option value={15}>15m</option></select></Fld>
                    <Fld label="Buffer después"><select value={ev.bufferDespues || 0} onChange={e=>patchEventType(ev.id,{bufferDespues:parseInt(e.target.value)})} style={sty.sel}><option value={0}>0m</option><option value={5}>5m</option><option value={10}>10m</option><option value={15}>15m</option></select></Fld>
                  </div>
                  <textarea value={ev.descripcion || ''} onChange={e=>patchEventType(ev.id,{descripcion:e.target.value})} placeholder="Descripción interna del evento" style={{...sty.inp,minHeight:54,resize:'vertical',marginTop:8}}/>
                  {agendaEventTypes.length > 1 && <button onClick={()=>removeEventType(ev.id)} style={{marginTop:8,fontSize:11,border:'1px solid #FCA5A5',background:'#FEF2F2',color:'#991B1B',borderRadius:8,padding:'5px 10px',cursor:'pointer'}}>Eliminar tipo</button>}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{marginTop:12,padding:'10px 12px',background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:10,fontSize:11,color:'#1E40AF',lineHeight:1.5}}>
          <b>Cómo funciona:</b> Round Robin muestra horarios donde al menos un asesor está libre y asigna al que lleva menos reuniones ponderado por prioridad. Colectivo muestra solo horarios donde todos los miembros del equipo coinciden. Al confirmar, el servidor vuelve a revisar CRM + Google Calendar antes de reservar para evitar doble booking.
        </div>
      </div>

      {/* ── Personalización de la página ── */}
      <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'16px',marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:13,color:'#0F172A',marginBottom:12}}>🎨 Página de reservas — configuración</div>
        <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'1fr 1fr',gap:12}}>
          {/* Logo */}
          <div style={{gridColumn:'1/-1',background:'#f8fafc',borderRadius:10,padding:'14px',border:'1px solid #E2E8F0'}}>
            <div style={{fontSize:12,fontWeight:600,color:'#374151',marginBottom:10}}>Logo de la empresa</div>
            <div style={{display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
              {/* Preview */}
              <div style={{background:'#FAFAFA',border:'1px solid #E2E8F0',borderRadius:10,padding:'12px 16px',minWidth:140,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                {agendaSettings?.logo ? (
                  <img src={agendaSettings.logo}
                    style={{
                      height: {pequeno:32,mediano:48,grande:72}[agendaSettings?.logoSize||'mediano'],
                      maxWidth:140, objectFit:'contain'
                    }} alt="preview"/>
                ) : (
                  <img src="/icon-192.png"
                    style={{
                      width:{pequeno:32,mediano:48,grande:72}[agendaSettings?.logoSize||'mediano'],
                      height:{pequeno:32,mediano:48,grande:72}[agendaSettings?.logoSize||'mediano'],
                      borderRadius:8, objectFit:'cover'
                    }} alt="preview"/>
                )}
              </div>
              {/* Controls */}
              <div style={{flex:1}}>
                <div style={{display:'flex',gap:6,marginBottom:10,flexWrap:'wrap'}}>
                  <label htmlFor="agenda-logo-up" style={{display:'inline-block',padding:'7px 16px',borderRadius:8,border:`1px solid ${B.primary}`,background:B.light,cursor:'pointer',fontSize:12,fontWeight:700,color:B.primary}}>
                    📁 Subir logo
                  </label>
                  <input id="agenda-logo-up" type="file" accept="image/*" style={{display:'none'}}
                    onChange={e=>{
                      const file=e.target.files[0]; if(!file) return
                      if(file.size>2*1024*1024){alert('Máx 2MB');return}
                      const r=new FileReader(); r.onload=ev=>setAgendaSettings(s=>({...s,logo:ev.target.result})); r.readAsDataURL(file)
                    }}/>
                  {agendaSettings?.logo && (
                    <button onClick={()=>setAgendaSettings(s=>({...s,logo:null}))}
                      style={{padding:'7px 12px',borderRadius:8,border:'1px solid #fca5a5',background:'#FEF2F2',fontSize:12,color:'#991b1b',cursor:'pointer',fontWeight:600}}>
                      Eliminar
                    </button>
                  )}
                </div>
                {/* Size selector */}
                <div style={{marginBottom:6}}>
                  <div style={{fontSize:11,color:'#6b7280',marginBottom:6,fontWeight:600}}>Tamaño del logo</div>
                  <div style={{display:'flex',gap:6}}>
                    {[{k:'pequeno',l:'Pequeño',h:32},{k:'mediano',l:'Mediano',h:48},{k:'grande',l:'Grande',h:72}].map(({k,l,h})=>{
                      const sel = (agendaSettings?.logoSize||'mediano')===k
                      return (
                        <button key={k} onClick={()=>setAgendaSettings(s=>({...s,logoSize:k}))}
                          style={{flex:1,padding:'6px 4px',borderRadius:8,cursor:'pointer',fontWeight:600,fontSize:11,
                            border:sel?`2px solid ${B.primary}`:'1px solid #E2E8F0',
                            background:sel?B.light:'#fff',color:sel?B.primary:'#6b7280',
                            display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                          <div style={{width:h*0.6,height:h*0.35,borderRadius:3,background:sel?B.primary:'#CBD5E1',transition:'all .15s'}}/>
                          {l}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div style={{fontSize:10,color:'#9ca3af'}}>PNG, SVG o JPG recomendado · máx 2MB · fondo transparente ideal</div>
              </div>
            </div>
          </div>
          {/* Fields */}
          <Fld label="Nombre de la empresa">
            <input value={agendaSettings?.empresa||''} onChange={e=>setAgendaSettings(s=>({...s,empresa:e.target.value}))} style={sty.inp} placeholder="Rabbitts Capital"/>
          </Fld>
          <Fld label="Título del evento">
            <input value={agendaSettings?.titulo||''} onChange={e=>setAgendaSettings(s=>({...s,titulo:e.target.value}))} style={sty.inp} placeholder="Reunión de Asesoría Inmobiliaria"/>
          </Fld>
          <div style={{gridColumn:'1/-1'}}>
            <Fld label="Descripción">
              <textarea value={agendaSettings?.descripcion||''} onChange={e=>setAgendaSettings(s=>({...s,descripcion:e.target.value}))}
                style={{...sty.inp,minHeight:68,resize:'vertical'}} placeholder="Revisaremos tu situación..."/>
            </Fld>
          </div>
          <Fld label="Color principal">
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input type="color" value={agendaSettings?.colorPrimario||'#2563EB'}
                onChange={e=>setAgendaSettings(s=>({...s,colorPrimario:e.target.value}))}
                style={{width:40,height:36,borderRadius:6,border:'1px solid #E2E8F0',cursor:'pointer',padding:2,flexShrink:0}}/>
              <input value={agendaSettings?.colorPrimario||'#2563EB'}
                onChange={e=>setAgendaSettings(s=>({...s,colorPrimario:e.target.value}))}
                style={{...sty.inp,flex:1}}/>
            </div>
          </Fld>
          <Fld label="Duración visible al cliente">
            <input value={agendaSettings?.duracionLabel||'1 hora'} onChange={e=>setAgendaSettings(s=>({...s,duracionLabel:e.target.value}))} style={sty.inp} placeholder="1 hora"/>
          </Fld>
        </div>
        <div style={{marginTop:10,padding:'7px 12px',background:'#F0FDF4',borderRadius:8,fontSize:11,color:'#14532d'}}>
          💾 Los cambios se guardan automáticamente y se reflejan en crm.rabbittscapital.com/agenda
        </div>
      </div>

      {/* Brokers en la agenda */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:8}}>
          Brokers en la agenda ({brokersEnAgenda.length})
        </div>
        {brokersEnAgenda.length === 0 && (
          <div style={{padding:'20px',textAlign:'center',color:'#9ca3af',fontSize:13,background:'#f9fbff',borderRadius:10,border:'1px dashed #E2E8F0'}}>
            Ningún broker agregado. Agrega asesores desde la sección de abajo.
          </div>
        )}
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {brokersEnAgenda.map(u => <BrokerCard key={u.id} u={u}/>)}
        </div>
      </div>

      {/* Brokers disponibles para agregar */}
      {brokersDisponibles.length > 0 && (
        <div>
          <div style={{fontSize:13,fontWeight:700,color:'#0F172A',marginBottom:8}}>
            Agregar asesores a la agenda
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {brokersDisponibles.map(u => (
              <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',
                background:'#fff',border:'1px solid #E2E8F0',borderRadius:10}}>
                <AV name={u.name} size={32} src={u.avatar_url||null}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13,color:'#0F172A'}}>{u.name}</div>
                  <div style={{fontSize:11,color:'#9ca3af'}}>
                    {u.google_tokens ? '✅ Google Calendar conectado' : '❌ Sin Google Calendar'}
                  </div>
                </div>
                <button onClick={()=>agregarBroker(u.id)}
                  style={{fontSize:12,padding:'6px 14px',borderRadius:8,border:`1px solid ${B.primary}`,
                    background:B.light,color:B.primary,cursor:'pointer',fontWeight:600,flexShrink:0}}>
                  + Agregar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}


// ─── Mi Agenda View (broker - only availability schedule) ────────────────────

function MiAgendaView({me, users, setUsers, saveUsers, supabase, dbReady}) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo']
  const DIAS_KEY = ['lun','mar','mie','jue','vie','sab','dom']

  const myUser = (users||[]).find(u=>u.id===me.id) || me
  const existingConfig = myUser.agenda_config || {}

  const [activa, setActiva] = React.useState(existingConfig.activa || false)
  const [dias, setDias] = React.useState(existingConfig.dias || {
    lun:{activo:true,  desde:'09:00',hasta:'18:00'},
    mar:{activo:true,  desde:'09:00',hasta:'18:00'},
    mie:{activo:true,  desde:'09:00',hasta:'18:00'},
    jue:{activo:true,  desde:'09:00',hasta:'18:00'},
    vie:{activo:true,  desde:'09:00',hasta:'18:00'},
    sab:{activo:false, desde:'10:00',hasta:'14:00'},
    dom:{activo:false, desde:'10:00',hasta:'14:00'},
  })
  const [bookingSlugState, setBookingSlugState] = React.useState(existingConfig.bookingSlug || bookingSlug(myUser.name || me.name))
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://crm.rabbittscapital.com'
  const directSlug = bookingSlug(bookingSlugState || myUser.name || me.name)
  const directUrl = `${baseUrl}/reservar/${directSlug}`

  const updDia = (dk, field, val) => setDias(prev => ({...prev, [dk]: {...prev[dk], [field]: val}}))

  const save = async () => {
    setSaving(true)
    // Merge with existing admin config (don't overwrite peso, duracion, etc.)
    const newConfig = { ...existingConfig, activa, dias, bookingSlug: directSlug }
    const updated = (users||[]).map(u => u.id===me.id ? {...u, agenda_config: newConfig} : u)
    await saveUsers(updated)
    setSaved(true)
    setTimeout(()=>setSaved(false), 2000)
    setSaving(false)
  }

  return (
    <div style={{maxWidth:600}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16,paddingBottom:12,borderBottom:'2px solid #E2E8F0'}}>
        <div style={{fontSize:28}}>📅</div>
        <div style={{flex:1}}>
          <div style={{fontSize:16,fontWeight:800,color:B.primary}}>Mi disponibilidad</div>
          <div style={{fontSize:12,color:B.mid}}>Configura cuándo puedes atender reuniones con clientes</div>
        </div>
        <button onClick={save} disabled={saving}
          style={{...sty.btnP,opacity:saving?0.6:1,minWidth:110,flexShrink:0}}>
          {saved?'✅ Guardado':saving?'Guardando...':'Guardar'}
        </button>
      </div>

      {/* Activa toggle */}
      <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px',marginBottom:12,
        display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
        <div>
          <div style={{fontWeight:700,fontSize:14,color:'#0F172A'}}>Disponible para reuniones</div>
          <div style={{fontSize:12,color:B.mid,marginTop:2}}>Cuando está activo, los clientes pueden agendar contigo</div>
        </div>
        <button onClick={()=>setActiva(v=>!v)}
          style={{width:48,height:26,borderRadius:99,border:'none',cursor:'pointer',position:'relative',
            background:activa?B.primary:'#CBD5E1',transition:'background .2s',flexShrink:0}}>
          <div style={{position:'absolute',top:3,left:activa?24:3,width:20,height:20,borderRadius:'50%',
            background:'#fff',transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
        </button>
      </div>

      {/* Link individual */}
      <div style={{background:'#fff',border:'1px solid #DBEAFE',borderRadius:12,padding:'14px 16px',marginBottom:12}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
          <div style={{flex:1,minWidth:220}}>
            <div style={{fontWeight:800,fontSize:13,color:'#0F172A',marginBottom:4}}>🔗 Tu link personal de reservas</div>
            <div style={{fontSize:12,color:B.mid,marginBottom:10}}>Compártelo para que los clientes agenden directo contigo, cruzando tu horario y Google Calendar.</div>
            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
              <span style={{fontSize:12,color:'#64748B'}}>{baseUrl}/reservar/</span>
              <input value={bookingSlugState} onChange={e=>setBookingSlugState(bookingSlug(e.target.value))} style={{...sty.inp,width:isMobile?'100%':220,padding:'7px 10px',marginTop:0}}/>
            </div>
            <div style={{fontSize:12,color:'#0F172A',marginTop:8,wordBreak:'break-all',fontWeight:700}}>{directUrl}</div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>navigator.clipboard?.writeText(directUrl).then(()=>setSaved(true))} style={{...sty.btn,fontSize:12}}>Copiar</button>
            <a href={directUrl} target="_blank" rel="noopener noreferrer" style={{...sty.btnP,fontSize:12,textDecoration:'none',padding:'8px 12px'}}>Ver</a>
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px',marginBottom:12}}>
        <div style={{fontWeight:700,fontSize:13,color:'#0F172A',marginBottom:12}}>🕐 Horario disponible por día</div>
        <div style={{display:'flex',flexDirection:'column',gap:0}}>
          {DIAS_KEY.map((dk,i)=>(
            <div key={dk} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 0',
              borderBottom:i<6?'1px solid #f0f4ff':'none',flexWrap:isMobile?'wrap':'nowrap'}}>
              <button onClick={()=>updDia(dk,'activo',!dias[dk].activo)}
                style={{width:40,height:22,borderRadius:99,border:'none',cursor:'pointer',position:'relative',flexShrink:0,
                  background:dias[dk].activo?B.primary:'#CBD5E1',transition:'background .2s'}}>
                <div style={{position:'absolute',top:2,left:dias[dk].activo?20:2,width:18,height:18,borderRadius:'50%',
                  background:'#fff',transition:'left .2s',boxShadow:'0 1px 2px rgba(0,0,0,0.2)'}}/>
              </button>
              <span style={{width:82,fontSize:13,fontWeight:dias[dk].activo?600:400,
                color:dias[dk].activo?'#0F172A':'#9ca3af',flexShrink:0}}>{DIAS[i]}</span>
              {dias[dk].activo ? (
                <div style={{display:'flex',alignItems:'center',gap:8,flex:1}}>
                  <input type="time" value={dias[dk].desde}
                    onChange={e=>updDia(dk,'desde',e.target.value)}
                    style={{...sty.inp,width:isMobile?'100%':110,fontSize:13}}/>
                  <span style={{color:'#6b7280',fontSize:12,flexShrink:0}}>—</span>
                  <input type="time" value={dias[dk].hasta}
                    onChange={e=>updDia(dk,'hasta',e.target.value)}
                    style={{...sty.inp,width:isMobile?'100%':110,fontSize:13}}/>
                </div>
              ) : (
                <span style={{fontSize:12,color:'#9ca3af'}}>No disponible</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Google Calendar status */}
      <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'14px 16px',marginBottom:12}}>
        <div style={{fontWeight:700,fontSize:13,color:'#0F172A',marginBottom:8}}>📅 Google Calendar</div>
        {me.google_tokens ? (
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{padding:'4px 12px',borderRadius:99,background:'#DCFCE7',color:'#14532d',fontWeight:600,fontSize:12}}>✅ Conectado</span>
            <span style={{color:'#6b7280',fontSize:12}}>{me.google_tokens.email}</span>
            <button onClick={()=>window.location.href=`/api/auth?action=login&userId=${me.id}`}
              style={{fontSize:11,padding:'3px 10px',borderRadius:6,border:'1px solid #86efac',background:'#fff',color:'#14532d',cursor:'pointer',marginLeft:4}}>
              Reconectar
            </button>
          </div>
        ) : (
          <div>
            <div style={{fontSize:12,color:'#6b7280',marginBottom:10}}>
              Conecta Google Calendar para que las reuniones se creen automáticamente y el cliente reciba la invitación.
            </div>
            <button onClick={()=>window.location.href=`/api/auth?action=login&userId=${me.id}`}
              style={{...sty.btnP,fontSize:13,display:'flex',alignItems:'center',gap:6}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Conectar Google Calendar
            </button>
          </div>
        )}
      </div>

      {/* Info about admin settings */}
      <div style={{padding:'10px 14px',background:'#FFF7ED',border:'1px solid #FED7AA',borderRadius:10,fontSize:12,color:'#92400e'}}>
        ℹ️ La prioridad, rango de ingresos y duración de reunión los configura el administrador en tu perfil.
      </div>
    </div>
  )
}


// ─── Kanban Card ──────────────────────────────────────────────────────────────

function KCard({lead, users, isAdmin, isPartner, isOps, onOpen, onMove, stages=[]}) {
  const si = stages.findIndex(x=>x.id===lead.stage)
  const ag = (users||[]).find(u=>u.id===lead.assigned_to)
  const cal = CAL[lead.calificacion]
  const dias = daysIn(lead)
  const isLocked = OPS_LOCKED_STAGES.includes(lead.stage)
  const urgColor = isLocked ? '#7e22ce' : dias>=7 ? '#dc2626' : dias>=3 ? '#d97706' : null
  return (
    <div onClick={onOpen} style={{
      background:'#fff',borderRadius:10,padding:'10px 10px',cursor:'pointer',marginBottom:8,
      boxShadow:'0 1px 4px rgba(27,79,200,0.05)',wordBreak:'break-word',
      border: urgColor ? `1px solid ${urgColor}30` : '1px solid #E2E8F0',
      borderTop: urgColor ? `3px solid ${urgColor}` : '1px solid #E2E8F0',
    }}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:5}}>
        <div style={{fontWeight:600,fontSize:13,color:'#0F172A',lineHeight:1.3,flex:1,marginRight:6}}>{lead.nombre}</div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:3,flexShrink:0}}>
          <Days d={dias}/>
          {cal&&<span style={{fontSize:10,padding:'1px 6px',borderRadius:99,background:cal.bg,color:cal.col,fontWeight:600}}>{lead.calificacion}</span>}
        </div>
      </div>
      <div style={{fontSize:12,color:'#6b7280',marginBottom:5}}>{lead.telefono!=='—'?lead.telefono:lead.email}</div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:5}}>
          <Tag tag={lead.tag||'lead'} sm/>
          {(lead.comments||[]).length>0&&<span style={{fontSize:10,color:'#9ca3af'}}>💬{(lead.comments||[]).length}</span>}
          {(lead.visitas||[]).length>0&&<span style={{fontSize:10,color:'#5b21b6'}}>🏠{(lead.visitas||[]).length}</span>}
        </div>
        {isAdmin&&ag&&<div style={{display:'flex',alignItems:'center',gap:4}}><AV name={ag.name} size={16}/><span style={{fontSize:10,color:'#9ca3af'}}>{ag.name.split(' ')[0]}</span></div>}
      </div>
      {!isAdmin&&!isPartner&&(()=>{
        if (isLocked && !isOps) {
          return (
            <div style={{display:'flex',alignItems:'center',gap:4,marginTop:8}}>
              <span style={{fontSize:10,color:'#7e22ce',background:'#FDF4FF',padding:'2px 8px',borderRadius:6,border:'1px solid #d8b4fe',fontWeight:600}}>🔒 En gestión de Operaciones</span>
            </div>
          )
        }
        return (
          <div style={{display:'flex',gap:4,marginTop:8}} onClick={e=>e.stopPropagation()}>
            {si>0&&!RESTRICTED_STAGES.includes(stages[si-1]?.id)&&<button onClick={()=>onMove(lead.id,stages[si-1].id)} style={{fontSize:11,padding:'3px 8px',borderRadius:8,border:'1px solid #E2E8F0',background:'transparent',cursor:'pointer',color:'#6b7280'}}>← Atrás</button>}
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


// ─── Visitas Gestión View (Operaciones / Admin) ───────────────────────────────
function VisitasGestionView({ leads, users, setLeads, supabase, dbReady, me }) {
  const B = { primary:'#1B4FC8', light:'#EEF2FF', mid:'#6b7280' }
  const sty = { inp:{padding:'7px 10px',borderRadius:8,border:'1px solid #E2E8F0',fontSize:13,width:'100%',boxSizing:'border-box'} }
  const [filter, setFilter] = React.useState('all') // all | solicitada | confirmada | rechazada
  const [msgModal, setMsgModal] = React.useState(null) // {leadId, visitaIdx, visita}
  const [msgText, setMsgText] = React.useState('')

  // Collect all visits across all leads
  const allVisitas = React.useMemo(() => {
    const rows = []
    for (const lead of leads) {
      for (let vi = 0; vi < (lead.visitas||[]).length; vi++) {
        const v = lead.visitas[vi]
        const broker = (users||[]).find(u=>u.id===v.broker_id) || {}
        rows.push({ lead, leadId:lead.id, vi, v, brokerName: v.broker_name || broker.name || '—', brokerPhone: broker.phone||'', brokerEmail: broker.email||'' })
      }
    }
    return rows.sort((a,b) => (b.v.fecha+b.v.hora).localeCompare(a.v.fecha+a.v.hora))
  }, [leads, users])

  const filtered = filter==='all' ? allVisitas : allVisitas.filter(x=>x.v.estado===filter)

  const updateVisita = async (leadId, vi, fields) => {
    const lead = leads.find(l=>l.id===leadId)
    if (!lead) return
    const newVisitas = (lead.visitas||[]).map((x,i) => i===vi ? {...x,...fields} : x)
    if (supabase&&dbReady) await supabase.from('crm_leads').update({visitas:newVisitas}).eq('id',leadId)
    setLeads(ls => ls.map(l => l.id===leadId ? {...l,visitas:newVisitas} : l))
  }

  const ESTADO_COLORS = {
    solicitada: { bg:'#EFF6FF', col:'#1d4ed8', label:'⏳ Solicitada' },
    confirmada:  { bg:'#DCFCE7', col:'#14532d', label:'✅ Confirmada' },
    rechazada:   { bg:'#FEF2F2', col:'#991b1b', label:'❌ Rechazada' },
  }

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,paddingBottom:12,borderBottom:'2px solid #E8EFFE',flexWrap:'wrap'}}>
        <span style={{fontSize:26}}>📅</span>
        <div style={{flex:1}}>
          <div style={{fontSize:16,fontWeight:800,color:B.primary}}>Gestión de Visitas</div>
          <div style={{fontSize:12,color:B.mid}}>{allVisitas.length} visita(s) en total · Confirma, rechaza o deja un mensaje al broker</div>
        </div>
        {/* Filter tabs */}
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          {[['all','Todas'],['solicitada','⏳ Pendientes'],['confirmada','✅ Confirmadas'],['rechazada','❌ Rechazadas']].map(([k,l])=>(
            <button key={k} onClick={()=>setFilter(k)}
              style={{padding:'5px 12px',borderRadius:8,border:'none',cursor:'pointer',fontSize:12,fontWeight:700,
                background:filter===k?B.primary:'#f0f4ff',color:filter===k?'#fff':B.mid}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {filtered.length===0 && (
        <div style={{textAlign:'center',color:B.mid,padding:'40px 20px',background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,fontSize:13}}>
          No hay visitas {filter!=='all'?`con estado "${filter}"`:''} registradas.
        </div>
      )}

      <div style={{display:'grid',gap:10}}>
        {filtered.map(({lead,leadId,vi,v,brokerName,brokerPhone,brokerEmail})=>{
          const ec = ESTADO_COLORS[v.estado]||ESTADO_COLORS.solicitada
          return (
            <div key={leadId+'-'+vi} style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:16}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
                {/* Info */}
                <div style={{flex:1,minWidth:200}}>
                  <div style={{fontWeight:800,fontSize:14,color:'#0F172A',marginBottom:2}}>
                    {lead.nombre}
                  </div>
                  <div style={{fontSize:12,color:B.mid,marginBottom:6}}>
                    📅 <strong>{v.fecha}</strong> a las <strong>{v.hora}</strong>
                    {v.proyecto && <span> · 🏠 {v.proyecto}</span>}
                  </div>
                  <div style={{fontSize:12,color:'#374151',marginBottom:4}}>
                    👤 Broker: <strong>{brokerName}</strong>
                    {brokerPhone && <a href={`https://wa.me/${brokerPhone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" style={{marginLeft:8,color:'#25D366',fontWeight:700,fontSize:11}}>💬 WA</a>}
                  </div>
                  {v.comentario && <div style={{fontSize:11,color:'#6b7280',background:'#f9fbff',padding:'5px 8px',borderRadius:6,marginBottom:4}}>Nota broker: {v.comentario}</div>}
                  {v.mensaje_ops && <div style={{fontSize:11,color:'#166534',background:'#DCFCE7',padding:'5px 8px',borderRadius:6,border:'1px solid #86efac'}}>💬 Tu mensaje: {v.mensaje_ops}</div>}
                </div>
                {/* Controls */}
                <div style={{display:'flex',flexDirection:'column',gap:8,alignItems:'flex-end',minWidth:160}}>
                  <span style={{fontSize:12,padding:'4px 10px',borderRadius:99,background:ec.bg,color:ec.col,fontWeight:700}}>{ec.label}</span>
                  <div style={{display:'flex',gap:6}}>
                    <button onClick={()=>updateVisita(leadId,vi,{estado:'confirmada',confirmado_por:me?.name||'Ops',confirmado_at:new Date().toISOString()})}
                      style={{padding:'5px 12px',borderRadius:8,border:'none',background:'#059669',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:700}}>
                      ✅ Confirmar
                    </button>
                    <button onClick={()=>updateVisita(leadId,vi,{estado:'rechazada',confirmado_por:me?.name||'Ops',confirmado_at:new Date().toISOString()})}
                      style={{padding:'5px 12px',borderRadius:8,border:'none',background:'#dc2626',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:700}}>
                      ❌ Rechazar
                    </button>
                  </div>
                  <button onClick={()=>{setMsgModal({leadId,vi,v});setMsgText(v.mensaje_ops||'')}}
                    style={{padding:'5px 12px',borderRadius:8,border:'1px solid #A8C0F0',background:B.light,color:B.primary,cursor:'pointer',fontSize:12,fontWeight:600,width:'100%'}}>
                    💬 {v.mensaje_ops?'Editar mensaje':'Dejar mensaje al broker'}
                  </button>
                  {/* Reagendar */}
                  <details style={{width:'100%'}}>
                    <summary style={{fontSize:11,color:B.mid,cursor:'pointer',padding:'4px 0',fontWeight:600}}>✏️ Modificar fecha/hora</summary>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:6}}>
                      <input type="date" defaultValue={v.fecha}
                        onChange={e=>updateVisita(leadId,vi,{fecha:e.target.value})}
                        style={{...sty.inp,padding:'5px 8px',fontSize:11}}/>
                      <input type="time" defaultValue={v.hora}
                        onChange={e=>updateVisita(leadId,vi,{hora:e.target.value})}
                        style={{...sty.inp,padding:'5px 8px',fontSize:11}}/>
                    </div>
                    <input placeholder="Modificar proyecto/lugar" defaultValue={v.proyecto}
                      onChange={e=>updateVisita(leadId,vi,{proyecto:e.target.value})}
                      style={{...sty.inp,padding:'5px 8px',fontSize:11,marginTop:4}}/>
                  </details>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal: mensaje al broker */}
      {msgModal && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:16,padding:24,maxWidth:440,width:'100%',boxShadow:'0 20px 60px rgba(0,0,0,0.15)'}}>
            <div style={{fontWeight:800,fontSize:15,color:B.primary,marginBottom:4}}>💬 Mensaje al broker</div>
            <div style={{fontSize:12,color:B.mid,marginBottom:12}}>Este mensaje lo verá el broker en su lista de visitas.</div>
            <textarea value={msgText} onChange={e=>setMsgText(e.target.value)}
              placeholder="Ej: La visita fue confirmada para las 11am. Por favor llegar 10 min antes..."
              style={{...sty.inp,minHeight:80,resize:'vertical',marginBottom:12}}/>
            <div style={{display:'flex',gap:8}}>
              <button onClick={async()=>{
                await updateVisita(msgModal.leadId, msgModal.vi, {mensaje_ops:msgText})
                setMsgModal(null); setMsgText('')
              }} style={{flex:1,padding:'10px',borderRadius:8,border:'none',background:B.primary,color:'#fff',fontWeight:700,cursor:'pointer'}}>
                Guardar mensaje
              </button>
              <button onClick={()=>{setMsgModal(null);setMsgText('')}}
                style={{flex:1,padding:'10px',borderRadius:8,border:'1px solid #E2E8F0',background:'#fff',cursor:'pointer',fontWeight:600}}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Mis Visitas View (Broker) ────────────────────────────────────────────────
function MisVisitasView({ leads, me, users }) {
  const B = { primary:'#1B4FC8', light:'#EEF2FF', mid:'#6b7280' }
  const [filter, setFilter] = React.useState('all')

  const misVisitas = React.useMemo(() => {
    const rows = []
    for (const lead of leads) {
      for (let vi = 0; vi < (lead.visitas||[]).length; vi++) {
        const v = lead.visitas[vi]
        if (v.broker_id === me.id || v.broker_name === me.name) {
          rows.push({ lead, vi, v })
        }
      }
    }
    return rows.sort((a,b)=>(b.v.fecha+b.v.hora).localeCompare(a.v.fecha+a.v.hora))
  }, [leads, me])

  const filtered = filter==='all' ? misVisitas : misVisitas.filter(x=>x.v.estado===filter)

  const ESTADO = {
    solicitada: { bg:'#EFF6FF', col:'#1d4ed8', label:'⏳ Pendiente confirmación' },
    confirmada:  { bg:'#DCFCE7', col:'#14532d', label:'✅ Confirmada' },
    rechazada:   { bg:'#FEF2F2', col:'#991b1b', label:'❌ Rechazada' },
  }

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,paddingBottom:12,borderBottom:'2px solid #E8EFFE',flexWrap:'wrap'}}>
        <span style={{fontSize:26}}>📅</span>
        <div style={{flex:1}}>
          <div style={{fontSize:16,fontWeight:800,color:B.primary}}>Mis Visitas</div>
          <div style={{fontSize:12,color:B.mid}}>{misVisitas.length} visita(s) programada(s)</div>
        </div>
        <div style={{display:'flex',gap:4}}>
          {[['all','Todas'],['solicitada','⏳ Pendientes'],['confirmada','✅ Confirmadas'],['rechazada','❌ Rechazadas']].map(([k,l])=>(
            <button key={k} onClick={()=>setFilter(k)}
              style={{padding:'5px 10px',borderRadius:8,border:'none',cursor:'pointer',fontSize:11,fontWeight:700,
                background:filter===k?B.primary:'#f0f4ff',color:filter===k?'#fff':B.mid}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {filtered.length===0 && (
        <div style={{textAlign:'center',color:B.mid,padding:'40px 20px',background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,fontSize:13}}>
          {misVisitas.length===0 ? 'Aún no has solicitado visitas. Hazlo desde la ficha de un lead.' : `Sin visitas con este filtro.`}
        </div>
      )}

      <div style={{display:'grid',gap:10}}>
        {filtered.map(({lead,vi,v})=>{
          const ec = ESTADO[v.estado]||ESTADO.solicitada
          return (
            <div key={lead.id+'-'+vi} style={{background:'#fff',border:'2px solid '+ec.bg.replace('FF','AA'),borderRadius:12,padding:14}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10,flexWrap:'wrap'}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:14,color:'#0F172A',marginBottom:4}}>{lead.nombre}</div>
                  <div style={{fontSize:13,color:'#374151',marginBottom:4}}>
                    📅 <strong>{v.fecha}</strong> a las <strong>{v.hora}</strong>
                  </div>
                  {v.proyecto && <div style={{fontSize:12,color:B.mid}}>🏠 {v.proyecto}</div>}
                  {v.comentario && <div style={{fontSize:11,color:'#6b7280',marginTop:4}}>Tu nota: {v.comentario}</div>}
                </div>
                <div style={{textAlign:'right'}}>
                  <span style={{display:'block',fontSize:12,padding:'5px 12px',borderRadius:99,background:ec.bg,color:ec.col,fontWeight:700,marginBottom:6}}>
                    {ec.label}
                  </span>
                  {v.confirmado_por && <div style={{fontSize:10,color:B.mid}}>Por: {v.confirmado_por}</div>}
                </div>
              </div>
              {/* Mensaje de operaciones */}
              {v.mensaje_ops && (
                <div style={{marginTop:10,padding:'8px 12px',background:'#F0FDF4',border:'1px solid #86efac',borderRadius:8,fontSize:12,color:'#14532d'}}>
                  <div style={{fontWeight:700,marginBottom:2}}>💬 Mensaje de Operaciones:</div>
                  {v.mensaje_ops}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}


function MarketplaceView({ config, setConfig, isAdmin, supabase, dbReady, me }) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState({...config})
  const [saving, setSaving] = React.useState(false)
  const [iframeError, setIframeError] = React.useState(false)
  const [iframeKey, setIframeKey] = React.useState(0)

  const ROLES = ['admin','agent','partner']

  const save = async () => {
    setSaving(true)
    try {
      const next = { ...draft }
      setConfig(next)
      if (supabase && dbReady) {
        await supabase.from('crm_settings').upsert({ key: 'marketplace_config', value: next })
      }
      setEditing(false)
      setIframeError(false)
      setIframeKey(k => k + 1)
    } catch(e) { alert('Error guardando: ' + e.message) }
    finally { setSaving(false) }
  }

  const label = config.label || 'Marketplace'

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,paddingBottom:12,borderBottom:'2px solid #E8EFFE',flexWrap:'wrap'}}>
        <div style={{fontSize:28}}>🏪</div>
        <div style={{flex:1}}>
          <div style={{fontSize:16,fontWeight:800,color:B.primary}}>{label}</div>
          {config.url && <div style={{fontSize:11,color:B.mid,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:400}}>{config.url}</div>}
        </div>
        {isAdmin && (
          <button onClick={()=>{setDraft({...config});setEditing(v=>!v)}}
            style={{...sty.btn,fontSize:12}}>
            {editing ? '✕ Cancelar' : '⚙️ Configurar'}
          </button>
        )}
      </div>

      {/* Admin config panel */}
      {isAdmin && editing && (
        <div style={{background:'#fff',border:'1px solid #E2E8F0',borderRadius:12,padding:'20px',marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,color:B.primary,marginBottom:14}}>⚙️ Configuración del Marketplace</div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
            <div>
              <label style={{fontSize:12,fontWeight:600,color:'#374151',display:'block',marginBottom:4}}>URL del marketplace</label>
              <input value={draft.url||''} onChange={e=>setDraft(p=>({...p,url:e.target.value}))}
                placeholder="https://app.tumarketplace.com"
                style={{...sty.inp,fontSize:12}}/>
              <div style={{fontSize:10,color:B.mid,marginTop:3}}>El sitio se cargará dentro del CRM via iframe.</div>
            </div>
            <div>
              <label style={{fontSize:12,fontWeight:600,color:'#374151',display:'block',marginBottom:4}}>Nombre de la pestaña</label>
              <input value={draft.label||''} onChange={e=>setDraft(p=>({...p,label:e.target.value}))}
                placeholder="Marketplace"
                style={{...sty.inp,fontSize:12}}/>
            </div>
          </div>

          <div style={{marginBottom:16}}>
            <label style={{fontSize:12,fontWeight:600,color:'#374151',display:'block',marginBottom:8}}>Roles que pueden ver el marketplace</label>
            <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
              {ROLES.map(role => {
                const active = (draft.allowRoles||[]).includes(role)
                return (
                  <button key={role} onClick={()=>{
                    const arr = draft.allowRoles||[]
                    setDraft(p=>({...p, allowRoles: active ? arr.filter(r=>r!==role) : [...arr,role]}))
                  }} style={{fontSize:12,padding:'5px 14px',borderRadius:8,border:'none',cursor:'pointer',fontWeight:600,
                    background:active?B.primary:'#f0f4ff',color:active?'#fff':B.mid}}>
                    {role}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <button onClick={()=>setDraft(p=>({...p,enabled:!p.enabled}))}
                style={{width:40,height:22,borderRadius:11,border:'none',cursor:'pointer',
                  background:draft.enabled?B.primary:'#d1d5db',position:'relative',transition:'background .2s'}}>
                <div style={{width:18,height:18,borderRadius:'50%',background:'#fff',position:'absolute',top:2,
                  left:draft.enabled?20:2,transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
              </button>
              <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>
                {draft.enabled ? '\ud83d\udfe2 Pestaña visible para usuarios' : '\u26ab Pestaña oculta'}
              </span>
            </div>
          </div>

          <div style={{padding:'10px 14px',background:'#FFF7ED',border:'1px solid #fdba74',borderRadius:8,fontSize:11,color:'#92400e',marginBottom:14}}>
            \u26a0\ufe0f <strong>Importante:</strong> Algunos sitios bloquean cargarse dentro de iframes (X-Frame-Options). Si el marketplace muestra un error, contacta al soporte del marketplace para que habiliten el acceso por iframe, o usa una URL alternativa que lo permita.
          </div>

          <div style={{display:'flex',gap:8}}>
            <button onClick={save} disabled={saving||!draft.url}
              style={{...sty.btnP,opacity:saving||!draft.url?0.5:1}}>
              {saving ? 'Guardando...' : '\ud83d\udcbe Guardar configuración'}
            </button>
            {draft.url && (
              <a href={draft.url} target="_blank" rel="noopener noreferrer"
                style={{...sty.btn,textDecoration:'none',display:'flex',alignItems:'center',gap:4,fontSize:12}}>
                \ud83d\udd17 Abrir en nueva pestaña
              </a>
            )}
          </div>
        </div>
      )}

      {/* Iframe area */}
      {config.enabled && config.url ? (
        <div style={{position:'relative',borderRadius:12,overflow:'hidden',border:'1px solid #E2E8F0',background:'#f9fbff'}}>
          {iframeError && (
            <div style={{padding:'32px',textAlign:'center',color:'#374151'}}>
              <div style={{fontSize:40,marginBottom:12}}>\ud83d\udeab</div>
              <div style={{fontSize:15,fontWeight:700,marginBottom:8}}>Este sitio no permite cargarse en iframe</div>
              <div style={{fontSize:13,color:B.mid,marginBottom:16}}>El marketplace bloqueó la carga dentro del CRM. Puedes abrirlo en una pestaña nueva.</div>
              <div style={{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap'}}>
                <a href={config.url} target="_blank" rel="noopener noreferrer"
                  style={{...sty.btnP,textDecoration:'none',display:'inline-flex',alignItems:'center',gap:6}}>
                  \ud83d\udd17 Abrir {label} en nueva pestaña
                </a>
                {isAdmin && (
                  <button onClick={()=>{setIframeError(false);setIframeKey(k=>k+1)}} style={sty.btn}>
                    \ud83d\udd04 Reintentar
                  </button>
                )}
              </div>
            </div>
          )}
          <iframe
            key={iframeKey}
            src={config.url}
            title={label}
            onError={() => setIframeError(true)}
            onLoad={e => {
              // Try to detect X-Frame-Options block
              try {
                const doc = e.target.contentDocument
                if (!doc || doc.URL === 'about:blank') setIframeError(true)
              } catch(_) {
                // Cross-origin \u2014 can't read, but likely loaded OK
              }
            }}
            style={{
              width: '100%',
              height: 'calc(100vh - 180px)',
              border: 'none',
              display: iframeError ? 'none' : 'block'
            }}
            allow="fullscreen; payment; clipboard-read; clipboard-write"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
          />
        </div>
      ) : !isAdmin ? (
        <div style={{textAlign:'center',padding:'60px 20px',color:B.mid}}>
          <div style={{fontSize:48,marginBottom:12}}>🏪</div>
          <div style={{fontSize:15,fontWeight:600,marginBottom:8}}>Marketplace no disponible</div>
          <div style={{fontSize:13}}>El administrador aún no ha configurado el marketplace.</div>
        </div>
      ) : !editing && (
        <div style={{textAlign:'center',padding:'60px 20px',color:B.mid,background:'#f9fbff',borderRadius:12,border:'2px dashed #dce8ff'}}>
          <div style={{fontSize:48,marginBottom:12}}>🏪</div>
          <div style={{fontSize:15,fontWeight:700,color:B.primary,marginBottom:8}}>Configura tu Marketplace</div>
          <div style={{fontSize:13,marginBottom:20}}>Pega la URL del marketplace y elige qué roles pueden verlo.</div>
          <button onClick={()=>{setDraft({...config});setEditing(true)}} style={sty.btnP}>
            ⚙️ Configurar ahora
          </button>
        </div>
      )}
    </div>
  )
}

