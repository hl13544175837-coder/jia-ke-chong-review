export type CompanyRole = 'admin' | 'manager' | 'recruiter' | 'interviewer' | 'hr_director';

export const VALID_COMPANY_ROLES: CompanyRole[] = [
  'admin',
  'manager',
  'recruiter',
  'interviewer',
  'hr_director',
];

function isCompanyRole(value: unknown): value is CompanyRole {
  return typeof value === 'string' && VALID_COMPANY_ROLES.includes(value.trim().toLowerCase() as CompanyRole);
}

export function parseGatewayRoleMap(rawValue: string): Record<string, CompanyRole> {
  return rawValue.split(',').reduce<Record<string, CompanyRole>>((mapping, item) => {
    const [employeeCode = '', role = ''] = item.split(':', 2);
    const normalizedCode = employeeCode.trim().toUpperCase();
    const normalizedRole = role.trim().toLowerCase();
    if (normalizedCode && isCompanyRole(normalizedRole)) {
      mapping[normalizedCode] = normalizedRole;
    }
    return mapping;
  }, {});
}

export function resolveGatewayRole(
  employeeCode: string,
  profileRole: unknown,
  rawRoleMap: string,
  fallbackRole: unknown = 'recruiter',
): CompanyRole {
  if (isCompanyRole(profileRole)) return profileRole.trim().toLowerCase() as CompanyRole;

  const mappedRole = parseGatewayRoleMap(rawRoleMap)[employeeCode.trim().toUpperCase()];
  if (mappedRole) return mappedRole;

  return isCompanyRole(fallbackRole)
    ? fallbackRole.trim().toLowerCase() as CompanyRole
    : 'recruiter';
}
