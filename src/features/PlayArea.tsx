import { useEffect, useState } from "react";
import type { Player, Tile } from "../game.ts";
import type { Action, DragState, HostAction } from "../app/types.ts";
import type { DragAreas, DragHandlers } from "../app/drag-controller.ts";
import { TileButton } from "./TileButton.tsx";

export function PlayArea({
  players,
  myId,
  ownTiles,
  publicTiles,
  remoteDragPreviews,
  drag,
  handlers,
  tableRef,
  handRef,
  discardRef,
  canPlay,
  isHost,
  canMoveOthers,
  performHostAction,
  canDrawTiles,
  canDrawBlankTile,
  drawTile,
  performAction,
}: {
  players: Player[];
  myId: string;
  ownTiles: Tile[];
  publicTiles: Tile[];
  remoteDragPreviews: Record<string, Tile>;
  drag: DragState | null;
  handlers: DragHandlers;
  tableRef: DragAreas["tableRef"];
  handRef: DragAreas["handRef"];
  discardRef: DragAreas["discardRef"];
  canPlay: boolean;
  isHost: boolean;
  canMoveOthers: boolean;
  performHostAction(action: HostAction): void;
  canDrawTiles: boolean;
  canDrawBlankTile: boolean;
  drawTile(blank?: boolean): void;
  performAction(action: Action): void;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!confirmDiscard) return;
    const timeout = window.setTimeout(() => setConfirmDiscard(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [confirmDiscard]);

  const handleDiscardAll = () => {
    if (!confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    setConfirmDiscard(false);
    performAction({ kind: "discard-all" });
  };

  return (
    <>
      <section className="game-table" aria-label="Shared table">
        <div className="table-caption">
          <span className="caption-rule" />
          <span>SHARED PLAY AREA</span>
          <span className="caption-rule" />
        </div>
        {isHost && (
          <button
            className="clear-table-button"
            type="button"
            disabled={publicTiles.length === 0}
            aria-label="Return all shared tiles to their owners' racks"
            onClick={() => performHostAction({ kind: "clear-shared-area" })}
          >
            Clear table
          </button>
        )}
        <div className="public-play-area" ref={tableRef}>
          {publicTiles
            .filter((tile) => !remoteDragPreviews[tile.id])
            .map((tile) => (
              <TileButton
                key={tile.id}
                tile={tile}
                players={players}
                myId={myId}
                canMoveOthers={canMoveOthers}
                drag={drag}
                handlers={handlers}
              />
            ))}
          {Object.values(remoteDragPreviews).map((tile) => (
            <TileButton
              key={tile.id}
              tile={tile}
              players={players}
              myId={myId}
              canMoveOthers={canMoveOthers}
              drag={drag}
              isRemotePreview
              handlers={handlers}
            />
          ))}
        </div>
      </section>

      <div className="wood-rail" aria-hidden="true">
        <span className="rail-inlay" />
      </div>

      <div className="private-rack-layout">
        <div className="draw-station-area">
          <button
            className="draw-station"
            type="button"
            onClick={() => drawTile()}
            disabled={!canDrawTiles}
            aria-label="Draw one random non-blank tile from the infinite bag"
            title="Draw one tile"
          >
            <span className="bag-illustration" aria-hidden="true">
              <svg viewBox="0 0 96 112" role="presentation">
                <defs>
                  <linearGradient
                    id="bag-fabric"
                    x1="18"
                    y1="40"
                    x2="78"
                    y2="94"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="#e0c38f" />
                    <stop offset="0.5" stopColor="#c49a5d" />
                    <stop offset="1" stopColor="#a47a47" />
                  </linearGradient>
                </defs>
                <path
                  className="bag-cord"
                  d="M31 37C21 27 10 23 7 27s7 10 15 14c6 4 4 10-2 18m45-22c10-10 21-14 24-10s-7 10-15 14c-6 4-4 10 2 18"
                />
                <ellipse
                  className="bag-opening"
                  cx="48"
                  cy="38"
                  rx="19"
                  ry="7"
                />
                <g transform="rotate(-10 40 30)">
                  <rect
                    className="bag-tile"
                    x="33"
                    y="17"
                    width="14"
                    height="22"
                    rx="2"
                  />
                  <text className="bag-letter" x="40" y="32">
                    A
                  </text>
                </g>
                <g transform="rotate(9 55 29)">
                  <rect
                    className="bag-tile"
                    x="48"
                    y="14"
                    width="14"
                    height="23"
                    rx="2"
                  />
                  <text className="bag-letter" x="55" y="30">
                    E
                  </text>
                </g>
                <path
                  className="bag-body"
                  d="M29 36c-7 5-10 12-11 20l-6 31c-2 11 5 18 17 21 11 3 27 3 38 0 12-3 19-10 17-21l-6-31c-1-8-4-15-11-20-6 5-12 5-19 0-7 5-13 5-19 0Z"
                />
                <path
                  className="bag-gather"
                  d="M29 37c5-4 8 4 13 0s8 4 13 0 8 4 13 0m-35 5 3 7m7-8 1 8m7-8 0 8m8-9-2 9"
                />
                <path
                  className="bag-fold"
                  d="M31 50c-5 13-6 28-8 43m14-41c-2 14-2 27-1 41m27-43c5 13 6 28 8 43m-14-41c2 14 2 27 1 41"
                />
                <path className="bag-seam" d="M20 91c13 8 43 8 56 0" />
                <path
                  className="bag-tie"
                  d="M31 37c-5-6-10-9-16-12m50 12c5-6 10-9 16-12M42 37c2-4 5-4 7 0 2-4 5-4 7 0-2 4-5 4-7 0-2 4-5 4-7 0Z"
                />
              </svg>
            </span>
            <span className="bag-label">DRAW A TILE</span>
            <span className="bag-infinite">∞ INFINITE BAG</span>
          </button>
          <button
            className="draw-blank-button"
            type="button"
            onClick={() => drawTile(true)}
            disabled={!canDrawBlankTile}
            aria-label="Draw one blank tile"
          >
            DRAW BLANK
          </button>
        </div>

        <section className="private-area" aria-label="Your private tile area">
          <div className="rack-heading">
            <div>
              <span className="rack-title">YOUR RACK</span>
              <span className="rack-hint">
                Only you can see these tiles · drag them onto the table to share
              </span>
            </div>
            <span className="rack-count">
              {ownTiles.length} {ownTiles.length === 1 ? "tile" : "tiles"}
            </span>
          </div>
          <div className="hand-space" ref={handRef}>
            {ownTiles.length === 0 ? (
              <p className="empty-rack">
                Draw a tile from the bag to get started
              </p>
            ) : (
              ownTiles.map((tile) => (
                <TileButton
                  key={tile.id}
                  tile={tile}
                  players={players}
                  myId={myId}
                  canMoveOthers={canMoveOthers}
                  drag={drag}
                  handlers={handlers}
                />
              ))
            )}
          </div>
        </section>

        <div
          className="discard-zone"
          ref={discardRef}
          aria-label="Discard area. Drop one of your tiles here to remove it"
        >
          <span className="discard-icon" aria-hidden="true">
            ×
          </span>
          <span className="discard-label">DISCARD</span>
          <small>drop tile here</small>
          <button
            className="discard-all-button"
            type="button"
            disabled={!canPlay || ownTiles.length === 0}
            onClick={handleDiscardAll}
            aria-label={
              confirmDiscard
                ? "Confirm discard all your tiles"
                : "Discard all your tiles"
            }
          >
            {confirmDiscard ? "Click again" : "Discard all"}
          </button>
        </div>
      </div>
    </>
  );
}
