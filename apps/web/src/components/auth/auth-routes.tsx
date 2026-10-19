import { Navigate, Outlet, useLocation } from "react-router";
import { getDashboardRoute, useAuth } from "@/auth/auth-context";

export function ProtectedRoutes() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function PublicAuthRoute() {
  const { user } = useAuth();
  return user ? <Navigate to={getDashboardRoute(user.role)} replace /> : <Outlet />;
}
