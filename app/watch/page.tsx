import { CategoryNav } from "./_components/CategoryNav";
import {
  ContentRow,
  Hero,
  LiveStrip,
  SiteFooter,
  ThreeUpCta,
} from "./_components/sections";
import {
  categories,
  featured,
  liveProgram,
  rows,
  schoolFilters,
  schoolLevels,
} from "./_data/placeholder";

export default function WatchHome() {
  return (
    <>
      <Hero featured={featured} />
      <CategoryNav
        categories={categories}
        schoolFilters={schoolFilters}
        schoolLevels={schoolLevels}
      />
      <LiveStrip program={liveProgram} />
      <main>
        {rows.map((row) => (
          <ContentRow key={row.title} row={row} />
        ))}
        <ThreeUpCta />
      </main>
      <SiteFooter />
    </>
  );
}
