import tileSoundJson from "./tile-sound.json" with { type: "json" };
import { playSound, SoundSettingsSchema } from "./sound.ts";

// Made with Sound Creator (https://github.com/tomcorke/sound-creator).
const tileSound = SoundSettingsSchema.parse(tileSoundJson);
let unlocked = false;
let soundEnabled = true;

export function setTileSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
}

// Call from a user action: an empty sound creates and resumes the shared context.
export function unlockTileAudio() {
  unlocked ||= playSound({ version: 2, name: "unlock", layers: [] });
}

export function playTileSound() {
  if (soundEnabled && unlocked) playSound(tileSound);
}
