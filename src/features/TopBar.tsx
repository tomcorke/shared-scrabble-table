import { useState } from "react";
import { setTileSoundEnabled, unlockTileAudio } from "../app/tile-sound.ts";
import type { PeerRole, SetupTab } from "../app/types.ts";

export function TopBar({
  role,
  connectionState,
  connectionLabel,
  canJoinAnotherTable,
  onOpenSetup,
}: {
  role: PeerRole;
  connectionState: string;
  connectionLabel: string;
  canJoinAnotherTable: boolean;
  onOpenSetup(tab: SetupTab): void;
}) {
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const toggleSounds = () => {
    const enabled = !soundsEnabled;
    setSoundsEnabled(enabled);
    setTileSoundEnabled(enabled);
    if (enabled) unlockTileAudio();
  };
  const setupTab = canJoinAnotherTable || role === "guest" ? "join" : "host";
  return (
    <header className="topbar">
      <div className="app-title">
        <h1>Shared Scrabble Table</h1>
      </div>
      <div className="topbar-actions">
        <button
          className="sound-toggle"
          type="button"
          aria-pressed={soundsEnabled}
          aria-label={soundsEnabled ? "Mute tile sounds" : "Enable tile sounds"}
          title={soundsEnabled ? "Mute tile sounds" : "Enable tile sounds"}
          onClick={toggleSounds}
        >
          <span className="sound-toggle-icon" aria-hidden="true">
            {soundsEnabled ? "🔊" : "🔇"}
          </span>
          <span className="sound-toggle-label">
            {soundsEnabled ? "Sound on" : "Sound off"}
          </span>
        </button>
        <span
          className={`connection-pill ${role === "guest" && connectionState === "connected" ? "is-connected" : ""}`}
        >
          <span className="connection-dot" />
          {connectionLabel}
        </span>
        <button
          className="invite-button"
          type="button"
          onClick={() => onOpenSetup(setupTab)}
        >
          <span aria-hidden="true">↗</span>{" "}
          {canJoinAnotherTable
            ? "Join another table"
            : role === "host"
              ? "Invite players"
              : "Connection"}
        </button>
      </div>
    </header>
  );
}
