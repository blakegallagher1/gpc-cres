"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Controlled/uncontrolled selection helper for map parcel ids.
 */
export function useMapSelection(params: {
  selectedParcelIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
}) {
  const controlled = params.selectedParcelIds !== undefined;
  const onSelectionChange = params.onSelectionChange;
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const selectedIds = params.selectedParcelIds ?? internalSelectedIds;
  const selectedIdsRef = useRef(selectedIds);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  const updateSelection = useCallback(
    (parcelId: string, isMultiSelect: boolean) => {
      const next = new Set(selectedIdsRef.current);
      if (isMultiSelect) {
        if (next.has(parcelId)) next.delete(parcelId);
        else next.add(parcelId);
      } else {
        next.clear();
        next.add(parcelId);
      }

      selectedIdsRef.current = next;
      if (controlled) {
        onSelectionChange?.(next);
        return;
      }

      setInternalSelectedIds(next);
      onSelectionChange?.(next);
    },
    [controlled, onSelectionChange],
  );

  const clearSelection = useCallback(() => {
    const next = new Set<string>();
    selectedIdsRef.current = next;
    if (controlled) {
      onSelectionChange?.(next);
      return;
    }
    setInternalSelectedIds(next);
    onSelectionChange?.(next);
  }, [controlled, onSelectionChange]);

  return useMemo(
    () => ({
      selectedIds,
      updateSelection,
      clearSelection,
    }),
    [clearSelection, selectedIds, updateSelection],
  );
}
