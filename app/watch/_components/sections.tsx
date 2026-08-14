/*
  Static (server-component) homepage sections, matching the reference markup.
  Interactive category nav lives in CategoryNav.tsx (client).
*/
import type {
  Featured,
  LiveProgram,
  PlaceholderCard,
  PlaceholderRow,
} from "../_data/placeholder";
import {
  ArrowRight,
  ChecklistIcon,
  InfoIcon,
  LogoChevrons,
  PlayIcon,
  SearchIcon,
  VideoIcon,
} from "./icons";

function Logo() {
  return (
    <a className="logo" href="#">
      <span className="chev">
        <LogoChevrons />
      </span>
      <span>
        CSDtv<small>CANYONS SCHOOL DISTRICT</small>
      </span>
    </a>
  );
}

function TopNav() {
  return (
    <nav className="topnav">
      <Logo />
      <div className="navlinks">
        <a href="#">Watch</a>
        <a href="#">Schools</a>
        <a href="#">Live</a>
        <a href="#">Schedule</a>
        <a href="#">About</a>
      </div>
      <div className="nav-right">
        <div className="onair">
          <span className="dot" />
          On air now
        </div>
        <button type="button" className="searchbtn">
          <SearchIcon />
          Search
        </button>
      </div>
    </nav>
  );
}

export function Hero({ featured }: { featured: Featured }) {
  return (
    <header className="hero">
      <TopNav />
      <div className="hero-body">
        <span className="kicker">{featured.kicker}</span>
        <h1 className="hero-title">{featured.title}</h1>
        <p className="hero-desc">{featured.desc}</p>
        <div className="hero-actions">
          <button type="button" className="btn btn-gold">
            <PlayIcon />
            Watch now
          </button>
          <button type="button" className="btn btn-ghost">
            More info
          </button>
        </div>
        <div className="hero-meta">
          <span className="tag">{featured.tag}</span>
          {featured.meta.map((item) => (
            <span key={item} style={{ display: "contents" }}>
              <span className="sep" />
              <span>{item}</span>
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}

export function LiveStrip({ program }: { program: LiveProgram | null }) {
  if (!program) return null;
  return (
    <section className="livestrip">
      <div className="live-inner">
        <div className="live-label">
          <span className="reddot" />
          Live now
        </div>
        <div className="live-prog">
          <span className="live-ch">{program.channel}</span>
          <span className="t">{program.title}</span>
        </div>
        <a className="live-watch" href="#">
          <PlayIcon width={14} height={14} />
          Watch live
        </a>
      </div>
    </section>
  );
}

function ThumbnailCard({ card }: { card: PlaceholderCard }) {
  return (
    <div className="card">
      <div className="thumb">
        <div className={`grad ${card.gradient}`} />
        <div className="shade" />
        {card.badge ? <span className="badge">{card.badge}</span> : null}
        {card.overTitle ? <span className="ov-title">{card.overTitle}</span> : null}
        {card.duration ? <span className="dur">{card.duration}</span> : null}
        <div className="play">
          <span className="pbtn">
            <PlayIcon width={20} height={20} />
          </span>
        </div>
      </div>
      {card.school ? (
        <div className="card-cat card-school" style={{ color: "var(--ink-2)" }}>
          <span className="cdot" style={{ background: card.school.color }} />
          {card.school.name}
        </div>
      ) : card.category ? (
        <div className="card-cat" style={{ color: card.categoryColor }}>
          {card.category}
        </div>
      ) : null}
      <div className="card-title">{card.title}</div>
      <div className="card-meta">{card.meta}</div>
    </div>
  );
}

export function ContentRow({ row }: { row: PlaceholderRow }) {
  return (
    <section className="row">
      <div className="row-head">
        <h2 className="row-title">{row.title}</h2>
        <a className="row-link" href="#">
          View all <ArrowRight />
        </a>
      </div>
      <div className="scroller">
        {row.cards.map((card, i) => (
          <ThumbnailCard key={`${row.title}-${i}`} card={card} />
        ))}
      </div>
    </section>
  );
}

export function ThreeUpCta() {
  return (
    <section className="cta-sec">
      <div className="cta-grid">
        <div className="cta-card">
          <div className="cta-ic">
            <VideoIcon />
          </div>
          <div className="cta-h">Join the crew</div>
          <div className="cta-d">Learn TV production as a CSDtv student intern.</div>
          <span className="cta-arrow">
            Apply <ArrowRight />
          </span>
        </div>
        <div className="cta-card gold">
          <div className="cta-ic">
            <ChecklistIcon />
          </div>
          <div className="cta-h">Request services</div>
          <div className="cta-d">Schedule a production for your school event.</div>
          <span className="cta-arrow">
            Get started <ArrowRight />
          </span>
        </div>
        <div className="cta-card">
          <div className="cta-ic">
            <InfoIcon />
          </div>
          <div className="cta-h">About CSDtv</div>
          <div className="cta-d">
            The video production service of Canyons School District.
          </div>
          <span className="cta-arrow">
            Learn more <ArrowRight />
          </span>
        </div>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer>
      <div className="foot-top">
        <div className="foot-brand">
          <Logo />
          <p>
            Filming and broadcasting the events of Canyons School District —
            games, concerts, graduations, and board meetings — across two
            channels and on demand.
          </p>
        </div>
        <div className="foot-cols">
          <div className="foot-col">
            <h4>Watch</h4>
            <a href="#">Live</a>
            <a href="#">Schedule</a>
            <a href="#">Sports</a>
            <a href="#">Performances</a>
            <a href="#">Board meetings</a>
          </div>
          <div className="foot-col">
            <h4>Schools</h4>
            <a href="#">High schools</a>
            <a href="#">Middle schools</a>
            <a href="#">Elementary</a>
            <a href="#">Specialty</a>
          </div>
          <div className="foot-col">
            <h4>CSDtv</h4>
            <a href="#">About</a>
            <a href="#">Join the crew</a>
            <a href="#">Request services</a>
            <a href="#">Contact</a>
          </div>
        </div>
      </div>
      <div className="foot-bottom">
        <div className="wrap2">
          <span>© 2026 Canyons School District · Sandy, Utah</span>
          <span>CSDtv</span>
        </div>
      </div>
    </footer>
  );
}
