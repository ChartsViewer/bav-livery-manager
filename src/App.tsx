import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { AuthTokenListener } from '@/components/AuthTokenListener';
import { AppUpdateListener } from '@/components/AppUpdateListener';
import { RequireAuth } from '@/components/RequireAuth';
import { SearchPage } from '@/pages/SearchPage';
import { PackagesPage } from '@/pages/PackagesPage';
import { DownloadsPage } from '@/pages/DownloadsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { LoginPage } from '@/pages/LoginPage';
import { useInitializeLiveryStore } from '@/store/liveryStore';
import { useSessionHeartbeat } from '@/hooks/useSessionHeartbeat';
import { useLiveriesQuery } from '@/hooks/useLiveriesQuery';
import { useInstalledLiveriesQuery } from '@/hooks/useInstalledLiveriesQuery';
import { InformationPage } from './pages/InformationPage';
import {ThemeSync} from "@/components/ThemeSync";

export const App = () => {
  useInitializeLiveryStore();
  useSessionHeartbeat();
  useLiveriesQuery();
  useInstalledLiveriesQuery();

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
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/search" replace />} />
      </Routes>
    </HashRouter>
  );
};
