/** Student intern onboarding template (2026). */

import type { SeedItem } from './legacy-seed'

export const STUDENT_INTERN_ONBOARDING_PHASES = [
  'Getting started',
  'Training',
  'Production',
  'Wrap-up',
] as const

export const STUDENT_INTERN_ONBOARDING_CATEGORIES = [
  'Getting Access',
  'HR & Admin',
  'Compliance & Policies',
  'Equipment',
  'Software & File Standards',
  'Brand & Style',
  'Communications',
  'Production',
  'Wrap-Up',
] as const

export const STUDENT_INTERN_ONBOARDING_ITEMS: SeedItem[] = [
  // Getting Access
  {
    phase: 'Getting started',
    category: 'Getting Access',
    title: 'District Google Workspace email',
    description:
      'Confirm your login, test access, and set it up on your device.',
  },
  {
    phase: 'Getting started',
    category: 'Getting Access',
    title: 'Send a test email',
    description:
      'Send a quick email to Justin from your district account to confirm everything works.',
  },
  {
    phase: 'Getting started',
    category: 'Getting Access',
    title: 'Set up your email signature',
    description:
      'Add your name, intern title, and CSDtv to your district email signature.',
  },
  {
    phase: 'Getting started',
    category: 'Getting Access',
    title: 'Productions web app',
    description:
      'Get your login, walk through the interface, and understand where your tasks will live.',
  },
  {
    phase: 'Getting started',
    category: 'Getting Access',
    title: 'Productions portal',
    description:
      'Navigate productions.canyonsdistrict.org and understand how projects are tracked and assigned.',
  },
  {
    phase: 'Getting started',
    category: 'Getting Access',
    title: 'Google Drive access',
    description:
      'Confirm you can access the CSDtv shared Google Drive and understand the folder structure.',
  },
  {
    phase: 'Getting started',
    category: 'Getting Access',
    title: 'External hard drive setup',
    description:
      'Format your drive correctly and build out your project folder structure using CSDtv file naming conventions before your first assignment.',
  },
  {
    phase: 'Getting started',
    category: 'Getting Access',
    title: 'Team Hub login',
    description: 'Sign in to csdtvstaff.org using your district email magic link.',
  },
  {
    phase: 'Getting started',
    category: 'Getting Access',
    title: 'Read one Team Hub article',
    description:
      'Browse the Team Hub library and read any article of your choice to get familiar with the knowledge base.',
  },
  {
    phase: 'Getting started',
    category: 'Getting Access',
    title: 'Subscribe to the productions calendar',
    description:
      'Add the CSDtv productions calendar to your Google Calendar so you know what\'s coming up.',
  },
  // HR & Admin
  {
    phase: 'Getting started',
    category: 'HR & Admin',
    title: 'District onboarding paperwork',
    description: 'Complete all required district intern documentation.',
  },
  {
    phase: 'Getting started',
    category: 'HR & Admin',
    title: 'Review intern schedule and hours',
    description:
      'Confirm your working days, start and end times, and how to communicate if you\'re running late or out.',
  },
  {
    phase: 'Getting started',
    category: 'HR & Admin',
    title: 'Supervision chain',
    description:
      'Know who to go to when Justin isn\'t available and how to reach them.',
  },
  {
    phase: 'Getting started',
    category: 'HR & Admin',
    title: 'Performance expectations',
    description:
      'Review and align with Justin on what a successful internship looks like — quality of work, communication habits, reliability, and growth.',
  },
  {
    phase: 'Getting started',
    category: 'HR & Admin',
    title: 'Set up weekly hour logging',
    description:
      'Confirm where and how to log your hours each week and submit your first entry.',
  },
  {
    phase: 'Getting started',
    category: 'HR & Admin',
    title: 'Schedule summer 1:1 with Justin',
    description:
      'Book a recurring 1:1 with Justin for the duration of your internship. This is your standing time to ask questions, get feedback, and stay aligned.',
  },
  // Compliance & Policies
  {
    phase: 'Getting started',
    category: 'Compliance & Policies',
    title: 'FERPA acknowledgment',
    description:
      'Understand what it means to film minors in a school district. Know what you can and cannot share, post, or use for personal purposes. Sign the acknowledgment.',
  },
  {
    phase: 'Getting started',
    category: 'Compliance & Policies',
    title: 'Copyright and music licensing',
    description:
      'Learn what CSDtv\'s rules are around music and third-party content. You cannot use unlicensed music in any production.',
  },
  {
    phase: 'Getting started',
    category: 'Compliance & Policies',
    title: 'Accessibility and captions',
    description:
      'Understand CSDtv\'s captioning standards and where accessibility fits into the publishing workflow.',
  },
  {
    phase: 'Getting started',
    category: 'Compliance & Policies',
    title: 'Content approval chain',
    description:
      'Learn who approves content at each stage of production. Nothing publishes without going through proper review.',
  },
  {
    phase: 'Getting started',
    category: 'Compliance & Policies',
    title: 'On-location protocols',
    description:
      'School filming permissions, safety expectations on shoots, and what to do if access is denied or a situation escalates.',
  },
  {
    phase: 'Getting started',
    category: 'Compliance & Policies',
    title: 'Complete critical policies',
    description:
      'Complete all required policy reading and acknowledgments assigned through the district.',
  },
  // Equipment
  {
    phase: 'Training',
    category: 'Equipment',
    title: 'Equipment room orientation',
    description:
      'Walk the equipment room with Justin. Learn what cameras, audio gear, and accessories CSDtv uses, where everything lives, and how it\'s organized.',
  },
  {
    phase: 'Training',
    category: 'Equipment',
    title: 'Studio and broadcast equipment overview',
    description:
      'Orientation to the live production setup — switcher, monitors, and studio gear.',
  },
  {
    phase: 'Training',
    category: 'Equipment',
    title: 'Independent equipment checkout',
    description:
      'Check out and return gear on your own following proper protocol. No hand-holding — this is a competency check.',
  },
  // Software & File Standards
  {
    phase: 'Training',
    category: 'Software & File Standards',
    title: 'NLE setup',
    description:
      'Confirm access to CSDtv\'s editing software. Open it, confirm settings, and flag any issues to Justin.',
  },
  {
    phase: 'Training',
    category: 'Software & File Standards',
    title: 'File naming and folder conventions',
    description:
      'Learn CSDtv\'s file naming format and where project files get saved. Bad file hygiene breaks shared workflows.',
  },
  // Brand & Style
  {
    phase: 'Training',
    category: 'Brand & Style',
    title: 'Watch recent CSDtv productions',
    description:
      'Review a sample of recent work across different formats — news, event coverage, short-form. Notice pacing, tone, and quality standards.',
  },
  {
    phase: 'Training',
    category: 'Brand & Style',
    title: 'Brand standards review',
    description: 'Review CSDtv\'s visual identity — logo usage, color palette, and fonts.',
  },
  {
    phase: 'Training',
    category: 'Brand & Style',
    title: 'Lower thirds and graphics package',
    description:
      'Learn the templates used for on-screen text and titles. Know where the files live and how to use them correctly.',
  },
  {
    phase: 'Training',
    category: 'Brand & Style',
    title: 'Brand asset library',
    description: 'Confirm you know where to find approved logos, fonts, and graphics.',
  },
  {
    phase: 'Training',
    category: 'Brand & Style',
    title: 'Follow CSDtv online',
    description:
      'Follow CSDtv on its social media channels and YouTube so you\'re watching the work and staying current.',
  },
  // Communications
  {
    phase: 'Training',
    category: 'Communications',
    title: 'Add Justin and Ryan to your phone',
    description:
      'Save both contacts and create a group chat with them. All team communication goes through the group — not individual texts.',
  },
  {
    phase: 'Training',
    category: 'Communications',
    title: 'Email communication norms',
    description:
      'Learn how the team communicates — expected response times, how to flag problems, and the tone CSDtv uses in professional correspondence.',
  },
  // Production
  {
    phase: 'Production',
    category: 'Production',
    title: 'Building and office tour',
    description:
      'Walk through the office, studio, edit bays, and equipment storage with Justin.',
  },
  {
    phase: 'Production',
    category: 'Production',
    title: 'Meet key staff',
    description:
      'Introductions to the people you\'ll work with regularly — faces, names, and roles.',
  },
  {
    phase: 'Production',
    category: 'Production',
    title: 'CSDtv mission overview',
    description:
      'Understand what CSDtv is, the scope of production, and what your role contributes.',
  },
  {
    phase: 'Production',
    category: 'Production',
    title: 'Review assigned productions',
    description: 'Open Productions and confirm which shows you are listed on.',
  },
  {
    phase: 'Production',
    category: 'Production',
    title: 'Shadow a full production',
    description:
      'Follow one complete CSDtv project through every stage — briefing, shoot, edit, review, and delivery. Observe without taking over.',
  },
  {
    phase: 'Production',
    category: 'Production',
    title: 'On-location shoot',
    description:
      'Participate in a real shoot outside the studio. Contribute where directed. Apply on-location protocols.',
  },
  {
    phase: 'Production',
    category: 'Production',
    title: 'First solo production task',
    description:
      'Receive and complete a real assigned project — short-form video, b-roll shoot, or broadcast segment.',
  },
  {
    phase: 'Production',
    category: 'Production',
    title: 'Submit first content for review',
    description:
      'Deliver your draft or rough cut through the proper submission channel. Do not self-publish.',
  },
  {
    phase: 'Production',
    category: 'Production',
    title: 'Attend a live studio session',
    description:
      'Participate in a scheduled broadcast or studio recording in a real contributing role.',
  },
  // Wrap-Up
  {
    phase: 'Wrap-up',
    category: 'Wrap-Up',
    title: 'Intern-led check-in with Justin',
    description:
      'You run this meeting. Walk Justin through what you worked on, what went well, what was hard, and what you want to focus on next. Use your performance expectations as your guide.',
    required: true,
  },
]
