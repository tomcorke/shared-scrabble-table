import { useState, type MutableRefObject } from "react";
import type { Tile } from "../game.ts";
import { useHostSession } from "./use-host-session.ts";
import { useGuestSession } from "./use-guest-session.ts";
import { SessionActions } from "./session-actions.ts";
import { useSessionState } from "./session-state.ts";

export function useTableSession(
  handRef: MutableRefObject<HTMLDivElement | null>,
) {
  const state = useSessionState();
  const updateRemoteDragPreview = (tileId: string, tile: Tile | null) => {
    state.setRemoteDragPreviews((current) => {
      const next = { ...current };
      if (tile) next[tileId] = tile;
      else delete next[tileId];
      return next;
    });
  };
  const host = useHostSession(state, updateRemoteDragPreview);
  const guest = useGuestSession(
    state,
    handRef,
    host.closeHostSession,
    updateRemoteDragPreview,
  );
  const [performAction] = useState(
    () => new SessionActions(state, host, guest, handRef).performAction,
  );

  return {
    state,
    refs: { myId: state.myIdRef },
    performAction,
    actions: new SessionActions(state, host, guest, handRef),
  };
}

export type TableSession = ReturnType<typeof useTableSession>;
