/**
 * Unit test for deleteAccount API function.
 *
 * Uses Jest (jest-expo preset) — consistent with all other tests in this project.
 * Mocks the underlying request() by intercepting fetch so no actual network call
 * is made and no native modules are required.
 */

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock auth-store so request() can get tokens without SecureStore
jest.mock('../auth-store', () => ({
  getAccessToken: jest.fn(async () => 'test-token'),
  getActiveCampaignId: jest.fn(async () => null),
  refreshTokens: jest.fn(async () => 'ok'),
  clearAuthData: jest.fn(async () => {}),
}));

import { deleteAccount } from '../api';

describe('deleteAccount', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('calls DELETE /auth/me and returns ok result', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await deleteAccount();

    expect(result).toEqual({ ok: true, data: { ok: true } });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/me$/);
    expect(options.method).toBe('DELETE');
  });

  it('returns error result when server responds with non-ok status', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Not found', code: 'NOT_FOUND' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await deleteAccount();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });
});
