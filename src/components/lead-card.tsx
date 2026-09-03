import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { useOutreach } from "@/outreach/store";
import type { Lead } from "@/outreach/models";
import { REVIEWABLE } from "@/outreach/lifecycle";

function ScoreMeter({ score }: { score: number | null }) {
  if (score === null) {
    return <span className="font-mono text-xs text-subtle">Unscored</span>;
  }
  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs tabular-nums text-muted">
      <span className="text-fg">{score}</span>
      <span aria-hidden className="h-1 w-16 overflow-hidden rounded-full bg-border">
        <span className="block h-full bg-accent" style={{ width: `${Math.min(100, score)}%` }} />
      </span>
      <span>/100</span>
    </span>
  );
}

export function LeadCard({ lead }: { lead: Lead }) {
  const approve = useOutreach((s) => s.approve);
  const reject = useOutreach((s) => s.reject);
  const hold = useOutreach((s) => s.hold);
  const setLeadRecipient = useOutreach((s) => s.setLeadRecipient);
  const reply = useOutreach((s) => s.reply);
  const bounce = useOutreach((s) => s.bounce);
  const unsubscribe = useOutreach((s) => s.unsubscribe);

  const [draftEmail, setDraftEmail] = useState(lead.recipient_email ?? "");
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftEmail(lead.recipient_email ?? "");
  }, [lead.id, lead.recipient_email]);

  function committedEmail() {
    return emailRef.current?.value ?? draftEmail;
  }

  function commitRecipient() {
    const value = committedEmail();
    setDraftEmail(value);
    if (value !== (lead.recipient_email ?? "")) {
      setLeadRecipient(lead.id, value);
    }
    return value;
  }

  const canReview = REVIEWABLE.has(lead.status);
  const showInbound = lead.status === "Sent" || lead.status === "Replied";
  const lockedRecipient = lead.status === "Sent" || lead.status === "Replied";

  return (
    <article className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-medium tracking-tight text-fg">{lead.company}</h3>
          <p className="mt-0.5 text-sm text-muted">{lead.title}</p>
        </div>
        <StatusBadge status={lead.status} />
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-subtle">
        <ScoreMeter score={lead.score} />
        <span>Source {lead.source}</span>
        {lead.send_count > 0 ? (
          <span className="tabular-nums">Sends {lead.send_count}</span>
        ) : null}
        {lead.suppressed ? <span className="text-danger">Suppressed</span> : null}
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted">{lead.description}</p>

      {lead.score_reason ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-subtle hover:text-fg">
            Score reason
          </summary>
          <p className="mt-2 text-xs leading-relaxed text-muted">{lead.score_reason}</p>
        </details>
      ) : null}

      {lead.diagnosis ? (
        <div className="mt-4 rounded-md bg-bg-elevated p-3">
          <p className="font-mono text-[0.65rem] tracking-widest text-subtle uppercase">
            AI diagnosis · no send authority
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-fg">{lead.diagnosis}</p>
        </div>
      ) : null}

      {lead.generated_message ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-subtle hover:text-fg">
            Generated outreach draft
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-bg p-3 font-sans text-sm leading-relaxed text-muted">
            {lead.generated_message}
          </pre>
        </details>
      ) : null}

      <div className="mt-5 border-t border-border pt-4">
        <label
          className="block text-xs font-medium tracking-wide text-subtle uppercase"
          htmlFor={`email-${lead.id}`}
        >
          Recipient
        </label>
        <div className="mt-2">
          <Input
            id={`email-${lead.id}`}
            ref={emailRef}
            type="email"
            autoComplete="off"
            placeholder="ops@company.example.com"
            value={draftEmail}
            disabled={lockedRecipient}
            onChange={(event) => setDraftEmail(event.target.value)}
            onBlur={() => commitRecipient()}
          />
        </div>
        <p className="mt-2 text-xs text-subtle">
          Fictional addresses only. Use <span className="font-mono text-muted">+fail</span> or{" "}
          <span className="font-mono text-muted">+bounce</span> in the local part to force a mock
          outcome.
        </p>
      </div>

      {canReview ? (
        <div className="mt-4">
          <p className="mb-2 text-xs text-subtle">
            Review changes lifecycle only. Approve does not send.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                const value = committedEmail();
                setDraftEmail(value);
                approve(lead.id, value);
              }}
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                commitRecipient();
                hold(lead.id);
              }}
              disabled={lead.status === "Held"}
            >
              Hold
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                commitRecipient();
                reject(lead.id);
              }}
            >
              Reject
            </Button>
          </div>
        </div>
      ) : null}

      {lead.status === "Approved" ? (
        <p className="mt-4 rounded-md bg-ok-bg px-3 py-2 text-sm text-ok">
          Approved — not sent. Execution is a separate system control above the queue.
        </p>
      ) : null}

      {lead.status === "Failed" ? (
        <p className="mt-4 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
          Delivery failed. Lifecycle did not advance to Sent. Send count is still {lead.send_count}.
        </p>
      ) : null}

      {showInbound ? (
        <div className="mt-4">
          <p className="mb-2 text-xs text-subtle">
            Simulated provider events (local webhooks — no external call)
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="quiet" onClick={() => reply(lead.id)} disabled={lead.status === "Replied"}>
              Simulate reply
            </Button>
            <Button variant="quiet" onClick={() => bounce(lead.id)}>
              Simulate bounce
            </Button>
            <Button variant="quiet" onClick={() => unsubscribe(lead.id)}>
              Simulate unsubscribe
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
