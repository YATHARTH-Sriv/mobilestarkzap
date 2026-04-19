import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { usePrivy } from '@privy-io/expo';
import { useLogin } from '@privy-io/expo/ui';

import { OnboardingFrame } from '@/components/onboarding-frame';
import { OnboardingCta } from '@/components/onboarding-cta';
import { ONBOARDING_COLORS } from '@/lib/onboarding-theme';

export default function WelcomeScreen() {
  const { user } = usePrivy();
  const { login } = useLogin();
  const { width, height } = useWindowDimensions();

  const compactWidth = width <= 375;
  const compactHeight = height <= 760;

  const titleSize = compactWidth ? 86 : 98;
  const welcomeSize = compactWidth ? 20 : 24;
  const taglineSize = compactWidth ? 16 : 18;
  const topMargin = compactHeight ? 48 : 76;
  const logoMargin = compactHeight ? 88 : 120;
  const logoBox = compactWidth ? 116 : 132;
  const logoCore = compactWidth ? 84 : 92;
  const panelMargin = compactHeight ? 52 : 84;

  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      router.replace('./username');
    }
  }, [user]);

  async function handleContinue() {
    try {
      setError(null);
      setStatus('Opening secure login...');
      await login({ loginMethods: ['email'] });
      setStatus('Login successful');
      router.replace('./username');
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : 'Login failed';
      setError(message);
      setStatus('');
    }
  }

  return (
    <OnboardingFrame
      footer={
        <OnboardingCta
          label="Login with Privy"
          onPress={handleContinue}
          variant="black"
          disabled={status === 'Opening secure login...'}
          icon={<Ionicons name="shield-checkmark" size={24} color="#24d06c" />}
        />
      }>
      <View style={styles.headerWrap}>
        <Text style={[styles.welcomeLine, { fontSize: welcomeSize, marginTop: topMargin }]}>Welcome To</Text>
        <Text style={[styles.brandTitle, { fontSize: titleSize, lineHeight: titleSize + 6 }]}>Starkbet</Text>
        <Text style={[styles.tagline, { fontSize: taglineSize }]}>One App For All Your Needs</Text>
      </View>

      <View style={[styles.logoWrap, { marginTop: logoMargin }]}> 
        <View style={[styles.logoSoftGreen, { width: logoBox, height: logoBox, borderRadius: compactWidth ? 24 : 28 }]} />
        <View style={[styles.logoSoftOrange, { width: logoBox, height: logoBox, borderRadius: compactWidth ? 24 : 28 }]} />
        <View style={[styles.logoCore, { width: logoCore, height: logoCore, borderRadius: logoCore / 2 }]}>
          <Ionicons name="sparkles" size={compactWidth ? 34 : 38} color={ONBOARDING_COLORS.greenDark} />
        </View>
      </View>

      <View style={[styles.authPanel, { marginTop: panelMargin }]}> 
        <Text style={styles.authPanelTitle}>Secure Email Login</Text>
        <Text style={styles.authPanelBody}>
          Continue to Privy&apos;s built-in email and OTP modal for sign-in.
        </Text>
        {status ? <Text style={styles.statusText}>{status}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    alignItems: 'center',
    gap: 6,
  },
  welcomeLine: {
    color: ONBOARDING_COLORS.green,
    fontWeight: '700',
  },
  brandTitle: {
    color: ONBOARDING_COLORS.textPrimary,
    fontWeight: '900',
  },
  tagline: {
    color: ONBOARDING_COLORS.textSecondary,
    fontWeight: '500',
  },
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoSoftGreen: {
    position: 'absolute',
    borderWidth: 5,
    borderColor: '#b9e6bf',
    transform: [{ rotate: '-12deg' }],
  },
  logoSoftOrange: {
    position: 'absolute',
    borderWidth: 4,
    borderColor: '#f6c28a',
    transform: [{ rotate: '10deg' }],
  },
  logoCore: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3faf2',
  },
  authPanel: {
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: ONBOARDING_COLORS.inputBorder,
    backgroundColor: '#fdfdfd',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  authPanelTitle: {
    color: ONBOARDING_COLORS.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  authPanelBody: {
    color: ONBOARDING_COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  statusText: {
    color: ONBOARDING_COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  errorText: {
    color: '#bd3f3f',
    fontSize: 13,
    textAlign: 'center',
  },
});
