import { useRef, useState } from 'react';

interface FileUploadProps {
  onFileSelected: (file: { name: string; size: string; type: string; dataUrl?: string }) => void;
  accept?: string;
  label?: string;
  compact?: boolean;
}

export default function FileUpload({ onFileSelected, accept, label, compact }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedName, setSelectedName] = useState('');

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedName(file.name);
      onFileSelected({
        name: file.name,
        size: formatSize(file.size),
        type: file.name.split('.').pop()?.toLowerCase() || 'unknown',
        dataUrl: reader.result as string,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} className="text-[11px] text-accent-600 font-medium hover:text-accent-700 border border-dashed border-accent-300 rounded-lg px-2.5 py-1 hover:bg-accent-50">
          {selectedName ? `📎 ${selectedName}` : (label || '📎 Choose file')}
        </button>
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${dragging ? 'border-accent-500 bg-accent-50' : selectedName ? 'border-sage-300 bg-sage-50' : 'border-ink-200 hover:border-accent-300 hover:bg-mist-50'}`}
      >
        {selectedName ? (
          <div><span className="text-sage-600 text-sm font-medium">📎 {selectedName}</span><p className="text-[10px] text-ink-400 mt-1">Click or drop to replace</p></div>
        ) : (
          <div><p className="text-sm text-ink-600">{label || 'Drop a file here or click to browse'}</p><p className="text-[10px] text-ink-400 mt-1">{accept ? `Accepts: ${accept}` : 'PDF, Word, Excel, Images'}</p></div>
        )}
      </div>
      <input ref={inputRef} type="file" accept={accept || '.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png'} className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
    </div>
  );
}

