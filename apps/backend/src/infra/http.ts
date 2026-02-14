export function errorPayload(requestId: string, code: string, message: string) {
  return {
    ok: false,
    request_id: requestId,
    code,
    message,
  };
}
