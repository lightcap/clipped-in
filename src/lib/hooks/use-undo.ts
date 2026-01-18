import { useCallback, useRef } from "react";
import { toast } from "sonner";

interface UndoableAction<T = unknown> {
  id: string;
  type: string;
  timestamp: number;
  data: T;
  undo: () => Promise<void> | void;
}

interface UseUndoOptions {
  /**
   * Duration in milliseconds before the toast auto-dismisses.
   * Default: 5000ms (5 seconds)
   */
  toastDuration?: number;
}

const DEFAULT_TOAST_DURATION = 5000;

/**
 * Hook for managing undoable actions with toast notifications.
 *
 * @example
 * ```tsx
 * const { executeWithUndo } = useUndo();
 *
 * const handleDelete = (item) => {
 *   executeWithUndo({
 *     execute: async () => {
 *       await deleteItem(item.id);
 *     },
 *     undo: async () => {
 *       await restoreItem(item);
 *     },
 *     message: "Item deleted",
 *     type: "delete_item",
 *     data: item,
 *   });
 * };
 * ```
 */
export function useUndo(options: UseUndoOptions = {}) {
  const { toastDuration = DEFAULT_TOAST_DURATION } = options;

  // Track active undo actions to prevent double-execution
  const activeUndos = useRef<Map<string, UndoableAction>>(new Map());

  /**
   * Execute an action that can be undone.
   *
   * @param params - The parameters for the undoable action
   * @param params.execute - The function to execute the action
   * @param params.undo - The function to undo the action
   * @param params.message - The message to display in the toast
   * @param params.type - The type of action (for tracking purposes)
   * @param params.data - Optional data associated with the action
   */
  const executeWithUndo = useCallback(
    async <T = unknown>({
      execute,
      undo,
      message,
      type,
      data,
    }: {
      execute: () => Promise<void> | void;
      undo: () => Promise<void> | void;
      message: string;
      type: string;
      data?: T;
    }) => {
      const actionId = crypto.randomUUID();
      let isUndone = false;

      // Create the undoable action
      const action: UndoableAction<T | undefined> = {
        id: actionId,
        type,
        timestamp: Date.now(),
        data,
        undo: async () => {
          if (isUndone) return;
          isUndone = true;
          activeUndos.current.delete(actionId);
          await undo();
        },
      };

      // Store the action
      activeUndos.current.set(actionId, action);

      // Execute the action
      await execute();

      // Show toast with undo button
      toast(message, {
        duration: toastDuration,
        action: {
          label: "Undo",
          onClick: async () => {
            await action.undo();
            toast.success("Action undone");
          },
        },
        onDismiss: () => {
          // Clean up when toast is dismissed
          activeUndos.current.delete(actionId);
        },
        onAutoClose: () => {
          // Clean up when toast auto-closes
          activeUndos.current.delete(actionId);
        },
      });

      return actionId;
    },
    [toastDuration]
  );

  /**
   * Cancel an undo action (if the action was committed server-side).
   * This prevents the undo from executing if the user clicks it after
   * the server has already committed the change.
   */
  const cancelUndo = useCallback((actionId: string) => {
    activeUndos.current.delete(actionId);
  }, []);

  /**
   * Check if an undo action is still active.
   */
  const isUndoActive = useCallback((actionId: string) => {
    return activeUndos.current.has(actionId);
  }, []);

  return {
    executeWithUndo,
    cancelUndo,
    isUndoActive,
  };
}
