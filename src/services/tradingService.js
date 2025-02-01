const { VersionedTransaction, Keypair } = require('@solana/web3.js');
const { loadPositions, savePositions } = require('../utils/helpers');
const bs58 = require('bs58');

const API_HOST = 'https://gmgn.ai';
const SOL_TOKEN = 'So11111111111111111111111111111111111111112';

class TradingService {
  constructor(connection) {
    this.connection = connection;
  }

  async buyToken(mint) {
    try {
      // Step 1: Get quote and unsigned transaction
      const amount = (Number(process.env.AMOUNT) * 1e9).toString(); // Convert SOL to lamports
      const quoteUrl =
        `${API_HOST}/defi/router/v1/sol/tx/get_swap_route?` +
        `token_in_address=${SOL_TOKEN}&` +
        `token_out_address=${mint}&` +
        `in_amount=${amount}&` +
        `from_address=${process.env.WALLET_PUBLIC_KEY}&` +
        `slippage=${process.env.SLIPPAGE || 1}&` +
        `fee=${process.env.PRIORITY_FEE || 0.006}`;

      console.log('Getting quote...');
      const routeResponse = await fetch(quoteUrl);
      const route = await routeResponse.json();

      if (routeResponse.status !== 200) {
        console.log('Route Error Response:', route);
        return `❌ Route Error: ${route.msg || 'Failed to get route'}`;
      }

      // Store the expected output amount
      const outAmount = route.data.quote.outAmount;
      console.log('Expected output amount:', outAmount);

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
        console.log('Submit Error Response:', submitResult);
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
          // Save position after successful buy with token quantity
          const positions = loadPositions();
          positions[mint] = {
            timestamp: Date.now(),
            txHash: hash,
            tokenAmount: outAmount, // Store the token quantity
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
      console.log('Full error:', error);
      return `❌ Error: ${error.message}`;
    }
  }

  async sellToken(mint, percentage) {
    try {
      // Get the stored position to calculate the sell amount
      const positions = loadPositions();
      const position = positions[mint];

      if (!position || !position.tokenAmount) {
        return `❌ Error: No position found for this token or token amount not stored`;
      }

      // Calculate the amount to sell based on percentage
      const sellAmount = Math.floor(
        (Number(position.tokenAmount) * percentage) / 100
      ).toString();

      const quoteUrl =
        `${API_HOST}/defi/router/v1/sol/tx/get_swap_route?` +
        `token_in_address=${mint}&` +
        `token_out_address=${SOL_TOKEN}&` +
        `from_address=${process.env.WALLET_PUBLIC_KEY}&` +
        `slippage=${process.env.SLIPPAGE || 1}&` +
        `in_amount=${sellAmount}&` + // Use calculated amount instead of percentage
        `fee=${process.env.PRIORITY_FEE || 0.006}`;

      console.log('Getting sell quote...');
      console.log('Quote URL:', quoteUrl);

      const routeResponse = await fetch(quoteUrl);
      const route = await routeResponse.json();

      if (routeResponse.status !== 200) {
        console.log('Route Error Response:', route);
        return `❌ Route Error: ${route.msg || 'Failed to get route'}`;
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
      console.log('Submitting sell transaction...');
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
        console.log('Submit Error Response:', submitResult);
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
          // Remove position if selling 100%
          if (percentage === 100) {
            const positions = loadPositions();
            delete positions[mint];
            savePositions(positions);
          }

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
      console.log('Full error:', error);
      return `❌ Error: ${error.message}`;
    }
  }
}

module.exports = TradingService;
