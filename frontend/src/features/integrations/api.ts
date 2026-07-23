import { ApiError, authHeaders } from '../../lib/api';
import { API_BASE } from '../../lib/apiBase';
import type {
  IntegrationCapabilitiesResponse,
  IntegrationCapability,
  IntegrationHealth,
  IntegrationMode,
} from './types';

const INTEGRATION_MODES: IntegrationMode[] = [
  'manual_bridge',
  'shadow',
  'dual_run',
  'authoritative',
  'legacy_retired',
];

const INTEGRATION_HEALTH_STATES: IntegrationHealth[] = [
  'unconfigured',
  'healthy',
  'degraded',
  'unavailable',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseCapability(value: unknown): IntegrationCapability | null {
  if (!isRecord(value)) return null;

  const { code, name, owner, mode, health, description, required_inputs: requiredInputs } = value;
  if (
    typeof code !== 'string'
    || typeof name !== 'string'
    || typeof owner !== 'string'
    || typeof mode !== 'string'
    || !INTEGRATION_MODES.includes(mode as IntegrationMode)
    || typeof health !== 'string'
    || !INTEGRATION_HEALTH_STATES.includes(health as IntegrationHealth)
    || typeof description !== 'string'
    || !Array.isArray(requiredInputs)
    || !requiredInputs.every((item) => typeof item === 'string')
  ) {
    return null;
  }

  return {
    code,
    name,
    owner,
    mode: mode as IntegrationMode,
    health: health as IntegrationHealth,
    description,
    required_inputs: requiredInputs,
  };
}

function parseCapabilitiesResponse(payload: unknown): IntegrationCapabilitiesResponse {
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    throw new ApiError(502, '接口状态格式不正确，请联系管理员检查');
  }

  const items = payload.items.map(parseCapability);
  if (items.some((item) => item === null)) {
    throw new ApiError(502, '接口状态内容不完整，请联系管理员检查');
  }

  const capabilities = items as IntegrationCapability[];
  const codes = capabilities.map((item) => item.code);
  if (new Set(codes).size !== codes.length) {
    throw new ApiError(502, '接口状态存在重复项，请联系管理员检查');
  }

  return { items: capabilities };
}

async function listCapabilities(): Promise<IntegrationCapabilitiesResponse> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}/integrations/capabilities`, {
      headers: authHeaders(),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ApiError(0, `接口状态读取失败：${reason}`);
  }

  const payload = await response.json().catch(() => null) as unknown;

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `接口状态读取失败（${response.status}）`;
    throw new ApiError(response.status, message);
  }

  return parseCapabilitiesResponse(payload);
}

export const integrationsApi = {
  listCapabilities,
};
