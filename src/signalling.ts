export function parseSessionDescription(
  value: string,
): RTCSessionDescriptionInit {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Session description must be valid JSON");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Session description must be an object");
  }

  const { type, sdp } = parsed as Record<string, unknown>;

  if (
    (type !== "offer" && type !== "answer") ||
    typeof sdp !== "string" ||
    !sdp.trim()
  ) {
    throw new Error(
      "Session description needs an offer or answer type and SDP",
    );
  }

  return { type, sdp };
}
