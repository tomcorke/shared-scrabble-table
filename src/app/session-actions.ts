import type { MutableRefObject } from "react";
import type { SessionState } from "./session-state.ts";
import type { HostSession } from "./use-host-session.ts";
import type { GuestSession } from "./use-guest-session.ts";
import type { Action, SetupTab } from "./types.ts";

export class SessionActions {
  private readonly state: SessionState;
  private readonly host: HostSession;
  private readonly guest: GuestSession;
  private readonly handRef: MutableRefObject<HTMLDivElement | null>;

  constructor(
    state: SessionState,
    host: HostSession,
    guest: GuestSession,
    handRef: MutableRefObject<HTMLDivElement | null>,
  ) {
    this.state = state;
    this.host = host;
    this.guest = guest;
    this.handRef = handRef;
  }

  updatePlayerName = (name: string) => {
    this.state.nameRef.current = name;
    this.state.setPlayerName(name);
  };

  savePlayerName = () => {
    const name = this.state.nameRef.current.trim().slice(0, 24) || "Player";
    this.state.nameRef.current = name;
    this.state.setPlayerName(name);
    try {
      window.localStorage.setItem("scrabble-player-name", name);
    } catch {
      // The table still works when browser storage is unavailable.
    }

    if (this.state.roleRef.current === "host") {
      const current = this.state.gameRef.current;
      this.host.controller.commitHostState({
        ...current,
        players: current.players.map((player) =>
          player.id === this.state.myIdRef.current
            ? { ...player, name }
            : player,
        ),
      });
      this.host.controller.broadcast();
    }
  };

  drawTile = () =>
    this.performAction({
      kind: "draw",
      viewportWidth: window.innerWidth,
      rackWidth: this.handRef.current?.clientWidth ?? window.innerWidth,
      rackHeight: this.handRef.current?.clientHeight ?? 108,
    });

  performAction = (action: Action) => {
    if (this.state.roleRef.current === "host")
      this.host.controller.performAction(action);
    else this.guest.sendAction(action);
  };

  attempt = async (action: () => Promise<void>) => {
    this.state.setError("");
    this.state.setNotice("");
    try {
      await action();
    } catch (caught) {
      this.state.setError(
        caught instanceof Error ? caught.message : "Unexpected error",
      );
    }
  };

  createInvite = async () => {
    this.savePlayerName();
    await this.host.createInvite();
  };

  applyAnswer = (inviteId: string) => this.host.applyAnswer(inviteId);

  createAnswer = () => this.guest.createAnswer(this.savePlayerName);

  resetJoin = () => {
    this.guest.closeGuestConnection();
    this.state.setRemoteOffer("");
    this.state.setLocalAnswer("");
    this.state.setConnectionState("idle");
    this.state.setRemoteDragPreviews({});
    this.state.setError("");
    this.state.setNotice("");
  };

  updateInviteAnswer = (id: string, answer: string) => {
    this.state.setInvites((current) =>
      current.map((invite) =>
        invite.id === id ? { ...invite, answer } : invite,
      ),
    );
  };

  copyText = async (value: string, label: string) => {
    if (!value) throw new Error(`Create ${label} first`);
    await navigator.clipboard.writeText(value);
    this.state.setNotice(`${label} copied`);
  };

  openSetup = (tab: SetupTab) => {
    this.state.setError("");
    this.state.setNotice("");
    this.state.setSetupTab(tab);
    this.state.setSetupOpen(true);
  };

  openHostInvite = () => {
    this.state.setSetupTab("host");
    this.state.setSetupOpen(true);
  };

  dismissMessage = () => {
    this.state.setError("");
    this.state.setNotice("");
  };
}
