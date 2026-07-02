import { redirect } from 'next/navigation'

// The floor plan was retired — screen locations/status live on the Screens page,
// and "which screens are in an area" is answered on the Areas page and in the
// content targeting picker. Any old bookmark lands on Screens.
export default function SignageFloorPlanRetired() {
  redirect('/dashboard/signage/screens')
}
