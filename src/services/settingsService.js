const { Database } = require('sqlite3').verbose();
const path = require('path');

class SettingsService {
  constructor() {
    this.db = new Database(path.join(__dirname, '../../data/settings.db'));
    this.initializeDatabase().catch(console.error);
  }

  async initializeDatabase() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Create settings table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        `);

        // Create authorized users table
        this.db.run(`
          CREATE TABLE IF NOT EXISTS authorized_users (
            chat_id TEXT PRIMARY KEY,
            username TEXT,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Initialize default settings
        const defaultSettings = {
          amount: process.env.AMOUNT || '0.1',
          slippage: process.env.SLIPPAGE || '15',
          priority_fee: process.env.PRIORITY_FEE || '0.00001',
          pool: process.env.POOL || 'pump',
        };

        const promises = Object.entries(defaultSettings).map(([key, value]) => {
          return new Promise((resolveInsert, rejectInsert) => {
            this.db.run(
              'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
              [key, value],
              (err) => {
                if (err) rejectInsert(err);
                else resolveInsert();
              }
            );
          });
        });

        // Add your Telegram chat_id as the initial authorized user
        this.db.run(
          'INSERT OR IGNORE INTO authorized_users (chat_id, username) VALUES (?, ?)',
          [process.env.ADMIN_CHAT_ID, process.env.ADMIN_USERNAME]
        );

        Promise.all(promises).then(resolve).catch(reject);
      });
    });
  }

  async isAuthorizedUser(chatId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT chat_id FROM authorized_users WHERE chat_id = ?',
        [chatId],
        (err, row) => {
          if (err) reject(err);
          resolve(!!row);
        }
      );
    });
  }

  async getSetting(key) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT value FROM settings WHERE key = ?',
        [key],
        (err, row) => {
          if (err) reject(err);
          resolve(row ? row.value : null);
        }
      );
    });
  }

  async getAllSettings() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT key, value FROM settings', (err, rows) => {
        if (err) reject(err);
        const settings = {};
        rows.forEach((row) => {
          settings[row.key] = row.value;
        });
        resolve(settings);
      });
    });
  }

  async updateSetting(key, value) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE settings SET value = ? WHERE key = ?',
        [value, key],
        (err) => {
          if (err) reject(err);
          resolve();
        }
      );
    });
  }
}

module.exports = SettingsService;
