/**
 * Write queue with exponential backoff and retry
 * Ensures Google Sheets API write rate limits (100 requests per 100 seconds per user)
 * and transient network errors are gracefully handled.
 */

export interface QueueTask<T> {
  fn: () => Promise<T>;
  retries?: number;
  delayMs?: number;
}

class WriteQueue {
  private queue: Array<() => Promise<any>> = [];
  private isProcessing = false;

  async enqueue<T>(fn: () => Promise<T>, maxRetries = 3, initialDelayMs = 250): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const execute = async () => {
        let attempt = 0;
        let delay = initialDelayMs;

        while (true) {
          try {
            const result = await fn();
            resolve(result);
            return;
          } catch (err: any) {
            attempt++;
            const isRateLimit = err?.code === 429 || err?.message?.includes('RATE_LIMIT') || err?.status === 429;
            const isTransient = isRateLimit || err?.code === 500 || err?.code === 503;

            if (attempt <= maxRetries && isTransient) {
              console.warn(`[WriteQueue] Transient error on attempt ${attempt}/${maxRetries}. Retrying in ${delay}ms...`, err?.message || err);
              await new Promise(r => setTimeout(r, delay));
              delay *= 2; // exponential backoff
            } else {
              reject(err);
              return;
            }
          }
        }
      };

      this.queue.push(execute);
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } catch (e) {
          // Handled inside task promise
        }
      }
    }

    this.isProcessing = false;
  }
}

export const writeQueue = new WriteQueue();
