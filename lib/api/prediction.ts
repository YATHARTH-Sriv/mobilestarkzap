import { API_BASE_URL } from "../config";
import { readErrorMessage } from "../http";

export interface MarketDetail {
  id: string;
  question: string;
  deadline: string;
  creator: string;
  yesPool: string;
  noPool: string;
  resolved: boolean;
  winningOutcome: boolean;
  userBet: {
    amount: string;
    outcome: boolean;
    claimed: boolean;
    exists: boolean;
  };
  userAddress: string;
}

async function buildAuthHeaders(
  getAccessToken: (() => Promise<string | null>) | undefined,
): Promise<HeadersInit> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (!getAccessToken) {
    return headers;
  }

  const token = await getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function getMarketCount(): Promise<number> {
  const response = await fetch(`${API_BASE_URL}/api/market-count`);
  if (!response.ok) throw new Error("Failed to fetch market count");
  const data = await response.json();
  return parseInt(data.count, 10);
}

export async function getMarketDetail(
  getAccessToken: () => Promise<string | null>,
  id: string
): Promise<MarketDetail> {
  const response = await fetch(`${API_BASE_URL}/api/prediction/market/${id}`, {
    headers: await buildAuthHeaders(getAccessToken),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return response.json();
}

export async function createMarket(
  getAccessToken: () => Promise<string | null>,
  title: string, 
  durationSeconds: number
): Promise<any> {
  const deadline = Math.floor(Date.now() / 1000) + durationSeconds;
  
  const response = await fetch(`${API_BASE_URL}/create-market`, {
    method: "POST",
    headers: await buildAuthHeaders(getAccessToken),
    body: JSON.stringify({ title, time: deadline.toString() }),
  });
  
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json();
}

export async function placeBet(
  getAccessToken: () => Promise<string | null>,
  marketId: string, 
  outcome: boolean, 
  amountWei: string
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/place-bet`, {
    method: "POST",
    headers: await buildAuthHeaders(getAccessToken),
    body: JSON.stringify({ marketId, outcome, amount: amountWei }),
  });
  
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json();
}

export async function resolveMarket(
  getAccessToken: () => Promise<string | null>,
  marketId: string, 
  winningOutcome: boolean
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/resolve-market`, {
    method: "POST",
    headers: await buildAuthHeaders(getAccessToken),
    body: JSON.stringify({ marketId, winningOutcome }),
  });
  
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json();
}

export async function claimWinnings(
  getAccessToken: () => Promise<string | null>,
  marketId: string
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/claim-winnings`, {
    method: "POST",
    headers: await buildAuthHeaders(getAccessToken),
    body: JSON.stringify({ marketId }),
  });
  
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json();
}

export async function getPredictionBalances(
  getAccessToken: () => Promise<string | null>
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/api/prediction/balances`, {
    headers: await buildAuthHeaders(getAccessToken),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return response.json();
}
