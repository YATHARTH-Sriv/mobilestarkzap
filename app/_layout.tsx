import '@/lib/runtime-polyfills';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import 'react-native-reanimated';

import { AuthProvider } from '@/lib/auth-provider';
import { PRIVY_APP_ID } from '@/lib/config';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_900Black,
  });

  if (!PRIVY_APP_ID) {
    return (
      <View style={styles.missingConfigContainer}>
        <Text style={styles.missingConfigTitle}>Privy configuration missing</Text>
        <Text style={styles.missingConfigBody}>
          Set EXPO_PUBLIC_PRIVY_APP_ID in mobile/.env and restart Expo.
        </Text>
      </View>
    );
  }

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  missingConfigContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#07142b',
  },
  missingConfigTitle: {
    color: '#e6f2ff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  missingConfigBody: {
    color: '#9ec5ff',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
