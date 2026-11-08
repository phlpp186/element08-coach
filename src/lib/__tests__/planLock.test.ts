import { describe, expect, it } from 'vitest';
import { createPlanLock } from '../planLock';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('createPlanLock', () => {
  it('runs one plan’s writes one after another', async () => {
    const lock = createPlanLock();
    const log: string[] = [];
    await Promise.all([
      lock.run('p', async () => {
        log.push('a start');
        await wait(5);
        log.push('a end');
      }),
      lock.run('p', async () => {
        log.push('b start');
        log.push('b end');
      }),
    ]);
    expect(log).toEqual(['a start', 'a end', 'b start', 'b end']);
  });

  it('lets different plans run at once', async () => {
    const lock = createPlanLock();
    const log: string[] = [];
    await Promise.all([
      lock.run('p', async () => {
        log.push('p start');
        await wait(5);
        log.push('p end');
      }),
      lock.run('q', async () => {
        log.push('q');
      }),
    ]);
    expect(log).toEqual(['p start', 'q', 'p end']);
  });

  it('a failed write does not block the next one', async () => {
    const lock = createPlanLock();
    const failed = lock.run('p', async () => {
      throw new Error('offline');
    });
    await expect(failed).rejects.toThrow('offline');
    await expect(lock.run('p', async () => 'ok')).resolves.toBe('ok');
  });

  it('only the newest save clears the unsent mark', () => {
    const lock = createPlanLock();
    expect(lock.current('p')).toBe(0);
    const first = lock.want('p');
    const second = lock.want('p');
    expect(lock.latest('p', first)).toBe(false);
    expect(lock.latest('p', second)).toBe(true);
    expect(lock.current('p')).toBe(second);
  });
});
