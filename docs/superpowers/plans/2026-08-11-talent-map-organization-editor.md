# 人才地图组织结构编辑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让人才地图可独立新增和编辑公司下的部门、岗位，空岗位无需先录入人才也会保存并展示。

**Architecture:** 部门与岗位配置保存在当前人才地图的 `board_json.organization[companyId]`；页面将配置与已录入人才合并渲染。专用后端接口在一次事务内保存配置，并把改名同步到已有人员的部门/岗位字段。

**Tech Stack:** React、TypeScript、Flask、SQLAlchemy、Node test、pytest。

---

### Task 1: 组织结构配置与渲染模型

**Files:**
- Create: `readdy-frontend/src/pages/talent-map/organization.ts`
- Modify: `readdy-frontend/src/features/talentMaps/types.ts`
- Test: `readdy-frontend/tests/talent-map-organization.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('自定义空岗位会与已录入人才一起显示', () => {
  const tree = buildOrganization([{ id: 1, department: '产品', title: '产品经理' }], {
    departments: [{ name: '产品', roles: ['产品经理', '产品运营'] }],
  });
  assert.deepEqual(tree.map((item) => [item.name, item.roles.map((role) => role.title)]), [
    ['产品', ['产品经理', '产品运营']],
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd readdy-frontend && npx tsx --test tests/talent-map-organization.test.mjs`

Expected: FAIL because `organization.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildOrganization(people, saved) {
  // 将已保存空部门/岗位先放入树，再合并人员字段生成的部门/岗位。
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd readdy-frontend && npx tsx --test tests/talent-map-organization.test.mjs`

Expected: PASS.

### Task 2: 后端原子保存与人员同步改名

**Files:**
- Modify: `backend/app/api/talent_maps.py`
- Modify: `backend/tests/test_talent_map.py`

- [ ] **Step 1: Write the failing test**

```python
updated = client.patch(
    f"/api/talent-maps/{map_id}/organization",
    headers=_auth(token),
    json={"company_id": company_id, "departments": [{
        "source_name": "产品", "name": "产品研发",
        "roles": [{"source_title": "产品经理", "title": "高级产品经理"}, {"title": "产品运营"}],
    }]},
)
assert updated.status_code == 200
assert updated.get_json()["people"][0]["department"] == "产品研发"
assert updated.get_json()["people"][0]["title"] == "高级产品经理"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./.venv/bin/python -m pytest backend/tests/test_talent_map.py -q`

Expected: FAIL with 404 because the organization route does not exist.

- [ ] **Step 3: Write minimal implementation**

```python
@bp.patch('/talent-maps/<int:map_id>/organization')
def update_talent_map_organization(map_id):
    # 校验当前地图与公司，保存 organization 配置；同一事务中更新对应人员字段。
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./.venv/bin/python -m pytest backend/tests/test_talent_map.py -q`

Expected: PASS.

### Task 3: 编辑组织结构界面和接线

**Files:**
- Create: `readdy-frontend/src/pages/talent-map/components/OrganizationEditorModal.tsx`
- Modify: `readdy-frontend/src/pages/talent-map/page.tsx`
- Modify: `readdy-frontend/src/features/talentMaps/api.ts`
- Modify: `readdy-frontend/src/features/talentMaps/useTalentMapWorkspace.ts`
- Modify: `readdy-frontend/tests/talent-map-organization.test.mjs`

- [ ] **Step 1: Write the failing UI contract test**

```js
assert.match(page, /编辑组织架构/);
assert.match(modal, /新增部门/);
assert.match(modal, /新增岗位/);
assert.match(modal, /保存组织结构/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd readdy-frontend && npx tsx --test tests/talent-map-organization.test.mjs`

Expected: FAIL because the modal and entry do not exist.

- [ ] **Step 3: Write minimal implementation**

```tsx
<button onClick={() => setOrganizationEditorOpen(true)}>编辑组织架构</button>
<OrganizationEditorModal onSave={workspace.updateOrganization} />
```

- [ ] **Step 4: Verify front end**

Run: `cd readdy-frontend && npm run test:contract && npm run type-check && npm run lint && npm run build`

Expected: all commands exit 0.

### Task 4: 发布前验证

**Files:** no additional files.

- [ ] **Step 1: Run repository release checks relevant to this change**

Run: `./.venv/bin/python -m pytest backend/tests/test_talent_map.py -q && cd readdy-frontend && npm run test:contract && npm run type-check && npm run lint && npm run build && cd .. && make -n build PKG_TAG=RC PKG_VERSION=organization-editor`

Expected: targeted backend and full frontend checks pass; RC image command resolves.

- [ ] **Step 2: Commit and push only verified changes**

```bash
git add backend/app/api/talent_maps.py backend/tests/test_talent_map.py \
  readdy-frontend/src/pages/talent-map readdy-frontend/src/features/talentMaps \
  readdy-frontend/tests/talent-map-organization.test.mjs
git commit -m "feat: make talent map organization editable"
git push https://git.ymdd.tech/cfpd/zhipin-mvp.git HEAD:test
```
