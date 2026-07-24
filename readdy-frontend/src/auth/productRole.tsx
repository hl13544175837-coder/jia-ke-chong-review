import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Navigate } from 'react-router-dom';
import { useCompanyAuth, type CompanyRole } from './companyAuth';
import { homePathForRole, PRODUCT_ROLE_KEYS, type ProductRole } from './productRoleModel';

const PREVIEW_ROLE_KEY = 'hireinsight_preview_role';
const ROLE_PREVIEW_ENABLED = import.meta.env.DEV
  && import.meta.env.VITE_ENABLE_ROLE_PREVIEW === 'true';

interface ProductRoleValue {
  assignedRole: CompanyRole | null;
  role: ProductRole | null;
  previewEnabled: boolean;
  setPreviewRole: (role: ProductRole) => void;
}

const ProductRoleContext = createContext<ProductRoleValue | undefined>(undefined);

function loadPreviewRole(): ProductRole | null {
  if (!ROLE_PREVIEW_ENABLED) return null;
  const stored = localStorage.getItem(PREVIEW_ROLE_KEY) as ProductRole | null;
  return stored && PRODUCT_ROLE_KEYS.has(stored) ? stored : null;
}

export function ProductRoleProvider({ children }: { children: ReactNode }) {
  const { role: assignedRole } = useCompanyAuth();
  const [previewRole, setPreviewRoleState] = useState<ProductRole | null>(loadPreviewRole);

  useEffect(() => {
    if (!assignedRole) {
      setPreviewRoleState(null);
      localStorage.removeItem(PREVIEW_ROLE_KEY);
    }
  }, [assignedRole]);

  const setPreviewRole = useCallback((role: ProductRole) => {
    if (!ROLE_PREVIEW_ENABLED) return;
    localStorage.setItem(PREVIEW_ROLE_KEY, role);
    setPreviewRoleState(role);
  }, []);

  const value = useMemo<ProductRoleValue>(() => ({
    assignedRole,
    role: assignedRole ? previewRole ?? assignedRole : null,
    previewEnabled: ROLE_PREVIEW_ENABLED,
    setPreviewRole,
  }), [assignedRole, previewRole, setPreviewRole]);

  return (
    <ProductRoleContext.Provider value={value}>
      {children}
    </ProductRoleContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProductRole(): ProductRoleValue {
  const value = useContext(ProductRoleContext);
  if (!value) throw new Error('useProductRole must be used within ProductRoleProvider');
  return value;
}

export function RequireCompanyRole({
  allow,
  children,
}: {
  allow: ProductRole[];
  children: ReactNode;
}) {
  const { role } = useProductRole();
  if (!role || !allow.includes(role)) {
    return <Navigate to={homePathForRole(role)} replace />;
  }
  return <>{children}</>;
}

export function RoleHomeRedirect() {
  const { role } = useProductRole();
  return <Navigate to={homePathForRole(role)} replace />;
}
