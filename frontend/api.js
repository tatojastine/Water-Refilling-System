export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function request(path, method = 'GET', payload, accountId, signal = AbortSignal.timeout(90_000)) {
  let response;
  let body;
  try {
    const headers = {};
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    if (accountId) headers['X-Aqua-Account'] = accountId;
    response = await fetch(`/api${path}`, {
      method,
      headers,
      signal,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw error;
    throw new ApiError(0, 'CONNECTION_ERROR', 'We couldn’t reach the station server. Try again.');
  }

  try {
    body = await response.json();
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw error;
    if (response.ok) throw new ApiError(0, 'INVALID_RESPONSE', 'The station server returned an unreadable response.');
  }

  if (!response.ok) {
    throw new ApiError(response.status, body?.error?.code, body?.error?.message ?? 'The request could not be completed.');
  }
  return body;
}
