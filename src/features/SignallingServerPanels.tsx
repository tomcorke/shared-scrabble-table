import type { TableSession } from "../app/use-table-session.ts";

export function HostSignallingPanel({ session }: { session: TableSession }) {
  const { state, actions } = session;
  return (
    <>
      <label>
        Signalling server address
        <input
          type="url"
          value={state.signallingServerUrl}
          readOnly={state.signallingRoomStatus === "ready"}
          onChange={(event) => state.setSignallingServerUrl(event.target.value)}
          placeholder="https://your-server.example"
        />
      </label>
      {state.signallingRoomCode ? (
        <div className="invite-card">
          <label>
            Join code
            <input readOnly value={state.signallingRoomCode} />
          </label>
          <button
            className="secondary-action"
            type="button"
            onClick={() =>
              void actions.attempt(() =>
                actions.copyText(state.signallingServerUrl, "Server address"),
              )
            }
          >
            Copy server address
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={() =>
              void actions.attempt(() =>
                actions.copyText(state.signallingRoomCode, "Join code"),
              )
            }
          >
            Copy join code
          </button>
          <p
            className={`join-status ${state.signallingRoomStatus === "ready" ? "is-live" : ""}`}
          >
            <span className="connection-dot" />
            {state.signallingRoomStatus === "ready"
              ? "Room open. Share both values; requests appear here."
              : "Room stopped. Start a new room to accept guests."}
          </p>
          {state.signallingRoomStatus === "error" && (
            <button
              className="secondary-action"
              type="button"
              disabled={!state.signallingServerUrl.trim()}
              onClick={() => void actions.attempt(actions.createInvite)}
            >
              Start a new room
            </button>
          )}
        </div>
      ) : (
        <button
          className="primary-action"
          type="button"
          disabled={
            !state.signallingServerUrl.trim() ||
            state.signallingRoomStatus === "starting"
          }
          onClick={() => void actions.attempt(actions.createInvite)}
        >
          {state.signallingRoomStatus === "starting"
            ? "Starting room…"
            : "Start exchange room"}
        </button>
      )}
      {state.signallingRequests.length > 0 && (
        <div className="invite-list">
          <h3>Join requests</h3>
          {state.signallingRequests.map(({ clientId }, index) => (
            <article className="invite-card" key={clientId}>
              <strong>Join request {index + 1}</strong>
              <button
                className="secondary-action"
                type="button"
                aria-label={`Reject join request ${index + 1}`}
                onClick={() =>
                  void actions.attempt(() =>
                    actions.respondToSignallingRequest(clientId, false),
                  )
                }
              >
                Reject
              </button>
              <button
                className="primary-action"
                type="button"
                aria-label={`Accept join request ${index + 1}`}
                onClick={() =>
                  void actions.attempt(() =>
                    actions.respondToSignallingRequest(clientId, true),
                  )
                }
              >
                Accept
              </button>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export function GuestSignallingPanel({ session }: { session: TableSession }) {
  const { state, actions } = session;
  const statusMessage = {
    idle: "Ready to join.",
    requesting: "Sending join request…",
    waiting: "Waiting for the host to send an invite. Keep this page open.",
    answering: "Creating a WebRTC answer…",
    submitted: "Answer sent. Waiting for the host to connect you.",
  }[state.signallingJoinStatus];

  return (
    <>
      <p className="setup-instructions">
        Enter the server address and four-character code from the host. Keep
        this page open while the host connects you.
      </p>
      <label>
        Signalling server address
        <input
          type="url"
          value={state.signallingServerUrl}
          readOnly={state.signallingJoinStatus !== "idle"}
          onChange={(event) => state.setSignallingServerUrl(event.target.value)}
          placeholder="https://your-server.example"
        />
      </label>
      <label>
        Room code
        <input
          value={state.signallingJoinCode}
          maxLength={4}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          readOnly={state.signallingJoinStatus !== "idle"}
          onChange={(event) =>
            state.setSignallingJoinCode(
              event.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, 4),
            )
          }
          placeholder="ABCD"
        />
      </label>
      {state.signallingJoinStatus === "idle" ? (
        <button
          className="primary-action"
          type="button"
          disabled={
            !state.signallingServerUrl.trim() ||
            state.signallingJoinCode.length !== 4
          }
          onClick={() => void actions.attempt(actions.createAnswer)}
        >
          Request to join
        </button>
      ) : (
        <>
          <p className="join-status">
            <span className="connection-dot" /> {statusMessage}
          </p>
          <button
            className="secondary-action"
            type="button"
            onClick={actions.resetJoin}
          >
            Cancel join
          </button>
        </>
      )}
    </>
  );
}
