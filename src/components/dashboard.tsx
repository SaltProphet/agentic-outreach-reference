"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { LeadCard } from "@/components/lead-card";
import { useOutreach } from "@/outreach/store";
import { DAILY_SEND_LIMIT, type EventType, type LeadStatus } from "@/outreach/models";

const PIPELINE = ["Source", "Qualify", "Analyze", "Review", "Execute", "Events"] as const;

const FILTERS: { id: string; label: string; match: (status: LeadStatus) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  {
    id: "review",
    label: "Needs review",
    match: (s) => s === "DraftGenerated" || s === "Held",
  },
  { id: "approved", label: "Approved", match: (s) => s === "Approved" },
  { id: "sent", label: "Sent / replied", match: (s) => s === "Sent" || s === "Replied" },
];

function formatEventTime(isoStamp: string): string {
  const date = new Date(isoStamp);
  if (Number.isNaN(date.getTime())) return isoStamp;
  return date.toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }) + " UTC";
}

function eventTone(type: EventType): string {
  if (type === "send_succeeded" || type === "replied" || type === "approved") return "text-ok";
  if (type === "send_failed" || type === "bounced" || type === "rejected") return "text-danger";
  if (type === "send_attempted" || type === "held" || type === "suppressed") return "text-warn";
  return "text-muted";
}

export function Dashboard() {
  const [filter, setFilter] = useState("all");
  const [confirmReset, setConfirmReset] = useState(false);

  const leads = useOutreach((s) => s.leads);
  const events = useOutreach((s) => s.events);
  const notice = useOutreach((s) => s.notice);
  const noticeOk = useOutreach((s) => s.noticeOk);
  const suppressedEmails = useOutreach((s) => s.suppressedEmails);
  const runPipeline = useOutreach((s) => s.runPipeline);
  const execute = useOutreach((s) => s.execute);
  const reset = useOutreach((s) => s.reset);
  const sendsToday = useOutreach((s) => s.sendsToday());

  useEffect(() => {
    void Promise.resolve(useOutreach.persist.rehydrate());
  }, []);

  const visible = useMemo(() => {
    const rule = FILTERS.find((item) => item.id === filter) ?? FILTERS[0];
    return leads.filter((lead) => rule.match(lead.status));
  }, [leads, filter]);

  const approvedCount = leads.filter((lead) => lead.status === "Approved").length;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8 sm:px-6">
          <p className="font-mono text-[0.65rem] tracking-[0.18em] text-subtle uppercase">
            Reference implementation · fictional data · no real emails are sent
          </p>
          <div className="stagger-in max-w-3xl">
            <h1 className="text-[1.75rem] leading-tight font-medium tracking-tight sm:text-3xl">
              Agentic Outreach Reference Implementation
            </h1>
            <p className="mt-2 text-base text-muted">
              Human-controlled AI-assisted outbound workflow
            </p>
          </div>
          <ol className="flex gap-0 overflow-x-auto pb-1 font-mono text-[0.7rem] tracking-wide text-subtle uppercase">
            {PIPELINE.map((step, index) => (
              <li key={step} className="flex shrink-0 items-center">
                {index > 0 ? (
                  <span className="mx-2 text-border-strong" aria-hidden>
                    →
                  </span>
                ) : null}
                <span className="text-muted">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="controls-heading" className="lg:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="controls-heading" className="text-sm font-medium text-fg">
                System controls
              </h2>
              <p className="mt-1 max-w-xl text-sm text-subtle">
                Qualification and draft generation are not delivery. Execution is a second
                operator action and is refused unless the lead is Approved.
              </p>
            </div>
            <p className="font-mono text-xs tabular-nums text-muted">
              Successful mock sends today {sendsToday} / {DAILY_SEND_LIMIT}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={runPipeline}>
              Run qualification / analysis
            </Button>
            <Button variant="secondary" onClick={execute}>
              Execute approved{approvedCount ? ` (${approvedCount})` : ""}
            </Button>
            {confirmReset ? (
              <>
                <Button
                  variant="danger"
                  onClick={() => {
                    reset();
                    setConfirmReset(false);
                  }}
                >
                  Confirm reset
                </Button>
                <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmReset(true)}>
                Reset demo
              </Button>
            )}
          </div>
          {notice ? (
            <p
              role="status"
              className={`mt-4 rounded-md px-3 py-2 text-sm ${noticeOk ? "bg-ok-bg text-ok" : "bg-danger-bg text-danger"}`}
            >
              {notice}
            </p>
          ) : null}
        </section>

        <section aria-labelledby="queue-heading" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="queue-heading" className="text-sm font-medium text-fg">
                Lead queue
              </h2>
              <p className="mt-1 text-sm text-subtle">{leads.length} fictional leads</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`min-h-11 rounded-sm px-3 text-xs tracking-wide ${
                    filter === item.id
                      ? "bg-accent text-accent-fg"
                      : "text-muted hover:bg-surface-hover hover:text-fg"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            {visible.length === 0 ? (
              <p className="rounded-xl bg-surface px-4 py-8 text-sm text-muted shadow-[var(--shadow-border)]">
                No leads in this view.
              </p>
            ) : (
              visible.map((lead) => <LeadCard key={lead.id} lead={lead} />)
            )}
          </div>
        </section>

        <aside className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="walkthrough-heading">
            <h2 id="walkthrough-heading" className="text-sm font-medium text-fg">
              Demo walkthrough
            </h2>
            <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm leading-relaxed text-muted">
              <li>Reset demo if this is not a fresh session.</li>
              <li>Inspect the fictional companies in the queue.</li>
              <li>Run qualification / analysis.</li>
              <li>Open score reason, diagnosis, and draft.</li>
              <li>Enter a fictional recipient, then Approve.</li>
              <li>Confirm the lead is Approved and nothing was sent.</li>
              <li>Execute approved leads.</li>
              <li>Inspect the resulting event.</li>
              <li>Simulate reply, bounce, or unsubscribe.</li>
              <li>Confirm suppression blocks a later send.</li>
            </ol>
          </section>

          <section aria-labelledby="boundaries-heading">
            <h2 id="boundaries-heading" className="text-sm font-medium text-fg">
              Control boundaries
            </h2>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
              <li>AI produces diagnosis and copy. It cannot send.</li>
              <li>Approval and execution are separate operations.</li>
              <li>Only a provider result of sent advances lifecycle to Sent.</li>
              <li>Duplicate protection lives in the execution layer.</li>
              <li>Suppression and the daily quota are enforced there too.</li>
            </ul>
          </section>

          <section aria-labelledby="events-heading">
            <h2 id="events-heading" className="text-sm font-medium text-fg">
              Recent system events
            </h2>
            {suppressedEmails.length > 0 ? (
              <p className="mt-2 text-xs text-danger">
                Suppressed: {suppressedEmails.join(", ")}
              </p>
            ) : null}
            <ol className="mt-3 divide-y divide-border rounded-xl bg-surface shadow-[var(--shadow-border)]">
              {events.slice(0, 18).map((event) => {
                const company = leads.find((lead) => lead.id === event.lead_id)?.company;
                return (
                  <li key={event.id} className="px-3 py-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`font-mono text-[0.7rem] tracking-wide uppercase ${eventTone(event.type)}`}>
                        {event.type}
                      </span>
                      <time
                        className="font-mono text-[0.65rem] text-subtle tabular-nums"
                        dateTime={event.at}
                      >
                        {formatEventTime(event.at)}
                      </time>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {company ?? event.lead_id ?? "system"} · {event.outcome}
                    </p>
                    {event.reason ? (
                      <p className="mt-1 line-clamp-3 text-xs text-subtle">{event.reason}</p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
        </aside>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-subtle sm:px-6">
          This repository is a sanitized reference implementation demonstrating reusable workflow,
          orchestration, state-management, and integration patterns. It contains fictional data and
          does not represent a deployed client system.
        </div>
      </footer>
    </div>
  );
}
