import { useState } from 'react';
import { sourceDistribution, recruitmentStageDistribution, interviewRoundDistribution } from '@/mocks/dashboard';

export default function SidePanels() {
  const [stageTab, setStageTab] = useState<'recruitment' | 'interview'>('recruitment');

  return (
    <div className="space-y-4">
      {/* 简历来源分布 */}
      <div className="bg-white rounded-xl border border-background-200 p-5">
        <h3 className="font-semibold text-foreground-900 text-sm mb-4">简历来源分布</h3>
        <div className="space-y-3">
          {sourceDistribution.map((item) => (
            <div key={item.name} className="flex items-center gap-3">
              <span className="text-xs text-foreground-600 w-16 text-right whitespace-nowrap flex-shrink-0">{item.name}</span>
              <div className="flex-1 h-5 bg-background-100 rounded-md overflow-hidden relative">
                <div
                  className="h-full rounded-md bg-secondary-400 transition-all duration-700"
                  style={{ width: `${(item.value / Math.max(...sourceDistribution.map(s => s.value), 1)) * 100}%` }}
                ></div>
              </div>
              <span className="text-xs font-medium text-foreground-700 w-5 text-right">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 阶段分布 - 双 Tab */}
      <div className="bg-white rounded-xl border border-background-200 overflow-hidden">
        <div className="px-5 pt-4 pb-0">
          <h3 className="font-semibold text-foreground-900 text-sm mb-3">阶段分布</h3>
          {/* Tab switcher */}
          <div className="flex bg-background-100 rounded-full p-1 gap-1">
            <button
              onClick={() => setStageTab('recruitment')}
              className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                stageTab === 'recruitment'
                  ? 'bg-white text-foreground-900 shadow-sm'
                  : 'text-foreground-500 hover:text-foreground-700'
              }`}
            >
              招聘阶段
            </button>
            <button
              onClick={() => setStageTab('interview')}
              className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                stageTab === 'interview'
                  ? 'bg-white text-foreground-900 shadow-sm'
                  : 'text-foreground-500 hover:text-foreground-700'
              }`}
            >
              面试轮次
            </button>
          </div>
        </div>

        <div className="px-5 py-4">
          {stageTab === 'recruitment' && (
            <div className="space-y-2.5">
              {recruitmentStageDistribution.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${item.bar}`}></span>
                    <span className="w-5 h-5 flex items-center justify-center">
                      <i className={`${item.icon} text-[13px] text-foreground-400`}></i>
                    </span>
                    <span className="text-xs text-foreground-600">{item.name}</span>
                  </div>
                  <span className="text-xs font-medium text-foreground-800">{item.value}人</span>
                </div>
              ))}
            </div>
          )}

          {stageTab === 'interview' && (
            <div className="space-y-2.5">
              {interviewRoundDistribution.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${item.bar}`}></span>
                    <span className="text-xs text-foreground-600">{item.name}</span>
                  </div>
                  <span className="text-xs font-medium text-foreground-800">{item.value}人</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}