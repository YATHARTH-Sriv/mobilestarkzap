import { API_BASE_URL } from "@/lib/config";
import { readErrorMessage } from "@/lib/http";

export type SwapTokenSymbol = "STRK" | "USDC";
export type SwapProviderId = "avnu" | "ekubo";

export type SwapQuoteParams = {
  tokenIn: SwapTokenSymbol;
  tokenOut: SwapTokenSymbol;
  amount: string;
  slippageBps?: number;
  provider?: SwapProviderId;
};

export type SwapTokenPayload = {
  symbol: SwapTokenSymbol;
  address: string;
  decimals: number;
};

export type SwapQuoteResponse = {
  tokenIn: SwapTokenPayload;
  tokenOut: SwapTokenPayload;
  amountIn: string;
  amountInRaw: string;
  amountOut: string;
  amountOutRaw: string;
  amountOutFormatted: string;
  provider: SwapProviderId | string;
  priceImpactBps: string | null;
  routeCallCount: number | null;
  slippageBps: string;
};

export type SwapExecuteResponse = SwapQuoteResponse & {
  message: string;
  txHash: string;
  explorerUrl: string;
  executionMode: "v3_default" | "v3_boosted_bounds";
};

async function buildAuthHeaders(
  getAccessToken: () => Promise<string | null>,
): Promise<HeadersInit> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  const token = await getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function fetchSwapQuote(
  getAccessToken: () => Promise<string | null>,
  params: SwapQuoteParams,
): Promise<SwapQuoteResponse> {
  const response = await fetch(`${API_BASE_URL}/api/swap/quote`, {
    method: "POST",
    headers: await buildAuthHeaders(getAccessToken),
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as SwapQuoteResponse;
}

export async function executeSwap(
  getAccessToken: () => Promise<string | null>,
  params: SwapQuoteParams,
): Promise<SwapExecuteResponse> {
  const response = await fetch(`${API_BASE_URL}/api/swap/execute`, {
    method: "POST",
    headers: await buildAuthHeaders(getAccessToken),
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as SwapExecuteResponse;
}
