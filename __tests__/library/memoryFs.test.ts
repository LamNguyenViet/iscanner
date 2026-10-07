import { createMemoryFs } from '../../src/library/memoryFs';

describe('memoryFs append/list', () => {
  it('append creates the file then appends', async () => {
    const fs = createMemoryFs();
    await fs.append('logs/a.log', 'x\n');
    await fs.append('logs/a.log', 'y\n');
    expect(await fs.readText('logs/a.log')).toBe('x\ny\n');
  });

  it('list returns direct child names, [] for a missing dir', async () => {
    const fs = createMemoryFs();
    await fs.append('logs/a.log', '1');
    await fs.writeText('logs/b.log', '2');
    await fs.writeText('other/c.txt', '3');
    expect((await fs.list('logs')).sort()).toEqual(['a.log', 'b.log']);
    expect(await fs.list('nope')).toEqual([]);
  });

  it('failNextAppend fails once', async () => {
    const fs = createMemoryFs();
    fs.failNextAppend('logs/a.log');
    await expect(fs.append('logs/a.log', 'x')).rejects.toThrow();
    await fs.append('logs/a.log', 'x');
    expect(await fs.readText('logs/a.log')).toBe('x');
  });
});
