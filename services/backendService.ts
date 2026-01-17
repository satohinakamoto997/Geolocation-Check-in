
/**
 * Backend Service for handling external API communications (Telegram Webhook).
 */

export const TELEGRAM_WEBHOOK_URL = import.meta.env.VITE_TELEGRAM_WEBHOOK_URL;
export const TELEGRAM_CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID;

export interface CheckInPayload {
  chatId: string;
  locationName: string;
  period: string;
  periodStartTime: string;
  periodEndTime: string;
  lat: string;
  lng: string;
  distance: string;
  checkInTime: string;
  checkOutTime: string;
  photo: string;
}

/**
 * Sends check-in notification to the configured Telegram Webhook.
 * @param payload The data to be sent.
 * @returns Promise that resolves when the request is complete.
 */
export const sendCheckInNotification = async (payload: CheckInPayload) => {
  if (!TELEGRAM_WEBHOOK_URL) {
    throw new Error("Telegram Webhook URL is not configured.");
  }

  return fetch(TELEGRAM_WEBHOOK_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  });
};
