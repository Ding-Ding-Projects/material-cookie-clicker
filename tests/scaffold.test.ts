import { describe, expect, it } from 'vitest';

// A placeholder so `npm test` has something real to run before the game
// logic lane adds its own suites under tests/.
describe('scaffold', () => {
  it('keeps the product name stable', () => {
    expect('Material Cookie Clicker').toBe('Material Cookie Clicker');
  });
});
