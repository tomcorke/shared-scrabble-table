import type { TableSession } from "../app/use-table-session.ts";
import {
  GuestSignallingPanel,
  HostSignallingPanel,
} from "./SignallingServerPanels.tsx";

export function SetupDialog({ session }: { session: TableSession }) {
  const { state, actions } = session;

  return (
    <div className="dialog-backdrop">
      <section
        className="setup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
      >
        <header className="dialog-header">
          <div>
            <h2 id="setup-title">Connect to a table</h2>
            <p>
              Choose manual codes or a token exchange server. Table data stays
              peer-to-peer.
            </p>
          </div>
          <button
            className="close-dialog"
            type="button"
            aria-label="Close"
            onClick={() => {
              if (state.signallingJoinStatus !== "idle") actions.resetJoin();
              state.setSetupOpen(false);
            }}
          >
            ×
          </button>
        </header>

        {state.role === "host" && (
          <div
            className="setup-tabs"
            role="tablist"
            aria-label="Connection role"
          >
            <button
              type="button"
              role="tab"
              aria-selected={state.setupTab === "host"}
              onClick={() => state.setSetupTab("host")}
            >
              Host a table
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={state.setupTab === "join"}
              onClick={() => state.setSetupTab("join")}
            >
              Join a table
            </button>
          </div>
        )}

        <label className="name-field">
          Your name
          <input
            value={state.playerName}
            maxLength={24}
            onChange={(event) => actions.updatePlayerName(event.target.value)}
            onBlur={actions.savePlayerName}
            placeholder="Enter your name"
          />
        </label>

        {state.setupTab === "host" && state.role === "host" ? (
          <div className="host-panel">
            <p className="setup-instructions">
              {state.useSignallingServer
                ? "Start a room and share its address and join code. Accept or reject join requests here."
                : "Make an invite, then send its code to a friend. They will return an answer code for you to paste below."}
            </p>
            <fieldset className="host-options">
              <legend>Connection method</legend>
              <label>
                <input
                  type="checkbox"
                  checked={state.useSignallingServer}
                  disabled={
                    state.signallingRoomStatus === "starting" ||
                    state.signallingRoomStatus === "ready"
                  }
                  onChange={(event) =>
                    state.setUseSignallingServer(event.currentTarget.checked)
                  }
                />
                Use token exchange server
              </label>
            </fieldset>

            {state.useSignallingServer ? (
              <HostSignallingPanel session={session} />
            ) : (
              <button
                className="primary-action"
                type="button"
                onClick={() => void actions.attempt(actions.createInvite)}
              >
                + Create an invite
              </button>
            )}

            <fieldset className="host-options">
              <legend>Client permissions</legend>
              <label>
                <input
                  type="checkbox"
                  checked={state.game.drawOptions.allowClientDraw}
                  onChange={(event) =>
                    actions.performAction({
                      kind: "set-draw-options",
                      drawOptions: {
                        ...state.game.drawOptions,
                        allowClientDraw: event.currentTarget.checked,
                      },
                    })
                  }
                />
                Clients can draw tiles
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={state.game.drawOptions.allowClientBlankDraw}
                  onChange={(event) =>
                    actions.performAction({
                      kind: "set-draw-options",
                      drawOptions: {
                        ...state.game.drawOptions,
                        allowClientBlankDraw: event.currentTarget.checked,
                      },
                    })
                  }
                />
                Clients can draw blank tiles
              </label>
            </fieldset>

            <div className="invite-list">
              {state.invites.map((invite, index) => (
                <article className="invite-card" key={invite.id}>
                  <div className="invite-card-heading">
                    <strong>
                      {invite.transport === "server"
                        ? "Guest request"
                        : `Invite ${index + 1}`}
                    </strong>
                    <span className={`invite-status status-${invite.status}`}>
                      {invite.status}
                    </span>
                  </div>
                  {invite.transport === "manual" ? (
                    <>
                      <details
                        className="invite-offer"
                        open={invite.status !== "connected"}
                      >
                        <summary>Invite code</summary>
                        <label>
                          Send this offer to your friend
                          <textarea readOnly rows={3} value={invite.offer} />
                        </label>
                        <button
                          className="secondary-action"
                          type="button"
                          onClick={() =>
                            void actions.attempt(() =>
                              actions.copyText(invite.offer, "Invite"),
                            )
                          }
                        >
                          Copy invite
                        </button>
                      </details>
                      {invite.status !== "connected" && (
                        <>
                          <label>
                            Paste their answer here
                            <textarea
                              rows={3}
                              value={invite.answer}
                              onChange={(event) =>
                                actions.updateInviteAnswer(
                                  invite.id,
                                  event.target.value,
                                )
                              }
                              spellCheck={false}
                              placeholder="Paste answer code"
                            />
                          </label>
                          <button
                            className="primary-action"
                            type="button"
                            disabled={!invite.answer.trim()}
                            onClick={() =>
                              void actions.attempt(() =>
                                actions.applyAnswer(invite.id),
                              )
                            }
                          >
                            Connect player
                          </button>
                        </>
                      )}
                    </>
                  ) : (
                    <p className="setup-instructions">
                      Offer sent through token exchange server.
                    </p>
                  )}
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="join-panel">
            <fieldset className="host-options">
              <legend>Connection method</legend>
              <label>
                <input
                  type="checkbox"
                  checked={state.useSignallingServer}
                  disabled={state.signallingJoinStatus !== "idle"}
                  onChange={(event) =>
                    state.setUseSignallingServer(event.currentTarget.checked)
                  }
                />
                Use token exchange server
              </label>
            </fieldset>

            {state.useSignallingServer ? (
              <GuestSignallingPanel session={session} />
            ) : (
              <>
                <p className="setup-instructions">
                  {state.localAnswer
                    ? "Send the answer code below to the table host. Keep this page open while they connect you."
                    : "Paste the invite code from the table host. Your connection is direct and peer-to-peer."}
                </p>
                <label>
                  Host invite code
                  <textarea
                    rows={5}
                    value={state.remoteOffer}
                    readOnly={Boolean(state.localAnswer)}
                    onChange={(event) =>
                      state.setRemoteOffer(event.target.value)
                    }
                    spellCheck={false}
                    placeholder="Paste invite code"
                  />
                </label>
                {state.localAnswer ? (
                  <>
                    <label>
                      Your answer code
                      <textarea readOnly rows={5} value={state.localAnswer} />
                    </label>
                    <button
                      className="primary-action"
                      type="button"
                      onClick={() =>
                        void actions.attempt(() =>
                          actions.copyText(state.localAnswer, "Answer"),
                        )
                      }
                    >
                      Copy answer
                    </button>
                    <p
                      className={`join-status ${state.connectionState === "connected" ? "is-live" : ""}`}
                    >
                      <span className="connection-dot" />{" "}
                      {state.connectionState === "connected"
                        ? "You are at the table"
                        : "Waiting for the host to apply your answer"}
                    </p>
                    {state.connectionState !== "connected" && (
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={actions.resetJoin}
                      >
                        Start over
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    className="primary-action"
                    type="button"
                    disabled={!state.remoteOffer.trim()}
                    onClick={() => void actions.attempt(actions.createAnswer)}
                  >
                    Create answer
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {state.error && (
          <p className="dialog-error" role="alert">
            {state.error}
          </p>
        )}
        <p className="privacy-note">
          The exchange server relays WebRTC offers and answers only. Table data
          stays peer-to-peer. Some networks still need TURN.
        </p>
      </section>
    </div>
  );
}
