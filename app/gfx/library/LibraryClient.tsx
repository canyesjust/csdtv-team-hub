'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseRosterCsv, type Player } from '@/lib/graphics/rosters'
import { formatDuration } from '@/lib/graphics/timing'

type AudioAsset = { id: string; name: string; kind: string; duration_seconds: number | null; file_size_bytes: number | null }
type Roster = { id: string; name: string; school_code: string | null; sport: string | null; season: string | null; count: number }
type Sponsor = { id: string; name: string; tagline: string | null; scope: string; school_code: string | null; active: boolean }
type Channel = { id: string; slug: string; name: string; note: string | null; output_token: string; control_token: string; listening: boolean; panel_enabled: boolean }
type School = { code: string; short_name: string | null; name: string | null }

type Tab = 'audio' | 'rosters' | 'sponsors' | 'outputs'

const mb = (bytes: number | null) => (bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '')

export default function LibraryClient({
  audio, rosters, sponsors, channels, schools,
}: {
  audio: AudioAsset[]; rosters: Roster[]; sponsors: Sponsor[]; channels: Channel[]; schools: School[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('audio')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const say = (good: string | null, bad: string | null) => { setOk(good); setError(bad) }

  return (
    <>
      <div className="gfx-bar">
        <div className="brand">CSDtv<small>Library</small></div>
        <a href="/gfx" className="gfx-btn sm ghost" style={{ textDecoration: 'none' }}>← Shows</a>
        <a href="/dashboard" className="gfx-btn sm ghost" style={{ textDecoration: 'none' }}>Hub</a>
        <div className="gfx-spacer" />
        {error && <span style={{ color: '#ff9ba4', fontSize: 11.5 }}>{error}</span>}
        {ok && <span style={{ color: '#8fe0b8', fontSize: 11.5 }}>{ok}</span>}
      </div>
      <div className="gfx-body">
        <div className="lb-wrap">
          <div className="lb-tabs">
            {(['audio', 'rosters', 'sponsors', 'outputs'] as Tab[]).map(t => (
              <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {tab === 'audio' && <AudioTab assets={audio} onDone={say} refresh={() => router.refresh()} />}
          {tab === 'rosters' && <RosterTab rosters={rosters} schools={schools} onDone={say} refresh={() => router.refresh()} />}
          {tab === 'sponsors' && <SponsorTab sponsors={sponsors} schools={schools} onDone={say} refresh={() => router.refresh()} />}
          {tab === 'outputs' && <OutputsTab channels={channels} onSay={say} />}
        </div>
      </div>
    </>
  )
}

type Say = (ok: string | null, err: string | null) => void

function AudioTab({ assets, onDone, refresh }: { assets: AudioAsset[]; onDone: Say; refresh: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState('vo')
  const [busy, setBusy] = useState(false)

  /** Read the real duration in the browser so the row estimate can match it. */
  const durationOf = (file: File) =>
    new Promise<number | null>(resolve => {
      const url = URL.createObjectURL(file)
      const el = new Audio(url)
      el.addEventListener('loadedmetadata', () => {
        URL.revokeObjectURL(url)
        resolve(Number.isFinite(el.duration) ? Math.round(el.duration) : null)
      })
      el.addEventListener('error', () => { URL.revokeObjectURL(url); resolve(null) })
    })

  const upload = useCallback(async (file: File) => {
    setBusy(true)
    onDone(null, null)
    try {
      const seconds = await durationOf(file)
      const form = new FormData()
      form.append('file', file)
      form.append('name', file.name.replace(/\.[^.]+$/, ''))
      form.append('kind', kind)
      if (seconds) form.append('duration_seconds', String(seconds))

      const res = await fetch('/api/gfx/audio-assets', { method: 'POST', body: form })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) onDone(null, typeof body?.error === 'string' ? body.error : 'Upload failed')
      else { onDone(`${file.name} uploaded`, null); refresh() }
    } catch {
      onDone(null, 'Could not reach the server')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [kind, onDone, refresh])

  return (
    <div className="lb-card">
      <h3>Audio<span className="gfx-spacer" /><span className="gfx-note">{assets.length} clips</span></h3>
      <div className="lb-in">
        {assets.length === 0 ? (
          <p className="gfx-note">Nothing uploaded yet.</p>
        ) : assets.map(a => (
          <div key={a.id} className="lb-row">
            <span style={{ flex: 1 }}>
              <div className="nm">{a.name}</div>
              <div className="sub">
                {a.kind}
                {a.duration_seconds ? ` · ${formatDuration(a.duration_seconds)}` : ''}
                {a.file_size_bytes ? ` · ${mb(a.file_size_bytes)}` : ''}
              </div>
            </span>
          </div>
        ))}

        <div className="lb-form">
          <div className="lb-g2">
            <select value={kind} onChange={e => setKind(e.target.value)}>
              <option value="vo">Voiceover, a prevoiced tease or a sponsor read</option>
              <option value="stinger">Stinger, a short sting or bumper</option>
              <option value="bed">Bed, loops under a slate</option>
              <option value="sfx">Effect</option>
            </select>
            <input ref={fileRef} type="file" accept="audio/*" disabled={busy}
              onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f) }} />
          </div>
          <p className="gfx-note">
            Up to 60 MB. The clip length is read on upload, so a prevoiced tease can set its row estimate
            to its own duration in one click.
          </p>
        </div>
      </div>
    </div>
  )
}

function RosterTab({
  rosters, schools, onDone, refresh,
}: { rosters: Roster[]; schools: School[]; onDone: Say; refresh: () => void }) {
  const [name, setName] = useState('')
  const [schoolCode, setSchoolCode] = useState('')
  const [sport, setSport] = useState('')
  const [season, setSeason] = useState('')
  const [csv, setCsv] = useState('')
  const [busy, setBusy] = useState(false)

  const parsed: Player[] = csv.trim() ? parseRosterCsv(csv) : []

  const save = async () => {
    if (!name.trim() || parsed.length === 0) return
    setBusy(true)
    try {
      const res = await fetch('/api/gfx/rosters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, school_code: schoolCode || null, sport, season, players: parsed }),
      })
      if (res.ok) {
        onDone(`${name} saved with ${parsed.length} players`, null)
        setName(''); setCsv(''); setSport(''); setSeason('')
        refresh()
      } else onDone(null, 'Could not save the roster')
    } catch { onDone(null, 'Could not reach the server') } finally { setBusy(false) }
  }

  return (
    <div className="lb-card">
      <h3>Rosters<span className="gfx-spacer" /><span className="gfx-note">{rosters.length} saved</span></h3>
      <div className="lb-in">
        {rosters.length === 0 ? (
          <p className="gfx-note">Nothing saved yet.</p>
        ) : rosters.map(r => (
          <div key={r.id} className="lb-row">
            <span style={{ flex: 1 }}>
              <div className="nm">{r.name}</div>
              <div className="sub">
                {r.count} players
                {r.sport ? ` · ${r.sport}` : ''}
                {r.season ? ` · ${r.season}` : ''}
                {r.school_code ? ` · ${r.school_code}` : ''}
              </div>
            </span>
          </div>
        ))}

        <div className="lb-form">
          <div className="lb-g3">
            <input placeholder="Corner Canyon Boys Basketball" value={name} onChange={e => setName(e.target.value)} />
            <input placeholder="Sport" value={sport} onChange={e => setSport(e.target.value)} />
            <input placeholder="Season" value={season} onChange={e => setSeason(e.target.value)} />
          </div>
          <select value={schoolCode} onChange={e => setSchoolCode(e.target.value)}>
            <option value="">School…</option>
            {schools.map(s => <option key={s.code} value={s.code}>{s.short_name || s.name || s.code}</option>)}
          </select>
          <textarea placeholder={'Paste a roster CSV. A MaxPreps export works as-is:\njersey,firstname,lastname,position1,classyear'}
            value={csv} onChange={e => setCsv(e.target.value)} />

          {parsed.length > 0 && (
            <>
              <p className="gfx-note">{parsed.length} players. Check it before saving.</p>
              <div className="lb-prev">
                <table>
                  <thead><tr><th>#</th><th>Name</th><th>Class</th><th>Position</th></tr></thead>
                  <tbody>
                    {parsed.map((p, i) => (
                      <tr key={i}><td>{p.jersey}</td><td>{p.name}</td><td>{p.cls}</td><td>{p.pos}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <button className="gfx-btn take" disabled={busy || !name.trim() || parsed.length === 0} onClick={() => void save()}>
            Save the roster
          </button>
        </div>
      </div>
    </div>
  )
}

function SponsorTab({
  sponsors, schools, onDone, refresh,
}: { sponsors: Sponsor[]; schools: School[]; onDone: Say; refresh: () => void }) {
  const [name, setName] = useState('')
  const [tagline, setTagline] = useState('')
  const [scope, setScope] = useState('district')
  const [schoolCode, setSchoolCode] = useState('')

  const add = async () => {
    if (!name.trim()) return
    const res = await fetch('/api/gfx/sponsors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, tagline, scope, school_code: scope === 'school' ? schoolCode : null }),
    })
    if (res.ok) { onDone(`${name} added`, null); setName(''); setTagline(''); refresh() }
    else onDone(null, 'Could not save the sponsor')
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/gfx/sponsors?id=${id}`, { method: 'DELETE' })
    if (res.ok) refresh()
  }

  return (
    <div className="lb-card">
      <h3>Sponsors<span className="gfx-spacer" /><span className="gfx-note">{sponsors.length}</span></h3>
      <div className="lb-in">
        <p className="gfx-note" style={{ marginBottom: 9 }}>
          District sponsors carry into every new show, switched on. Untick one on the show if it should not
          run tonight. The bug, the rotation, the intermission strip and the side panel all read one list.
        </p>
        {sponsors.map(s => (
          <div key={s.id} className="lb-row">
            <span style={{ flex: 1 }}>
              <div className="nm">{s.name}</div>
              <div className="sub">{s.scope}{s.school_code ? ` · ${s.school_code}` : ''}{s.tagline ? ` · ${s.tagline}` : ''}</div>
            </span>
            <button className="gfx-btn sm ghost" style={{ color: '#ff9ba4', borderColor: 'var(--gx-live)' }}
              onClick={() => void remove(s.id)}>Remove</button>
          </div>
        ))}

        <div className="lb-form">
          <div className="lb-g2">
            <input placeholder="Sponsor name" value={name} onChange={e => setName(e.target.value)} />
            <input placeholder="Tagline (optional)" value={tagline} onChange={e => setTagline(e.target.value)} />
          </div>
          <div className="lb-g2">
            <select value={scope} onChange={e => setScope(e.target.value)}>
              <option value="district">District, carries to every show</option>
              <option value="school">School</option>
            </select>
            {scope === 'school' && (
              <select value={schoolCode} onChange={e => setSchoolCode(e.target.value)}>
                <option value="">School…</option>
                {schools.map(s => <option key={s.code} value={s.code}>{s.short_name || s.name || s.code}</option>)}
              </select>
            )}
          </div>
          <button className="gfx-btn take" disabled={!name.trim()} onClick={() => void add()}>Add the sponsor</button>
        </div>
      </div>
    </div>
  )
}

function OutputsTab({
  channels, onSay,
}: {
  channels: Channel[]
  onSay: (good: string | null, bad: string | null) => void
}) {
  const router = useRouter()
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const [shown, setShown] = useState<string | null>(null)

  const patchChannel = async (id: string, body: Record<string, unknown>, done: string) => {
    const res = await fetch(`/api/gfx/channels/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    if (!res || !res.ok) { onSay(null, 'That did not save.'); return }
    onSay(done, null)
    router.refresh()
  }

  return (
    <div className="lb-card">
      <h3>Output channels<span className="gfx-spacer" /><span className="gfx-note">URLs belong to machines, not shows</span></h3>
      <div className="lb-in">
        <p className="gfx-note" style={{ marginBottom: 10 }}>
          Set these once per machine in OBS and never re-paste them. Assign a different show to the channel
          and the page already open follows it.
        </p>
        <p className="gfx-note" style={{ marginBottom: 12 }}>
          <b>Listening</b> is the rig&rsquo;s ear. Off, every output page on it checks back every two minutes.
          On, they run at broadcast cadence. It switches itself on when a show on the rig goes to rehearsal or
          live and off when the show wraps, so this is only the manual override.
        </p>
        {channels.map(c => (
          <div key={c.id} style={{ marginBottom: 18 }}>
            <div className="lb-row" style={{ marginBottom: 4 }}>
              <span style={{ flex: 1 }}>
                <div className="nm">{c.name}</div>
                <div className="sub">{c.note || c.slug}</div>
              </span>
              <button className={`gfx-btn sm ${c.listening ? 'on' : 'ghost'}`}
                title={c.listening
                  ? 'Output pages on this rig are polling at broadcast cadence'
                  : 'Output pages on this rig check back every two minutes'}
                onClick={() => void patchChannel(c.id, { listening: !c.listening },
                  c.listening ? 'Rig asleep. Outputs drop to a two minute check.' : 'Rig listening.')}>
                {c.listening ? 'Listening' : 'Idle'}
              </button>
            </div>
            {[
              ['Graphics browser source', `${origin}/gfx/${c.slug}/out?k=${c.output_token}`],
              ['Audio browser source', `${origin}/gfx/${c.slug}/audio?k=${c.output_token}`],
              ['Prompter', `${origin}/gfx/${c.slug}/prompter?k=${c.output_token}`],
            ].map(([label, url]) => (
              <div key={label} style={{ marginBottom: 4 }}>
                <div className="gfx-note" style={{ marginBottom: 2 }}>{label}</div>
                <code className="gfx-url">{url}</code>
              </div>
            ))}

            <div className="lb-row" style={{ marginTop: 8 }}>
              <span style={{ flex: 1 }}>
                <div className="nm" style={{ fontSize: 12.5 }}>Hardware panel</div>
                <div className="sub">Companion, a Stream Deck, a foot pedal</div>
              </span>
              <button className={`gfx-btn sm ${c.panel_enabled ? 'on' : 'ghost'}`}
                onClick={() => void patchChannel(c.id, { panel_enabled: !c.panel_enabled },
                  c.panel_enabled ? 'Panel control off.' : 'Panel control on.')}>
                {c.panel_enabled ? 'On' : 'Off'}
              </button>
            </div>
            {c.panel_enabled && (
              <>
                <div className="gfx-note" style={{ margin: '4px 0 2px' }}>Endpoint</div>
                <code className="gfx-url">POST {origin}/api/gfx/{c.slug}/cmd</code>
                <div className="gfx-note" style={{ margin: '4px 0 2px' }}>
                  Control token
                  <button className="gfx-btn sm ghost" style={{ marginLeft: 8 }}
                    onClick={() => setShown(shown === c.id ? null : c.id)}>
                    {shown === c.id ? 'Hide' : 'Show'}
                  </button>
                  <button className="gfx-btn sm ghost" style={{ marginLeft: 5 }}
                    onClick={() => void patchChannel(c.id, { action: 'rotate_control_token' }, 'New token. Re-paste it into the panel.')}>
                    Rotate
                  </button>
                </div>
                <code className="gfx-url">
                  {shown === c.id ? `Authorization: Bearer ${c.control_token}` : 'Authorization: Bearer \u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                </code>
                <p className="gfx-note" style={{ marginTop: 6 }}>
                  This is not the OBS token. The output token is read-only on purpose and cannot take a
                  graphic. Body is <code>{'{ "action": "take_next" }'}</code>. Also accepted:
                  <code> take_prev</code>, <code>take_row</code> with a page number, <code>clear</code>,
                  <code> clear_all</code>, <code>shelf</code> with a slot number, <code>prompter</code>,
                  <code> audio_stop</code>, <code>status</code>. A panel that can only fire a URL can use
                  <code> GET ?k=TOKEN&amp;a=take_next</code>.
                </p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
