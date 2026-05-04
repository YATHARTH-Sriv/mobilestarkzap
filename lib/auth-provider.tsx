// Native auth provider — uses @privy-io/expo
import React from 'react';
import { PrivyProvider } from '@privy-io/expo';
import { PrivyElements } from '@privy-io/expo/ui';

import { PRIVY_APP_ID, PRIVY_MOBILE_CLIENT_ID } from '@/lib/config';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider appId={PRIVY_APP_ID} clientId={PRIVY_MOBILE_CLIENT_ID || undefined}>
      {children}
      <PrivyElements />
    </PrivyProvider>
  );
}
