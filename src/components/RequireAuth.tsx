import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import styles from './RequireAuth.module.css';

export const RequireAuth = () => {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const status = useAuthStore((state) => state.status);
    const location = useLocation();

    if (status === 'awaiting-browser' || status === 'verifying' || status === 'restoring') {
        return (
            <div className={styles.guard}>
                <p>{status === 'restoring' ? 'Restoring session…' : status === 'verifying' ? 'Verifying session…' : 'Verifying access…'}</p>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
    }

    return <Outlet />;
};
