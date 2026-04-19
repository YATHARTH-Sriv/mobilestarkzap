import 'react-native-get-random-values';
import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';
import { TextDecoder, TextEncoder } from 'fast-text-encoding';

const globalObject = globalThis as unknown as {
  crypto?: {
    getRandomValues?: typeof Crypto.getRandomValues;
    randomUUID?: typeof Crypto.randomUUID;
  };
  Buffer?: typeof Buffer;
  TextEncoder?: typeof TextEncoder;
  TextDecoder?: typeof TextDecoder;
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
  globalObject.TextEncoder = TextEncoder;
}

if (!globalObject.TextDecoder) {
  globalObject.TextDecoder = TextDecoder;
}
