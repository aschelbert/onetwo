import { useState } from 'react';
import { useFinancialStore } from '@/store/useFinancialStore';
import { useAuthStore } from '@/store/useAuthStore';
import { getDocumentSignedUrl } from '@/lib/services/unitManager';
import type { Unit } from '@/types/financial';

const DOC_TYPES = ['general', 'lease', 'insurance', 'inspection', 'correspondence', 'move', 'other'] as const;

export default function MyDocumentsTab({ activeUnit }: { activeUnit: Unit }) {
  const { currentUser } = useAuthStore();
  const { unitDocuments, uploadDocument, deleteDocument } = useFinancialStore();
  const isBoard = currentUser?.role !== 'RESIDENT';

  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState<string>('general');
  const [visibleToOwner, setVisibleToOwner] = useState(true);

  const myDocs = unitDocuments.filter(d => d.unitNumber === activeUnit.number);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    await uploadDocument(
      activeUnit.number,
      file,
      docType,
      visibleToOwner,
      currentUser?.id || null,
      currentUser?.name || null,
    );
    setUploading(false);
    e.target.value = '';
  };

  const handleDownload = async (storagePath: string, filename: string) => {
    const url = await getDocumentSignedUrl(storagePath);
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.target = '_blank';
      a.click();
    } else {
      alert('Could not generate download link.');
    }
  };

  const handleDelete = async (id: string, storagePath: string) => {
    if (!confirm('Delete this document?')) return;
    await deleteDocument(id, storagePath);
  };

  const docTypeLabel = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

  return (
    <div className="space-y-4">
      {/* Upload (board/PM only) */}
      {isBoard && (
        <div className="bg-white rounded-xl border border-ink-100 p-4 space-y-3">
          <h4 className="text-sm font-semibold text-ink-800">Upload Document</h4>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-ink-600 mb-1">Document Type</label>
              <select value={docType} onChange={e => setDocType(e.target.value)} className="px-3 py-2 border border-ink-200 rounded-lg text-sm">
                {DOC_TYPES.map(t => <option key={t} value={t}>{docTypeLabel(t)}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-600">
              <input type="checkbox" checked={visibleToOwner} onChange={e => setVisibleToOwner(e.target.checked)} className="rounded" />
              Visible to owner
            </label>
            <label className={`px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all ${uploading ? 'bg-ink-100 text-ink-400' : 'bg-accent-600 text-white hover:bg-accent-700'}`}>
              {uploading ? 'Uploading...' : 'Choose File'}
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        </div>
      )}

      {/* Document List */}
      {myDocs.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📄</div>
          <p className="text-sm text-ink-500">No documents for this unit yet.</p>
          {isBoard && <p className="text-xs text-ink-400 mt-1">Use the upload form above to add documents.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {myDocs.map(doc => (
            <div key={doc.id} className="flex items-center justify-between p-3 bg-white border border-ink-100 rounded-xl hover:border-ink-200 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-mist-50 flex items-center justify-center shrink-0">
                  <span className="text-lg">📄</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900 truncate">{doc.filename}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-ink-50 text-ink-500 font-medium">{docTypeLabel(doc.docType)}</span>
                    {doc.uploadedByName && <span className="text-[10px] text-ink-400">by {doc.uploadedByName}</span>}
                    <span className="text-[10px] text-ink-300">{new Date(doc.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => handleDownload(doc.storagePath, doc.filename)} className="px-3 py-1.5 text-xs font-medium text-accent-600 border border-accent-200 rounded-lg hover:bg-accent-50">Download</button>
                {isBoard && (
                  <button onClick={() => handleDelete(doc.id, doc.storagePath)} className="px-3 py-1.5 text-xs font-medium text-red-500 border border-red-200 rounded-lg hover:bg-red-50">Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
