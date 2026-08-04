import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NodeEditModal from '@/pages/talent-map/components/NodeEditModal';
import PageHeader from '@/components/ui/PageHeader';
import { useTalentMapWorkspace } from '@/features/talentMaps/useTalentMapWorkspace';
import type { TalentNode } from '@/features/talentMaps/types';

export default function TalentMapPage() {
  const navigate = useNavigate();
  const workspace = useTalentMapWorkspace();
  const {
    maps,
    loading,
    saving,
    error,
    industries,
    activeIndustry,
    companies,
    departments,
    nodes,
    industryCompanies,
    activeCompanyId,
    setActiveCompanyId,
    safeCompanyId,
    activeCompany,
    companyDepartments,
    refresh,
    handleIndustryChange,
    addCompany,
    saveNode,
    removeNode,
    getCompanyStats,
  } = workspace;

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<TalentNode | null>(null);
  const [parentNodeId, setParentNodeId] = useState<string | null>(null);
  const [targetDeptId, setTargetDeptId] = useState<string>('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [addCompanyOpen, setAddCompanyOpen] = useState(false);
  const [newCompanyForm, setNewCompanyForm] = useState({
    name: '',
    shortName: '',
    industry: '',
    description: '',
  });
  const [companyError, setCompanyError] = useState<string | null>(null);

  const handleAddCompany = async () => {
    if (!newCompanyForm.name.trim() || !newCompanyForm.shortName.trim()) return;
    setCompanyError(null);
    try {
      await addCompany(newCompanyForm);
      setAddCompanyOpen(false);
      setNewCompanyForm({ name: '', shortName: '', industry: '', description: '' });
    } catch (saveError) {
      setCompanyError(saveError instanceof Error ? saveError.message : '公司保存失败');
    }
  };

  const nodesByDept = useMemo(() => {
    const map: Record<string, TalentNode[]> = {};
    companyDepartments.forEach((dept) => {
      map[dept.id] = nodes
        .filter((n) => n.departmentId === dept.id)
        .sort((a, b) => {
          if (!a.reportsTo && !b.reportsTo) return 0;
          if (!a.reportsTo) return -1;
          if (!b.reportsTo) return 1;
          return 0;
        });
    });
    return map;
  }, [nodes, companyDepartments]);

  const getChildren = useCallback(
    (parentId: string): TalentNode[] => {
      return nodes.filter((n) => n.reportsTo === parentId);
    },
    [nodes]
  );

  const openAddNode = (deptId: string, parentId: string | null = null) => {
    setTargetDeptId(deptId);
    setParentNodeId(parentId);
    setEditingNode(null);
    setEditModalOpen(true);
  };

  const openEditNode = (node: TalentNode) => {
    setEditingNode(node);
    setTargetDeptId(node.departmentId);
    setParentNodeId(node.reportsTo);
    setEditModalOpen(true);
  };

  const handleSaveNode = async (nodeData: Partial<TalentNode>) => {
    await saveNode({
      editingNode,
      companyId: safeCompanyId,
      departmentId: targetDeptId,
      parentNodeId,
      nodeData,
    });
    setEditModalOpen(false);
    setEditingNode(null);
  };

  const handleDeleteNode = async (nodeId: string) => {
    await removeNode(nodeId);
    setDeleteConfirm(null);
  };

  const statusStyle: Record<string, string> = {
    confirmed: 'border-primary-300 bg-white shadow-sm',
    estimated: 'border-secondary-300 border-dashed bg-secondary-50/50',
    gap: 'border-background-300 border-dotted bg-background-50',
  };

  const statusBadgeStyle: Record<string, string> = {
    confirmed: 'bg-primary-100 text-primary-700',
    estimated: 'bg-secondary-100 text-secondary-700',
    gap: 'bg-background-200 text-foreground-500',
  };

  const statusLabel: Record<string, string> = {
    confirmed: '已确认',
    estimated: '推测中',
    gap: '待填充',
  };

  const sourceLabel: Record<string, string> = {
    resume: '简历库来源',
    manual: '人工录入',
  };

  const sourceIcon: Record<string, string> = {
    resume: 'ri-file-search-line',
    manual: 'ri-edit-box-line',
  };

  const renderNode = (node: TalentNode) => {
    const children = getChildren(node.id);
    const isRoot = !node.reportsTo;

    return (
      <div key={node.id} className={`flex ${isRoot ? 'flex-col' : ''} items-start gap-3`}>
        {!isRoot && (
          <div className="flex-shrink-0 mt-5">
            <div className="w-8 h-0.5 bg-background-300"></div>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {/* Node Card */}
          <div
            className={`relative w-56 rounded-xl border-2 p-4 transition-all group cursor-pointer hover:shadow-md ${statusStyle[node.status]}`}
            onClick={() => openEditNode(node)}
          >
            {/* Action buttons */}
            <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); openAddNode(node.departmentId, node.id); }}
                className="w-6 h-6 rounded-md bg-background-100 hover:bg-primary-100 flex items-center justify-center cursor-pointer"
                title="添加下级"
              >
                <i className="ri-add-line text-xs text-foreground-500 hover:text-primary-600"></i>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(node.id); }}
                className="w-6 h-6 rounded-md bg-background-100 hover:bg-accent-100 flex items-center justify-center cursor-pointer"
                title="删除"
              >
                <i className="ri-delete-bin-line text-xs text-foreground-400 hover:text-accent-600"></i>
              </button>
            </div>

            {/* Status badge */}
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusBadgeStyle[node.status]}`}>
                {statusLabel[node.status]}
              </span>
              {node.personSource && (
                <span className="text-[10px] text-foreground-400 flex items-center gap-0.5">
                  <i className={`${sourceIcon[node.personSource]} text-[10px]`}></i>
                  {sourceLabel[node.personSource]}
                </span>
              )}
            </div>

            {/* Title + Level */}
            <p className="text-sm font-semibold text-foreground-900 leading-tight mb-1">
              {node.title}
            </p>
            {node.level && (
              <span className="inline-block text-[11px] px-1.5 py-0.5 bg-background-200/70 rounded text-foreground-500 mb-2">
                {node.level}
              </span>
            )}

            {/* Person */}
            {node.personName ? (
              <div className="flex items-center gap-2 mt-1">
                <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-primary-600">{node.personName.charAt(0)}</span>
                </div>
                <span className="text-xs font-medium text-foreground-800">{node.personName}</span>
              </div>
            ) : (
              <p className="text-xs text-foreground-400 italic mt-1">岗位空缺</p>
            )}

            {/* Responsibilities */}
            {node.responsibilities && (
              <p className="text-[11px] text-foreground-500 mt-2 leading-relaxed line-clamp-2">
                {node.responsibilities}
              </p>
            )}

            {/* Notes */}
            {node.notes && (
              <div className="mt-2 pt-2 border-t border-background-100">
                <p className="text-[10px] text-foreground-400 leading-relaxed line-clamp-2 italic">
                  <i className="ri-information-line align-text-bottom mr-0.5"></i>
                  {node.notes}
                </p>
              </div>
            )}
          </div>

          {/* Children */}
          {children.length > 0 && (
            <div className="ml-4 pl-3 border-l-2 border-background-200 space-y-3">
              {children.map((child) => renderNode(child))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background-50">
      {/* Header */}
      <div className="px-6 pt-6 pb-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 mb-6">
          <button
            onClick={() => navigate('/candidates')}
            className="px-4 py-1.5 text-sm text-foreground-600 hover:text-foreground-900 transition-colors whitespace-nowrap"
          >
            简历库
          </button>
          <i className="ri-arrow-right-s-line text-foreground-400"></i>
          <span className="px-4 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 rounded-md whitespace-nowrap">
            人才地图
          </span>
        </div>

        <PageHeader
          className="mb-6"
          title="人才地图"
          visuallyHiddenTitle
          description="按行业和公司沉淀人才分布与组织信息"
          actions={(
            <button
              onClick={() => {
                setCompanyError(null);
                setNewCompanyForm((prev) => ({ ...prev, industry: activeIndustry }));
                setAddCompanyOpen(true);
              }}
              disabled={saving}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5"
            >
              <i className="ri-building-2-line"></i>
              新增公司
            </button>
          )}
        />

        {error && (
          <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button type="button" onClick={() => void refresh()} className="font-medium underline">重试</button>
          </div>
        )}
        {loading && (
          <div className="mb-4 rounded-xl border border-background-200 bg-white px-4 py-6 text-center text-sm text-foreground-500">
            正在加载人才地图…
          </div>
        )}
        {!loading && !error && industries.length === 0 && (
          <div className="mb-4 rounded-xl border border-dashed border-background-300 bg-white px-6 py-8 text-center">
            <p className="text-sm font-medium text-foreground-800">还没有人才地图</p>
            <p className="mt-1 text-xs text-foreground-500">点右上角“新增公司”，会同时创建第一张地图。</p>
          </div>
        )}

        {/* Industry Tabs */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
          {industries.map((industry) => {
            const isActive = activeIndustry === industry;
            const summary = maps.find((item) => item.name === industry);
            const industryCompanyList = isActive ? companies : [];
            const totalNodes = isActive
              ? industryCompanyList.reduce((sum, company) => sum + getCompanyStats(company.id).total, 0)
              : summary?.people_count ?? 0;
            const confirmedNodes = isActive
              ? industryCompanyList.reduce((sum, company) => sum + getCompanyStats(company.id).confirmed, 0)
              : null;
            const companyCount = isActive ? industryCompanyList.length : summary?.companies_count ?? 0;
            return (
              <button
                key={industry}
                onClick={() => void handleIndustryChange(industry)}
                className={`flex-shrink-0 px-5 py-3 rounded-xl border transition-all cursor-pointer text-left ${
                  isActive
                    ? 'border-primary-300 bg-white shadow-sm ring-1 ring-primary-200'
                    : 'border-background-200 bg-white hover:border-background-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground-900">{industry}</span>
                  <span className="text-[11px] text-foreground-400 bg-background-100 px-1.5 py-0.5 rounded">
                    {companyCount} 家
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-foreground-500">
                    {confirmedNodes === null ? `${totalNodes} 人选` : `${confirmedNodes}/${totalNodes} 确认`}
                  </span>
                  <div className="flex-1 h-1 bg-background-200 rounded-full overflow-hidden w-16">
                    <div
                      className="h-full bg-primary-400 rounded-full"
                      style={{ width: `${confirmedNodes !== null && totalNodes > 0 ? (confirmedNodes / totalNodes) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Company Tabs */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
          {industryCompanies.map((company) => {
            const stats = getCompanyStats(company.id);
            const isActive = safeCompanyId === company.id;
            return (
              <button
                key={company.id}
                onClick={() => setActiveCompanyId(company.id)}
                className={`flex-shrink-0 px-5 py-3 rounded-xl border transition-all cursor-pointer text-left ${
                  isActive
                    ? 'border-primary-300 bg-white shadow-sm ring-1 ring-primary-200'
                    : 'border-background-200 bg-white hover:border-background-300'
                }`}
              >
                <p className="text-sm font-semibold text-foreground-900">{company.shortName}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-foreground-500">
                    {stats.confirmed}/{stats.total} 确认
                  </span>
                  <div className="flex-1 h-1 bg-background-200 rounded-full overflow-hidden w-16">
                    <div
                      className="h-full bg-primary-400 rounded-full"
                      style={{ width: `${stats.total > 0 ? (stats.confirmed / stats.total) * 100 : 0}%` }}
                    ></div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Company Description */}
        {activeCompany && (
          <div className="bg-white rounded-xl border border-background-200 p-4 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                <i className="ri-building-4-line text-xl text-primary-500"></i>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-foreground-900">{activeCompany.name}</h3>
                <p className="text-sm text-foreground-600 mt-1 leading-relaxed">{activeCompany.description}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-foreground-400">
                  <span>
                    <i className="ri-file-search-line mr-1"></i>
                    来自简历库自动映射 {getCompanyStats(activeCompany.id).confirmed} 人
                  </span>
                  <span>
                    <i className="ri-team-line mr-1"></i>
                    当前映射 {getCompanyStats(activeCompany.id).total} 个岗位节点
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 mb-6 text-xs">
          <span className="text-foreground-500">图例：</span>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded border-2 border-primary-300 bg-white"></div>
            <span className="text-foreground-600">已确认（来自简历库）</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded border-2 border-dashed border-secondary-300 bg-secondary-50/50"></div>
            <span className="text-foreground-600">推测中（待验证）</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded border-2 border-dotted border-background-300 bg-background-50"></div>
            <span className="text-foreground-600">待填充（部门缺口）</span>
          </div>
        </div>
      </div>

      {/* Department Panels */}
      <div className="px-6 pb-10">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {companyDepartments.map((dept) => {
            const deptNodes = nodesByDept[dept.id] || [];
            const deptConfirmed = deptNodes.filter((n) => n.status === 'confirmed').length;
            const rootNodes = deptNodes.filter((n) => !n.reportsTo);

            return (
              <div key={dept.id} className="bg-white rounded-xl border border-background-200 p-6">
                {/* Department Header */}
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="text-base font-bold text-foreground-900">{dept.name}</h3>
                    <p className="text-xs text-foreground-500 mt-0.5">
                      {deptConfirmed}/{dept.headcountEstimated} 人已确认
                      {dept.description && (
                        <span className="ml-2 text-foreground-400">{dept.description}</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => openAddNode(dept.id, null)}
                    className="w-8 h-8 rounded-lg bg-background-100 hover:bg-primary-100 flex items-center justify-center cursor-pointer transition-colors"
                    title="添加顶层岗位"
                  >
                    <i className="ri-add-line text-foreground-500 hover:text-primary-600"></i>
                  </button>
                </div>

                {/* Org Chart */}
                <div className="space-y-4">
                  {rootNodes.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-xs text-foreground-400 mb-2">该部门暂无映射数据</p>
                      <button
                        onClick={() => openAddNode(dept.id, null)}
                        className="text-xs text-primary-600 hover:text-primary-700 cursor-pointer flex items-center gap-1 mx-auto"
                      >
                        <i className="ri-add-line"></i>
                        添加岗位
                      </button>
                    </div>
                  ) : (
                    rootNodes.map((rootNode) => renderNode(rootNode))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <>
          <div className="fixed inset-0 bg-foreground-900/40 z-40" onClick={() => setDeleteConfirm(null)}></div>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm pointer-events-auto p-6">
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-full bg-accent-100 flex items-center justify-center mx-auto mb-3">
                  <i className="ri-delete-bin-line text-xl text-accent-600"></i>
                </div>
                <h3 className="text-lg font-bold text-foreground-900">确认从地图移除</h3>
                <p className="text-sm text-foreground-500 mt-1">
                  该节点和下级节点会从当前地图隐藏，不会删除已保存的人才档案。
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 px-4 py-2.5 bg-background-100 hover:bg-background-200 rounded-lg text-sm font-medium text-foreground-700 transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={() => void handleDeleteNode(deleteConfirm)}
                  disabled={saving}
                  className="flex-1 px-4 py-2.5 bg-accent-500 hover:bg-accent-600 rounded-lg text-sm font-medium text-white transition-colors cursor-pointer"
                >
                  {saving ? '处理中…' : '确认移除'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Add Company Modal */}
      {addCompanyOpen && (
        <>
          <div className="fixed inset-0 bg-foreground-900/40 z-40" onClick={() => { if (!saving) setAddCompanyOpen(false); }}></div>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md pointer-events-auto flex flex-col animate-modal-in">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-background-100">
                <div>
                  <h2 className="text-lg font-bold text-foreground-900">新增公司</h2>
                  <p className="text-xs text-foreground-400 mt-0.5">添加新目标公司，系统将自动创建默认部门模板</p>
                </div>
                <button
                  onClick={() => setAddCompanyOpen(false)}
                  disabled={saving}
                  className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-background-100 text-foreground-500 transition-colors cursor-pointer"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-foreground-600 mb-1.5">
                    公司全称 <span className="text-accent-500">*</span>
                  </label>
                  <input
                    aria-label="公司全称"
                    type="text"
                    value={newCompanyForm.name}
                    onChange={(e) => setNewCompanyForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="如：美团"
                    className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-600 mb-1.5">
                    简称 <span className="text-accent-500">*</span>
                  </label>
                  <input
                    aria-label="公司简称"
                    type="text"
                    value={newCompanyForm.shortName}
                    onChange={(e) => setNewCompanyForm((prev) => ({ ...prev, shortName: e.target.value }))}
                    placeholder="如：美团"
                    className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-600 mb-1.5">人才地图 / 行业</label>
                  <input
                    aria-label="人才地图 / 行业"
                    type="text"
                    value={newCompanyForm.industry}
                    onChange={(e) => setNewCompanyForm((prev) => ({ ...prev, industry: e.target.value }))}
                    placeholder={activeIndustry ? `如：${activeIndustry}` : '如：互联网/科技'}
                    className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground-600 mb-1.5">公司描述</label>
                  <textarea
                    aria-label="公司描述"
                    value={newCompanyForm.description}
                    onChange={(e) => setNewCompanyForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="简要描述公司规模、业务特色、行业地位..."
                    rows={3}
                    maxLength={200}
                    className="w-full px-3 py-2.5 bg-white border border-background-200 rounded-lg text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:border-primary-300 resize-none"
                  ></textarea>
                  <p className="text-[10px] text-foreground-400 mt-1 text-right">{newCompanyForm.description.length}/200</p>
                </div>

                <div className="bg-secondary-50 rounded-lg p-3 border border-secondary-100">
                  <p className="text-xs text-secondary-700 flex items-start gap-2">
                    <i className="ri-lightbulb-line mt-0.5"></i>
                    <span>提交后将自动创建 3 个默认部门：总部技术中心、产品中心、运营中心。您可以随时编辑这些部门。</span>
                  </p>
                </div>
                {companyError && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{companyError}</p>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-background-100">
                <button
                  onClick={() => setAddCompanyOpen(false)}
                  disabled={saving}
                  className="px-4 py-2.5 bg-background-100 hover:bg-background-200 rounded-lg text-sm font-medium text-foreground-700 transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={() => void handleAddCompany()}
                  disabled={saving || !newCompanyForm.name.trim() || !newCompanyForm.shortName.trim()}
                  className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                >
                  {saving ? '保存中…' : '创建公司'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Edit Modal */}
      {editModalOpen && (
        <NodeEditModal
          node={editingNode}
          departmentId={targetDeptId}
          parentNodeId={parentNodeId}
          departments={companyDepartments}
          nodes={nodes}
          onSave={handleSaveNode}
          onClose={() => { setEditModalOpen(false); setEditingNode(null); }}
        />
      )}
    </div>
  );
}
