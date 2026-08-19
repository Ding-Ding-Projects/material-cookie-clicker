import { securitySearchMatches, type SecuritySearchState } from "./security-search.js";

export type TicketSeverity = "low" | "medium" | "high";
export type TicketState = "open" | "in-progress" | "resolved";
export type SupportTicket = { id: string; title: string; body: string; severity: TicketSeverity; state: TicketState; createdAt: string; updatedAt: string };

const TRANSITIONS: Record<TicketState, readonly TicketState[]> = { open: ["in-progress", "resolved"], "in-progress": ["resolved", "open"], resolved: ["open"] };
const SENSITIVE = [
  /\b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/g,
  /(?:[$€£]\s?\d[\d,]*(?:\.\d{1,2})?)|(?:\b\d[\d,]*\.\d{2}\s?(?:CAD|USD)\b)/gi,
  /(?:^|\s)(?:\/(?:[^\s/]+\/)+[^\s/]*|[A-Za-z]:\\(?:[^\s\\]+\\)*[^\s\\]*)/g,
];

function redact(body: string): string {
  let output = body.slice(0, 4000);
  for (const pattern of SENSITIVE) output = output.replace(new RegExp(pattern.source, pattern.flags), "[removed]");
  return output;
}

export function createLocalTicket(input: { id: string; title: string; body: string; severity: TicketSeverity; at: string }): SupportTicket {
  return { id: input.id, title: input.title.trim().slice(0, 120), body: redact(input.body), severity: input.severity, state: "open", createdAt: input.at, updatedAt: input.at };
}

export function advanceLocalTicket(ticket: SupportTicket, next: TicketState, at: string): SupportTicket {
  return TRANSITIONS[ticket.state].includes(next) ? { ...ticket, state: next, updatedAt: at } : ticket;
}

export function filterLocalTickets(tickets: readonly SupportTicket[], search: SecuritySearchState): SupportTicket[] {
  return tickets.filter((ticket) => securitySearchMatches(`${ticket.title} ${ticket.body} ${ticket.severity} ${ticket.state}`, search));
}
