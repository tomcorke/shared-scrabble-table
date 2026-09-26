import type { DragAreas, DragHandlers } from "../app/drag-controller.ts";
import type { TableSession } from "../app/use-table-session.ts";
import type { DragState } from "../app/types.ts";
import type { Tile } from "../game.ts";
import { MessageToast } from "./MessageToast.tsx";
import { PlayArea } from "./PlayArea.tsx";
import { PlayerStrip } from "./PlayerStrip.tsx";
import { SetupDialog } from "./SetupDialog.tsx";
import { TopBar } from "./TopBar.tsx";

export function AppPage({
  session,
  drag,
  handlers,
  tableRef,
  handRef,
  discardRef,
  canJoinAnotherTable,
  connectionLabel,
  canPlay,
  ownTiles,
  publicTiles,
}: {
  session: TableSession;
  drag: DragState | null;
  handlers: DragHandlers;
  tableRef: DragAreas["tableRef"];
  handRef: DragAreas["handRef"];
  discardRef: DragAreas["discardRef"];
  canJoinAnotherTable: boolean;
  connectionLabel: string;
  canPlay: boolean;
  ownTiles: Tile[];
  publicTiles: Tile[];
}) {
  const { state, actions } = session;
  const dropPreview = drag?.previewCenter ?? null;
  return (
    <main className="app-shell">
      <TopBar
        role={state.role}
        connectionState={state.connectionState}
        connectionLabel={connectionLabel}
        canJoinAnotherTable={canJoinAnotherTable}
        onOpenSetup={actions.openSetup}
      />
      <PlayerStrip
        players={state.game.players}
        myId={state.myId}
        role={state.role}
        onOpenSetup={actions.openHostInvite}
        performAction={actions.performAction}
      />
      <PlayArea
        players={state.game.players}
        myId={state.myId}
        ownTiles={ownTiles}
        publicTiles={publicTiles}
        remoteDragPreviews={state.remoteDragPreviews}
        drag={drag}
        handlers={handlers}
        tableRef={tableRef}
        handRef={handRef}
        discardRef={discardRef}
        canPlay={canPlay}
        canDrawTiles={
          canPlay &&
          (state.role === "host" || state.game.drawOptions.allowClientDraw)
        }
        canDrawBlankTile={
          canPlay &&
          (state.role === "host" || state.game.drawOptions.allowClientBlankDraw)
        }
        drawTile={actions.drawTile}
        performAction={actions.performAction}
      />
      {drag && dropPreview && (
        <div
          className="tile-drop-shadow"
          aria-hidden="true"
          style={{
            left: dropPreview.x,
            top: dropPreview.y,
            transform: `translate(-50%, -50%) rotate(${drag.rotation}deg)`,
          }}
        />
      )}
      <MessageToast
        error={state.error}
        notice={state.notice}
        onDismiss={actions.dismissMessage}
      />
      {state.setupOpen && <SetupDialog session={session} />}
    </main>
  );
}
