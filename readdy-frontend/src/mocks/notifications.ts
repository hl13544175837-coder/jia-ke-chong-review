export interface Notification {
  id: number;
  type: 'interview' | 'offer' | 'stage' | 'system' | 'alert';
  title: string;
  content: string;
  time: string;
  isRead: boolean;
}

export const notificationList: Notification[] = [
  {
    id: 1,
    type: 'interview',
    title: '面试安排提醒',
    content: '候选人 王磊 的「Java 高级工程师」终面已确认，时间：7 月 17 日 14:00，地点：A 座 302',
    time: '5 分钟前',
    isRead: false,
  },
  {
    id: 2,
    type: 'offer',
    title: 'Offer 审批通过',
    content: '候选人 刘思雨 的 Offer 已由 HR 总监审批通过，请尽快发送邮件',
    time: '20 分钟前',
    isRead: false,
  },
  {
    id: 3,
    type: 'stage',
    title: '阶段推进提醒',
    content: '候选人 张明辉 已完成初筛，请在 2 个工作日内安排一面',
    time: '1 小时前',
    isRead: false,
  },
  {
    id: 4,
    type: 'alert',
    title: '招聘周期预警',
    content: '「前端工程师」岗位已超 30 天未完成招聘，当前在途 3 人',
    time: '2 小时前',
    isRead: true,
  },
  {
    id: 5,
    type: 'system',
    title: '口径配置已更新',
    content: '管理员更新了面试评分标准，涉及「技术深度」和「沟通能力」两个维度',
    time: '昨天',
    isRead: true,
  },
  {
    id: 6,
    type: 'interview',
    title: '面试反馈待录入',
    content: '候选人 陈佳怡 一面已完成，面试官李明尚未提交评分反馈',
    time: '昨天',
    isRead: true,
  },
  {
    id: 7,
    type: 'offer',
    title: 'Offer 已接受',
    content: '候选人 赵晓东 已接受 Offer（产品经理），预计入职日期 2026-08-01',
    time: '2 天前',
    isRead: true,
  },
  {
    id: 8,
    type: 'system',
    title: '系统维护通知',
    content: '系统将于本周六凌晨 02:00 - 04:00 进行例行维护，部分功能可能短暂不可用',
    time: '3 天前',
    isRead: true,
  },
];

export const typeIconMap: Record<string, string> = {
  interview: 'ri-calendar-check-line',
  offer: 'ri-file-list-3-line',
  stage: 'ri-arrow-right-circle-line',
  system: 'ri-settings-3-line',
  alert: 'ri-error-warning-line',
};

export const typeColorMap: Record<string, string> = {
  interview: 'bg-accent-100 text-accent-600',
  offer: 'bg-primary-100 text-primary-600',
  stage: 'bg-secondary-100 text-secondary-600',
  system: 'bg-background-200 text-foreground-500',
  alert: 'bg-accent-50 text-accent-600',
};