// Timer "bell" cue. Several synthesized chimes (no audio asset required) plus an
// optional custom uploaded sound. Best-effort: if the browser blocks audio (no
// user gesture yet) it simply no-ops.

export type BellChoice = 'classic' | 'soft' | 'triad' | 'ding' | 'beeps' | 'custom'

export const BELL_OPTIONS: { value: Exclude<BellChoice, 'custom'>; label: string; description: string }[] = [
  { value: 'classic', label: 'Classic', description: 'Three bright strikes' },
  { value: 'soft', label: 'Soft', description: 'One warm, gentle tone' },
  { value: 'triad', label: 'Chime', description: 'Rising three-note chime' },
  { value: 'beeps', label: 'Beeps', description: 'Clean triple beep (stage-timer style)' },
  { value: 'ding', label: 'Ding', description: 'Single clear ding' },
]

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = ctx || new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function strike(ac: AudioContext, start: number, freqs: number[], peak = 0.28, decay = 0.45) {
  for (const freq of freqs) {
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + decay)
    osc.connect(gain).connect(ac.destination)
    osc.start(start)
    osc.stop(start + decay + 0.05)
  }
}

function playSynth(choice: Exclude<BellChoice, 'custom'>) {
  const ac = getCtx()
  if (!ac) return
  const t = ac.currentTime
  if (choice === 'soft') {
    strike(ac, t, [523.25], 0.22, 1.1)
  } else if (choice === 'ding') {
    strike(ac, t, [987.77], 0.26, 0.8)
  } else if (choice === 'beeps') {
    // Clean, even triple beep — the crisp "time's up" cue stage timers use.
    for (let s = 0; s < 3; s++) strike(ac, t + s * 0.26, [988], 0.26, 0.16)
  } else if (choice === 'triad') {
    strike(ac, t, [523.25], 0.24, 0.5)
    strike(ac, t + 0.18, [659.25], 0.24, 0.5)
    strike(ac, t + 0.36, [783.99], 0.26, 0.9)
  } else {
    // classic — three bright double-strikes
    for (let s = 0; s < 3; s++) strike(ac, t + s * 0.5, [880, 1320], 0.28, 0.45)
  }
}

/**
 * Play the timer bell. Pass the operator's chosen bell; defaults to "classic".
 * For a custom uploaded sound, pass choice 'custom' and its URL.
 */
export function playBell(opts?: { choice?: BellChoice; customUrl?: string | null }) {
  if (typeof window === 'undefined') return
  try {
    const choice = opts?.choice ?? 'classic'
    if (choice === 'custom' && opts?.customUrl) {
      const audio = new Audio(opts.customUrl)
      audio.volume = 1
      void audio.play().catch(() => { /* blocked until a user gesture — ignore */ })
      return
    }
    playSynth(choice === 'custom' ? 'classic' : choice)
  } catch {
    /* audio not available — ignore */
  }
}
