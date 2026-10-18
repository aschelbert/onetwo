/**
 * useRunbook — shared hook for fetching compliance requirements.
 * Used by both the BoardRoomPage (Governance Calendar) and the RunbookDrawer.
 */

import { useMemo } from 'react';
import { useBuildingStore } from '@/store/useBuildingStore';
import {
  refreshComplianceRequirements,
  type ComplianceItem,
  type ComplianceCategory,
  type RefreshResult,
} from '@/lib/complianceRefresh';

export interface RunbookData {
  result: RefreshResult;
  categories: ComplianceCategory[];
  allItems: ComplianceItem[];
  findItem: (itemId: string) => ComplianceItem | undefined;
  findCategoryForItem: (itemId: string) => ComplianceCategory | undefined;
}

export function useRunbook(): RunbookData {
  const { address, legalDocuments, insurance, board, management } = useBuildingStore();

  return useMemo(() => {
    const result = refreshComplianceRequirements({
      state: address.state,
      legalDocuments: legalDocuments.map((d) => ({ name: d.name, status: d.status })),
      insurance: insurance.map((p) => ({ type: p.type, expires: p.expires })),
      boardCount: board.length,
      hasManagement: !!management.company,
    });

    const allItems = result.categories.flatMap((c) => c.items);

    const findItem = (itemId: string) => allItems.find((i) => i.id === itemId);

    const findCategoryForItem = (itemId: string) =>
      result.categories.find((c) => c.items.some((i) => i.id === itemId));

    return {
      result,
      categories: result.categories,
      allItems,
      findItem,
      findCategoryForItem,
    };
  }, [address.state, legalDocuments, insurance, board.length, management.company]);
}
