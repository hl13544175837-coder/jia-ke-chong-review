export type IntegrationMode =
  | 'manual_bridge'
  | 'shadow'
  | 'dual_run'
  | 'authoritative'
  | 'legacy_retired';

export type IntegrationHealth =
  | 'unconfigured'
  | 'healthy'
  | 'degraded'
  | 'unavailable';

export interface IntegrationCapability {
  code: string;
  name: string;
  owner: string;
  mode: IntegrationMode;
  health: IntegrationHealth;
  description: string;
  required_inputs: string[];
}

export interface IntegrationCapabilitiesResponse {
  items: IntegrationCapability[];
}
