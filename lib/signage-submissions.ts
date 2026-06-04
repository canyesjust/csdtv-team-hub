/** Public storage URL for an approved signage submission image. */
export function signageSubmissionPublicUrl(imagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? ''
  return `${base}/storage/v1/object/public/signage-submissions/${imagePath}`
}

export const SIGNAGE_SUBMIT_URL = 'https://www.csdtvstaff.org/signage/submit'
export const SIGNAGE_SLIDESHOW_URL = 'https://www.csdtvstaff.org/signage/slideshow'
export const SIGNAGE_REVIEW_URL = 'https://www.csdtvstaff.org/dashboard/signage-submissions'
