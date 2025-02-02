const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const bs58 = require('bs58');
const { loadPositions, savePositions } = require('../utils/helpers');

class TelegramService {
  constructor(token, tradingService) {
    this.bot = new TelegramBot(token, { polling: true });
    this.tradingService = tradingService;
    this.setupCommands();
  }

  setupCommands() {
    this.bot.onText(/\/start/, this.handleStart.bind(this));
    this.bot.onText(/\/help/, this.handleHelp.bind(this));
    this.bot.onText(/\/settings/, this.handleSettings.bind(this));
    this.bot.onText(/\/positions/, this.handlePositions.bind(this));
    this.bot.on('callback_query', this.handleCallbackQuery.bind(this));
    this.bot.on('message', this.handleMessage.bind(this));
  }

  async handleStart(msg) {
    const chatId = msg.chat.id;
    const message = `
🚀 Welcome to PumpRipper Bot!

To use this bot:
1. Simply paste a Solana token contract address
2. The bot will instantly attempt to buy the token using your preset parameters

Your current settings can be viewed with /settings
Need help? Use /help command
`;
    this.bot.sendMessage(chatId, message);
  }

  async handleHelp(msg) {
    const chatId = msg.chat.id;
    const message = `
📚 Help Guide:

Commands:
/start - Show welcome message
/settings - View current trading settings
/help - Show this help message

To buy a token:
Simply paste the token's contract address (44 characters)
`;
    this.bot.sendMessage(chatId, message);
  }

  async handleSettings(msg) {
    const chatId = msg.chat.id;
    const message = `
⚙️ Current Trading Settings:

Amount: ${process.env.AMOUNT} SOL
Slippage: ${process.env.SLIPPAGE}%
Priority Fee: ${process.env.PRIORITY_FEE} SOL
Pool: ${process.env.POOL}
`;
    this.bot.sendMessage(chatId, message);
  }

  async handlePositions(msg) {
    const chatId = msg.chat.id;
    const positions = loadPositions();

    if (Object.keys(positions).length === 0) {
      this.bot.sendMessage(chatId, '📊 No active positions');
      return;
    }

    for (const [mint, data] of Object.entries(positions)) {
      const actualAmount = data.tokenAmount
        ? (Number(data.tokenAmount) / 1e9).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 9,
          })
        : 'Unknown';

      const message = `
🪙 Token: ${data.tokenName || mint}
💰 Amount: ${actualAmount} tokens
📅 Last transaction: ${new Date(data.timestamp).toLocaleString()}
`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: 'Sell 25%', callback_data: `sell_${mint}_25` },
            { text: 'Sell 50%', callback_data: `sell_${mint}_50` },
            { text: 'Sell 75%', callback_data: `sell_${mint}_75` },
          ],
          [
            { text: 'Sell 100%', callback_data: `sell_${mint}_100` },
            { text: '❌ Remove', callback_data: `remove_${mint}` },
          ],
        ],
      };

      this.bot.sendMessage(chatId, message, {
        reply_markup: keyboard,
        parse_mode: 'HTML',
      });
    }
  }

  async handleCallbackQuery(query) {
    const [action, mint, percentage] = query.data.split('_');

    if (action === 'sell') {
      this.bot.answerCallbackQuery(query.id, {
        text: `Selling ${percentage}% of ${mint}...`,
      });
      const result = await this.tradingService.sellToken(
        mint,
        parseInt(percentage)
      );
      this.bot.sendMessage(query.message.chat.id, result);

      // If sold 100%, remove from positions
      if (percentage === '100') {
        const positions = loadPositions();
        delete positions[mint];
        savePositions(positions);
      }
    }

    if (action === 'remove') {
      const positions = loadPositions();
      delete positions[mint];
      savePositions(positions);
      this.bot.answerCallbackQuery(query.id, { text: 'Position removed' });
      this.bot.deleteMessage(query.message.chat.id, query.message.message_id);
    }
  }

  async handleMessage(msg) {
    const chatId = msg.chat.id;

    // Skip if it's a command
    if (msg.text && msg.text.startsWith('/')) {
      return;
    }

    // Check if the message is a contract address
    if (msg.text && this.isValidSolanaAddress(msg.text)) {
      this.bot.sendMessage(chatId, '🚀 Processing buy order...');
      const result = await this.tradingService.buyToken(msg.text);
      this.bot.sendMessage(chatId, result);
    } else if (!msg.text.startsWith('/')) {
      this.bot.sendMessage(
        chatId,
        '❌ Please send a valid Solana token contract address'
      );
    }
  }

  isValidSolanaAddress(address) {
    try {
      const decoded = bs58.decode(address);
      return decoded.length === 32;
    } catch {
      return false;
    }
  }
}

module.exports = TelegramService;
