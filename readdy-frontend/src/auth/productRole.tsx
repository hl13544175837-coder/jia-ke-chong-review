import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { Navigate } from 'react-router-dom';
import { useCompanyAuth } from './companyAuth';
import { homePathForRole, type ProductRole } from './productRoleModel';

interface ProductRoleValue {
  role: ProductRole | null;
}

const ProductRoleContext = createContext<ProductRoleValue | undefined>(undefined);

export function ProductRoleProvider({ children }: { children: ReactNode }) {
  const { role } = useCompanyAuth();

  const value = useMemo<ProductRoleValue>(() => ({
    role,
  }), [role]);

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
