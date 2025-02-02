const TelegramBot = require('node-telegram-bot-api');
const bs58 = require('bs58');
const { loadPositions, savePositions } = require('../utils/helpers');
const SettingsService = require('./settingsService');

class TelegramService {
  constructor(token, tradingService) {
    this.bot = new TelegramBot(token, { polling: true });
    this.tradingService = tradingService;
    this.settingsService = new SettingsService();
    this.setupCommands();
  }

  async checkAuthorization(msg, handler) {
    const chatId = msg.chat.id;
    const isAuthorized = await this.settingsService.isAuthorizedUser(chatId);

    if (!isAuthorized) {
      this.bot.sendMessage(
        chatId,
        '⛔️ Unauthorized access. This incident will be logged.'
      );
      console.log(
        `Unauthorized access attempt from chat_id: ${chatId}, username: ${msg.from.username}`
      );
      return false;
    }
    return true;
  }

  setupCommands() {
    // Wrap each command handler with authorization check
    const withAuth = (handler) => async (msg, match) => {
      if (await this.checkAuthorization(msg)) {
        return handler(msg, match);
      }
    };

    this.bot.onText(/\/start/, withAuth(this.handleStart.bind(this)));
    this.bot.onText(/\/help/, withAuth(this.handleHelp.bind(this)));
    this.bot.onText(/\/settings/, withAuth(this.handleSettings.bind(this)));
    this.bot.onText(/\/positions/, withAuth(this.handlePositions.bind(this)));
    this.bot.onText(
      /\/setamount\s+(\d*\.?\d*)/,
      withAuth(this.handleSetAmount.bind(this))
    );
    this.bot.onText(
      /\/setslippage\s+(\d*\.?\d*)/,
      withAuth(this.handleSetSlippage.bind(this))
    );
    this.bot.onText(
      /\/setfee\s+(\d*\.?\d*)/,
      withAuth(this.handleSetFee.bind(this))
    );
    this.bot.onText(
      /\/setpool\s+(\w+)/,
      withAuth(this.handleSetPool.bind(this))
    );
    this.bot.onText(/\/update/, withAuth(this.handleUpdate.bind(this)));

    // Protect callback queries and messages
    this.bot.on('callback_query', async (query) => {
      if (
        await this.checkAuthorization({ chat: { id: query.message.chat.id } })
      ) {
        this.handleCallbackQuery(query);
      }
    });

    this.bot.on('message', async (msg) => {
      if (await this.checkAuthorization(msg)) {
        this.handleMessage(msg);
      }
    });
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
/positions - View current positions
/settings - View current trading settings
/update - Update positions
/help - Show this help message

To buy a token:
Simply paste the token's contract address (44 characters)
`;
    this.bot.sendMessage(chatId, message);
  }

  async handleSettings(msg) {
    const chatId = msg.chat.id;
    const settings = await this.settingsService.getAllSettings();

    const message = `
⚙️ Current Trading Settings:

Amount: ${settings.amount} SOL
Slippage: ${settings.slippage}%
Priority Fee: ${settings.priority_fee} SOL
Pool: ${settings.pool}

To change settings, use these commands:
/setamount <value> - Set trading amount in SOL
/setslippage <value> - Set slippage percentage
/setfee <value> - Set priority fee in SOL
/setpool <name> - Set pool name
`;
    this.bot.sendMessage(chatId, message);
  }

  async handleSetAmount(msg, match) {
    const chatId = msg.chat.id;
    const amount = parseFloat(match[1]);

    if (isNaN(amount) || amount <= 0) {
      this.bot.sendMessage(
        chatId,
        '❌ Please provide a valid positive number for amount'
      );
      return;
    }

    await this.settingsService.updateSetting('amount', amount.toString());
    this.bot.sendMessage(chatId, `✅ Trading amount updated to ${amount} SOL`);
  }

  async handleSetSlippage(msg, match) {
    const chatId = msg.chat.id;
    const slippage = parseFloat(match[1]);

    if (isNaN(slippage) || slippage <= 0 || slippage > 100) {
      this.bot.sendMessage(
        chatId,
        '❌ Please provide a valid slippage percentage between 0 and 100'
      );
      return;
    }

    await this.settingsService.updateSetting('slippage', slippage.toString());
    this.bot.sendMessage(chatId, `✅ Slippage updated to ${slippage}%`);
  }

  async handleSetFee(msg, match) {
    const chatId = msg.chat.id;
    const fee = parseFloat(match[1]);

    if (isNaN(fee) || fee <= 0) {
      this.bot.sendMessage(
        chatId,
        '❌ Please provide a valid positive number for priority fee'
      );
      return;
    }

    await this.settingsService.updateSetting('priority_fee', fee.toString());
    this.bot.sendMessage(chatId, `✅ Priority fee updated to ${fee} SOL`);
  }

  async handleSetPool(msg, match) {
    const chatId = msg.chat.id;
    const pool = match[1].toLowerCase();

    const validPools = ['pump']; // Add other valid pools if needed
    if (!validPools.includes(pool)) {
      this.bot.sendMessage(
        chatId,
        '❌ Invalid pool name. Available pools: ' + validPools.join(', ')
      );
      return;
    }

    await this.settingsService.updateSetting('pool', pool);
    this.bot.sendMessage(chatId, `✅ Pool updated to ${pool}`);
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

    // Skip if message has no text
    if (!msg.text) {
      return;
    }

    // Skip if it's a command
    if (msg.text.startsWith('/')) {
      return;
    }

    // Check if the message is a contract address
    if (this.isValidSolanaAddress(msg.text)) {
      this.bot.sendMessage(chatId, '🚀 Processing buy order...');
      const result = await this.tradingService.buyToken(msg.text);
      this.bot.sendMessage(chatId, result);
    } else {
      this.bot.sendMessage(
        chatId,
        '❌ Please send a valid Solana token contract address'
      );
    }
  }

  async handleUpdate(msg) {
    const chatId = msg.chat.id;
    this.bot.sendMessage(chatId, '🔄 Updating positions...');

    try {
      const positions = loadPositions();
      const updatedPositions = await this.tradingService.updatePositions(
        positions
      );

      if (Object.keys(updatedPositions).length === 0) {
        this.bot.sendMessage(chatId, '📊 No positions to update');
        return;
      }

      this.bot.sendMessage(chatId, '✅ Positions updated successfully!');
      // Show updated positions
      this.handlePositions(msg);
    } catch (error) {
      console.error('Update error:', error);
      this.bot.sendMessage(
        chatId,
        `❌ Error updating positions: ${error.message}`
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
