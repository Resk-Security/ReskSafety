const API_BASE = "";

let csrfToken: string | null = null;

export function setCsrf(token: string | null) {
  csrfToken = token;
}

async function getCsrf(): Promise<string | null> {
  return csrfToken;
}

export function clearCsrf() {
  csrfToken = null;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (!options.credentials) options.credentials = "include";

  // CSRF for mutating requests
  if (options.method && options.method !== "GET") {
    const csrf = await getCsrf();
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }

  const res = await fetch(API_BASE + path, { ...options, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", body: formData, headers: {} }),
  raw: request,
};
