import { Platform } from 'react-native';

// On web, the browser already has crypto, TextEncoder/TextDecoder, etc.
// These polyfills are only needed for native (iOS/Android).
if (Platform.OS !== 'web') {
  require('react-native-get-random-values');

  const Crypto = require('expo-crypto');
  const { Buffer } = require('buffer');
  const { TextDecoder: TDPolyfill, TextEncoder: TEPolyfill } = require('fast-text-encoding');

  const globalObject = globalThis as unknown as {
    crypto?: {
      getRandomValues?: typeof Crypto.getRandomValues;
      randomUUID?: typeof Crypto.randomUUID;
    };
    Buffer?: typeof Buffer;
    TextEncoder?: typeof TEPolyfill;
    TextDecoder?: typeof TDPolyfill;
  };

  if (!globalObject.crypto) {
    globalObject.crypto = {};
  }

  if (typeof globalObject.crypto.getRandomValues !== 'function') {
    globalObject.crypto.getRandomValues = Crypto.getRandomValues;
  }

  if (typeof globalObject.crypto.randomUUID !== 'function') {
    globalObject.crypto.randomUUID = Crypto.randomUUID;
  }

  if (!globalObject.Buffer) {
    globalObject.Buffer = Buffer;
  }

  if (!globalObject.TextEncoder) {
    globalObject.TextEncoder = TEPolyfill;
  }

  if (!globalObject.TextDecoder) {
    globalObject.TextDecoder = TDPolyfill;
  }
}
