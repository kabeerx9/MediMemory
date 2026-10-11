import type { Memory } from "@caretalk/contracts/health";
import { ChevronDown, Pill } from "lucide-react";
import { useState } from "react";

import { shortDate } from "./metric-chart";

// The medication side of the record, kept off the charts: what you take now,
// and recent events (visits, procedures). Facts are prose (that's how the record stores
// them), so each row shows two lines and opens to the full note on demand.

const COLLAPSED = 5;

function FactRow({ fact, muted }: { fact: Memory; muted?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        aria-expanded={open}
        className="group flex w-full gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--wd-track)] focus-visible:ring-2 focus-visible:ring-[var(--wd-strain)]/50 focus-visible:outline-none"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="w-12 shrink-0 pt-0.5 text-xs text-[var(--wd-muted)] tabular-nums">
          {fact.happenedOn ? shortDate(fact.happenedOn) : "—"}
        </span>
        <span className={`min-w-0 flex-1 text-sm leading-snug ${muted ? "text-[var(--wd-muted)]" : ""} ${open ? "" : "line-clamp-2"}`}>
          {fact.content}
        </span>
        <ChevronDown
          aria-hidden
          className={`mt-0.5 size-3.5 shrink-0 text-[var(--wd-faint)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
    </li>
  );
}

function Section({ title, facts, empty, muted }: { title: string; facts: Memory[]; empty: string; muted?: (m: Memory) => boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? facts : facts.slice(0, COLLAPSED);
  return (
    <section className="flex flex-col gap-1">
      <h2 className="px-2 text-sm font-semibold">
        {title} <span className="font-normal text-[var(--wd-muted)] tabular-nums">{facts.length}</span>
      </h2>
      {facts.length === 0 ? (
        <p className="px-2 text-sm text-[var(--wd-muted)]">{empty}</p>
      ) : (
        <ul className="flex flex-col">
          {shown.map((fact) => (
            <FactRow fact={fact} key={fact.id} muted={muted?.(fact)} />
          ))}
        </ul>
      )}
      {facts.length > COLLAPSED ? (
        <button
          className="self-start px-2 text-xs font-medium text-[var(--wd-muted)] hover:text-[var(--wd-ink)]"
          onClick={() => setAll((v) => !v)}
          type="button"
        >
          {all ? "Show fewer" : `Show all ${facts.length}`}
        </button>
      ) : null}
    </section>
  );
}

export function MedicationsPanel({ current, events }: { current: Memory[]; events: Memory[] }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 px-2 text-[var(--wd-muted)]">
        <Pill aria-hidden className="size-4" />
        <span className="text-xs">From your health record</span>
      </div>
      <Section empty="No medications recorded." facts={current} title="Medications" />
      <Section empty="No visits or events in the last 90 days." facts={events} title="Recent events" />
    </div>
  );
}
