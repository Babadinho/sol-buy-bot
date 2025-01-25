require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const {
  VersionedTransaction,
  Connection,
  Keypair,
} = require('@solana/web3.js');
const bs58 = require('bs58');

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize Solana connection
const web3Connection = new Connection(process.env.RPC_ENDPOINT, 'confirmed');

// Get wallet keypair from private key
const walletKeypair = Keypair.fromSecretKey(
  bs58.decode(process.env.WALLET_PRIVATE_KEY)
);

async function buyToken(mint) {
  try {
    const response = await fetch(`https://pumpportal.fun/api/trade-local`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        publicKey: walletKeypair.publicKey.toString(),
        action: 'buy',
        mint: mint,
        denominatedInSol: 'false',
        amount: parseInt(process.env.AMOUNT),
        slippage: parseInt(process.env.SLIPPAGE),
        priorityFee: parseFloat(process.env.PRIORITY_FEE),
        pool: process.env.POOL,
      }),
    });

    if (response.status === 200) {
      const data = await response.arrayBuffer();
      const tx = VersionedTransaction.deserialize(new Uint8Array(data));
      tx.sign([walletKeypair]);
      const signature = await web3Connection.sendTransaction(tx);
      return `Transaction successful! View at: https://solscan.io/tx/${signature}`;
    } else {
      return `Error: ${response.statusText}`;
    }
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

// Command handlers
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const message = `
🚀 Welcome to PumpRipper Bot!

To use this bot:
1. Simply paste a Solana token contract address
2. The bot will instantly attempt to buy the token using your preset parameters

Your current settings can be viewed with /settings
Need help? Use /help command
`;
  bot.sendMessage(chatId, message);
});

bot.onText(/\/settings/, (msg) => {
  const chatId = msg.chat.id;
  const message = `
⚙️ Current Trading Settings:

Amount: ${process.env.AMOUNT}
Slippage: ${process.env.SLIPPAGE}%
Priority Fee: ${process.env.PRIORITY_FEE} SOL
Pool: ${process.env.POOL}
Wallet: ${walletKeypair.publicKey
    .toString()
    .slice(0, 4)}...${walletKeypair.publicKey.toString().slice(-4)}
`;
  bot.sendMessage(chatId, message);
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const message = `
📚 Help Guide:

Commands:
/start - Show welcome message
/settings - View current trading settings
/help - Show this help message

To buy a token:
Simply paste the token's contract address (44 characters)

Example address format:
EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
`;
  bot.sendMessage(chatId, message);
});

function isValidSolanaAddress(address) {
  try {
    const decoded = bs58.decode(address);
    return decoded.length === 32;
  } catch {
    return false;
  }
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  // Skip if it's a command
  if (msg.text && msg.text.startsWith('/')) {
    return;
  }

  // Check if the message is a contract address
  if (msg.text && isValidSolanaAddress(msg.text)) {
    bot.sendMessage(chatId, '🚀 Processing buy order...');
    const result = await buyToken(msg.text);
    bot.sendMessage(chatId, result);
  } else if (!msg.text.startsWith('/')) {
    bot.sendMessage(
      chatId,
      '❌ Please send a valid Solana token contract address'
    );
  }
});

console.log('Bot is running...');
