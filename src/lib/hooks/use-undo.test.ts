import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useUndo } from "./use-undo";
import { toast } from "sonner";

// Mock sonner
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock crypto.randomUUID
const mockUUID = "test-uuid-123";
vi.stubGlobal("crypto", {
  randomUUID: () => mockUUID,
});

describe("useUndo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should return executeWithUndo, cancelUndo, and isUndoActive functions", () => {
    const { result } = renderHook(() => useUndo());

    expect(result.current.executeWithUndo).toBeInstanceOf(Function);
    expect(result.current.cancelUndo).toBeInstanceOf(Function);
    expect(result.current.isUndoActive).toBeInstanceOf(Function);
  });

  it("should execute the action and show toast with undo button", async () => {
    const { result } = renderHook(() => useUndo());
    const executeFn = vi.fn();
    const undoFn = vi.fn();

    await act(async () => {
      await result.current.executeWithUndo({
        execute: executeFn,
        undo: undoFn,
        message: "Item deleted",
        type: "delete_item",
        data: { id: "123" },
      });
    });

    expect(executeFn).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("Item deleted", {
      duration: 5000,
      action: expect.objectContaining({
        label: "Undo",
        onClick: expect.any(Function),
      }),
      onDismiss: expect.any(Function),
      onAutoClose: expect.any(Function),
    });
  });

  it("should use custom toast duration when provided", async () => {
    const { result } = renderHook(() => useUndo({ toastDuration: 10000 }));
    const executeFn = vi.fn();
    const undoFn = vi.fn();

    await act(async () => {
      await result.current.executeWithUndo({
        execute: executeFn,
        undo: undoFn,
        message: "Test action",
        type: "test",
      });
    });

    expect(toast).toHaveBeenCalledWith("Test action", expect.objectContaining({
      duration: 10000,
    }));
  });

  it("should call undo function when undo action is clicked", async () => {
    const { result } = renderHook(() => useUndo());
    const executeFn = vi.fn();
    const undoFn = vi.fn();

    await act(async () => {
      await result.current.executeWithUndo({
        execute: executeFn,
        undo: undoFn,
        message: "Item deleted",
        type: "delete_item",
      });
    });

    // Get the action onClick handler from the toast call
    const toastCall = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const actionOnClick = toastCall[1].action.onClick;

    // Trigger the undo
    await act(async () => {
      await actionOnClick();
    });

    expect(undoFn).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Action undone");
  });

  it("should not call undo function twice when clicked multiple times", async () => {
    const { result } = renderHook(() => useUndo());
    const executeFn = vi.fn();
    const undoFn = vi.fn();

    await act(async () => {
      await result.current.executeWithUndo({
        execute: executeFn,
        undo: undoFn,
        message: "Item deleted",
        type: "delete_item",
      });
    });

    // Get the action onClick handler
    const toastCall = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const actionOnClick = toastCall[1].action.onClick;

    // Trigger undo twice
    await act(async () => {
      await actionOnClick();
      await actionOnClick();
    });

    // Should only be called once
    expect(undoFn).toHaveBeenCalledTimes(1);
  });

  it("should return action ID from executeWithUndo", async () => {
    const { result } = renderHook(() => useUndo());

    let actionId: string | undefined;
    await act(async () => {
      actionId = await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: vi.fn(),
        message: "Test",
        type: "test",
      });
    });

    expect(actionId).toBe(mockUUID);
  });

  it("should track active undo actions", async () => {
    const { result } = renderHook(() => useUndo());

    await act(async () => {
      await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: vi.fn(),
        message: "Test",
        type: "test",
      });
    });

    // Should be active before undo
    expect(result.current.isUndoActive(mockUUID)).toBe(true);
  });

  it("should remove action from active after undo is executed", async () => {
    const { result } = renderHook(() => useUndo());

    await act(async () => {
      await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: vi.fn(),
        message: "Test",
        type: "test",
      });
    });

    // Get the action onClick handler
    const toastCall = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const actionOnClick = toastCall[1].action.onClick;

    // Trigger undo
    await act(async () => {
      await actionOnClick();
    });

    // Should no longer be active
    expect(result.current.isUndoActive(mockUUID)).toBe(false);
  });

  it("should cancel undo action with cancelUndo", async () => {
    const { result } = renderHook(() => useUndo());

    await act(async () => {
      await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: vi.fn(),
        message: "Test",
        type: "test",
      });
    });

    expect(result.current.isUndoActive(mockUUID)).toBe(true);

    // Cancel the undo
    act(() => {
      result.current.cancelUndo(mockUUID);
    });

    expect(result.current.isUndoActive(mockUUID)).toBe(false);
  });

  it("should clean up action on toast dismiss", async () => {
    const { result } = renderHook(() => useUndo());

    await act(async () => {
      await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: vi.fn(),
        message: "Test",
        type: "test",
      });
    });

    expect(result.current.isUndoActive(mockUUID)).toBe(true);

    // Get the onDismiss handler
    const toastCall = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const onDismiss = toastCall[1].onDismiss;

    // Trigger dismiss
    act(() => {
      onDismiss();
    });

    expect(result.current.isUndoActive(mockUUID)).toBe(false);
  });

  it("should clean up action on toast auto-close", async () => {
    const { result } = renderHook(() => useUndo());

    await act(async () => {
      await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: vi.fn(),
        message: "Test",
        type: "test",
      });
    });

    expect(result.current.isUndoActive(mockUUID)).toBe(true);

    // Get the onAutoClose handler
    const toastCall = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const onAutoClose = toastCall[1].onAutoClose;

    // Trigger auto-close
    act(() => {
      onAutoClose();
    });

    expect(result.current.isUndoActive(mockUUID)).toBe(false);
  });

  it("should handle async execute functions", async () => {
    // Use real timers for this test
    vi.useRealTimers();

    const { result } = renderHook(() => useUndo());
    const executeFn = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      await result.current.executeWithUndo({
        execute: executeFn,
        undo: vi.fn(),
        message: "Async action",
        type: "async",
      });
    });

    expect(executeFn).toHaveBeenCalled();
  });

  it("should handle async undo functions", async () => {
    // Use real timers for this test
    vi.useRealTimers();

    const { result } = renderHook(() => useUndo());
    const undoFn = vi.fn().mockResolvedValue(undefined);

    await act(async () => {
      await result.current.executeWithUndo({
        execute: vi.fn(),
        undo: undoFn,
        message: "Test",
        type: "test",
      });
    });

    // Get the action onClick handler
    const toastCall = (toast as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const actionOnClick = toastCall[1].action.onClick;

    // Trigger undo
    await act(async () => {
      await actionOnClick();
    });

    expect(undoFn).toHaveBeenCalled();
  });
});
