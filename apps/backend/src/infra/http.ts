export function errorPayload(requestId: string, code: string, message?: string) {
  // Support both 2-arg (code, message) and 3-arg (requestId, code, message) calls.
  // When called with 2 args, requestId holds the code and code holds the message.
  if (message === undefined) {
    return {
      ok: false,
      code: requestId,
      message: code,
    };
  }
  return {
    ok: false,
    request_id: requestId,
    code,
    message,
  };
}
