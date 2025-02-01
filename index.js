require('dotenv').config();
const { Connection, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const TradingService = require('./src/services/tradingService');
const TelegramService = require('./src/services/telegramService');

// Initialize Solana connection
const connection = new Connection(process.env.RPC_ENDPOINT, 'confirmed');

// Get wallet keypair
const walletKeypair = Keypair.fromSecretKey(
  bs58.decode(process.env.WALLET_PRIVATE_KEY)
);

// Initialize services
const tradingService = new TradingService(connection);
const telegramService = new TelegramService(
  process.env.TELEGRAM_BOT_TOKEN,
  tradingService
);

console.log('Bot is running...');
