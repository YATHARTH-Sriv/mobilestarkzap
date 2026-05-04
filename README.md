## Expo Client For Zen Mobile 

Link To App: https://zenmobile.vercel.app/  <br/>
This repo contains all the code login with privy username wallet creaion deploy wallet 

1. send
2. swap
3. prediction custom contract calling
4. Defi 
5. Balance and TXn History

How To Run This Whole Mobile App:


---

## Prerequisites

Ensure you have the following installed on your system:
* Node.js
* Expo

## API Keys Required

Create a .env file based on the variables below. Refer to .env.example for more details.

## Environment Variables Configuration

Create a `.env` file in the root directory and populate it with the following variables:

EXPO_PUBLIC_API_BASE_URL=http://localhost:8001 <br/>
EXPO_PUBLIC_WS_BASE_URL=ws://localhost:8001 <br/>
EXPO_PUBLIC_PRIVY_APP_ID= <br/>
EXPO_PUBLIC_PRIVY_CLIENT_ID= <br/>



---

## Installation and Setup

Follow these steps to test the application locally.

### 1. Clone the Repositories
Copy and run these commands in your terminal:

```bash
# Mobile Client Repository
git clone https://github.com/YATHARTH-Sriv/mobilestarkzap.git 

# Backend Repository
git clone https://github.com/YATHARTH-Sriv/backendstarkzap

```



### 2. Configure the Backend
Open the backendstarkzap folder in your IDE and run:

```Bash
npm install
npm run start
```
Verify that all environment variables are set before running.

### 3. Configure the Mobile Client
Open the mobilestarkzap folder in your IDE and perform the following:

Install Dependencies:

```Bash
npm install
Network Configuration:
```

Run the following command to get your local IP address:

```Bash
ipconfig getifaddr en0
Copy the value and set it in your environment variables:
EXPO_PUBLIC_BACKEND_URL=http://<value>:8000
```


Alchemy Setup:
Obtain an Alchemy RPC URL and ensure all other environment variables are configured.

Start the Client:

```Bash
npm run start
```

Testing on Mobile
Install the Expo Go app from the Play Store or App Store.

Scan the QR code displayed in your terminal from the mobilestarkzap workspace.
