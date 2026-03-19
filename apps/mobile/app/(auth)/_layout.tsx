import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      {/* gestureEnabled: false evita que el usuario haga swipe-back desde pending
          al formulario de registro (lo que causaría AUTH_PHONE_EXISTS en re-submit) */}
      <Stack.Screen name="pending" options={{ gestureEnabled: false }} />
      <Stack.Screen name="invite/[code]" />
    </Stack>
  );
}
