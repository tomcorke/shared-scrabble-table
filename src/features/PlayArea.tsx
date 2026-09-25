import type { Player, Tile } from "../game.ts";
import type { DragState } from "../app/types.ts";
import type { DragAreas, DragHandlers } from "../app/drag-controller.ts";
import { TileButton } from "./TileButton.tsx";

export function PlayArea({
  players,
  ownTiles,
  publicTiles,
  remoteDragPreviews,
  drag,
  handlers,
  tableRef,
  handRef,
  discardRef,
  canPlay,
  drawTile,
}: {
  players: Player[];
  ownTiles: Tile[];
  publicTiles: Tile[];
  remoteDragPreviews: Record<string, Tile>;
  drag: DragState | null;
  handlers: DragHandlers;
  tableRef: DragAreas["tableRef"];
  handRef: DragAreas["handRef"];
  discardRef: DragAreas["discardRef"];
  canPlay: boolean;
  drawTile(): void;
}) {
  return (
    <>
      <section className="game-table" aria-label="Shared table">
        <div className="table-caption">
          <span className="caption-rule" />
          <span>SHARED PLAY AREA</span>
          <span className="caption-rule" />
        </div>
        <div className="public-play-area" ref={tableRef}>
          {publicTiles
            .filter((tile) => !remoteDragPreviews[tile.id])
            .map((tile) => (
              <TileButton
                key={tile.id}
                tile={tile}
                players={players}
                drag={drag}
                handlers={handlers}
              />
            ))}
          {Object.values(remoteDragPreviews).map((tile) => (
            <TileButton
              key={tile.id}
              tile={tile}
              players={players}
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
        <button
          className="draw-station"
          type="button"
          onClick={drawTile}
          disabled={!canPlay}
          aria-label="Draw one random tile from the infinite bag"
          title="Draw one tile"
        >
          <span className="bag-illustration" aria-hidden="true">
            <svg viewBox="0 0 72 82" role="presentation">
              <path d="M24 15c2-8 6-11 12-11s10 3 12 11l7 5c7 5 11 11 10 20l-4 30c-1 7-6 10-14 10H25c-8 0-13-3-14-10L7 40c-1-9 3-15 10-20l7-5Z" />
              <path d="M23 16c7 4 19 4 26 0M16 32c7 4 15 6 20 6m-19 4 1 20m38-31c-4 4-8 6-13 7" />
              <circle cx="31" cy="54" r="2" />
              <circle cx="43" cy="62" r="1.5" />
              <circle cx="48" cy="48" r="1.5" />
            </svg>
          </span>
          <span className="bag-label">DRAW A TILE</span>
          <span className="bag-infinite">∞ INFINITE BAG</span>
        </button>

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
        </div>
      </div>
    </>
  );
}
