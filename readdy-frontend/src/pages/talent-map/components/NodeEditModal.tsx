import { useState } from 'react';
import type { TalentNode, TalentDepartment } from '@/mocks/talentMap';

interface NodeEditModalProps {
  node: TalentNode | null;
  departmentId: string;
  parentNodeId: string | null;
  departments: TalentDepartment[];
  nodes: TalentNode[];
  onSave: (nodeData: Partial<TalentNode>) => void;
  onClose: () => void;
}

export default function NodeEditModal({
  node,
  departmentId,
  parentNodeId,
  departments,
  nodes,
  onSave,
  onClose,
}: NodeEditModalProps) {
  const isEditing = !!node;
  const parentNode = nodes.find((n) => n.id === parentNodeId);

  const [formData, setFormData] = useState({
    title: node?.title || '',
    level: node?.level || '',
    personName: node?.personName || '',
    status: node?.status || 'estimated',
    responsibilities: node?.responsibilities || '',
    notes: node?.notes || '',
    departmentId: node?.departmentId || departmentId,
    reportsTo: node?.reportsTo || parentNodeId || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    onSave({
      ...formData,
      reportsTo: formData.reportsTo || null,
      personName: formData.personName.trim() || undefined,
      personSource: formData.personName.trim() ? (node?.personSource || 'manual') : undefined,
    });
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-foreground-900/40 z-40" onClick={onClose}></div>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto flex flex-col animate-modal-in">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-background-100">
            <div>
              <h2 className="text-lg font-bold text-foreground-900">
                {isEditing ? '编辑岗位信息' : '新增岗位'}
              </h2>
              <p className="text-xs text-foreground-400 mt-0.5">
                {isEditing ? '修改岗位名称、职级、人员信息等' : '在当前部门下创建新的岗位节点'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[60vh]">
            {/* Title */}
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1.5">
                岗位名称 <span className="text-accent-500">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="如：高级前端工程师"
                className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300"
                required
              />
            </div>

            {/* Level + Status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1.5">职级</label>
                <input
                  type="text"
                  value={formData.level}
                  onChange={(e) => setFormData((prev) => ({ ...prev, level: e.target.value }))}
                  placeholder="如：P7 / M2"
                  className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1.5">确认状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData((prev) => ({
                    ...prev,
                    status: e.target.value as 'confirmed' | 'estimated' | 'gap',
                  }))}
                  className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-700 focus:outline-none focus:border-primary-300 cursor-pointer"
                >
                  <option value="confirmed">已确认</option>
                  <option value="estimated">推测中</option>
                  <option value="gap">待填充</option>
                </select>
              </div>
            </div>

            {/* Person Name */}
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1.5">
                人员姓名
                <span className="text-foreground-400 font-normal ml-1">（选填）</span>
              </label>
              <input
                type="text"
                value={formData.personName}
                onChange={(e) => setFormData((prev) => ({ ...prev, personName: e.target.value }))}
                placeholder="如：张伟"
                className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300"
              />
            </div>

            {/* Department (only show when creating) */}
            {!isEditing && (
              <div>
                <label className="block text-xs font-medium text-foreground-600 mb-1.5">所属部门</label>
                <select
                  value={formData.departmentId}
                  onChange={(e) => setFormData((prev) => ({ ...prev, departmentId: e.target.value }))}
                  className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-700 focus:outline-none focus:border-primary-300 cursor-pointer"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Reports To */}
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1.5">
                汇报对象
                <span className="text-foreground-400 font-normal ml-1">（选填）</span>
              </label>
              {parentNode && !isEditing && (
                <p className="text-xs text-primary-600 mb-2">
                  默认上级：{parentNode.title} {parentNode.personName ? `(${parentNode.personName})` : ''}
                </p>
              )}
              <select
                value={formData.reportsTo}
                onChange={(e) => setFormData((prev) => ({ ...prev, reportsTo: e.target.value }))}
                className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-700 focus:outline-none focus:border-primary-300 cursor-pointer"
              >
                <option value="">无（顶层岗位）</option>
                {nodes
                  .filter((n) => n.departmentId === formData.departmentId && n.id !== node?.id)
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title} {n.personName ? `(${n.personName})` : ''} {n.level ? `[${n.level}]` : ''}
                    </option>
                  ))}
              </select>
            </div>

            {/* Responsibilities */}
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1.5">
                岗位职责
              </label>
              <textarea
                value={formData.responsibilities}
                onChange={(e) => setFormData((prev) => ({ ...prev, responsibilities: e.target.value }))}
                placeholder="描述该岗位的核心职责..."
                rows={3}
                maxLength={300}
                className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300 resize-none"
              ></textarea>
              <p className="text-[10px] text-foreground-400 mt-1 text-right">{formData.responsibilities.length}/300</p>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-foreground-600 mb-1.5">
                备注
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="补充说明，如数据来源、推测依据..."
                rows={2}
                maxLength={200}
                className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300 resize-none"
              ></textarea>
            </div>
          </form>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-background-100">
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-background-100 hover:bg-background-200 rounded-lg text-sm font-medium text-foreground-700 transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
            >
              {isEditing ? '保存修改' : '创建岗位'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-modal-in {
          animation: modalIn 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
