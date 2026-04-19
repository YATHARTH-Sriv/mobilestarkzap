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
