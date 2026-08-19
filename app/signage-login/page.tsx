import LoginForm from '../login/LoginForm'

export const metadata = {
  title: 'Sign in · Canyons Digital Signage',
  description: 'Sign in to manage your Canyons School District digital signage screens.',
}

/**
 * Same login, Canyons-branded, and it drops people straight into the signage
 * tool. This is the URL that goes in a signage-only invite email — a front
 * office person shouldn't land on a CSDtv crew portal.
 */
export default function SignageLoginPage() {
  return <LoginForm variant="signage" />
}
