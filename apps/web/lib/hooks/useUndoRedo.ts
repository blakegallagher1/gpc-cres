"use client";

import { useState, useCallback } from "react";

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

interface UseUndoRedoOptions<T> {
  maxHistory?: number;
  onChange?: (state: T) => void;
}

export function useUndoRedo<T>(
  initialState: T,
  options: UseUndoRedoOptions<T> = {}
) {
  const { maxHistory = 50, onChange } = options;

  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const setState = useCallback(
    (newState: T | ((prev: T) => T)) => {
      setHistory((prev) => {
        const resolvedState =
          typeof newState === "function"
            ? (newState as (prev: T) => T)(prev.present)
            : newState;

        const newPast = [...prev.past, prev.present];
        
        // Limit history size
        if (newPast.length > maxHistory) {
          newPast.shift();
        }

        onChange?.(resolvedState);

        return {
          past: newPast,
          present: resolvedState,
          future: [],
        };
      });
    },
    [maxHistory, onChange]
  );

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;

      const previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, -1);

      onChange?.(previous);

      return {
        past: newPast,
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, [onChange]);

  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;

      const next = prev.future[0];
      const newFuture = prev.future.slice(1);

      onChange?.(next);

      return {
        past: [...prev.past, prev.present],
        present: next,
        future: newFuture,
      };
    });
  }, [onChange]);

  const reset = useCallback(
    (state: T = initialState) => {
      setHistory({
        past: [],
        present: state,
        future: [],
      });
      onChange?.(state);
    },
    [initialState, onChange]
  );

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifierKey = isMac ? event.metaKey : event.ctrlKey;

      if (modifierKey && event.key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if (modifierKey && (event.key === "y" || (event.shiftKey && event.key === "Z"))) {
        event.preventDefault();
        redo();
      }
    },
    [undo, redo]
  );

  return {
    state: history.present,
    setState,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
    handleKeyDown,
    historyLength: history.past.length,
  };
}

// Specialized hook for workflow builder
interface WorkflowState {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
  }>;
}

export function useWorkflowHistory(initialWorkflow: WorkflowState) {
  return useUndoRedo<WorkflowState>(initialWorkflow, {
    maxHistory: 100,
  });
}
