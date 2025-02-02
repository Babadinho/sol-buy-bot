const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class ConfigManager extends EventEmitter {
  constructor() {
    super();
    this.CONFIG_FILE = path.join(__dirname, '../config/settings.json');
    this.config = this.loadInitialConfig();
  }

  loadInitialConfig() {
    try {
      return JSON.parse(fs.readFileSync(this.CONFIG_FILE, 'utf8'));
    } catch (error) {
      console.log('Error loading config:', error);
      return {
        AMOUNT: '0.1',
        SLIPPAGE: '1',
        PRIORITY_FEE: '0.006',
      };
    }
  }

  getConfig() {
    return { ...this.config };
  }

  updateConfig(updates) {
    try {
      const newConfig = { ...this.config, ...updates };
      fs.writeFileSync(this.CONFIG_FILE, JSON.stringify(newConfig, null, 2));
      this.config = newConfig;

      // Update process.env
      Object.keys(updates).forEach((key) => {
        process.env[key] = updates[key];
      });

      return true;
    } catch (error) {
      console.log('Error saving config:', error);
      return false;
    }
  }
}

// Create a singleton instance
const configManager = new ConfigManager();

// Export functions that use the singleton
module.exports = {
  loadConfig: () => configManager.getConfig(),
  saveConfig: (updates) => configManager.updateConfig(updates),
  configManager, // Export the manager if needed
};
