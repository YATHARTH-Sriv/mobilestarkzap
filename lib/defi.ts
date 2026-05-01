import { API_BASE_URL } from "@/lib/config";
import { readErrorMessage } from "@/lib/http";

export type DefiAmount = {
  unit: string;
  raw: string;
  formatted: string;
};

export type DefiToken = {
  symbol: "STRK";
  name: string;
  address: string;
  decimals: number;
};

export type DefiPool = {
  poolContract: string;
  token: DefiToken;
  delegated: DefiAmount;
  validator: {
    name: string;
    stakerAddress: string;
    logoUrl: string | null;
  } | null;
};

export type StakingPosition = {
  staked: DefiAmount;
  rewards: DefiAmount;
  total: DefiAmount;
  unpooling: DefiAmount;
  unpoolTime: string | null;
  commissionPercent: number;
  rewardAddress: string;
} | null;

export type DefiStakingSummary = {
  chainId: "SN_MAIN" | "SN_SEPOLIA";
  walletAddress: string;
  token: DefiToken;
  walletBalance: DefiAmount;
  primaryPool: DefiPool;
  pools: DefiPool[];
  position: StakingPosition;
  stats: {
    estimatedApy: number;
    projectedYearlyRewards: string;
    rewardsUnit: string;
  };
};

export type DefiActionResponse = {
  message: string;
  txHash: string;
  explorerUrl: string;
  poolAddress: string;
  amount?: DefiAmount;
  rewards?: DefiAmount;
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

async function postDefiAction(
  getAccessToken: () => Promise<string | null>,
  path: string,
  body: Record<string, unknown>,
): Promise<DefiActionResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: await buildAuthHeaders(getAccessToken),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as DefiActionResponse;
}

export async function fetchDefiStakingSummary(
  getAccessToken: () => Promise<string | null>,
): Promise<DefiStakingSummary> {
  const response = await fetch(`${API_BASE_URL}/api/defi/staking/summary`, {
    headers: await buildAuthHeaders(getAccessToken),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as DefiStakingSummary;
}

export async function stakeStrk(
  getAccessToken: () => Promise<string | null>,
  poolAddress: string,
  amount: string,
): Promise<DefiActionResponse> {
  return postDefiAction(getAccessToken, "/api/defi/staking/stake", {
    poolAddress,
    amount,
  });
}

export async function claimStakingRewards(
  getAccessToken: () => Promise<string | null>,
  poolAddress: string,
): Promise<DefiActionResponse> {
  return postDefiAction(getAccessToken, "/api/defi/staking/claim", {
    poolAddress,
  });
}

export async function startStakingWithdrawal(
  getAccessToken: () => Promise<string | null>,
  poolAddress: string,
  amount: string,
): Promise<DefiActionResponse> {
  return postDefiAction(getAccessToken, "/api/defi/staking/exit-intent", {
    poolAddress,
    amount,
  });
}

export async function completeStakingWithdrawal(
  getAccessToken: () => Promise<string | null>,
  poolAddress: string,
): Promise<DefiActionResponse> {
  return postDefiAction(getAccessToken, "/api/defi/staking/exit", {
    poolAddress,
  });
}
