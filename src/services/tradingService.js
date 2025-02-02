const { VersionedTransaction, Keypair } = require('@solana/web3.js');
const { loadPositions, savePositions } = require('../utils/helpers');
const bs58 = require('bs58');
const { Connection, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const SettingsService = require('./settingsService');

const API_HOST = 'https://gmgn.ai';
const SOL_TOKEN = 'So11111111111111111111111111111111111111112';

class TradingService {
  constructor(connection) {
    this.connection = connection;
    this.settingsService = new SettingsService();
  }

  async buyToken(mint) {
    try {
      // Get settings from database
      const amount = await this.settingsService.getSetting('amount');
      const slippage = await this.settingsService.getSetting('slippage');
      const priorityFee = await this.settingsService.getSetting('priority_fee');

      // Step 1: Get quote and unsigned transaction
      const amountInLamports = (Number(amount) * 1e9).toString();
      const quoteUrl =
        `${API_HOST}/defi/router/v1/sol/tx/get_swap_route?` +
        `token_in_address=${SOL_TOKEN}&` +
        `token_out_address=${mint}&` +
        `in_amount=${amountInLamports}&` +
        `from_address=${process.env.WALLET_PUBLIC_KEY}&` +
        `slippage=${slippage || 1}&` +
        `fee=${priorityFee || 0.006}`;

      console.log('Getting quote...');
      const routeResponse = await fetch(quoteUrl);
      const route = await routeResponse.json();

      if (!route.data?.quote) {
        return `❌ Invalid route response: ${route.msg || 'No quote data'}`;
      }

      const outAmount = route.data.quote.outAmount;
      if (!outAmount) {
        return '❌ Failed to get output amount from quote';
      }

      // Step 2: Sign transaction
      console.log('Signing transaction...');
      const swapTransactionBuf = Buffer.from(
        route.data.raw_tx.swapTransaction,
        'base64'
      );
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      const signerKeyPair = Keypair.fromSecretKey(
        Buffer.from(bs58.decode(process.env.WALLET_PRIVATE_KEY))
      );
      transaction.sign([signerKeyPair]);
      const signedTx = Buffer.from(transaction.serialize()).toString('base64');

      // Step 3: Submit transaction
      console.log('Submitting transaction...');
      const submitResponse = await fetch(
        `${API_HOST}/defi/router/v1/sol/tx/submit_signed_transaction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signed_tx: signedTx }),
        }
      );

      const submitResult = await submitResponse.json();
      if (submitResponse.status !== 200) {
        return `❌ Submit Error: ${
          submitResult.msg || 'Failed to submit transaction'
        }`;
      }

      // Step 4: Wait for confirmation
      console.log('Waiting for confirmation...');
      const hash = submitResult.data.hash;
      const lastValidBlockHeight = route.data.raw_tx.lastValidBlockHeight;

      while (true) {
        const statusUrl = `${API_HOST}/defi/router/v1/sol/tx/get_transaction_status?hash=${hash}&last_valid_height=${lastValidBlockHeight}`;
        const statusResponse = await fetch(statusUrl);
        const status = await statusResponse.json();

        if (status.data.success === true) {
          const positions = loadPositions();
          const existingAmount = positions[mint]?.tokenAmount || '0';
          const metadata = await this.getTokenMetadata(mint, positions);
          console.log(metadata);
          positions[mint] = {
            timestamp: Date.now(),
            txHash: hash,
            tokenAmount: (
              BigInt(existingAmount) + BigInt(outAmount)
            ).toString(),
            symbol: metadata.symbol,
            name: metadata.name,
          };
          savePositions(positions);
          return `✅ Buy transaction successful! View at: https://solscan.io/tx/${hash}`;
        }

        if (status.data.expired === true) {
          return `❌ Transaction expired. Please try again.`;
        }

        if (status.data.failed === true) {
          return `❌ Transaction failed on chain.`;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.log('Error:', error.message);
      return `❌ Error: ${error.message}`;
    }
  }

  async sellToken(mint, percentage) {
    try {
      // Get settings from database
      const slippage = await this.settingsService.getSetting('slippage');
      const priorityFee = await this.settingsService.getSetting('priority_fee');

      const positions = loadPositions();
      if (!positions[mint]) {
        return '❌ No position found for this token';
      }

      const connection = new Connection(process.env.RPC_ENDPOINT);
      const tokenAccount = await getAssociatedTokenAddress(
        new PublicKey(mint),
        new PublicKey(process.env.WALLET_PUBLIC_KEY)
      );

      const tokenBalance = await connection.getTokenAccountBalance(
        tokenAccount
      );
      const totalAmount = tokenBalance.value.amount;
      const sellAmount = (
        (BigInt(totalAmount) * BigInt(percentage)) /
        BigInt(100)
      ).toString();

      if (BigInt(sellAmount) <= BigInt(0)) {
        return '❌ Invalid sell amount calculated';
      }

      // Step 1: Get quote and unsigned transaction
      console.log('Getting quote...');
      const quoteUrl =
        `${API_HOST}/defi/router/v1/sol/tx/get_swap_route?` +
        `token_in_address=${mint}&` +
        `token_out_address=${SOL_TOKEN}&` +
        `in_amount=${sellAmount}&` +
        `from_address=${process.env.WALLET_PUBLIC_KEY}&` +
        `slippage=${slippage || 1}&` +
        `fee=${priorityFee || 0.006}`;

      const routeResponse = await fetch(quoteUrl);
      const route = await routeResponse.json();

      if (!route.data?.quote) {
        return `❌ Invalid route response: ${route.msg || 'No quote data'}`;
      }

      const outAmount = route.data.quote.outAmount;
      if (!outAmount) {
        return '❌ Failed to get output amount from quote';
      }

      // Step 2: Sign transaction
      console.log('Signing transaction...');
      const swapTransactionBuf = Buffer.from(
        route.data.raw_tx.swapTransaction,
        'base64'
      );
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      const signerKeyPair = Keypair.fromSecretKey(
        Buffer.from(bs58.decode(process.env.WALLET_PRIVATE_KEY))
      );
      transaction.sign([signerKeyPair]);
      const signedTx = Buffer.from(transaction.serialize()).toString('base64');

      // Step 3: Submit transaction
      console.log('Submitting transaction...');
      const submitResponse = await fetch(
        `${API_HOST}/defi/router/v1/sol/tx/submit_signed_transaction`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signed_tx: signedTx }),
        }
      );

      const submitResult = await submitResponse.json();
      if (submitResponse.status !== 200) {
        return `❌ Submit Error: ${
          submitResult.msg || 'Failed to submit transaction'
        }`;
      }

      // Step 4: Wait for confirmation
      console.log('Waiting for confirmation...');
      const hash = submitResult.data.hash;
      const lastValidBlockHeight = route.data.raw_tx.lastValidBlockHeight;

      while (true) {
        const statusUrl = `${API_HOST}/defi/router/v1/sol/tx/get_transaction_status?hash=${hash}&last_valid_height=${lastValidBlockHeight}`;
        const statusResponse = await fetch(statusUrl);
        const status = await statusResponse.json();

        if (status.data.success === true) {
          if (BigInt(percentage) === BigInt(100)) {
            delete positions[mint];
          } else {
            const remainingAmount = (
              BigInt(totalAmount) - BigInt(sellAmount)
            ).toString();
            const metadata = positions[mint].symbol
              ? { symbol: positions[mint].symbol, name: positions[mint].name }
              : await this.getTokenMetadata(mint, positions);
            positions[mint] = {
              ...positions[mint],
              timestamp: Date.now(),
              txHash: hash,
              tokenAmount: remainingAmount,
              symbol: metadata.symbol,
              name: metadata.name,
            };
          }
          savePositions(positions);
          return `✅ Sell transaction successful! View at: https://solscan.io/tx/${hash}`;
        }

        if (status.data.expired === true) {
          return `❌ Transaction expired. Please try again.`;
        }

        if (status.data.failed === true) {
          return `❌ Transaction failed on chain.`;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.log('Error:', error.message);
      return `❌ Error: ${error.message}`;
    }
  }

  async getTokenMetadata(mint, positions) {
    // First check if we already have the metadata in positions
    if (positions[mint]?.symbol && positions[mint]?.name) {
      return {
        symbol: positions[mint].symbol,
        name: positions[mint].name,
      };
    }

    try {
      const response = await fetch(
        `https://solana-gateway.moralis.io/token/mainnet/${mint}/metadata`,
        {
          method: 'GET',
          headers: {
            accept: 'application/json',
            'X-API-Key': process.env.MORALIS_API_KEY,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        return {
          symbol: data.symbol?.trim() || 'Unknown',
          name: data.name?.trim() || 'Unknown Token',
        };
      }

      console.log('Moralis API error:', response.status);
      return {
        symbol: 'Unknown',
        name: 'Unknown Token',
      };
    } catch (error) {
      console.log('Error fetching token metadata:', error);
      return {
        symbol: 'Unknown',
        name: 'Unknown Token',
      };
    }
  }
}

module.exports = TradingService;
