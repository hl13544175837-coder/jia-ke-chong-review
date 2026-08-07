import { useCallback, useEffect, useState } from 'react';
import ActionButton from '@/components/ui/ActionButton';
import { onlineResumesApi } from '../api';
import type { OnlineResumeItem } from '../types';
import OnlineResumeDetailDrawer from './OnlineResumeDetailDrawer';

interface OpenResume {
  id: number;
  edit: boolean;
}

const PAGE_SIZE = 20;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
}

export default function OnlineResumeList() {
  const [items, setItems] = useState<OnlineResumeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openResume, setOpenResume] = useState<OpenResume | null>(null);

  const load = useCallback(async () => {
    let keepLoadingForPageCorrection = false;
    setLoading(true);
    setError('');
    try {
      const result = await onlineResumesApi.list(page, PAGE_SIZE);
      const validLastPage = Math.max(1, result.pages);
      if (page > validLastPage) {
        keepLoadingForPageCorrection = true;
        setPage(validLastPage);
        return;
      }
      setItems(result.items);
      setTotal(result.total);
      setPages(validLastPage);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '在线简历加载失败');
    } finally {
      if (!keepLoadingForPageCorrection) setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section className="rounded-xl border border-background-200 bg-white px-5 py-14 text-center shadow-sm">
        <p className="text-sm text-foreground-500">正在加载在线简历...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-xl border border-red-100 bg-white px-5 py-12 text-center shadow-sm">
        <p className="text-sm text-red-700">{error}</p>
        <ActionButton className="mt-4" onClick={() => void load()}>重新加载</ActionButton>
      </section>
    );
  }

  if (items.length === 0 && total === 0) {
    return (
      <section className="rounded-xl border border-dashed border-background-300 bg-white px-5 py-16 text-center shadow-sm">
        <p className="text-base font-medium text-foreground-700">暂无Agent导入的在线简历</p>
        <p className="mt-2 text-sm text-foreground-500">外部Agent导入后会显示在这里</p>
      </section>
    );
  }

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-background-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-background-100 px-4 py-3">
          <p className="text-sm text-foreground-600">共 {total} 份在线简历</p>
          <ActionButton size="sm" onClick={() => void load()}>刷新</ActionButton>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-background-50 text-xs font-medium text-foreground-500">
              <tr>
                <th className="px-4 py-3">候选人</th>
                <th className="px-4 py-3">招聘需求</th>
                <th className="px-4 py-3">BOSS账号</th>
                <th className="px-4 py-3">最新聊天</th>
                <th className="px-4 py-3">导入时间</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-100">
              {items.map((item) => (
                <tr key={item.id} className="align-top hover:bg-background-50/60">
                  <td className="px-4 py-4">
                    <button
                      type="button"
                      onClick={() => setOpenResume({ id: item.id, edit: false })}
                      className="font-medium text-foreground-900 hover:text-primary-700"
                    >
                      {item.display_name}
                    </button>
                    <p className="mt-1 text-xs text-foreground-400">{item.source_platform}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-foreground-800">{item.demand.title}</p>
                    <p className="mt-1 text-xs text-foreground-400">{item.demand.request_no}</p>
                  </td>
                  <td className="px-4 py-4 text-foreground-700">{item.boss_account}</td>
                  <td className="max-w-[320px] px-4 py-4">
                    {item.latest_chat ? (
                      <>
                        <p className="line-clamp-2 whitespace-pre-wrap break-words text-foreground-700">{item.latest_chat.text}</p>
                        <time className="mt-1 block text-xs text-foreground-400" dateTime={item.latest_chat.sent_at}>
                          {formatDate(item.latest_chat.sent_at)}
                        </time>
                      </>
                    ) : (
                      <span className="text-foreground-400">暂无聊天</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-foreground-500">{formatDate(item.created_at)}</td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <ActionButton size="sm" onClick={() => setOpenResume({ id: item.id, edit: false })}>查看</ActionButton>
                      <ActionButton size="sm" onClick={() => setOpenResume({ id: item.id, edit: true })}>编辑</ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-background-100 px-4 py-3">
          <p className="text-xs text-foreground-500">第 {page} / {pages} 页</p>
          <div className="flex gap-2">
            <ActionButton size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              上一页
            </ActionButton>
            <ActionButton size="sm" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>
              下一页
            </ActionButton>
          </div>
        </div>
      </section>

      {openResume && (
        <OnlineResumeDetailDrawer
          key={`${openResume.id}-${openResume.edit ? 'edit' : 'view'}`}
          resumeId={openResume.id}
          initialEdit={openResume.edit}
          onClose={() => setOpenResume(null)}
          onSaved={(updated) => {
            setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
          }}
          onDeleted={(deletedId) => {
            setItems((current) => current.filter((item) => item.id !== deletedId));
            setTotal((current) => Math.max(0, current - 1));
            setOpenResume(null);
            if (items.length === 1 && page > 1) {
              setPage((current) => current - 1);
            } else {
              void load();
            }
          }}
        />
      )}
    </>
  );
}
