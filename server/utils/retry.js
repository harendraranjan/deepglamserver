// utils/retry.js
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, { retries = 3, baseMs = 200 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (err) {
      const msg = String(err?.message || "");
      // Retry only for transient/catalog/transaction errors
      const retryable =
        msg.includes("catalog changes") ||
        msg.includes("Please retry your operation") ||
        msg.includes("WriteConflict") ||
        msg.includes("Transaction") ||
        err?.code === 112 ||          // WriteConflict
        err?.code === 251 ||          // NoSuchTransaction (driver retries)
        err?.code === 244 ||          // TransientTransactionError
        err?.hasErrorLabel?.("TransientTransactionError");
      if (!retryable || i === retries - 1) { lastErr = err; break; }
      await sleep(baseMs * Math.pow(2, i));  // exp backoff
    }
  }
  throw lastErr;
}
module.exports = { withRetry };
