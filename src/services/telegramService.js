const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const bs58 = require('bs58');
const { loadPositions, savePositions } = require('../utils/helpers');
const { loadConfig, saveConfig } = require('../utils/config');

class TelegramService {
  static instance = null;

  constructor(token, tradingService) {
    if (TelegramService.instance) {
      return TelegramService.instance;
    }

    this.bot = new TelegramBot(token, {
      polling: {
        // Only process messages received after bot startup
        offset: -1,
        // Ignore messages older than current timestamp
        timeout: 0,
      },
    });
    this.tradingService = tradingService;
    this.startupTime = Date.now();
    this.setupCommands();

    TelegramService.instance = this;
  }

  setupCommands() {
    this.bot.removeAllListeners();

    // Add timestamp check to all message handlers
    const withTimestampCheck = (handler) => {
      return (msg, ...args) => {
        // Ignore messages from before bot startup
        if (msg.date * 1000 < this.startupTime) {
          return;
        }
        return handler(msg, ...args);
      };
    };

    // Wrap all handlers with timestamp check
    this.bot.onText(
      /^\/start$/,
      withTimestampCheck(this.handleStart.bind(this))
    );
    this.bot.onText(/^\/help$/, withTimestampCheck(this.handleHelp.bind(this)));
    this.bot.onText(
      /^\/settings$/,
      withTimestampCheck(this.handleSettings.bind(this))
    );
    this.bot.onText(
      /^\/setamount\s+(\d*\.?\d+)$/,
      withTimestampCheck(this.handleSetAmount.bind(this))
    );
    this.bot.onText(
      /^\/setslippage\s+(\d*\.?\d+)$/,
      withTimestampCheck(this.handleSetSlippage.bind(this))
    );
    this.bot.onText(
      /^\/setfee\s+(\d*\.?\d+)$/,
      withTimestampCheck(this.handleSetFee.bind(this))
    );
    this.bot.onText(
      /^\/positions$/,
      withTimestampCheck(this.handlePositions.bind(this))
    );
    this.bot.on(
      'callback_query',
      withTimestampCheck(this.handleCallbackQuery.bind(this))
    );
    this.bot.on('message', withTimestampCheck(this.handleMessage.bind(this)));
  }

  destroy() {
    if (this.bot) {
      this.bot.removeAllListeners();
      this.bot.stopPolling();
    }
    TelegramService.instance = null;
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
    const settings = loadConfig();

    const message = `⚙️ Current Settings:
💰 Buy Amount: ${settings.AMOUNT} SOL
📊 Slippage: ${settings.SLIPPAGE}%
💨 Priority Fee: ${settings.PRIORITY_FEE} SOL

To update settings, use:
/setamount <value> - Set buy amount in SOL
/setslippage <value> - Set slippage in %
/setfee <value> - Set priority fee in SOL`;

    this.bot.sendMessage(chatId, message);
  }

  async handleSetAmount(msg, match) {
    const chatId = msg.chat.id;
    const amount = match[1];

    if (isNaN(amount) || Number(amount) <= 0) {
      this.bot.sendMessage(
        chatId,
        '❌ Please provide a valid amount (e.g., /setamount 0.1)'
      );
      return;
    }

    if (saveConfig({ AMOUNT: amount })) {
      this.bot.sendMessage(chatId, `✅ Buy amount updated to ${amount} SOL`);
    } else {
      this.bot.sendMessage(chatId, '❌ Failed to update settings');
    }
  }

  async handleSetSlippage(msg, match) {
    const chatId = msg.chat.id;
    const slippage = match[1];

    if (isNaN(slippage) || Number(slippage) <= 0) {
      this.bot.sendMessage(
        chatId,
        '❌ Please provide a valid slippage percentage (e.g., /setslippage 1)'
      );
      return;
    }

    if (saveConfig({ SLIPPAGE: slippage })) {
      this.bot.sendMessage(chatId, `✅ Slippage updated to ${slippage}%`);
    } else {
      this.bot.sendMessage(chatId, '❌ Failed to update settings');
    }
  }

  async handleSetFee(msg, match) {
    const chatId = msg.chat.id;
    const fee = match[1];

    if (isNaN(fee) || Number(fee) <= 0) {
      this.bot.sendMessage(
        chatId,
        '❌ Please provide a valid priority fee (e.g., /setfee 0.006)'
      );
      return;
    }

    if (saveConfig({ PRIORITY_FEE: fee })) {
      this.bot.sendMessage(chatId, `✅ Priority fee updated to ${fee} SOL`);
    } else {
      this.bot.sendMessage(chatId, '❌ Failed to update settings');
    }
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
🪙 Token: ${data.symbol}
📝 CA: ${mint}
💰 Balance: ${actualAmount} tokens
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

    if (msg.text && msg.text.startsWith('/')) {
      return;
    }

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

TelegramService.cleanup = () => {
  if (TelegramService.instance) {
    TelegramService.instance.destroy();
  }
};

process.on('SIGINT', () => {
  TelegramService.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  TelegramService.cleanup();
  process.exit(0);
});

module.exports = TelegramService;
