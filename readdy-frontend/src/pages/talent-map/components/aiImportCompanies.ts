interface CompanyImportItem {
  company_id?: number | null;
  create_company_name?: string;
}

interface CompanyWorkspace {
  addCompany(name: string): Promise<{ id?: number }>;
}

/**
 * 把待导入项里的新公司提前落库，并替换成当前人才地图内的 company_id。
 */
export async function materializeCompanies<T extends CompanyImportItem>(
  workspace: CompanyWorkspace,
  items: T[],
  knownMap: ReadonlyMap<string, number>,
): Promise<T[]> {
  const toCreate = new Map<string, T[]>();
  for (const item of items) {
    const name = item.create_company_name?.trim();
    if (!name) continue;
    if (knownMap.has(name)) {
      item.company_id = knownMap.get(name) ?? null;
      delete item.create_company_name;
      continue;
    }
    if (!toCreate.has(name)) toCreate.set(name, []);
    toCreate.get(name)!.push(item);
  }

  for (const [name, owners] of toCreate) {
    try {
      const company = await workspace.addCompany(name);
      if (!company.id) throw new Error('createCompany 返回无 id');
      for (const item of owners) {
        item.company_id = company.id;
        delete item.create_company_name;
      }
    } catch (error) {
      console.warn('[AI 导入] 兼容创建公司失败,保留 create_company_name', { name, error });
    }
  }
  return items;
}
