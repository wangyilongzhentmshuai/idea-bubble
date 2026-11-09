import { config } from '../config.js';

export class ArkError extends Error {
  constructor(code, message, { retryable = false, status } = {}) {
    super(message);
    this.name = 'ArkError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

async function callChat({ body, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let resp;
  try {
    resp = await fetch(config.ark.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.ark.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new ArkError('ARK_TIMEOUT', '大模型请求超时', { retryable: true });
    }
    throw new ArkError('NETWORK_ERROR', '网络异常，无法连接大模型', {
      retryable: true,
    });
  }
  clearTimeout(timer);

  if (!resp.ok) {
    if (resp.status === 401 || resp.status === 403) {
      throw new ArkError('ARK_AUTH_FAILED', '大模型鉴权失败，请检查 API Key', {
        status: resp.status,
      });
    }
    if (resp.status === 429) {
      throw new ArkError('ARK_RATE_LIMITED', '大模型限流，请稍后再试', {
        retryable: true,
        status: resp.status,
      });
    }
    if (resp.status >= 500) {
      throw new ArkError('ARK_SERVER_ERROR', '大模型服务异常，请稍后再试', {
        retryable: true,
        status: resp.status,
      });
    }
    let msg = '大模型请求失败';
    try {
      const j = await resp.json();
      if (j.error?.message) msg = j.error.message;
    } catch {}
    throw new ArkError('ARK_BAD_REQUEST', msg, { status: resp.status });
  }

  const json = await resp.json();
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new ArkError('ARK_EMPTY_RESPONSE', '大模型返回内容为空', {
      retryable: true,
    });
  }
  return content;
}

/* 普通对话：返回文本内容，供音频理解等场景，不做 JSON 校验与重试 */
export async function rawChat({ messages, model, timeoutMs }) {
  if (!config.ark.apiKey) {
    throw new ArkError('ARK_NOT_CONFIGURED', '未配置 ARK_API_KEY，请先在 .env 填入');
  }
  return callChat({
    body: {
      model: model || config.ark.modelId,
      messages,
      temperature: 0.2,
    },
    timeoutMs: timeoutMs || config.ark.timeoutMs,
  });
}

/* 结构化对话：强制 json_object，zod 校验，解析/校验失败自动重试 */
export async function jsonObjectChat({
  messages,
  schema,
  model,
  timeoutMs,
  maxRetries,
}) {
  if (!config.ark.apiKey) {
    throw new ArkError('ARK_NOT_CONFIGURED', '未配置 ARK_API_KEY，请先在 .env 填入');
  }
  const body = {
    model: model || config.ark.modelId,
    messages,
    response_format: { type: 'json_object' },
    temperature: 0.4,
  };
  const retries = maxRetries ?? config.ark.maxRetries;
  const useTimeout = timeoutMs || config.ark.timeoutMs;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const raw = await callChat({ body, timeoutMs: useTimeout });
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      lastError = new ArkError('LLM_JSON_PARSE_FAILED', '大模型输出不是合法 JSON', {
        retryable: true,
      });
      continue;
    }
    const result = schema.safeParse(parsed);
    if (result.success) return result.data;
    lastError = new ArkError('LLM_SCHEMA_INVALID', '大模型输出不符合结构要求', {
      retryable: true,
    });
  }
  throw lastError;
}
