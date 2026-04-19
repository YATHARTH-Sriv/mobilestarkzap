export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8001";

function toWsUrl(httpUrl: string): string {
  if (httpUrl.startsWith("https://")) {
    return `wss://${httpUrl.slice(8)}`;
  }

  if (httpUrl.startsWith("http://")) {
    return `ws://${httpUrl.slice(7)}`;
  }

  return httpUrl;
}

export const WS_BASE_URL = process.env.EXPO_PUBLIC_WS_BASE_URL ?? toWsUrl(API_BASE_URL);

export const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "";
export const PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID ?? "";
