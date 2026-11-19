// supabase/functions/_shared/mailRecords.ts
// The building's letter history (mail_records). send-mail writes a row as a
// letter goes out and check-mail-status updates it, both with the service
// role, so the record does not depend on the sender's browser.

import { restGetOne, restWrite } from "./supabaseRest.ts";

export interface StatusEvent { status: string; timestamp: string; source: string; detail?: string }

/** The record as the app reads it (src/types/mail.ts MailRecord). */
// deno-lint-ignore no-explicit-any
export type MailRecordData = Record<string, any> & { id: string; status: string; statusHistory: StatusEvent[] };

/** Who may read and update the building's letters. */
export const canManageMail = (tu: { role: string; is_account_owner?: boolean } | null): boolean =>
  !!tu && (tu.role === "board_member" || tu.role === "property_manager" || !!tu.is_account_owner);

/** App record ids only: nothing that could reach into a query string. */
export const validRecordId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(id);

/** What the browser says about the letter, kept only where it is the right shape and a sane size. */
export function clientFields(r: unknown): Record<string, unknown> {
  const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
  const str = (v: unknown, n: number) => (typeof v === "string" && v ? v.slice(0, n) : undefined);
  const out: Record<string, unknown> = {
    stepId: str(o.stepId, 64),
    templateName: str(o.templateName, 200),
    emailCopy: !!o.emailCopy,
    emailAddress: str(o.emailAddress, 320),
  };
  const c = (o.cost && typeof o.cost === "object" ? o.cost : null) as Record<string, unknown> | null;
  if (c) {
    const cents = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 10_000_000 ? Math.round(v) : 0);
    out.cost = { baseCostCents: cents(c.baseCostCents), additionalPagesCents: cents(c.additionalPagesCents), returnEnvelopeCents: cents(c.returnEnvelopeCents), totalCents: cents(c.totalCents) };
  }
  if (o.mergeVariables && typeof o.mergeVariables === "object" && JSON.stringify(o.mergeVariables).length <= 8000) out.mergeVariables = o.mergeVariables;
  return out;
}

export async function saveMailRecord(tenantId: string, userId: string | null, data: MailRecordData): Promise<boolean> {
  return await restWrite("POST", "mail_records?on_conflict=tenant_id,id", {
    tenant_id: tenantId,
    id: data.id,
    case_id: data.caseId ? String(data.caseId).slice(0, 120) : null,
    provider: data.mailProvider,
    delivery_method: data.deliveryMethod,
    status: data.status,
    job_id: data.letterstreamJobId || null,
    tracking_number: data.trackingNumber || null,
    data,
    ...(userId ? { sent_by: userId } : {}),
  }, "resolution=merge-duplicates,return=minimal");
}

export async function getMailRecord(tenantId: string, id: string): Promise<MailRecordData | null> {
  const row = await restGetOne("mail_records", { "tenant_id": `eq.${tenantId}`, "id": `eq.${id}`, "select": "id,data" });
  return row?.data ? { ...row.data, id: row.id } : null;
}
