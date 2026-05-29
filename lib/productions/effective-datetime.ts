/** Resolve when a production happens — synced rows often only have start_datetime_label set. */
export type ProductionDateInput = {
  start_datetime?: string | null
  start_datetime_label?: string | null
  event_date?: string | null
}

export function parseProductionStartInstant(input: ProductionDateInput): Date | null {
  if (input.start_datetime) {
    const raw = input.start_datetime.includes('T')
      ? input.start_datetime
      : input.start_datetime.replace(' ', 'T')
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return d
  }

  if (input.event_date) {
    const d = new Date(`${input.event_date}T12:00:00`)
    if (!Number.isNaN(d.getTime())) return d
  }

  const label = input.start_datetime_label?.trim()
  if (label) {
    const d = new Date(label)
    if (!Number.isNaN(d.getTime())) return d
  }

  return null
}

export function productionStartIso(input: ProductionDateInput): string | null {
  const d = parseProductionStartInstant(input)
  return d ? d.toISOString() : null
}

/** Prefer parsed label/event_date when start_datetime is missing. */
export function normalizeProductionDatetimeFields<T extends ProductionDateInput>(
  row: T,
): T & { start_datetime: string | null } {
  const effective = productionStartIso(row)
  return {
    ...row,
    start_datetime: effective ?? row.start_datetime ?? null,
  }
}

export function isProductionInDateWindow(
  input: ProductionDateInput,
  windowStart: Date,
  windowEnd: Date,
): boolean {
  const d = parseProductionStartInstant(input)
  if (!d) return false
  return d >= windowStart && d <= windowEnd
}
