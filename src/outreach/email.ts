/**
 * Outbound delivery provider boundary.
 *
 * Application / execution service
 *      ↓
 * Email Provider Interface
 *      ↓
 * MockEmailProvider
 *
 * No real email leaves this process. The adapter is the only place a future
 * implementation would talk to a transactional mail API. Lifecycle authority
 * stays in the execution service, which inspects the structured result
 * before advancing state.
 *
 * A generic CRM/provider boundary could be implemented against an external
 * system without moving lifecycle authority into the AI layer. Those
 * integrations are not implemented here.
 */

export type DeliveryStatus = "sent" | "failed" | "bounced";

export interface SendRequest {
  lead_id: string;
  recipient: string;
  subject: string;
  body: string;
}

export interface DeliveryResult {
  provider: string;
  event_id: string;
  status: DeliveryStatus;
  timestamp: string;
  error: string | null;
}

export interface EmailProvider {
  readonly name: string;
  send(request: SendRequest): DeliveryResult;
}

/**
 * Deterministic mock.
 *
 *   recipient contains "+fail"     → failed
 *   recipient contains "+bounce"   → bounced
 *   otherwise                      → sent
 *
 * Reviewers can force an outcome from the dashboard by choosing the address.
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = "MockEmailProvider";
  readonly calls: SendRequest[] = [];
  private seq = 0;

  send(request: SendRequest): DeliveryResult {
    this.calls.push(request);
    this.seq += 1;
    const local = request.recipient.toLowerCase();
    const timestamp = new Date().toISOString();
    const event_id = `mock_${this.seq}`;

    if (local.includes("+fail") || local.endsWith("@fail.example.com")) {
      return {
        provider: this.name,
        event_id,
        status: "failed",
        timestamp,
        error: "Mock provider refused delivery (forced failure address).",
      };
    }
    if (local.includes("+bounce") || local.endsWith("@bounce.example.com")) {
      return {
        provider: this.name,
        event_id,
        status: "bounced",
        timestamp,
        error: "Mock provider reported a bounce (forced bounce address).",
      };
    }
    return {
      provider: this.name,
      event_id,
      status: "sent",
      timestamp,
      error: null,
    };
  }
}
