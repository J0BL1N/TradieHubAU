export interface SoundOption {
  id: string;
  name: string;
  path: string;
}

export const MESSAGE_SOUND_OPTIONS: SoundOption[] = [
  { id: 'confirm-tap', name: 'Confirm Tap', path: '/audio/message-confirm-tap.mp3' },
];

export const NOTIFICATION_SOUND_OPTIONS: SoundOption[] = [
  { id: 'soft-alert', name: 'Soft Alert (Default)', path: '/audio/notification-soft-alert.mp3' },
  { id: 'bright-chime', name: 'Bright Chime', path: '/audio/notification-bright-chime.mp3' },
  { id: 'gentle-ping', name: 'Gentle Ping', path: '/audio/notification-gentle-ping.mp3' },
  { id: 'clean-pop', name: 'Clean Pop', path: '/audio/notification-clean-pop.mp3' },
  { id: 'echo-chime', name: 'Echo Chime', path: '/audio/notification-echo-chime.mp3' },
  { id: 'light-sweep', name: 'Light Sweep', path: '/audio/notification-light-sweep.mp3' },
  { id: 'digital-blip', name: 'Digital Blip', path: '/audio/notification-digital-blip.mp3' },
];

// LocalStorage Keys
export const KEYS = {
  MESSAGE_SOUND: 'tradiehub_sound_message',
  NOTIFICATION_SOUND: 'tradiehub_sound_notification',
  MESSAGES_ENABLED: 'tradiehub_sound_messages_enabled',
  NOTIFICATIONS_ENABLED: 'tradiehub_sound_notifications_enabled',
};

export const getSoundPreference = (key: string, defaultValue: string): string => {
  try {
    return localStorage.getItem(key) || defaultValue;
  } catch {
    return defaultValue;
  }
};

export const getSoundEnabledPreference = (key: string, defaultValue: boolean): boolean => {
  try {
    const val = localStorage.getItem(key);
    return val === null ? defaultValue : val === 'true';
  } catch {
    return defaultValue;
  }
};

export const setSoundPreference = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn('Failed to save sound preference to localStorage:', e);
  }
};

export const setSoundEnabledPreference = (key: string, value: boolean): void => {
  try {
    localStorage.setItem(key, String(value));
  } catch (e) {
    console.warn('Failed to save sound preference to localStorage:', e);
  }
};

/**
 * Safely plays a sound by its relative path.
 * Catches any autoplay blocks or missing file issues gracefully without crashes.
 */
export const playSoundSafe = async (path: string): Promise<void> => {
  try {
    const audio = new Audio(path);
    audio.volume = 0.5;
    await audio.play();
  } catch (error) {
    // Log the error silently as fallback behavior (autoblocks or missing assets are normal)
    console.log('Audio playback bypassed or file not found:', path, error);
  }
};
