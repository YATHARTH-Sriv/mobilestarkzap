# StarkBet — Mobile App

A **React Native (Expo)** mobile application that brings **social payments**, **real-time group chat**, and **on-chain prediction markets** to Starknet — all powered by [**StarkZap**](https://www.starkzap.com/) for seamless wallet management and transaction execution.

> Users sign in with social accounts via Privy, get a server-managed Starknet wallet automatically, and can send STRK tokens, chat in rooms, and bet on prediction markets — without ever touching a private key.

---

## What is StarkBet?

StarkBet is a full-stack mobile application built for the Starknet ecosystem. It combines three core experiences into a single app:

1. **Social Payments** — Send and receive STRK tokens to any user by searching their username or pasting a wallet address. Includes payment history and recent contacts.
2. **Group Chat with Prediction Markets** — Create and join chat rooms with real-time WebSocket messaging. Share prediction markets (from Polymarket, Kalshi, or on-chain) directly in chat. Place bets, resolve markets, and claim winnings — all from the chat interface.
3. **Seamless Onboarding** — Users log in with social accounts (Google, Apple, email). A Starknet wallet is automatically created and funded in the background. No seed phrases, no gas management, no complexity.

---

## How StarkZap Powers the App

[**StarkZap**](https://www.starkzap.com/) (`starkzap` and `starkzap-native` npm packages) is the backbone of all blockchain interactions in this project. Here is exactly how it is used:

### On the Express Backend (`starkzap` package)

| Usage                                     | Where                                                      | What it does                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **`StarkZap` SDK initialization**         | `src/config/clients.ts`                                    | Creates a StarkZap instance with RPC URL and chain ID (Sepolia or Mainnet)                          |
| **`sdk.connectWallet()`**                 | `src/services/starknet-wallet.ts`                          | Connects a Privy-managed wallet using `PrivySigner` + `ArgentXV050Preset` account class             |
| **`userWallet.ensureReady()`**            | `src/services/starknet-wallet.ts`                          | Deploys the user's account contract on-chain if not already deployed                                |
| **`userWallet.execute()`**                | `src/services/starknet-wallet.ts`                          | Executes on-chain transactions (transfers, bets, market creation) with automatic out-of-gas retry   |
| **`userWallet.balanceOf()`**              | `src/routes/payments-routes.ts`                            | Checks the sender's STRK balance before processing payments                                         |
| **`sdk.callContract()`**                  | `src/routes/prediction-routes.ts`, `room-market-routes.ts` | Reads on-chain state — market count, pool balances, creator addresses, deadlines, resolution status |
| **`Amount.parse()` / `Amount.fromRaw()`** | `src/routes/wallet-routes.ts`, `payments-routes.ts`        | Token amount parsing and formatting (human-readable ↔ base units)                                   |
| **`getPresets(chainId)`**                 | `src/routes/wallet-routes.ts`, `payments-routes.ts`        | Gets preset token definitions (STRK address, decimals, symbol) for the configured chain             |
| **`fromAddress()`**                       | Multiple route files                                       | Normalizes Starknet addresses to their canonical felt format                                        |
| **`StarkSigner`**                         | `src/routes/wallet-routes.ts`                              | Signs funding transactions with the server's funder private key for automated onboarding            |
| **`PrivySigner`**                         | `src/services/starknet-wallet.ts`                          | Bridges Privy's embedded wallet signing into StarkZap's signer interface                            |
| **`ChainId`**                             | `src/config/env.ts`                                        | Type-safe chain ID management (`SEPOLIA` / `MAINNET`)                                               |

### On the Mobile App (`starkzap-native` package)

The mobile app itself uses `starkzap-native` as a dependency, listed in `package.json`. The mobile app delegates all wallet operations to the Express backend via REST API — the backend is the one directly using StarkZap to sign and execute transactions.

### The Key Design Pattern

```
┌──────────────┐    REST/WS     ┌──────────────┐   StarkZap    ┌──────────────┐
│  React Native │ ──────────►  │  Express API  │ ──────────►  │   Starknet   │
│  Mobile App   │              │  + StarkZap   │              │   Network    │
│  (Privy Auth) │  ◄────────── │  + Privy Node │  ◄────────── │   (Sepolia)  │
└──────────────┘    JSON       └──────────────┘    RPC        └──────────────┘
```

1. User authenticates on mobile via Privy (social login)
2. Mobile sends Privy access token to Express API
3. Backend verifies token, looks up user's Privy-managed wallet
4. Backend uses **StarkZap** to connect the wallet, build transactions, and execute them on-chain
5. Backend returns transaction hash + explorer URL to mobile

---

## Features

### Home Screen

- Personalized welcome with username
- **Send Money** — search users by username or paste a wallet address
- Recent contacts carousel with quick access
- Quick action cards for Send & Receive

### Payments

- Send STRK tokens to any user (by username) or any wallet address
- Real-time balance checking before transfer
- Full bilateral payment history with pagination
- Transaction receipts with Voyager explorer links

### Real-Time Chat

- Create public or private chat rooms
- Real-time WebSocket messaging with typing indicators
- Room membership system (open / approval / invite-only)
- Direct private messaging between users
- Admin tools: invite members, approve/reject join requests

### Prediction Markets

- Create on-chain binary prediction markets (Cairo smart contract)
- Place bets with STRK tokens (approve + bet in a single multicall)
- Resolve markets as the creator
- Claim winnings after resolution
- Link external markets from **Polymarket** and **Kalshi** into chat rooms
- Full on-chain state reading (pools, deadlines, outcomes)

### Profile & Onboarding

- Multi-step onboarding flow: Welcome → Login → Username → Wallet → Done
- Automatic wallet creation and deployment via Privy + StarkZap
- Auto-funding with STRK on Sepolia testnet for new users
- Transaction history log with status tracking
- QR code for wallet address sharing

### Authentication & Security

- Social login via Privy (Google, Apple, email, passkeys)
- Server-side wallet management — private keys never touch the mobile device
- Bearer token authentication on every API endpoint
- Privy access token verification middleware

---

## Tech Stack

| Layer          | Technology                                            |
| -------------- | ----------------------------------------------------- |
| **Mobile**     | React Native + Expo (SDK 54), Expo Router, TypeScript |
| **Auth**       | Privy (`@privy-io/expo`)                              |
| **Blockchain** | StarkZap (`starkzap-native`), Starknet Sepolia        |
| **Backend**    | Expressjs, TypeScript, tsx                            |
| **Database**   | PostgreSQL (via `pg`)                                 |
| **Real-Time**  | WebSockets (`ws`)                                     |
| **Styling**    | React Native StyleSheet, Inter font family            |

---

## Project Structure

```
mobile/
├── app/                     # Expo Router screens
│   ├── index.tsx            # Root entry — auth routing logic
│   ├── _layout.tsx          # Root layout — Privy provider + fonts
│   ├── onboarding/          # Welcome, Username, Wallet, Done screens
│   ├── (tabs)/              # Tab navigator
│   │   ├── index.tsx        # Home — payments, search, contacts
│   │   ├── chats.tsx        # Chat rooms + WebSocket messaging
│   │   ├── profile.tsx      # Profile + transaction history
│   │   └── explore.tsx      # Explore screen
│   └── payments/
│       └── [username].tsx   # Payment thread (send + history)
├── components/              # Reusable UI components
├── lib/                     # Config, API clients, utilities
│   ├── config.ts            # Env vars (API URL, Privy IDs)
│   ├── http.ts              # Authenticated HTTP client
│   ├── payments.ts          # Payment API functions
│   ├── profile.ts           # Profile API functions
│   └── responsive.ts        # Responsive layout helpers
├── expresscode/             # ← Backend (see expresscode/Readme.md)
├── app.json                 # Expo configuration
├── package.json             # Dependencies & scripts
└── .env.example             # Environment variable template
```

---

## Prerequisites

- **Node.js**
- **npm** (comes with Node)
- **Expo CLI** — Install via `npm install -g expo-cli` (optional, can use `npx`)
- **Expo Go** app on your phone (for testing on device)
- **Privy account** — Get your App ID and Client ID from [privy.io](https://www.privy.io/)

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/YATHARTH-Sriv/mobilestarkzap.git
cd mobilestarkzap
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` with your values (see below).

### 4. Start the Express backend first

The mobile app requires the backend to be running.

### 5. Start the Expo dev server

```bash
npm start
```

Or for a specific platform:

```bash
npm run ios       # iOS Simulator
npm run android   # Android Emulator
npm run web       # Web browser
```

---

## Environment Variables

Create a `.env` file in the project root with the following:

```env
# URL of the Express backend (use your machine's local IP for physical devices)
EXPO_PUBLIC_API_BASE_URL=http://localhost:8001

# WebSocket URL for real-time chat
EXPO_PUBLIC_WS_BASE_URL=ws://localhost:8001

# Privy App ID — from your Privy dashboard
EXPO_PUBLIC_PRIVY_APP_ID=your_privy_app_id

# Privy Client ID — from your Privy dashboard
EXPO_PUBLIC_PRIVY_CLIENT_ID=your_privy_client_id
```

> **Note for physical devices**: Replace `localhost` with your computer's local IP address (e.g., `http://192.168.1.100:8001`).

---

## Running the App

1. **Start the backend** — `cd expresscode && npm run dev`
2. **Start the mobile app** — `npm start` (from root)
3. **Open on device** — Scan the QR code with Expo Go, or press `i` for iOS / `a` for Android simulator
4. **Sign in** — Use social login (Google, Apple, or email)
5. **Complete onboarding** — Choose a username, wallet is auto-created and funded
6. **Start using** — Send payments, join/create chat rooms, bet on markets

---
