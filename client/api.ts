export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      credentials: "include",
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
    if (response.status === 204) {
      return { ok: true, data: undefined as T };
    }
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { error: text };
      }
    }
    if (!response.ok) {
      const error =
        body && typeof body === "object" && body !== null && "error" in body
          ? String((body as { error: unknown }).error)
          : `Request failed (${response.status})`;
      return { ok: false, status: response.status, error };
    }
    return { ok: true, data: body as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return { ok: false, status: 0, error: message };
  }
}
