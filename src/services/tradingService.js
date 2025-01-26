const { VersionedTransaction } = require('@solana/web3.js');
const { loadPositions, savePositions } = require('../utils/helpers');

class TradingService {
  constructor(connection, walletKeypair) {
    this.connection = connection;
    this.walletKeypair = walletKeypair;
  }

  async buyToken(mint) {
    try {
      const requestBody = {
        publicKey: this.walletKeypair.publicKey.toString(),
        action: 'buy',
        mint: mint,
        denominatedInSol: 'true',
        amount: Number(process.env.AMOUNT),
        slippage: Number(process.env.SLIPPAGE || 10),
        priorityFee: Number(process.env.PRIORITY_FEE || 0.00001),
        pool: 'pump',
      };

      const response = await fetch('https://pumpportal.fun/api/trade-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 200) {
        const data = await response.arrayBuffer();
        let tx = VersionedTransaction.deserialize(new Uint8Array(data));
        tx.sign([this.walletKeypair]);
        const signature = await this.connection.sendTransaction(tx);

        const confirmation = await this.connection.confirmTransaction(
          signature,
          'confirmed'
        );
        if (confirmation.value.err) {
          return `❌ Transaction failed: ${JSON.stringify(
            confirmation.value.err
          )}`;
        }

        // Save position after successful buy
        const positions = loadPositions();
        positions[mint] = {
          timestamp: Date.now(),
          txHash: signature,
        };
        savePositions(positions);

        return `✅ Buy transaction sent! View at: https://solscan.io/tx/${signature}`;
      }

      const errorText = await response.text();
      return `❌ API Error: ${response.status} - ${errorText}`;
    } catch (error) {
      console.log('Full error:', error);
      return `❌ Error: ${error.message}`;
    }
  }

  async sellToken(mint, percentage) {
    try {
      const requestBody = {
        publicKey: this.walletKeypair.publicKey.toString(),
        action: 'sell',
        mint: mint,
        denominatedInSol: 'false',
        amount: `${percentage}%`,
        slippage: Number(process.env.SLIPPAGE),
        priorityFee: Number(process.env.PRIORITY_FEE),
        pool: 'pump',
      };

      const response = await fetch('https://pumpportal.fun/api/trade-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 200) {
        const data = await response.arrayBuffer();
        let tx = VersionedTransaction.deserialize(new Uint8Array(data));
        tx.sign([this.walletKeypair]);
        const signature = await this.connection.sendTransaction(tx);
        return `✅ Sell transaction sent! View at: https://solscan.io/tx/${signature}`;
      }

      const errorText = await response.text();
      return `❌ API Error: ${response.status} - ${errorText}`;
    } catch (error) {
      console.log('Full error:', error);
      return `❌ Error: ${error.message}`;
    }
  }
}

module.exports = TradingService;
