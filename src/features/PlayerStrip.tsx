import { useState } from "react";
import type { Player } from "../game.ts";
import {
  MAX_GRANTED_TILES,
  type Action,
  type HostAction,
  type PeerRole,
} from "../app/types.ts";

export function PlayerStrip({
  players,
  myId,
  role,
  onOpenSetup,
  performAction,
  performHostAction,
}: {
  players: Player[];
  myId: string;
  role: PeerRole;
  onOpenSetup(tab: "host"): void;
  performAction(action: Action): void;
  performHostAction(action: HostAction): void;
}) {
  const [tileCounts, setTileCounts] = useState<Record<string, string>>({});

  return (
    <section className="player-strip" aria-label="Players at the table">
      <div className="player-strip-label">AT THE TABLE</div>
      <div className="player-list">
        {players.map((player) => {
          const quantity = tileCounts[player.id] ?? "1";
          const count = Number(quantity);
          const validCount =
            Number.isInteger(count) && count > 0 && count <= MAX_GRANTED_TILES;

          return (
            <div className="player-entry" key={player.id}>
              <div
                className={`player-card ${player.id === myId ? "is-you" : ""}`}
              >
                <span
                  className="player-avatar"
                  style={{ backgroundColor: player.color }}
                >
                  {player.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="player-name">
                  {player.name}
                  {player.id === myId && <small>YOU</small>}
                  {player.isVip && <small className="vip-badge">VIP</small>}
                </span>
                <span
                  className="player-tile-count"
                  aria-label={`${player.tileCount} tiles`}
                >
                  <span className="mini-tile-stack" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  {player.tileCount}
                </span>
              </div>
              {role === "host" && player.id !== myId && (
                <div className="player-grant-controls">
                  <input
                    type="number"
                    min={1}
                    max={MAX_GRANTED_TILES}
                    step={1}
                    value={quantity}
                    aria-label={`Number of tiles to give to ${player.name}`}
                    onChange={(event) =>
                      setTileCounts((current) => ({
                        ...current,
                        [player.id]: event.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    disabled={!validCount}
                    aria-label={`Give ${count} tiles to ${player.name}`}
                    onClick={() =>
                      performAction({
                        kind: "grant-draw",
                        playerId: player.id,
                        count,
                        blank: false,
                      })
                    }
                  >
                    Give
                  </button>
                  <button
                    type="button"
                    aria-label={`Give a blank tile to ${player.name}`}
                    onClick={() =>
                      performAction({
                        kind: "grant-draw",
                        playerId: player.id,
                        count: 1,
                        blank: true,
                      })
                    }
                  >
                    Blank
                  </button>
                </div>
              )}
              {role === "host" &&
                (player.id !== myId || player.tileCount > 0) && (
                  <div className="player-admin-controls">
                    {player.id !== myId && (
                      <button
                        type="button"
                        onClick={() =>
                          performHostAction({
                            kind: "set-player-vip",
                            playerId: player.id,
                            isVip: !player.isVip,
                          })
                        }
                      >
                        {player.isVip ? "Revoke VIP" : "Grant VIP"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={player.tileCount === 0}
                      onClick={() =>
                        window.confirm(
                          `Discard all of ${player.id === myId ? "your" : `${player.name}'s`} tiles?`,
                        ) &&
                        performHostAction({
                          kind: "discard-player-tiles",
                          playerId: player.id,
                        })
                      }
                    >
                      Discard all
                    </button>
                    {player.id !== myId && (
                      <button
                        type="button"
                        className="player-danger-action"
                        onClick={() =>
                          window.confirm(
                            `Disconnect ${player.name} and remove all their tiles?`,
                          ) &&
                          performHostAction({
                            kind: "disconnect-player",
                            playerId: player.id,
                          })
                        }
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                )}
            </div>
          );
        })}
        {role === "host" && players.length === 1 && (
          <button
            className="waiting-player"
            type="button"
            onClick={() => onOpenSetup("host")}
          >
            <span>＋</span> Invite someone to play
          </button>
        )}
      </div>
      <span className="player-strip-note">
        {players.length} {players.length === 1 ? "seat" : "seats"}
      </span>
    </section>
  );
}
