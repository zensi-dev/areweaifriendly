import type { Stance } from './stance';

/** Tone utilities from src/styles/global.css; full class names so Tailwind's scanner finds them. */
export const stanceTone: Record<Stance, string> = {
  friendly: 'tone-friendly',
  'mostly-friendly': 'tone-mostly-friendly',
  unfriendly: 'tone-unfriendly',
  unknown: 'tone-unknown',
};
