import type { Player } from "../game.ts";
import type { PeerRole } from "../app/types.ts";

export function PlayerStrip({
  players,
  myId,
  role,
  onOpenSetup,
}: {
  players: Player[];
  myId: string;
  role: PeerRole;
  onOpenSetup(tab: "host"): void;
}) {
  return (
    <section className="player-strip" aria-label="Players at the table">
      <div className="player-strip-label">AT THE TABLE</div>
      <div className="player-list">
        {players.map((player) => (
          <div
            className={`player-card ${player.id === myId ? "is-you" : ""}`}
            key={player.id}
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
        ))}
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
