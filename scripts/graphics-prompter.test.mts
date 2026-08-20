import { resolveSeek, sanitizePrompterSeek, PROMPTER_LINE_PX } from '../lib/graphics/prompter.ts'

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `   got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`}`)
}

// Back is negative. Getting this sign wrong scrolls away from the line talent
// just missed, which is the exact opposite of the point.
check('back one line goes up', resolveSeek({ kind: 'back', value: '1' }), { type: 'delta', px: -PROMPTER_LINE_PX })
check('back three lines', resolveSeek({ kind: 'back', value: '3' }), { type: 'delta', px: -3 * PROMPTER_LINE_PX })
check('forward one line goes down', resolveSeek({ kind: 'forward', value: '1' }), { type: 'delta', px: PROMPTER_LINE_PX })
check('a missing count is one line', resolveSeek({ kind: 'back', value: null }), { type: 'delta', px: -PROMPTER_LINE_PX })
check('a nonsense count is one line', resolveSeek({ kind: 'back', value: 'lots' }), { type: 'delta', px: -PROMPTER_LINE_PX })
check('a negative count cannot flip the direction', resolveSeek({ kind: 'back', value: '-4' }), { type: 'delta', px: -PROMPTER_LINE_PX })

check('jump to a row', resolveSeek({ kind: 'row', value: 'row-9' }), { type: 'row', rowId: 'row-9' })
check('a row jump with no row is nothing', resolveSeek({ kind: 'row', value: null }), null)
check('back to on air', resolveSeek({ kind: 'air', value: null }), { type: 'air' })
check('top of show', resolveSeek({ kind: 'top', value: null }), { type: 'top' })
check('no command is nothing', resolveSeek({ kind: null, value: null }), null)

// --- what the API will accept -----------------------------------------------
check('a valid nudge', sanitizePrompterSeek({ kind: 'back', value: '3' }), { kind: 'back', value: '3' })
check('a kind with no value is fine', sanitizePrompterSeek({ kind: 'air' }), { kind: 'air', value: null })
check('an unknown kind is refused', sanitizePrompterSeek({ kind: 'rewind' }), null)
check('a row with no id is refused', sanitizePrompterSeek({ kind: 'row' }), null)
check('junk is refused', sanitizePrompterSeek('back'), null)
check('null is refused', sanitizePrompterSeek(null), null)
check('a long value is cut, not rejected', sanitizePrompterSeek({ kind: 'row', value: 'x'.repeat(200) })?.value?.length, 64)

console.log(failures === 0 ? '\nALL PROMPTER TESTS PASS' : `\n${failures} PROMPTER TEST FAILURES`)
process.exit(failures === 0 ? 0 : 1)
