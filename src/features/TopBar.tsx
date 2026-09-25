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
  const setupTab = canJoinAnotherTable || role === "guest" ? "join" : "host";
  return (
    <header className="topbar">
      <div className="app-title">
        <h1>Shared Scrabble Table</h1>
      </div>
      <div className="topbar-actions">
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
