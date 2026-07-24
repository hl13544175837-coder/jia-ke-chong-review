import { companyAuthHeaders } from '@/auth/companyAuth';

const API_BASE = ((import.meta.env.VITE_API_BASE_URL ?? '/api') as string)
  .trim()
  .replace(/\/+$/, '') || '/api';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  idempotencyKey?: string;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;

  constructor(status: number, message: string, code?: string, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function requestHeaders(options: Pick<RequestOptions, 'headers' | 'idempotencyKey'> = {}) {
  const headers = { ...companyAuthHeaders(), ...(options.headers ?? {}) };
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  return headers;
}

function notifyUnauthorized(status: number) {
  if (status === 401) window.dispatchEvent(new Event('hireinsight:unauthorized'));
}

async function responseData(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toApiError(response: Response, data: unknown) {
  notifyUnauthorized(response.status);
  const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const message = typeof payload.error === 'string'
    ? payload.error
    : typeof payload.message === 'string'
      ? payload.message
      : `请求失败（HTTP ${response.status}）`;
  const fields = payload.fields && typeof payload.fields === 'object'
    ? payload.fields as Record<string, string>
    : undefined;
  return new ApiError(
    response.status,
    message,
    typeof payload.code === 'string' ? payload.code : undefined,
    fields,
  );
}

async function fetchApi(path: string, init: Parameters<typeof fetch>[1]): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, init);
  } catch (error) {
    throw new ApiError(0, `无法连接本地业务服务：${(error as Error).message}`);
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = requestHeaders(options);

  let body: string | undefined;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetchApi(path, { method: options.method ?? 'GET', headers, body });
  const data = await responseData(response);
  if (!response.ok) throw toApiError(response, data);

  return data as T;
}

export async function apiMultipart<T>(
  path: string,
  form: FormData,
  options: Pick<RequestOptions, 'headers' | 'idempotencyKey'> = {},
): Promise<T> {
  const response = await fetchApi(path, {
    method: 'POST',
    headers: requestHeaders(options),
    body: form,
  });
  const data = await responseData(response);
  if (!response.ok) throw toApiError(response, data);
  return data as T;
}

export async function apiBlob(path: string): Promise<Blob> {
  const response = await fetchApi(path, { headers: requestHeaders() });
  if (!response.ok) throw toApiError(response, await responseData(response));
  return response.blob();
}
