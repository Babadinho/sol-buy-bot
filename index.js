require('dotenv').config();
const { Connection, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const TradingService = require('./src/services/tradingService');
const TelegramService = require('./src/services/telegramService');
const { loadConfig } = require('./src/utils/config');

// Load config at startup
loadConfig();

// Initialize Solana connection
const connection = new Connection(process.env.RPC_ENDPOINT, 'confirmed');

// Get wallet keypair
const walletKeypair = Keypair.fromSecretKey(
  bs58.decode(process.env.WALLET_PRIVATE_KEY)
);

// Initialize services
const tradingService = new TradingService(connection);

// Cleanup any existing instance before creating a new one
TelegramService.cleanup();

// Create new instance
const telegramService = new TelegramService(
  process.env.TELEGRAM_BOT_TOKEN,
  tradingService
);

console.log('Bot is running...');
