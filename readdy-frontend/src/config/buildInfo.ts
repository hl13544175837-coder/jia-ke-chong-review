const publicValue = (value: string | undefined, fallback: string) => {
  const normalized = (value ?? '').trim();
  return normalized || fallback;
};

export const buildInfo = {
  version: publicValue(import.meta.env.VITE_BUILD_VERSION, 'local'),
  channel: publicValue(import.meta.env.VITE_BUILD_CHANNEL, 'local'),
  buildTime: publicValue(import.meta.env.VITE_BUILD_TIME, 'unknown'),
};

export const formatBuildLabel = () => {
  const channel = buildInfo.channel === 'RC' ? 'Test RC' : buildInfo.channel;
  return `${channel} · ${buildInfo.version}`;
};
