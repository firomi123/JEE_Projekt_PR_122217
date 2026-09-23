import { describe, expect, it } from 'vitest';
import { useTestApp } from './helpers/context.js';
import { createUser } from './helpers/users.js';

// Guards the test infrastructure itself: migrations are applied and every test
// starts with an empty database.
describe('test database helpers', () => {
  const { prisma } = useTestApp();

  it('applies the migrations, so createUser can insert into the users table', async () => {
    const user = await createUser(prisma, { username: 'jan_kowalski' });

    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await prisma.user.count()).toBe(1);
  });

  it('starts every test with an empty database', async () => {
    expect(await prisma.user.count()).toBe(0);
  });
});
