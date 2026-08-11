import assert from 'node:assert/strict';
import test from 'node:test';

// 走 tsx 编译路径：让 contract 直接打到源文件，避免运行时再构建
import { materializeCompanies } from '../src/pages/talent-map/components/aiImportCompanies.ts';

const workspaceStub = (mapCompanyNameToId = new Map(), createImpl) => ({
  async addCompany(name) {
    if (createImpl) return createImpl(name);
    if (mapCompanyNameToId.has(name)) return { id: mapCompanyNameToId.get(name) };
    const id = 1000 + mapCompanyNameToId.size;
    mapCompanyNameToId.set(name, id);
    return { id };
  },
});

test('materializeCompanies: 已知公司不重复创建', async () => {
  const ws = workspaceStub(new Map([['广东鹏心快运', 12]]));
  const items = [
    { name: '罗来勇', create_company_name: '广东鹏心快运', title: 'TMS产品经理' },
  ];
  const out = await materializeCompanies(
    ws,
    items,
    new Map([['广东鹏心快运', 12]]),
  );
  assert.equal(out[0].company_id, 12);
  assert.equal(out[0].create_company_name, undefined);
});

test('materializeCompanies: 新公司创建并替换 company_id', async () => {
  const ws = workspaceStub();
  const items = [
    { name: '罗来勇', create_company_name: 'SHEIN', title: 'TMS产品经理' },
  ];
  const out = await materializeCompanies(
    ws,
    items,
    new Map(),
  );
  assert.ok(typeof out[0].company_id === 'number');
  assert.equal(out[0].create_company_name, undefined);
});

test('materializeCompanies: 同名公司只创建一次,多个项目共享', async () => {
  let calls = 0;
  const ws = {
    async addCompany(name) {
      calls += 1;
      return { id: 9000 + calls };
    },
  };
  const items = [
    { name: '罗来勇', create_company_name: 'SHEIN', title: 'TMS产品经理' },
    { name: '张三', create_company_name: 'SHEIN', title: '运营' },
    { name: '李四', create_company_name: 'ByteDance', title: '招聘' },
  ];
  const out = await materializeCompanies(
    ws,
    items,
    new Map(),
  );
  assert.equal(calls, 2, 'SHEIN + ByteDance 只调 addCompany 2 次');
  assert.equal(out[0].company_id, out[1].company_id, '罗来勇/张三 共享 SHEIN 同一 company_id');
  assert.notEqual(out[0].company_id, out[2].company_id);
});

test('materializeCompanies: addCompany 失败时保留 create_company_name 走新后端兜底', async () => {
  const ws = {
    async addCompany() {
      throw new Error('403 Forbidden (旧后端无此路由)');
    },
  };
  const items = [
    { name: '罗来勇', create_company_name: 'SHEIN', title: 'TMS产品经理' },
  ];
  const out = await materializeCompanies(
    ws,
    items,
    new Map(),
  );
  assert.equal(out[0].company_id, undefined);
  assert.equal(out[0].create_company_name, 'SHEIN', '失败时原样保留,交给新后端兜底');
});

test('materializeCompanies: 已 company_id 的不被处理', async () => {
  const ws = workspaceStub();
  const items = [
    { name: '罗来勇', company_id: 5, title: 'TMS产品经理' },
  ];
  const out = await materializeCompanies(
    ws,
    items,
    new Map(),
  );
  assert.equal(out[0].company_id, 5);
});
