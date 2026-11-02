/**
 * JANO HEALTH — TEST HARNESS WEB LOCKS MOCK
 *
 * Dedicated in-memory lock manager strictly for Node.js test environments.
 * Used exclusively by test harnesses to simulate browser Web Locks behavior.
 * NEVER exposed or installed in production code.
 */

export class TestWebLocksMock {
  private lockQueues = new Map<string, Promise<void>>();

  public async request<T>(name: string, optionsOrCallback: any, maybeCallback?: any): Promise<T> {
    const callback: () => Promise<T> = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
    if (typeof callback !== 'function') {
      throw new Error('[TestWebLocks] Callback function is required');
    }
    const previous = this.lockQueues.get(name) || Promise.resolve();
    let releaseLock: () => void = () => {};
    const lockReleasedPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.lockQueues.set(name, lockReleasedPromise);

    await previous;
    try {
      return await callback();
    } finally {
      releaseLock();
      if (this.lockQueues.get(name) === lockReleasedPromise) {
        this.lockQueues.delete(name);
      }
    }
  }
}

export function installTestWebLocksMock(): void {
  if (typeof navigator !== 'undefined') {
    (navigator as any).locks = new TestWebLocksMock();
  } else {
    (globalThis as any).navigator = { locks: new TestWebLocksMock() };
  }
}

export function removeTestWebLocksMock(): void {
  if (typeof navigator !== 'undefined') {
    (navigator as any).locks = undefined;
  }
}
