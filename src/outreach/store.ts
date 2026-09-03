"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { MockAIProvider } from "./ai";
import { MockEmailProvider } from "./email";
import {
  approveLead,
  executeApproved,
  holdLead,
  rejectLead,
  resetDemo,
  runCognitivePipeline,
  setRecipient,
  simulateBounce,
  simulateReply,
  simulateUnsubscribe,
  successfulSendsToday,
  type ActionResult,
} from "./engine";
import {
  createIdFactory,
  DAILY_SEND_LIMIT,
  systemClock,
  type AppState,
} from "./models";
import { createInitialState } from "./seed";

const ai = new MockAIProvider();
const email = new MockEmailProvider();
const ids = createIdFactory();

function deps() {
  return { clock: systemClock, ids, ai, email, dailyLimit: DAILY_SEND_LIMIT };
}

export interface OutreachStore extends AppState {
  notice: string | null;
  noticeOk: boolean;
  hydrated: boolean;
  markHydrated: () => void;
  sendsToday: () => number;
  runPipeline: () => void;
  setLeadRecipient: (leadId: string, email: string) => void;
  approve: (leadId: string, email?: string) => void;
  reject: (leadId: string) => void;
  hold: (leadId: string) => void;
  execute: () => void;
  reply: (leadId: string) => void;
  bounce: (leadId: string) => void;
  unsubscribe: (leadId: string) => void;
  reset: () => void;
  clearNotice: () => void;
}

function apply(result: ActionResult): Partial<OutreachStore> {
  return {
    leads: result.state.leads,
    events: result.state.events,
    suppressedEmails: result.state.suppressedEmails,
    successfulSendAt: result.state.successfulSendAt,
    notice: result.message,
    noticeOk: result.ok,
  };
}

const empty = createInitialState(systemClock);

export const useOutreach = create<OutreachStore>()(
  persist(
    (set, get) => ({
      ...empty,
      notice: null,
      noticeOk: true,
      hydrated: false,
      markHydrated: () => set({ hydrated: true }),
      sendsToday: () => successfulSendsToday(get(), systemClock),
      runPipeline: () => set(apply(runCognitivePipeline(get(), deps()))),
      setLeadRecipient: (leadId, address) =>
        set(apply(setRecipient(get(), leadId, address, systemClock))),
      approve: (leadId, email) => {
        let snapshot: AppState = get();
        if (typeof email === "string") {
          snapshot = setRecipient(snapshot, leadId, email, systemClock).state;
        }
        set(apply(approveLead(snapshot, leadId, deps())));
      },
      reject: (leadId) => set(apply(rejectLead(get(), leadId, deps()))),
      hold: (leadId) => set(apply(holdLead(get(), leadId, deps()))),
      execute: () => set(apply(executeApproved(get(), deps()))),
      reply: (leadId) => set(apply(simulateReply(get(), leadId, deps()))),
      bounce: (leadId) => set(apply(simulateBounce(get(), leadId, deps()))),
      unsubscribe: (leadId) => set(apply(simulateUnsubscribe(get(), leadId, deps()))),
      reset: () => {
        email.calls.length = 0;
        set({
          ...apply({ ok: true, state: resetDemo({ clock: systemClock }), message: "Demo reset. Fictional seed leads restored." }),
        });
      },
      clearNotice: () => set({ notice: null }),
    }),
    {
      name: "agentic-outreach-reference-v1",
      skipHydration: true,
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      partialize: (state) => ({
        leads: state.leads,
        events: state.events,
        suppressedEmails: state.suppressedEmails,
        successfulSendAt: state.successfulSendAt,
      }),
    },
  ),
);
