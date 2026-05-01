import { API_BASE_URL } from "@/lib/config";
import { readErrorMessage } from "@/lib/http";

export type AppUserProfile = {
  privyUserId: string;
  username: string | null;
  onboardingStep: "welcome" | "username" | "wallet" | "done";
  onboardingCompleted: boolean;
  onboardingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProfileWallet = {
  id: string;
  address: string;
  publicKey?: string;
} | null;

export type ProfileMeResponse = {
  profile: AppUserProfile | null;
  wallet: ProfileWallet;
};

export type WalletDeployment = {
  ready: boolean;
  mode?: "user_pays" | "sponsored";
  chainId?: "SN_MAIN" | "SN_SEPOLIA";
  message?: string;
  hint?: string;
};

export type WalletFundingStatus =
  | "disabled"
  | "ready_to_fund"
  | "pending"
  | "funded"
  | "failed";

export type WalletFundingState = {
  enabled: boolean;
  configured: boolean;
  status: WalletFundingStatus;
  amountStrk: string;
  amountRaw: string;
  tokenAddress: string;
  currentBalanceStrk: string;
  currentBalanceRaw: string;
  canDeploy: boolean;
  txHash: string | null;
  explorerUrl: string | null;
  error: string | null;
};

export type WalletOnboardingStateResponse = {
  wallet: NonNullable<ProfileWallet>;
  deployment?: WalletDeployment;
  funding?: WalletFundingState;
};

export type WalletFundingTransaction = {
  txHash: string;
  explorerUrl: string;
  executionMode: "v3_default" | "v3_boosted_bounds";
};

export type FundWalletOnboardingResponse = {
  wallet: NonNullable<ProfileWallet>;
  funding: WalletFundingState;
  transaction?: WalletFundingTransaction;
  message?: string;
};

export type PredictionBalanceResponse = {
  tokenContractAddress: string;
  usdcTokenContractAddress: string;
  walletAddress: string;
  treasuryAddress: string;
  symbol: string;
  userBalance: string;
  userBalanceRaw: {
    low: string;
    high: string;
  };
  userUsdcBalance: string;
  userUsdcBalanceRaw: {
    low: string;
    high: string;
  };
  treasuryBalance: string;
  treasuryBalanceRaw: {
    low: string;
    high: string;
  };
  strkPriceUsdc: string;
  usdcPriceUsdc?: string;
};

export type UserTransactionActivity = {
  id: string;
  action: string;
  status: "success" | "failed";
  txHash: string | null;
  explorerUrl: string | null;
  details: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ProfileTransactionsResponse = {
  transactions: UserTransactionActivity[];
  limit: number;
};

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

export async function fetchMyProfile(
  getAccessToken: () => Promise<string | null>,
): Promise<ProfileMeResponse> {
  const response = await fetch(`${API_BASE_URL}/api/profile/me`, {
    headers: await buildAuthHeaders(getAccessToken),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as ProfileMeResponse;
}

export async function setMyUsername(
  getAccessToken: () => Promise<string | null>,
  username: string,
): Promise<ProfileMeResponse> {
  const response = await fetch(`${API_BASE_URL}/api/profile/username`, {
    method: "POST",
    headers: await buildAuthHeaders(getAccessToken),
    body: JSON.stringify({ username }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as { profile: AppUserProfile };
  return {
    profile: payload.profile,
    wallet: null,
  };
}

export async function completeMyOnboarding(
  getAccessToken: () => Promise<string | null>,
): Promise<ProfileMeResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/profile/onboarding/complete`,
    {
      method: "POST",
      headers: await buildAuthHeaders(getAccessToken),
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as ProfileMeResponse;
}

export async function prepareMyWalletForOnboarding(
  getAccessToken: () => Promise<string | null>,
): Promise<WalletOnboardingStateResponse> {
  const response = await fetch(`${API_BASE_URL}/api/wallet/starknet`, {
    method: "POST",
    headers: await buildAuthHeaders(getAccessToken),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as WalletOnboardingStateResponse;
}

export async function fetchMyWalletOnboardingState(
  getAccessToken: () => Promise<string | null>,
): Promise<WalletOnboardingStateResponse> {
  const response = await fetch(`${API_BASE_URL}/api/wallet/onboarding-state`, {
    headers: await buildAuthHeaders(getAccessToken),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as WalletOnboardingStateResponse;
}

export async function fundMyWalletForOnboarding(
  getAccessToken: () => Promise<string | null>,
): Promise<FundWalletOnboardingResponse> {
  const response = await fetch(`${API_BASE_URL}/api/wallet/fund-onboarding`, {
    method: "POST",
    headers: await buildAuthHeaders(getAccessToken),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as FundWalletOnboardingResponse;
}

export async function deployMyWallet(
  getAccessToken: () => Promise<string | null>,
): Promise<WalletOnboardingStateResponse> {
  const response = await fetch(`${API_BASE_URL}/api/wallet/deploy`, {
    method: "POST",
    headers: await buildAuthHeaders(getAccessToken),
  });

  if (!response.ok && response.status !== 409) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as WalletOnboardingStateResponse;
}

export async function connectRealtimeSocket(
  getAccessToken: () => Promise<string | null>,
  wsBaseUrl: string,
): Promise<WebSocket> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("Missing access token for realtime connection");
  }

  const separator = wsBaseUrl.includes("?") ? "&" : "?";
  const socketUrl = `${wsBaseUrl}${separator}token=${encodeURIComponent(token)}`;
  return new WebSocket(socketUrl);
}

export async function fetchMyPredictionBalances(
  getAccessToken: () => Promise<string | null>,
): Promise<PredictionBalanceResponse> {
  const response = await fetch(`${API_BASE_URL}/api/prediction/balances`, {
    headers: await buildAuthHeaders(getAccessToken),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as PredictionBalanceResponse;
}

export async function fetchMyTransactions(
  getAccessToken: () => Promise<string | null>,
  limit = 12,
): Promise<ProfileTransactionsResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/profile/transactions?limit=${limit}`,
    {
      headers: await buildAuthHeaders(getAccessToken),
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as ProfileTransactionsResponse;
}

export function formatWeiToStrk(wei: string): string {
  const parsed = BigInt(wei || "0");
  const whole = parsed / 10n ** 18n;
  const fraction = parsed % 10n ** 18n;

  if (fraction === 0n) {
    return `${whole.toString()} STRK`;
  }

  const fractionText = fraction
    .toString()
    .padStart(18, "0")
    .slice(0, 4)
    .replace(/0+$/, "");
  return `${whole.toString()}.${fractionText || "0"} STRK`;
}

export function formatWeiToUsdc(wei: string): string {
  const parsed = BigInt(wei || "0");
  const whole = parsed / 10n ** 6n;
  const fraction = parsed % 10n ** 6n;

  if (fraction === 0n) {
    return `${whole.toString()} USDC`;
  }

  const fractionText = fraction
    .toString()
    .padStart(6, "0")
    .slice(0, 2)
    .replace(/0+$/, "");
  return `${whole.toString()}.${fractionText || "0"} USDC`;
}

export function formatTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const deltaSec = Math.max(0, Math.floor((now - then) / 1000));

  if (deltaSec < 60) {
    return `${deltaSec}s ago`;
  }

  const mins = Math.floor(deltaSec / 60);
  if (mins < 60) {
    return `${mins}m ago`;
  }

  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
