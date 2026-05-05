export async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as {
      error?: string;
      hint?: string;
      details?: string;
    };

    return payload.hint || payload.details || payload.error || "Request failed";
  } catch {
    const text = await response.text();
    return text || "Request failed";
  }
}

export function shortenAddress(address: string | null | undefined): string {
  if (!address) {
    return "-";
  }

  if (address.length <= 14) {
    return address;
  }

  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

export function formatErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  
  let msg = err instanceof Error ? err.message : String(err);
  
  if (/insufficient liquidity/i.test(msg)) {
    return "Insufficient liquidity for this trade.";
  }
  
  if (/starknet_addInvokeTransaction/i.test(msg)) {
    return "Transaction was rejected by the network.";
  }
  
  if (/insufficient funds|insufficient balance/i.test(msg)) {
    return "Insufficient token balance.";
  }

  if (/user rejected/i.test(msg)) {
    return "Transaction was cancelled.";
  }

  msg = msg.replace(/^error:\s*/i, "");
  
  // Truncate excessively long messages to prevent UI layout breakage
  if (msg.length > 80) {
    return `${msg.slice(0, 80).trim()}...`;
  }
  
  return msg || fallback;
}
