import type { Metadata } from "next";
import localFont from "next/font/local";
import "./watch.css";

/*
  Isolated layout for the public /watch section. It nests inside the Team Hub
  root layout but wraps everything in `.csdtv-watch` with its own fonts and
  scoped stylesheet, so it inherits none of the Team Hub's theme. `title.absolute`
  bypasses the root "%s | CSDTV Team Hub" template so this reads as its own site.
*/

const archivo = localFont({
  src: "./fonts/archivo-variable.woff2",
  variable: "--font-archivo",
  display: "swap",
  weight: "100 900",
});

const hanken = localFont({
  src: "./fonts/hanken-grotesk-variable.woff2",
  variable: "--font-hanken",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: {
    absolute: "CSDtv — Canyons School District Television",
  },
  description:
    "Watch CSDtv: student productions, performances, sports, graduations, board meetings, and district news from Canyons School District.",
};

export default function WatchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`csdtv-watch ${archivo.variable} ${hanken.variable}`}>
      {children}
    </div>
  );
}
