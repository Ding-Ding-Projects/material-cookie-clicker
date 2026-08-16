/**
 * Local support tickets.
 *
 * A ticket is a note a person writes about a problem. Because such a note can
 * easily contain something that should not be kept, the body is redacted
 * before it is stored or exported: anything shaped like a government
 * identifier, a monetary amount or an absolute filesystem path is replaced,
 * and the categories that were replaced are reported back.
 */

import { matchesSearch, type SearchState } from "./regex-builder.ts";

export type TicketSeverity = "low" | "medium" | "high";
export type TicketState = "open" | "in-progress" | "resolved";

export type SupportTicket = {
  id: string;
  title: string;
  body: string;
  severity: TicketSeverity;
  state: TicketState;
  createdAt: string;
  updatedAt: string;
};

export const MAX_TICKET_TITLE_LENGTH = 120;
export const MAX_TICKET_BODY_LENGTH = 4000;
export const REDACTION_MARKER = "[removed]";

const REDACTION_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "government identifier", pattern: /\b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/g },
  { label: "monetary amount", pattern: /(?:[$€£]\s?\d[\d,]*(?:\.\d{1,2})?)|(?:\b\d[\d,]*\.\d{2}\s?(?:CAD|USD)\b)/gi },
  { label: "absolute path", pattern: /(?:^|\s)(?:\/(?:[^\s/]+\/)+[^\s/]*|[A-Za-z]:\\(?:[^\s\\]+\\)*[^\s\\]*)/g },
];

/** The state a ticket may move to next. */
export const TICKET_TRANSITIONS: Record<TicketState, TicketState[]> = {
  open: ["in-progress", "resolved"],
  "in-progress": ["resolved", "open"],
  resolved: ["open"],
};

/**
 * Strips anything shaped like sensitive content and names the categories that
 * were replaced.
 */
export function redactTicketBody(body: string): { body: string; redacted: string[] } {
  let output = body;
  const redacted: string[] = [];
  for (const { label, pattern } of REDACTION_PATTERNS) {
    const expression = new RegExp(pattern.source, pattern.flags);
    if (!expression.test(output)) continue;
    redacted.push(label);
    const replacer = new RegExp(pattern.source, pattern.flags);
    output = output.replace(replacer, (match) => {
      const leading = /^\s/.test(match) ? match.slice(0, 1) : "";
      return `${leading}${REDACTION_MARKER}`;
    });
  }
  return { body: output, redacted };
}

/** Creates a ticket with a redacted body. */
export function createTicket(input: {
  id: string;
  title: string;
  body: string;
  severity: TicketSeverity;
  createdAt: string;
}): { ticket: SupportTicket; redacted: string[] } {
  const { body, redacted } = redactTicketBody(input.body.slice(0, MAX_TICKET_BODY_LENGTH));
  return {
    ticket: {
      id: input.id,
      title: input.title.slice(0, MAX_TICKET_TITLE_LENGTH),
      body,
      severity: input.severity,
      state: "open",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    },
    redacted,
  };
}

/** Moves a ticket to an allowed next state, or returns it unchanged. */
export function advanceTicket(ticket: SupportTicket, next: TicketState, atIso: string): SupportTicket {
  if (!TICKET_TRANSITIONS[ticket.state].includes(next)) return ticket;
  return { ...ticket, state: next, updatedAt: atIso };
}

/** Filters tickets with the shared search engine. */
export function filterTickets(list: readonly SupportTicket[], state: SearchState): SupportTicket[] {
  return list.filter((ticket) =>
    matchesSearch(`${ticket.title} ${ticket.body} ${ticket.severity} ${ticket.state}`, state),
  );
}
