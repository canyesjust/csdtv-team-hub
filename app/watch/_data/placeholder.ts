/*
  Placeholder homepage content mirroring the approved reference. Lets the
  /watch homepage render pixel-faithfully now; swapped for live Cablecast data
  in a later pass (the shapes here map onto EnrichedShow / PublicSiteShow).
*/

export interface Featured {
  kicker: string;
  title: string;
  desc: string;
  tag: string;
  meta: string[];
}

export interface LiveProgram {
  channel: string;
  title: string;
}

export interface PlaceholderCard {
  gradient: string; // g1..g6
  badge?: string;
  duration?: string;
  overTitle?: string;
  category?: string;
  categoryColor?: string;
  school?: { name: string; color: string };
  title: string;
  meta: string;
}

export interface PlaceholderRow {
  title: string;
  cards: PlaceholderCard[];
}

export interface SchoolChip {
  initial: string;
  name: string;
  bg: string;
  color?: string;
}

export interface SchoolLevel {
  label: string;
  schools: SchoolChip[];
}

export const featured: Featured = {
  kicker: "Featured",
  title: "Alta vs Hillcrest — Varsity Boys Basketball",
  desc: "Alta High School hosts Hillcrest in a 2025–2026 season matchup, with a senior night ceremony at halftime honoring the Alta team's graduating players.",
  tag: "Sports",
  meta: ["Alta High School", "Jan 15, 2026", "1h 42m"],
};

export const liveProgram: LiveProgram = {
  channel: "Channel 1",
  title: "Brighton vs Alta — Boys basketball",
};

export const categories: string[] = [
  "All",
  "Sports",
  "Performances",
  "Board meetings",
  "District news",
  "Student features",
  "Graduations",
];

export const schoolFilters: { label: string; count: number }[] = [
  { label: "All", count: 49 },
  { label: "Elementary", count: 28 },
  { label: "Middle", count: 8 },
  { label: "High", count: 5 },
  { label: "Specialty", count: 8 },
];

export const schoolLevels: SchoolLevel[] = [
  {
    label: "High schools",
    schools: [
      { initial: "A", name: "Alta", bg: "#065687" },
      { initial: "B", name: "Brighton", bg: "#0F6E56" },
      { initial: "C", name: "Corner Canyon", bg: "#7a1f2b" },
      { initial: "H", name: "Hillcrest", bg: "#c5662e" },
      { initial: "J", name: "Jordan", bg: "#241d91" },
    ],
  },
  {
    label: "Middle schools",
    schools: [
      { initial: "A", name: "Albion", bg: "#322351" },
      { initial: "B", name: "Butler", bg: "#1d2f4d" },
      { initial: "D", name: "Draper Park", bg: "#0f1225" },
      { initial: "E", name: "Eastmont", bg: "#21407c" },
      { initial: "I", name: "Indian Hills", bg: "#c5662e" },
      { initial: "M", name: "Midvale", bg: "#6e1b2c" },
      { initial: "M", name: "Mt. Jordan", bg: "#241d91", color: "#ede43e" },
      { initial: "U", name: "Union", bg: "#ead470", color: "#444" },
    ],
  },
  {
    label: "Elementary & specialty",
    schools: [
      { initial: "A", name: "Alta View", bg: "#001A64", color: "#F3FF00" },
      { initial: "A", name: "Altara", bg: "#7392b5" },
      { initial: "B", name: "Bella Vista", bg: "#172056" },
      { initial: "G", name: "Glacier Hills", bg: "#4477BC" },
      { initial: "S", name: "Sunrise", bg: "#af2535", color: "#fad736" },
      { initial: "+", name: "41 more", bg: "#065687" },
    ],
  },
];

export const rows: PlaceholderRow[] = [
  {
    title: "Recently added",
    cards: [
      {
        gradient: "g1",
        badge: "Sports",
        duration: "1:42:10",
        category: "Sports",
        categoryColor: "#065687",
        title: "Alta vs Hillcrest — Boys basketball",
        meta: "Alta High · Jan 15, 2026",
      },
      {
        gradient: "g3",
        badge: "Performance",
        duration: "52:18",
        category: "Performance",
        categoryColor: "#2791D0",
        title: "Brighton spring choir concert",
        meta: "Brighton High · Jan 12, 2026",
      },
      {
        gradient: "g4",
        badge: "Board",
        duration: "2:08:44",
        category: "Board meeting",
        categoryColor: "#4a5f76",
        title: "Canyons Board of Education — Jan 21",
        meta: "District · Jan 21, 2026",
      },
      {
        gradient: "g5",
        badge: "News",
        duration: "6:30",
        category: "District news",
        categoryColor: "#b07a18",
        title: "2026–2027 calendar released",
        meta: "District · Jan 8, 2026",
      },
      {
        gradient: "g6",
        badge: "Sports",
        duration: "1:55:02",
        category: "Sports",
        categoryColor: "#065687",
        title: "Corner Canyon vs Alta — Volleyball",
        meta: "Corner Canyon · Oct 30, 2025",
      },
    ],
  },
  {
    title: "District news & events",
    cards: [
      {
        gradient: "g5",
        duration: "12:04",
        category: "District news",
        categoryColor: "#b07a18",
        title: "Superintendent's January address",
        meta: "District · Jan 14, 2026",
      },
      {
        gradient: "g2",
        duration: "8:50",
        category: "District news",
        categoryColor: "#b07a18",
        title: "2026 Teacher of the Year announcement",
        meta: "District · Jan 9, 2026",
      },
      {
        gradient: "g4",
        duration: "15:22",
        category: "District news",
        categoryColor: "#b07a18",
        title: "Bond election update from the board",
        meta: "District · Jan 6, 2026",
      },
      {
        gradient: "g6",
        duration: "9:12",
        category: "District news",
        categoryColor: "#b07a18",
        title: "Back to school 2026 highlights",
        meta: "District · Dec 18, 2025",
      },
      {
        gradient: "g1",
        duration: "4:48",
        category: "District news",
        categoryColor: "#b07a18",
        title: "Groundbreaking at the new STEM wing",
        meta: "District · Dec 4, 2025",
      },
    ],
  },
  {
    title: "Live sports",
    cards: [
      {
        gradient: "g1",
        overTitle: "BASKETBALL",
        school: { name: "Brighton High", color: "#0F6E56" },
        title: "Brighton vs Jordan — Boys basketball",
        meta: "Jan 13, 2026",
      },
      {
        gradient: "g2",
        overTitle: "VOLLEYBALL",
        school: { name: "Corner Canyon", color: "#7a1f2b" },
        title: "Corner Canyon vs Alta — Volleyball",
        meta: "Oct 30, 2025",
      },
      {
        gradient: "g6",
        overTitle: "WRESTLING",
        school: { name: "Hillcrest High", color: "#c5662e" },
        title: "Hillcrest wrestling invitational",
        meta: "Jan 7, 2026",
      },
      {
        gradient: "g3",
        overTitle: "SOCCER",
        school: { name: "Jordan High", color: "#241d91" },
        title: "Jordan vs Brighton — Boys soccer",
        meta: "Dec 12, 2025",
      },
      {
        gradient: "g4",
        overTitle: "FOOTBALL",
        school: { name: "Alta High", color: "#065687" },
        title: "Alta vs Corner Canyon — Football",
        meta: "Sep 20, 2025",
      },
    ],
  },
  {
    title: "Performances & arts",
    cards: [
      {
        gradient: "g3",
        overTitle: "CHOIR",
        category: "Performance",
        categoryColor: "#2791D0",
        title: "Brighton spring choir concert",
        meta: "Brighton High · Jan 12, 2026",
      },
      {
        gradient: "g2",
        overTitle: "THEATER",
        category: "Performance",
        categoryColor: "#2791D0",
        title: 'Alta fall play — "Our Town"',
        meta: "Alta High · Nov 21, 2025",
      },
      {
        gradient: "g6",
        overTitle: "ORCHESTRA",
        category: "Performance",
        categoryColor: "#2791D0",
        title: "Jordan symphony winter concert",
        meta: "Jordan High · Dec 14, 2025",
      },
      {
        gradient: "g1",
        overTitle: "DANCE",
        category: "Performance",
        categoryColor: "#2791D0",
        title: "Canyons Middle School Dance Festival",
        meta: "8 middle schools · Mar 8, 2026",
      },
      {
        gradient: "g4",
        overTitle: "BAND",
        category: "Performance",
        categoryColor: "#2791D0",
        title: "Hillcrest marching band showcase",
        meta: "Hillcrest High · Oct 18, 2025",
      },
    ],
  },
];
