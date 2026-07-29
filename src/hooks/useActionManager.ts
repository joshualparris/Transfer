import { useCallback, useReducer } from "react";

const ACTION_TIMEOUT_MS = 100000;

export type ActionStatus = "idle" | "running" | "success" | "error";

export interface ActionState {
  status: ActionStatus;
  error?: string;
}

type State = Record<string, ActionState>;

type Action =
  | { type: "start"; label: string }
  | { type: "success"; label: string }
  | { type: "failure"; label: string; error: string }
  | { type: "clear"; label: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "start":
      return { ...state, [action.label]: { status: "running" } };
    case "success":
      return { ...state, [action.label]: { status: "success" } };
    case "failure":
      return {
        ...state,
        [action.label]: { status: "error", error: action.error },
      };
    case "clear":
      return { ...state, [action.label]: { status: "idle" } };
    default:
      return state;
  }
}

export function useActionManager() {
  const [state, dispatch] = useReducer(reducer, {} as State);

  const act = useCallback(async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    dispatch({ type: "start", label });
    let timeout: ReturnType<typeof setTimeout>;
    let timedOut = false;
    const action = fn().catch((error) => {
      if (timedOut) return new Promise<never>(() => {});
      throw error;
    });
    try {
      const result = await Promise.race([
        action,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            timedOut = true;
            reject(
              new Error(
                "This action timed out. If an authorisation tab was closed or blocked, try again.",
              ),
            );
          }, ACTION_TIMEOUT_MS);
        }),
      ]);
      clearTimeout(timeout!);
      dispatch({ type: "success", label });
      return result;
    } catch (error) {
      clearTimeout(timeout!);
      const message = error instanceof Error ? error.message : String(error);
      dispatch({ type: "failure", label, error: message });
      throw error;
    }
  }, []);

  const clearError = useCallback((label: string) => {
    dispatch({ type: "clear", label });
  }, []);

  const isBusy = Object.values(state).some((item) => item.status === "running");

  return { actionState: state, act, clearError, isBusy };
}
