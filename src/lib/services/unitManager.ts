import { supabase, logDbError } from '@/lib/supabase';
import type { UnitDocument, MoveEvent } from '@/types/financial';

// ── Unit Documents ──

export function rowToUnitDocument(r: Record<string, unknown>): UnitDocument {
  return {
    id: r.id as string,
    unitNumber: r.unit_number as string,
    uploadedBy: (r.uploaded_by as string) || null,
    uploadedByName: (r.uploaded_by_name as string) || null,
    filename: r.filename as string,
    storagePath: r.storage_path as string,
    docType: (r.doc_type as string) || 'general',
    visibleToOwner: r.visible_to_owner as boolean,
    createdAt: r.created_at as string,
  };
}

export async function fetchUnitDocuments(tenantId: string): Promise<UnitDocument[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('unit_documents')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) { logDbError('fetchUnitDocuments error:', error); return null; }
  return (data || []).map(rowToUnitDocument);
}

export async function uploadUnitDocument(
  tenantId: string,
  unitNumber: string,
  file: File,
  docType: string,
  visibleToOwner: boolean,
  uploadedBy: string | null,
  uploadedByName: string | null,
): Promise<UnitDocument | null> {
  if (!supabase) return null;

  // Upload file to storage
  const path = `${tenantId}/${unitNumber}/${Date.now()}-${file.name}`;
  const { error: storageError } = await supabase.storage
    .from('unit-documents')
    .upload(path, file);
  if (storageError) { logDbError('uploadUnitDocument storage error:', storageError); return null; }

  // Insert record
  const { data, error } = await supabase
    .from('unit_documents')
    .insert({
      tenant_id: tenantId,
      unit_number: unitNumber,
      uploaded_by: uploadedBy,
      uploaded_by_name: uploadedByName,
      filename: file.name,
      storage_path: path,
      doc_type: docType,
      visible_to_owner: visibleToOwner,
    })
    .select()
    .single();
  if (error) { logDbError('uploadUnitDocument insert error:', error); return null; }
  return rowToUnitDocument(data);
}

export async function deleteUnitDocument(id: string, storagePath: string): Promise<boolean> {
  if (!supabase) return false;
  // Delete from storage
  await supabase.storage.from('unit-documents').remove([storagePath]);
  // Delete record
  const { error } = await supabase.from('unit_documents').delete().eq('id', id);
  if (error) { logDbError('deleteUnitDocument error:', error); return false; }
  return true;
}

export async function getDocumentSignedUrl(storagePath: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from('unit-documents')
    .createSignedUrl(storagePath, 3600); // 1 hour
  if (error) { logDbError('getDocumentSignedUrl error:', error); return null; }
  return data?.signedUrl || null;
}

// ── Move Events ──

export function rowToMoveEvent(r: Record<string, unknown>): MoveEvent {
  return {
    id: r.id as string,
    unitNumber: r.unit_number as string,
    moveType: r.move_type as 'in' | 'out',
    scheduledDate: r.scheduled_date as string,
    timeWindow: (r.time_window as string) || null,
    elevatorSlot: (r.elevator_slot as string) || null,
    depositAmount: Number(r.deposit_amount || 0),
    depositStatus: (r.deposit_status as MoveEvent['depositStatus']) || 'pending',
    accessStatus: (r.access_status as MoveEvent['accessStatus']) || 'pending',
    insuranceConfirmed: (r.insurance_confirmed as boolean) || false,
    inspectionStatus: (r.inspection_status as MoveEvent['inspectionStatus']) || 'pending',
    residentName: (r.resident_name as string) || null,
    moverName: (r.mover_name as string) || null,
    caseId: (r.case_id as string) || null,
    notes: (r.notes as string) || null,
    createdAt: r.created_at as string,
  };
}

export async function fetchMoveEvents(tenantId: string): Promise<MoveEvent[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('move_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('scheduled_date', { ascending: false });
  if (error) { logDbError('fetchMoveEvents error:', error); return null; }
  return (data || []).map(rowToMoveEvent);
}

export async function createMoveEvent(
  tenantId: string,
  event: Omit<MoveEvent, 'id' | 'createdAt'>,
): Promise<MoveEvent | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('move_events')
    .insert({
      tenant_id: tenantId,
      unit_number: event.unitNumber,
      move_type: event.moveType,
      scheduled_date: event.scheduledDate,
      time_window: event.timeWindow,
      elevator_slot: event.elevatorSlot,
      deposit_amount: event.depositAmount,
      deposit_status: event.depositStatus,
      access_status: event.accessStatus,
      insurance_confirmed: event.insuranceConfirmed,
      inspection_status: event.inspectionStatus,
      resident_name: event.residentName,
      mover_name: event.moverName,
      case_id: event.caseId,
      notes: event.notes,
    })
    .select()
    .single();
  if (error) { logDbError('createMoveEvent error:', error); return null; }
  return rowToMoveEvent(data);
}

export async function updateMoveEvent(id: string, updates: Partial<MoveEvent>): Promise<boolean> {
  if (!supabase) return false;
  const row: Record<string, unknown> = {};
  if (updates.moveType !== undefined) row.move_type = updates.moveType;
  if (updates.scheduledDate !== undefined) row.scheduled_date = updates.scheduledDate;
  if (updates.timeWindow !== undefined) row.time_window = updates.timeWindow;
  if (updates.elevatorSlot !== undefined) row.elevator_slot = updates.elevatorSlot;
  if (updates.depositAmount !== undefined) row.deposit_amount = updates.depositAmount;
  if (updates.depositStatus !== undefined) row.deposit_status = updates.depositStatus;
  if (updates.accessStatus !== undefined) row.access_status = updates.accessStatus;
  if (updates.insuranceConfirmed !== undefined) row.insurance_confirmed = updates.insuranceConfirmed;
  if (updates.inspectionStatus !== undefined) row.inspection_status = updates.inspectionStatus;
  if (updates.residentName !== undefined) row.resident_name = updates.residentName;
  if (updates.moverName !== undefined) row.mover_name = updates.moverName;
  if (updates.caseId !== undefined) row.case_id = updates.caseId;
  if (updates.notes !== undefined) row.notes = updates.notes;
  const { error } = await supabase.from('move_events').update(row).eq('id', id);
  if (error) { logDbError('updateMoveEvent error:', error); return false; }
  return true;
}
