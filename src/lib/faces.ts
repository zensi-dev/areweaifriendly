import type { Stance } from './stance';

/** Face drawings for each stance, on a 24×24 grid. Eyes are shared; brows and mouth carry the emotion. */
export const FACE_EYES = '<circle cx="8.5" cy="10" r="1.5" fill="currentColor" stroke="none"/><circle cx="15.5" cy="10" r="1.5" fill="currentColor" stroke="none"/>';

export const FACE_FEATURES: Record<Stance, string> = {
  friendly: '<path d="M7.5 14.5q4.5 4.5 9 0"/>',
  'mostly-friendly': '<path d="M14 6.6l3.2-1"/><path d="M8.5 16h7"/>',
  unfriendly: '<path d="M8 17.2q4-3.6 8 0"/>',
  unknown: '',
};
