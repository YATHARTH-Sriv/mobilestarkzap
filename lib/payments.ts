import { API_BASE_URL } from '@/lib/config';
import { readErrorMessage } from '@/lib/http';

export type PaymentUser = {
  privyUserId: string;
  username: string;
  walletAddress: string;
};

export type RecentPaymentContact = {
  username: string;
  walletAddress: string;
  lastPaidAt: string;
  isExternal: boolean;
};

export type DirectPaymentHistoryItem = {
  id: string;
  senderPrivyUserId: string;
  senderUsername: string;
  senderWalletAddress: string;
  recipientPrivyUserId: string | null;
  recipientUsername: string;
  recipientWalletAddress: string;
  tokenSymbol: string;
  tokenContractAddress: string;
  amountRaw: string;
  amountUnit: string;
  txHash: string | null;
  explorerUrl: string | null;
  status: 'success' | 'failed';
  details: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type SendDirectPaymentResult = {
  message: string;
  recipientUsername: string | null;
  recipientDisplayName: string;
  recipientWalletAddress: string;
  amountUnit: string;
  amountRaw: string;
  tokenSymbol: string;
  txHash: string;
  explorerUrl: string;
};

async function buildAuthHeaders(getAccessToken: () => Promise<string | null>): Promise<HeadersInit> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  const token = await getAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

export async function searchPaymentUsers(
  getAccessToken: () => Promise<string | null>,
  query: string,
  limit = 8,
): Promise<PaymentUser[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/payments/search-users?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}`,
    {
      headers: await buildAuthHeaders(getAccessToken),
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as { users: PaymentUser[] };
  return payload.users;
}

export async function fetchRecentPaymentContacts(
  getAccessToken: () => Promise<string | null>,
  limit = 8,
): Promise<RecentPaymentContact[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/payments/recent-contacts?limit=${encodeURIComponent(String(limit))}`,
    {
      headers: await buildAuthHeaders(getAccessToken),
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as { contacts: RecentPaymentContact[] };
  return payload.contacts;
}

export async function fetchPaymentHistory(
  getAccessToken: () => Promise<string | null>,
  recipient: string,
  limit = 40,
): Promise<DirectPaymentHistoryItem[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/payments/history/${encodeURIComponent(recipient)}?limit=${encodeURIComponent(String(limit))}`,
    {
      headers: await buildAuthHeaders(getAccessToken),
    },
  );

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as { history: DirectPaymentHistoryItem[] };
  return payload.history;
}

export async function sendDirectPayment(
  getAccessToken: () => Promise<string | null>,
  params: {
    recipient: string;
    amount: string;
  },
): Promise<SendDirectPaymentResult> {
  const response = await fetch(`${API_BASE_URL}/api/payments/send`, {
    method: 'POST',
    headers: await buildAuthHeaders(getAccessToken),
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as SendDirectPaymentResult;
}
