import { redirect } from 'next/navigation'

// The brand password gate now renders inline in the /brand server layout, so this
// standalone route just forwards there (kept so any old links still work).
export default function BrandAccessRedirect() {
  redirect('/brand')
}
