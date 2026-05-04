// Web auth provider — uses @privy-io/react-auth
import React from 'react';
import { PrivyProvider } from '@privy-io/react-auth';

import { PRIVY_APP_ID, PRIVY_WEB_CLIENT_ID } from '@/lib/config';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_WEB_CLIENT_ID || undefined}
      config={{
        appearance: {
          theme: 'light',
        },
        loginMethods: ['email'],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
