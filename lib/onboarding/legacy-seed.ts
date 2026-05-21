/** Default phases and categories + checklist items migrated from the original hardcoded lists. */

export type SeedItem = {
  phase: string
  category: string
  title: string
  description: string
  required?: boolean
}

export const INTERN_SEED_PHASES = ['Before you start', 'Core training', 'Hands-on practice', 'Wrap-up']

export const INTERN_SEED_CATEGORIES = [
  'HR & district',
  'Team & facility',
  'Equipment',
  'Library',
  'Productions',
  'Skills & practice',
  'Wrap-up',
]

export const INTERN_SEED_ITEMS: SeedItem[] = [
  { phase: 'Before you start', category: 'HR & district', title: 'Complete HR new-hire paperwork', description: 'Fill out all required district HR forms and return to the front office.' },
  { phase: 'Before you start', category: 'HR & district', title: 'Get your district ID badge', description: 'Visit the district office to have your photo taken and receive your badge.' },
  { phase: 'Before you start', category: 'HR & district', title: 'Set up district email and log in', description: 'Activate your @canyonsdistrict.org email and confirm access.' },
  { phase: 'Before you start', category: 'HR & district', title: 'Complete district digital safety training', description: 'Finish the required online digital safety course assigned by the district.' },
  { phase: 'Before you start', category: 'Team & facility', title: 'Office tour and desk setup', description: 'Tour the CSDTV office, learn where supplies are, and get your workspace ready.' },
  { phase: 'Before you start', category: 'Team & facility', title: 'Meet the full CSDTV team', description: 'Introduction meetings with Justin and any other current staff or interns.' },
  { phase: 'Before you start', category: 'Team & facility', title: 'Log into the Team Hub', description: 'Sign in to csdtvstaff.org using your district email magic link.' },
  { phase: 'Before you start', category: 'Team & facility', title: 'Set your weekly schedule in Team Hub', description: 'Add your default weekly hours under Team hours in the Team Hub.' },
  { phase: 'Core training', category: 'Equipment', title: 'Equipment room walkthrough', description: 'Learn the layout of the equipment room — cameras, audio, lighting, and streaming gear.' },
  { phase: 'Core training', category: 'Equipment', title: 'Review equipment inventory spreadsheet', description: 'Familiarize yourself with what equipment we have and how it is tracked.' },
  { phase: 'Core training', category: 'Equipment', title: 'Learn the equipment checkout process', description: 'Walk through how to check equipment in and out properly.' },
  { phase: 'Core training', category: 'Library', title: 'Read Equipment Checkout Policy in Library', description: 'Find and read the Equipment Checkout Policy article in the Team Hub Library.' },
  { phase: 'Core training', category: 'Library', title: 'Read Livestream Setup Process in Library', description: 'Find and read the Livestream Setup Process article in the Team Hub Library.' },
  { phase: 'Core training', category: 'Library', title: 'Review all Library articles', description: 'Read every article in the Team Hub Library to understand team processes.' },
  { phase: 'Core training', category: 'Productions', title: 'Learn the productions tracking site', description: 'Get a tour of productions.canyonsdistrict.org and understand how requests come in.' },
  { phase: 'Core training', category: 'Productions', title: 'Watch Justin demo a full livestream setup', description: 'Observe a complete setup from equipment pack to stream-live, ask questions.' },
  { phase: 'Core training', category: 'Productions', title: 'Shadow your first live production', description: 'Attend a real production event as an observer and take notes.' },
  { phase: 'Hands-on practice', category: 'Library', title: 'Read Video Production Workflow in Library', description: 'Study the full film, edit, and publish workflow before your first video project.' },
  { phase: 'Hands-on practice', category: 'Library', title: 'Read Board Meeting Workflow in Library', description: 'Study the board meeting production process end to end.' },
  { phase: 'Hands-on practice', category: 'Library', title: 'Read Photo Headshot Workflow in Library', description: 'Study the headshot session workflow before your first shoot.' },
  { phase: 'Hands-on practice', category: 'Productions', title: 'Observe a full board meeting production', description: 'Attend a board meeting production as an observer — watch setup, streaming, and teardown.' },
  { phase: 'Hands-on practice', category: 'Productions', title: 'First independent livestream setup (supervised)', description: 'Set up a full livestream on your own with Justin nearby to help if needed.' },
  { phase: 'Hands-on practice', category: 'Productions', title: 'Assist with a video shoot', description: 'Work alongside Justin or Ryan on a film shoot — handle camera, audio, or lighting.' },
  { phase: 'Hands-on practice', category: 'Skills & practice', title: 'Complete a basic video edit', description: 'Edit a short piece of footage and deliver a rough cut for review.' },
  { phase: 'Hands-on practice', category: 'Skills & practice', title: 'Export and deliver the final video', description: 'Export the approved edit in the correct format and upload it to the right folder.' },
  { phase: 'Hands-on practice', category: 'Skills & practice', title: 'Assist with a headshot session', description: 'Help with equipment setup, lighting, and file management during a headshot session.' },
  { phase: 'Hands-on practice', category: 'Skills & practice', title: 'First independent headshot session (supervised)', description: 'Run a headshot session on your own with Justin available for questions.' },
  { phase: 'Hands-on practice', category: 'Skills & practice', title: 'Learn podcast equipment setup', description: 'Learn how to set up the podcast recording equipment from scratch.' },
  { phase: 'Hands-on practice', category: 'Skills & practice', title: 'Assist with a podcast recording', description: 'Help with levels, recording, and file management during a live podcast session.' },
  { phase: 'Hands-on practice', category: 'Skills & practice', title: 'Practice Google Drive file organization', description: 'Locate the shared team Drive, understand the folder structure, and practice filing correctly.' },
  { phase: 'Hands-on practice', category: 'Skills & practice', title: 'Review file naming conventions', description: 'Learn and apply the team file naming standards for video, photos, and audio exports.' },
  { phase: 'Hands-on practice', category: 'Equipment', title: 'Complete an equipment room organization task', description: 'Do a full reset of the equipment room — check all items in, label, organize shelves.' },
  { phase: 'Hands-on practice', category: 'Productions', title: 'Observe a second board meeting production', description: 'Attend another board meeting production and identify areas where you can take on more.' },
  { phase: 'Wrap-up', category: 'Wrap-up', title: 'Core training check-in with your manager', description: 'Review progress, ask questions, and align on goals for hands-on practice.' },
  { phase: 'Wrap-up', category: 'Wrap-up', title: 'Final onboarding review meeting with Justin', description: 'Review all tasks, discuss strengths and areas to keep working on, set 30-day goals.' },
  { phase: 'Wrap-up', category: 'Wrap-up', title: 'Sign onboarding completion acknowledgment', description: 'Review and sign the onboarding completion form confirming you have finished all tasks.', required: true },
]

export const STUDENT_SEED_PHASES = ['Getting started', 'On the job', 'Wrap-up']

export const STUDENT_SEED_CATEGORIES = ['Getting started', 'Equipment', 'Library', 'Productions', 'Wrap-up']

export const STUDENT_SEED_ITEMS: SeedItem[] = [
  { phase: 'Getting started', category: 'Getting started', title: 'Log into the Team Hub', description: 'Sign in to csdtvstaff.org using your district email magic link.' },
  { phase: 'Getting started', category: 'Getting started', title: 'Review assigned productions', description: 'Open Productions and confirm which shows you are listed on.' },
  { phase: 'Getting started', category: 'Library', title: 'Read Equipment Checkout Policy in Library', description: 'Find and read the Equipment Checkout Policy article in the Team Hub Library.' },
  { phase: 'Getting started', category: 'Equipment', title: 'Equipment room orientation', description: 'Walk the equipment room with a staff member; learn where items live and how checkout works.' },
  { phase: 'Getting started', category: 'Productions', title: 'Shadow one production or classroom shoot', description: 'Attend as an observer; take notes on setup, roles, and safety.' },
  { phase: 'Getting started', category: 'Getting started', title: 'Complete district digital safety training', description: 'Finish the required online digital safety course assigned by the district.' },
  { phase: 'Getting started', category: 'Getting started', title: 'Check-in with your manager', description: 'Review expectations, hours, and questions about your assignments.' },
  { phase: 'On the job', category: 'Productions', title: 'Assist with one assigned production task', description: 'Work on a concrete task your manager assigns (camera, grip, logging, etc.).' },
  { phase: 'Wrap-up', category: 'Wrap-up', title: 'Student intern wrap-up', description: 'Review progress with your manager and confirm next steps.', required: true },
]
