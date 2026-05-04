// Web re-exports from @privy-io/react-auth
// API differences between SDKs:
//   Native (@privy-io/expo):    { user, isReady, getAccessToken, logout }
//   Web (@privy-io/react-auth): { user, ready, authenticated, getAccessToken, logout, login }
//
// We normalize the web API to match the native shape so all app code
// can use `const { user, isReady, getAccessToken } = usePrivy()`.
import {
  usePrivy as usePrivyWeb,
  useLogin as useLoginWeb,
} from '@privy-io/react-auth';

export function usePrivy() {
  const privy = usePrivyWeb();
  return {
    ...privy,
    // Native SDK exposes `isReady`, web SDK exposes `ready`
    isReady: privy.ready,
  };
}

export function useLogin() {
  const { login: webLogin } = useLoginWeb();

  return {
    login: async (_opts?: { loginMethods?: string[] }) => {
      // The web SDK's login() opens a modal. Let the PrivyProvider handle auth state.
      webLogin();
    },
  };
}
