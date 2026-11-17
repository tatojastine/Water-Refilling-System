export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function request(path, method = 'GET', payload, accountId) {
  let response;
  let body;
  try {
    const headers = {};
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    if (accountId) headers['X-Aqua-Account'] = accountId;
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    body = await response.json();
  } catch {
    throw new ApiError(0, 'CONNECTION_ERROR', 'Connection lost. Check AquaRefresh is running, then try again.');
  }

  if (!response.ok) {
    throw new ApiError(response.status, body?.error?.code, body?.error?.message ?? 'The request could not be completed.');
  }
  return body;
}
