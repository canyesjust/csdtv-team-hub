"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "./icons";
import type { SchoolLevel } from "../_data/placeholder";

interface CategoryNavProps {
  categories: string[];
  schoolFilters: { label: string; count: number }[];
  schoolLevels: SchoolLevel[];
}

export function CategoryNav({
  categories,
  schoolFilters,
  schoolLevels,
}: CategoryNavProps) {
  const [activeCat, setActiveCat] = useState(0);
  const [activeFilter, setActiveFilter] = useState(0);
  const [schoolsOpen, setSchoolsOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { threshold: 1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden />
      <nav className={`catnav${stuck ? " stuck" : ""}`}>
        <div className="catnav-inner">
          {categories.map((category, i) => (
            <button
              key={category}
              type="button"
              className={`pill${i === activeCat ? " active" : ""}`}
              onClick={() => setActiveCat(i)}
            >
              {category}
            </button>
          ))}
          <button
            type="button"
            className={`pill schools${schoolsOpen ? " open" : ""}`}
            aria-expanded={schoolsOpen}
            onClick={() => setSchoolsOpen((open) => !open)}
          >
            Schools
            <span className="ic">
              <ChevronDown />
            </span>
          </button>
        </div>
      </nav>

      <div className={`schools-panel${schoolsOpen ? " open" : ""}`}>
        <div className="sp-inner">
          <div className="sp-filters">
            {schoolFilters.map((filter, i) => (
              <button
                key={filter.label}
                type="button"
                className={`fpill${i === activeFilter ? " active" : ""}`}
                onClick={() => setActiveFilter(i)}
              >
                {filter.label} <span style={{ opacity: 0.6 }}>{filter.count}</span>
              </button>
            ))}
          </div>
          {schoolLevels.map((level) => (
            <div key={level.label}>
              <div className="sp-level">{level.label}</div>
              <div className="sp-grid">
                {level.schools.map((school) => (
                  <span key={school.name} className="schl">
                    <span
                      className="crest"
                      style={{ background: school.bg, color: school.color }}
                    >
                      {school.initial}
                    </span>
                    {school.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
