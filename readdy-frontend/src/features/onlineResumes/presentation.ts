import type { OnlineResumeItem } from './types';

export interface OnlineResumeDemandPresentation {
  available: boolean;
  requestNo: string;
  title: string;
}

export function presentOnlineResumeDemand(
  demand: OnlineResumeItem['demand'],
): OnlineResumeDemandPresentation {
  if (!demand) {
    return {
      available: false,
      requestNo: '',
      title: '关联需求已不可用',
    };
  }

  return {
    available: true,
    requestNo: demand.request_no,
    title: demand.title,
  };
}
