import { parseSessionDescription } from "../signalling.ts";
import type { SignallingRequest } from "./types.ts";

export type { SignallingRequest };
export type SignallingRoom = { code: string; hostToken: string };
export type SignallingAnswer = {
  clientId: string;
  answer: RTCSessionDescriptionInit;
};

export class SignallingServerError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeSignallingServerUrl(
  value: string,
  pageProtocol = typeof window === "undefined"
    ? "http:"
    : window.location.protocol,
) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid signalling server address");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Enter the signalling server origin, without a path");
  }
  const isLoopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (pageProtocol === "https:" && url.protocol !== "https:" && !isLoopback) {
    throw new Error("Use an HTTPS signalling server address on this page");
  }
  return url.origin;
}

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  token?: string;
  body?: unknown;
  signal?: AbortSignal;
};
type ServerRequest = <T>(path: string, options?: RequestOptions) => Promise<T>;

async function request<T>(
  fetcher: typeof fetch,
  origin: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetcher(new URL(path, `${origin}/`), {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    cache: "no-store",
  });
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error("Signalling server returned invalid JSON");
  }
  if (!response.ok) {
    const message =
      isRecord(result) && typeof result.error === "string"
        ? result.error
        : `Signalling server returned ${response.status}`;
    throw new SignallingServerError(message, response.status);
  }
  return result as T;
}

async function createRoom(request: ServerRequest, signal?: AbortSignal) {
  const room = await request<SignallingRoom>("/api/rooms", {
    method: "POST",
    signal,
  });
  if (
    !isRecord(room) ||
    typeof room.code !== "string" ||
    !/^[A-Z0-9]{4}$/.test(room.code) ||
    typeof room.hostToken !== "string" ||
    !room.hostToken
  ) {
    throw new Error("Signalling server returned an invalid room");
  }
  return room;
}

async function pendingRequests(
  request: ServerRequest,
  code: string,
  hostToken: string,
  signal?: AbortSignal,
) {
  const result = await request<{ requests: SignallingRequest[] }>(
    `/api/rooms/${encodeURIComponent(code)}/requests`,
    { token: hostToken, signal },
  );
  if (
    !isRecord(result) ||
    !Array.isArray(result.requests) ||
    result.requests.some(
      (item) =>
        !isRecord(item) ||
        typeof item.clientId !== "string" ||
        typeof item.createdAt !== "string",
    )
  ) {
    throw new Error("Signalling server returned invalid join requests");
  }
  return result.requests as SignallingRequest[];
}

async function getJoinRequest(
  request: ServerRequest,
  code: string,
  clientId: string,
  signal?: AbortSignal,
) {
  const result = await request<{
    status: string;
    offer?: RTCSessionDescriptionInit;
  }>(
    `/api/rooms/${encodeURIComponent(code)}/requests/${encodeURIComponent(clientId)}`,
    { signal },
  );
  if (!isRecord(result) || typeof result.status !== "string")
    throw new Error("Signalling server returned an invalid join request");
  if (result.offer) {
    const offer = parseSessionDescription(JSON.stringify(result.offer));
    if (offer.type !== "offer")
      throw new Error("Signalling server returned an invalid offer");
    return { status: result.status, offer };
  }
  return { status: result.status, offer: undefined };
}

async function answers(
  request: ServerRequest,
  code: string,
  hostToken: string,
  signal?: AbortSignal,
) {
  const result = await request<{ answers: SignallingAnswer[] }>(
    `/api/rooms/${encodeURIComponent(code)}/answers`,
    { token: hostToken, signal },
  );
  if (
    !isRecord(result) ||
    !Array.isArray(result.answers) ||
    result.answers.some(
      (item) =>
        !isRecord(item) ||
        typeof item.clientId !== "string" ||
        !isRecord(item.answer),
    )
  ) {
    throw new Error("Signalling server returned invalid answers");
  }
  return result.answers.map((item) => {
    const description = parseSessionDescription(JSON.stringify(item.answer));
    if (description.type !== "answer")
      throw new Error("Signalling server returned an invalid answer");
    return { clientId: item.clientId as string, answer: description };
  });
}

export function createSignallingServerClient(
  serverAddress: string,
  fetcher: typeof fetch = fetch,
) {
  const origin = normalizeSignallingServerUrl(serverAddress);
  const send: ServerRequest = (path, options) =>
    request(fetcher, origin, path, options);

  return {
    createRoom: createRoom.bind(null, send),
    requestToJoin: (code: string, clientId: string, signal?: AbortSignal) =>
      send<{ clientId: string }>(
        `/api/rooms/${encodeURIComponent(code)}/requests`,
        { method: "POST", body: { clientId }, signal },
      ),
    pendingRequests: pendingRequests.bind(null, send),
    rejectRequest: (
      code: string,
      clientId: string,
      hostToken: string,
      signal?: AbortSignal,
    ) =>
      send<{ ok: boolean }>(
        `/api/rooms/${encodeURIComponent(code)}/requests/${encodeURIComponent(clientId)}`,
        { method: "DELETE", token: hostToken, signal },
      ),
    cancelJoinRequest: (code: string, clientId: string, signal?: AbortSignal) =>
      send<{ ok: boolean }>(
        `/api/rooms/${encodeURIComponent(code)}/requests/${encodeURIComponent(clientId)}`,
        { method: "DELETE", token: clientId, signal },
      ),
    sendOffer: (
      code: string,
      clientId: string,
      hostToken: string,
      offer: RTCSessionDescriptionInit,
      signal?: AbortSignal,
    ) =>
      send<{ ok: boolean }>(
        `/api/rooms/${encodeURIComponent(code)}/requests/${encodeURIComponent(clientId)}/offer`,
        { method: "POST", token: hostToken, body: offer, signal },
      ),
    getJoinRequest: getJoinRequest.bind(null, send),
    sendAnswer: (
      code: string,
      clientId: string,
      answer: RTCSessionDescriptionInit,
      signal?: AbortSignal,
    ) =>
      send<{ ok: boolean }>(
        `/api/rooms/${encodeURIComponent(code)}/requests/${encodeURIComponent(clientId)}/answer`,
        { method: "POST", body: answer, signal },
      ),
    answers: answers.bind(null, send),
  };
}
