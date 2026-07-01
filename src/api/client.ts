export type BackendErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
  };
};

export class ApiError extends Error {
  status: number;
  code: string;
  requestId?: string;

  constructor(message: string, status: number, code = "API_ERROR", requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

type ParsedBody = {
  json: unknown | null;
  text: string | null;
};

async function parseBody(response: Response): Promise<ParsedBody> {
  if (response.status === 204 || response.status === 205 || response.status === 304) {
    return { json: null, text: null };
  }
  if (response.headers.get("content-length") === "0") {
    return { json: null, text: null };
  }

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!text) return { json: null, text: null };

  if (!contentType.includes("application/json")) {
    return { json: null, text };
  }

  try {
    return { json: JSON.parse(text) as unknown, text };
  } catch {
    return { json: null, text };
  }
}

function defaultMessageForStatus(status: number) {
  if (status === 400) return "Invalid request";
  if (status === 401) return "Authentication required";
  if (status === 403) return "Access denied";
  if (status === 404) return "Resource not found";
  if (status === 409) return "Conflict";
  if (status === 413) return "Payload too large";
  if (status === 415) return "Unsupported media type";
  if (status === 416) return "Invalid range request";
  if (status === 429) return "Too many requests";
  if (status === 500) return "Internal server error";
  if (status === 503) return "Service unavailable";
  return "Request failed";
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" | "HEAD";
  body?: unknown;
  signal?: AbortSignal;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "include",
      signal,
      headers: isFormData
        ? undefined
        : body !== undefined
          ? { "Content-Type": "application/json" }
          : undefined,
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("Network request failed", 0, "NETWORK_ERROR");
  }

  const parsed = await parseBody(response);

  if (!response.ok) {
    const payload = (parsed.json as BackendErrorPayload | null) ?? null;
    const message = payload?.error?.message || parsed.text || defaultMessageForStatus(response.status);
    const code = payload?.error?.code || `HTTP_${response.status}`;
    const requestId = payload?.error?.requestId;
    throw new ApiError(message, response.status, code, requestId);
  }

  return (parsed.json as T) ?? (undefined as T);
}
