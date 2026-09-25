# Shared Scrabble Table

A shared Scrabble table that runs in the browser. Players connect directly with WebRTC, draw from an infinite bag, keep private tiles in their rack, and place shared tiles on the felt table.

Live site: [spell.corke.dev](https://spell.corke.dev).

## Run locally

Requires Node.js 22.12 or newer.

```bash
pnpm install
pnpm dev
```

Open the app in a browser. The first player hosts the table. Select **Invite someone to play**, create an invite, and send its code to another player. They select **Join another table**, paste the code, and create an answer. Send the answer back to the host, who pastes it into the matching invite. The join dialog closes when the host connects. Keep both pages open while you play.

Session JSON moves by copy and paste. The app does not use a signalling server or store games. The host browser coordinates the table; if it closes, the session ends. Each guest receives their own rack and the shared tiles, not other players' private tile faces.

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
