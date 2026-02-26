#!/bin/bash
set -e
echo "============================================================"
echo " OneTwo Patch — Fix 7 TS errors (3 issues)"
echo "============================================================"
cd "$(dirname "$0")/.."

echo "[1/3] Fix toggleCompletion -> toggleItem in BoardRoomPage.tsx"
sed -i '' 's/comp\.toggleCompletion/comp.toggleItem/g' src/features/boardroom/BoardRoomPage.tsx

echo "[2/3] Fix toggleCompletion -> toggleItem in CompliancePage.tsx"
sed -i '' 's/comp\.toggleCompletion/comp.toggleItem/g' src/features/compliance/CompliancePage.tsx

echo "[3/3] Add documents:[] to all seed meetings in useMeetingsStore.ts"
sed -i '' 's/linkedVoteIds:\[\] }/linkedVoteIds:[], documents:[] }/g' src/store/useMeetingsStore.ts
sed -i '' 's/linkedVoteIds:\[\], votes:/linkedVoteIds:[], documents:[], votes:/g' src/store/useMeetingsStore.ts

echo ""
echo "Verifying fixes..."
ERRORS=0
if grep -q "toggleCompletion" src/features/boardroom/BoardRoomPage.tsx; then echo "  FAIL: BoardRoomPage still has toggleCompletion"; ERRORS=1; else echo "  OK: BoardRoomPage"; fi
if grep -q "toggleCompletion" src/features/compliance/CompliancePage.tsx; then echo "  FAIL: CompliancePage still has toggleCompletion"; ERRORS=1; else echo "  OK: CompliancePage"; fi
if grep "linkedVoteIds:\[\] }" src/store/useMeetingsStore.ts | grep -qv "documents"; then echo "  FAIL: useMeetingsStore still missing documents"; ERRORS=1; else echo "  OK: useMeetingsStore"; fi

if [ $ERRORS -eq 1 ]; then echo "VERIFICATION FAILED"; exit 1; fi

echo ""
echo "Building..."
npm run build
if [ $? -eq 0 ]; then
  echo ""
  echo "BUILD SUCCESSFUL — now run the full deploy-v5 script"
else
  echo "BUILD FAILED"; exit 1
fi
