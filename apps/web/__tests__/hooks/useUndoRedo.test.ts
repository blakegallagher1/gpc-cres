import { renderHook, act } from "@testing-library/react";
import { useUndoRedo } from "@/lib/hooks/useUndoRedo";

describe("useUndoRedo", () => {
  const initialState = { count: 0, name: "test" };

  it("should initialize with the correct state", () => {
    const { result } = renderHook(() => useUndoRedo(initialState));

    expect(result.current.state).toEqual(initialState);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("should update state and enable undo", () => {
    const { result } = renderHook(() => useUndoRedo(initialState));

    act(() => {
      result.current.setState({ count: 1, name: "test" });
    });

    expect(result.current.state).toEqual({ count: 1, name: "test" });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("should undo state changes", () => {
    const { result } = renderHook(() => useUndoRedo(initialState));

    act(() => {
      result.current.setState({ count: 1, name: "test" });
    });

    act(() => {
      result.current.undo();
    });

    expect(result.current.state).toEqual(initialState);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it("should redo state changes", () => {
    const { result } = renderHook(() => useUndoRedo(initialState));

    act(() => {
      result.current.setState({ count: 1, name: "test" });
    });

    act(() => {
      result.current.undo();
    });

    act(() => {
      result.current.redo();
    });

    expect(result.current.state).toEqual({ count: 1, name: "test" });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("should clear redo history on new state change", () => {
    const { result } = renderHook(() => useUndoRedo(initialState));

    act(() => {
      result.current.setState({ count: 1, name: "test" });
    });

    act(() => {
      result.current.undo();
    });

    act(() => {
      result.current.setState({ count: 2, name: "test" });
    });

    expect(result.current.canRedo).toBe(false);
    expect(result.current.state).toEqual({ count: 2, name: "test" });
  });

  it("should support functional state updates", () => {
    const { result } = renderHook(() => useUndoRedo(initialState));

    act(() => {
      result.current.setState((prev) => ({ ...prev, count: prev.count + 1 }));
    });

    expect(result.current.state.count).toBe(1);
  });

  it("should reset to initial state", () => {
    const { result } = renderHook(() => useUndoRedo(initialState));

    act(() => {
      result.current.setState({ count: 5, name: "changed" });
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toEqual(initialState);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("should respect maxHistory option", () => {
    const { result } = renderHook(() =>
      useUndoRedo(initialState, { maxHistory: 3 })
    );

    act(() => result.current.setState({ count: 1, name: "test" }));
    act(() => result.current.setState({ count: 2, name: "test" }));
    act(() => result.current.setState({ count: 3, name: "test" }));
    act(() => result.current.setState({ count: 4, name: "test" }));

    expect(result.current.historyLength).toBe(3);
  });

  it("should call onChange callback", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useUndoRedo(initialState, { onChange })
    );

    act(() => {
      result.current.setState({ count: 1, name: "test" });
    });

    expect(onChange).toHaveBeenCalledWith({ count: 1, name: "test" });
  });
});
