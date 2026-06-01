'use client'

import { EXTERNAL_COST_DEFAULTS, getDefaultExternalCostForType } from '@/lib/external-production-costs'

interface Production {
  id: string
  request_type_label: string | null
  estimated_external_cost: number | null
}

interface CameraPackageRow {
  option_id: number
  label: string
  cost: number
}

export interface ReportsValueTabProps {
  costSavings: number
  costByType: [string, number][]
  maxCost: number
  fp: Production[]
  cameraPackages: CameraPackageRow[]
  recomputing: boolean
  onRecomputeAll: () => void
  text: string
  muted: string
  border: string
  cardBg: string
}

export default function ReportsValueTab({
  costSavings,
  costByType,
  maxCost,
  fp,
  cameraPackages,
  recomputing,
  onRecomputeAll,
  text,
  muted,
  border,
  cardBg,
}: ReportsValueTabProps) {
  const pctBar = (value: number, max: number, color: string) => {
    const pct = max ? (value / max) * 100 : 0
    return (
      <div style={{ flex: 1, height: '8px', background: 'var(--surface-2)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px' }} />
      </div>
    )
  }

  const sectionCard = (title: string, children: React.ReactNode) => (
    <div style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: '14px', padding: '20px', marginBottom: '14px' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: '0.8px', margin: '0 0 16px' }}>{title}</h3>
      {children}
    </div>
  )

  return (
    <div>
      <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '16px', padding: '28px', marginBottom: '20px', textAlign: 'center' as const }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: '#22c55e', margin: '0 0 8px', textTransform: 'uppercase' as const, letterSpacing: '1px' }}>Estimated value of CSDtv productions</p>
        <p style={{ fontSize: '48px', fontWeight: 800, color: '#22c55e', margin: '0 0 4px', lineHeight: 1 }}>${costSavings.toLocaleString()}</p>
        <p style={{ fontSize: '14px', color: muted, margin: 0 }}>Based on estimated external production costs for {fp.length} productions</p>
      </div>
      <div style={{ marginBottom: '16px' }}>
        <button
          type="button"
          onClick={() => void onRecomputeAll()}
          disabled={recomputing}
          style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '8px', background: cardBg, border: `0.5px solid ${border}`, color: muted, cursor: recomputing ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          {recomputing ? 'Recomputing…' : 'Recompute all costs'}
        </button>
      </div>
      <p style={{ fontSize: '13px', color: muted, marginBottom: '16px' }}>
        These estimates reflect what an outside production company would charge for each type of work. Override individual production costs in the production detail page. Default rates shown below.
      </p>
      {sectionCard('Value by production type', (
        <div>
          {costByType.map(([type, cost]) => {
            const count = fp.filter(p => (p.request_type_label || 'Other') === type).length
            const perUnit = getDefaultExternalCostForType(type)
            return (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: `0.5px solid ${border}` }}>
                <span style={{ fontSize: '13px', color: text, minWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{type}</span>
                {pctBar(cost, maxCost, '#22c55e')}
                <span style={{ fontSize: '13px', color: muted, minWidth: '80px', textAlign: 'right' as const }}>{count} × ${perUnit}</span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#22c55e', minWidth: '80px', textAlign: 'right' as const }}>${cost.toLocaleString()}</span>
              </div>
            )
          })}
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 0', gap: '12px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: text }}>Total:</span>
            <span style={{ fontSize: '15px', fontWeight: 800, color: '#22c55e' }}>${costSavings.toLocaleString()}</span>
          </div>
        </div>
      ))}
      {sectionCard('Camera package rates', (
        <div>
          <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px' }}>These are the per-package rates used when a production has a camera_options value set. Edit in Supabase to update.</p>
          {cameraPackages.length === 0 ? (
            <p style={{ fontSize: '13px', color: muted, margin: 0 }}>No active camera packages found.</p>
          ) : cameraPackages.map(row => (
            <div key={row.option_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `0.5px solid ${border}`, fontSize: '13px' }}>
              <span style={{ color: text }}>{row.label}</span>
              <span style={{ color: muted, fontWeight: 500 }}>${Number(row.cost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          ))}
        </div>
      ))}
      {sectionCard('Default external cost rates', (
        <div>
          <p style={{ fontSize: '13px', color: muted, margin: '0 0 12px' }}>These defaults apply when a production has no override. Set a per-production amount under <strong>Production → Info</strong> (Estimated external cost).</p>
          {Object.entries(EXTERNAL_COST_DEFAULTS).map(([type, cost]) => (
            <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `0.5px solid ${border}`, fontSize: '13px' }}>
              <span style={{ color: text }}>{type}</span>
              <span style={{ color: muted, fontWeight: 500 }}>${cost}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
