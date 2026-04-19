import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="username" />
      <Stack.Screen name="wallet" />
      <Stack.Screen name="done" />
    </Stack>
  );
}
