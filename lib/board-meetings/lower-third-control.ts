import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureBroadcastState, logMeetingEvent } from '@/lib/board-meetings/broadcast-control'

const PHOTO_BUCKET = 'lower-third-photos'

export type PublicActiveLowerThird = {
  person_id: string
  display_name: string
  primary_title: string | null
  affiliation: string | null
  officer_position: string | null
  photo_url: string | null
}

export async function lowerThirdPhotoUrl(
  service: SupabaseClient,
  photoPath: string | null,
): Promise<string | null> {
  if (!photoPath) return null
  if (photoPath.startsWith('http')) return photoPath

  const { data, error } = await service.storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(photoPath, 3600)
  if (!error && data?.signedUrl) return data.signedUrl

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
  if (!base) return null
  const encoded = photoPath.split('/').map(encodeURIComponent).join('/')
  return `${base}/storage/v1/object/public/${PHOTO_BUCKET}/${encoded}`
}

export async function buildPublicLowerThirdPayload(
  service: SupabaseClient,
  personId: string | null | undefined,
): Promise<PublicActiveLowerThird | null> {
  if (!personId) return null

  const { data: person } = await service
    .from('lower_third_people')
    .select('id, display_name, primary_title, affiliation, officer_position, photo_path, is_active')
    .eq('id', personId)
    .maybeSingle()

  if (!person || !person.is_active) return null

  return {
    person_id: person.id,
    display_name: person.display_name,
    primary_title: person.primary_title,
    affiliation: person.affiliation,
    officer_position: person.officer_position,
    photo_url: await lowerThirdPhotoUrl(service, person.photo_path),
  }
}

export async function setActiveLowerThird(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
  personId: string,
) {
  const { data: person } = await service
    .from('lower_third_people')
    .select('id, display_name, is_active')
    .eq('id', personId)
    .maybeSingle()

  if (!person) throw new Error('Person not found')
  if (!person.is_active) throw new Error('Person is not active in the library')

  await ensureBroadcastState(service, boardMeetingId, operatorId)

  await service
    .from('meeting_broadcast_state')
    .update({
      active_lower_third_person_id: personId,
      updated_at: new Date().toISOString(),
      updated_by: operatorId,
    })
    .eq('board_meeting_id', boardMeetingId)

  await logMeetingEvent(service, boardMeetingId, 'lower_third_set', operatorId, {
    person_id: personId,
    display_name: person.display_name,
  })
}

export async function clearActiveLowerThird(
  service: SupabaseClient,
  boardMeetingId: string,
  operatorId: string,
) {
  await service
    .from('meeting_broadcast_state')
    .update({
      active_lower_third_person_id: null,
      updated_at: new Date().toISOString(),
      updated_by: operatorId,
    })
    .eq('board_meeting_id', boardMeetingId)

  await logMeetingEvent(service, boardMeetingId, 'lower_third_cleared', operatorId)
}
