import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { AuthTokenListener } from '@/components/AuthTokenListener';
import { AppUpdateListener } from '@/components/AppUpdateListener';
import { RequireAuth } from '@/components/RequireAuth';
import { RequireAdmin } from '@/components/RequireAdmin';
import { SearchPage } from '@/pages/SearchPage';
import { PackagesPage } from '@/pages/PackagesPage';
import { DownloadsPage } from '@/pages/DownloadsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { LoginPage } from '@/pages/LoginPage';
import { MetaEditorPage } from '@/pages/MetaEditorPage';
import { useInitializeLiveryStore } from '@/store/liveryStore';
import { useInitializePackageStore } from '@/store/packageStore';
import { useSessionHeartbeat } from '@/hooks/useSessionHeartbeat';
import { useLiveriesQuery } from '@/hooks/useLiveriesQuery';
import { useInstalledLiveriesQuery } from '@/hooks/useInstalledLiveriesQuery';
import { usePackagesQuery } from '@/hooks/usePackagesQuery';
import { InformationPage } from './pages/InformationPage';
import { NextFlightPage } from './pages/NextFlightPage';
import {ThemeSync} from "@/components/ThemeSync";

export const App = () => {
  useInitializeLiveryStore();
  useSessionHeartbeat();
  useLiveriesQuery();
  useInstalledLiveriesQuery();
  const { data: packagesData } = usePackagesQuery();
  useInitializePackageStore(packagesData);

  return (
    <HashRouter>
      <AuthTokenListener />
      <AppUpdateListener />
      <ThemeSync/>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/search" replace />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="packages" element={<PackagesPage />} />
            <Route path="downloads" element={<DownloadsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="information/:liveryId" element={<InformationPage/>}></Route>
            <Route path="next-flight" element={<NextFlightPage />} />
            <Route element={<RequireAdmin />}>
              <Route path="meta-editor" element={<MetaEditorPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/search" replace />} />
      </Routes>
    </HashRouter>
  );
};
