const { Database } = require('sqlite3').verbose();
const path = require('path');

class SettingsService {
  constructor() {
    this.db = new Database(path.join(__dirname, '../../data/settings.db'));
    this.initializeDatabase().catch(console.error);
  }

  async initializeDatabase() {
    return new Promise((resolve, reject) => {
      this.db.run(
        `
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `,
        (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Initialize default settings if they don't exist
          const defaultSettings = {
            amount: process.env.AMOUNT || '0.1',
            slippage: process.env.SLIPPAGE || '15',
            priority_fee: process.env.PRIORITY_FEE || '0.00001',
            pool: process.env.POOL || 'pump',
          };

          // Use Promise.all to wait for all insertions to complete
          const promises = Object.entries(defaultSettings).map(
            ([key, value]) => {
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
            }
          );

          Promise.all(promises).then(resolve).catch(reject);
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
