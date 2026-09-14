import { describe, it, expect, vi } from 'vitest';
import { sendOnce } from './emailOutbox.js';

function makeFakeDb(overrides = {}) {
  return {
    emailMessage: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'row-1', ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'row-1', ...data })),
      ...overrides,
    },
  };
}

describe('sendOnce', () => {
  it('returns the existing row without sending, when one already exists for this templateKey+dedupeKey', async () => {
    const existingRow = { id: 'row-1', status: 'sent' };
    const db = makeFakeDb({ findUnique: vi.fn().mockResolvedValue(existingRow) });
    const send = vi.fn();

    const result = await sendOnce({
      templateKey: 'password_reset',
      dedupeKey: 'abc123',
      to: ['a@example.com'],
      subject: 'Reset your password',
      text: 'body',
      db,
      send,
    });

    expect(result).toBe(existingRow);
    expect(send).not.toHaveBeenCalled();
    expect(db.emailMessage.create).not.toHaveBeenCalled();
  });

  it('records a successful send as status sent with a sentAt date', async () => {
    const db = makeFakeDb();
    const send = vi.fn().mockResolvedValue([{ messageId: 'x' }]);

    await sendOnce({
      templateKey: 'invite',
      dedupeKey: 'invite-1',
      to: ['b@example.com'],
      subject: 'You are invited',
      text: 'body',
      db,
      send,
    });

    expect(send).toHaveBeenCalledWith({ to: ['b@example.com'], subject: 'You are invited', text: 'body' });
    expect(db.emailMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'row-1' },
        data: expect.objectContaining({ status: 'sent', errorMessage: null }),
      }),
    );
    const updateCall = db.emailMessage.update.mock.calls[0][0];
    expect(updateCall.data.sentAt).toBeInstanceOf(Date);
  });

  it('records a failed send as status failed with the error message, without throwing', async () => {
    const db = makeFakeDb();
    const send = vi.fn().mockRejectedValue(new Error('SMTP connection refused'));

    const result = await sendOnce({
      templateKey: 'password_reset',
      dedupeKey: 'def456',
      to: ['c@example.com'],
      subject: 'Reset your password',
      text: 'body',
      db,
      send,
    });

    expect(db.emailMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'row-1' },
        data: expect.objectContaining({ status: 'failed', errorMessage: 'SMTP connection refused', sentAt: null }),
      }),
    );
    expect(result.status).toBe('failed');
  });

  it('falls back to findUnique instead of throwing, when create hits a concurrent duplicate (P2002)', async () => {
    const existingRow = { id: 'row-1', status: 'sent' };
    const findUnique = vi.fn()
      .mockResolvedValueOnce(null) // first check: no row yet
      .mockResolvedValueOnce(existingRow); // after the P2002 catch: the row a concurrent request just created
    const create = vi.fn().mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));
    const db = makeFakeDb({ findUnique, create });
    const send = vi.fn();

    const result = await sendOnce({
      templateKey: 'invite',
      dedupeKey: 'invite-2',
      to: ['d@example.com'],
      subject: 'You are invited',
      text: 'body',
      db,
      send,
    });

    expect(result).toBe(existingRow);
    expect(send).not.toHaveBeenCalled();
  });
});
