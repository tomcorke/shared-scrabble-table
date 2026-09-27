# Shared Scrabble Table

A shared Scrabble table that runs in the browser. Players connect directly with WebRTC, draw from an infinite bag, keep private tiles in their rack, and place shared tiles on the felt table.

Live site: [spell.corke.dev](https://spell.corke.dev).

## Run locally

Requires Node.js 22.12 or newer.

```bash
pnpm install
pnpm dev
```

Open the app in a browser. The first player hosts the table. To connect manually, select **Invite someone to play** and send the invite code. The guest selects **Join another table**, creates an answer, and sends it back for the host to apply. Or deploy a signalling server at a reachable HTTPS address, enter its address, and share the room code. The host accepts each join request; offers and answers are then exchanged automatically. Keep both pages open while you play.

The signalling server relays connection setup only. Table data still travels directly between browsers, and the app does not store games. The host browser coordinates the table; if it closes, the session ends. Each guest receives their own rack and the shared tiles, not other players' private tile faces.

## Play

- Select the bag to draw one tile. Draws use the standard 100-tile English distribution with replacement, so the bag never runs out.
- Drag your tiles around your rack, onto the table, or into the discard area. Use Enter to move a tile between rack and table, arrow keys to nudge it, and Backspace to discard it.
- Tile counts and player colors stay synchronized across connected pages.

WebRTC uses Google's public STUN server. Some networks block direct connections; reliable connections on those networks need a TURN service.

## Checks

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```
