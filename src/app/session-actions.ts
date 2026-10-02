import type { MutableRefObject } from "react";
import { createBlankTile, createTile } from "../game.ts";
import type { SessionState } from "./session-state.ts";
import type { HostSession } from "./use-host-session.ts";
import type { GuestSession } from "./use-guest-session.ts";
import { unlockTileAudio } from "./tile-sound.ts";
import type { Action, HostAction, SetupTab } from "./types.ts";

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

  drawTile = (blank = false) => {
    unlockTileAudio();
    const game = this.state.gameRef.current;
    const create = blank ? createBlankTile : createTile;
    this.performAction({
      kind: "draw",
      tile: create(
        this.state.myIdRef.current,
        game.tiles,
        window.innerWidth,
        this.handRef.current?.clientWidth ?? window.innerWidth,
        this.handRef.current?.clientHeight ?? 108,
      ),
    });
  };

  performHostAction = (action: HostAction) => {
    if (this.state.roleRef.current !== "host") return;
    if (action.kind === "clear-shared-area") {
      const hand = this.handRef.current;
      this.host.controller.performHostAction(action, {
        viewportWidth: window.innerWidth,
        rackWidth: hand?.clientWidth ?? window.innerWidth,
        rackHeight: hand?.clientHeight ?? 108,
      });
      return;
    }
    this.host.controller.performHostAction(action);
  };

  performAction = (action: Action) => {
    if (this.state.roleRef.current === "host") {
      this.host.controller.performAction(action);
    } else if (
      action.kind !== "set-draw-options" &&
      action.kind !== "grant-draw"
    ) {
      this.guest.sendAction(action);
    }
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
    unlockTileAudio();
    if (this.state.useSignallingServer) {
      await this.host.startSignallingRoom(this.state.signallingServerUrl);
    } else {
      await this.host.createInvite();
    }
  };

  applyAnswer = (inviteId: string) => this.host.applyAnswer(inviteId);

  respondToSignallingRequest = (clientId: string, accept: boolean) =>
    this.host.respondToSignallingRequest(clientId, accept);

  createAnswer = () => {
    unlockTileAudio();
    return this.state.useSignallingServer
      ? this.guest.joinViaSignallingServer(
          this.state.signallingServerUrl,
          this.state.signallingJoinCode,
          this.savePlayerName,
        )
      : this.guest.createAnswer(this.savePlayerName);
  };

  resetJoin = () => {
    this.guest.closeGuestConnection();
    this.state.setRemoteOffer("");
    this.state.setLocalAnswer("");
    this.state.setConnectionState("idle");
    this.state.setSignallingJoinStatus("idle");
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
