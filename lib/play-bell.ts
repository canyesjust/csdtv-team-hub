// Synthesized "bell" chime via the Web Audio API — no audio asset required.
// Used to signal that a meeting timer has reached zero. Best-effort: if the
// browser blocks audio (no user gesture yet) it simply no-ops.

let ctx: AudioContext | null = null

export function playBell() {
  if (typeof window === 'undefined') return
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    ctx = ctx || new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    // Ring three soft strikes for an unmistakable "time's up" cue.
    for (let strike = 0; strike < 3; strike++) {
      const start = now + strike * 0.5
      for (const freq of [880, 1320]) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(0.28, start + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45)
        osc.connect(gain).connect(ctx.destination)
        osc.start(start)
        osc.stop(start + 0.5)
      }
    }
  } catch {
    /* audio not available — ignore */
  }
}
