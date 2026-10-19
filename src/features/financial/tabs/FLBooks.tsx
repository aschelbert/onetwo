/**
 * FLBooks.tsx -- Books tab container with segmented navigation.
 *
 * Segments: Ledger, Statements, Accounts (CoA), Reconcile, Tax Forms
 */

import { useState } from 'react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import BooksLedger from './BooksLedger';
import BooksStatements from './BooksStatements';
import BooksAccounts from './BooksAccounts';
import BooksReconcile from './BooksReconcile';
import BooksTaxForms from './BooksTaxForms';
import GLMappingConfig from './GLMappingConfig';

type BooksSegment = 'ledger' | 'statements' | 'accounts' | 'reconcile' | 'tax_forms' | 'gl_mapping';

const SEGMENTS: Array<{ value: BooksSegment; label: string }> = [
  { value: 'ledger', label: 'Ledger' },
  { value: 'statements', label: 'Statements' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'reconcile', label: 'Reconcile' },
  { value: 'tax_forms', label: 'Tax Forms' },
  { value: 'gl_mapping', label: 'GL Mapping' },
];

export default function FLBooks() {
  const [segment, setSegment] = useState<BooksSegment>('ledger');

  return (
    <div>
      <div className="mb-4">
        <SegmentedControl<BooksSegment>
          options={SEGMENTS}
          value={segment}
          onChange={setSegment}
          size="sm"
        />
      </div>
      {segment === 'ledger' && <BooksLedger />}
      {segment === 'statements' && <BooksStatements />}
      {segment === 'accounts' && <BooksAccounts />}
      {segment === 'reconcile' && <BooksReconcile />}
      {segment === 'tax_forms' && <BooksTaxForms />}
      {segment === 'gl_mapping' && <GLMappingConfig />}
    </div>
  );
}
