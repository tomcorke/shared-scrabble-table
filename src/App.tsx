import { useMemo, useRef } from "react";
import "./App.css";
import "./play-area.css";
import "./dialog.css";
import "./responsive.css";
import { useTableSession } from "./app/use-table-session.ts";
import { useTileDrag } from "./app/use-tile-drag.ts";
import { canJoinAnotherTable, connectionLabel } from "./app/view-state.ts";
import { AppPage } from "./features/AppPage.tsx";

function App() {
  const tableRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<HTMLDivElement>(null);
  const areas = useMemo(
    () => ({ tableRef, discardRef, handRef }),
    [tableRef, discardRef, handRef],
  );
  const session = useTableSession(handRef);
  const tileDrag = useTileDrag(session.refs.myId, session.performAction, areas);
  const { state } = session;
  const playerCount = state.game.players.length;
  const canJoin = canJoinAnotherTable(
    state.role,
    playerCount,
    state.invites.length,
    state.connectionState,
  );
  const label = connectionLabel(state.role, state.connectionState, playerCount);
  const canPlay =
    state.role === "host" || state.connectionState === "connected";
  const ownTiles = state.game.tiles.filter(
    (tile) => tile.ownerId === state.myId && tile.zone === "hand",
  );
  const publicTiles = state.game.tiles.filter((tile) => tile.zone === "board");

  return (
    <AppPage
      session={session}
      drag={tileDrag.drag}
      handlers={tileDrag.handlers}
      tableRef={tableRef}
      handRef={handRef}
      discardRef={discardRef}
      canJoinAnotherTable={canJoin}
      connectionLabel={label}
      canPlay={canPlay}
      ownTiles={ownTiles}
      publicTiles={publicTiles}
    />
  );
}

export default App;
