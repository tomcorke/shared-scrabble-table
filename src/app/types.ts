import type { MoveDestination, TableState, Tile } from "../game.ts";

export type PeerRole = "host" | "guest";
export type SetupTab = "host" | "join";
export type InviteStatus =
  "ready" | "connecting" | "connected" | "failed" | "disconnected";

export type Invite = {
  id: string;
  offer: string;
  answer: string;
  status: InviteStatus;
};

export type Action =
  | {
      kind: "draw";
      viewportWidth: number;
      rackWidth: number;
      rackHeight: number;
    }
  | {
      kind: "drag-preview";
      tileId: string;
      x: number;
      y: number;
      rotation: number;
    }
  | { kind: "drag-end"; tileId: string }
  | {
      kind: "move";
      tileId: string;
      destination: MoveDestination;
      x: number;
      y: number;
      rotation: number;
    };

export type PendingPeerDragUpdate = { tile: Tile; timer: number };
export type PendingDragUpdate = {
  tileId: string;
  x: number;
  y: number;
  rotation: number;
  timer: number;
};

export type DragState = {
  tileId: string;
  pointerId: number;
  clientX: number;
  clientY: number;
  startClientX: number;
  startClientY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  startRotation: number;
  rotation: number;
  angularVelocity: number;
  destination: MoveDestination | null;
  previewCenter: { x: number; y: number } | null;
  sharedPreview: boolean;
};

export type SessionData = {
  myId: string;
  playerName: string;
  game: TableState;
  role: PeerRole;
  setupTab: SetupTab;
  setupOpen: boolean;
  invites: Invite[];
  remoteOffer: string;
  localAnswer: string;
  connectionState: string;
  error: string;
  notice: string;
  remoteDragPreviews: Record<string, Tile>;
};
