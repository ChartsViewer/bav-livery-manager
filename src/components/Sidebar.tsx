import { NavLink } from 'react-router-dom';
import { DownloadProgress } from './DownloadProgress';
import { NextFlightCard } from './NextFlightCard';
import { UpdateBadge } from './UpdateBadge';
import { APP_VERSION } from '@/constants/appVersion';
import styles from './Sidebar.module.css';
import { Layers, Package as PackageIcon, Settings, Upload } from 'react-feather';
import { LiveriesIcon } from '@/components/Icons/LiveriesIcon';
import { CollapseIcon } from '@/components/Icons/CollapseIcon';
import { UnCollapseIcon } from '@/components/Icons/UnCollapseIcon';
import { useState } from "react";
import { useThemeStore } from "@/store/themeStore";
import { useNextFlightQuery } from "@/hooks/useNextFlightQuery";
import { useLiveryStore } from "@/store/liveryStore";
import { usePackagesQuery } from "@/hooks/usePackagesQuery";
import { useAuthStore } from "@/store/authStore";

const NAV_ITEMS = [
    { label: 'Liveries', to: '/search', icon: 'search' },
    { label: 'Packages', to: '/packages', icon: 'package' },
    { label: 'Updates', to: '/downloads', icon: 'download' },
    { label: 'Settings', to: '/settings', icon: 'settings' }
];

const LOGO_URL = 'https://pub-505cce096f5e4523867626e0594f0337.r2.dev/InstallerLogo.png';

const Icon = ({ name }: { name: string }) => {
    switch (name) {
        case 'download':
            return (
                <Upload />
            );
        case 'package':
            return (
                <PackageIcon />
            );
        case 'settings':
            return <Settings aria-hidden />;
        default:
            return <LiveriesIcon />;
    }
};


const classNames = (...tokens: Array<string | false | undefined>) => tokens.filter(Boolean).join(' ');

export const Sidebar = () => {

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isRenderExpanded, setIsRenderExpanded] = useState(true);

    const { theme, currentTheme } = useThemeStore();
    const role = useAuthStore((state) => state.role);
    const { data: flight } = useNextFlightQuery();
    const liveriesCount = useLiveryStore((state) => state.liveries.length);
    const { data: packages } = usePackagesQuery();
    const packagesCount = packages?.length ?? 0;

    const navCounts: Record<string, number> = {
        '/search': liveriesCount,
        '/packages': packagesCount
    };
    // Card shows when:
    //   - no flight is booked (→ Book a flight CTA), OR
    //   - a flight is booked AND liveries have loaded (→ full flight card).
    // It stays hidden when a flight is booked but liveries haven't loaded yet.
    const showFlightCard = !flight || liveriesCount > 0;

    const toggleSidebar = () => {
        if (isCollapsed) {
            setIsCollapsed(false);
            setTimeout(() => setIsRenderExpanded(true), 300);
        } else {
            setIsRenderExpanded(false);
            setIsCollapsed(true);
        }
    };

    return (
        <aside className={classNames(styles.sidePanel, isCollapsed && styles.sidePanelCollapsed)}>
            <div className={styles.topSection}>
                <div onClick={toggleSidebar} className={styles.collapseButton}>
                    <div className={classNames(styles.panelButton)}>
                        {
                            isCollapsed ? <CollapseIcon color={theme.text} /> : <UnCollapseIcon color={theme.text} />
                        }
                        {!isCollapsed && <span>Collapse</span>}
                    </div>
                </div>
                <nav className={styles.panelButtons}>
                    {NAV_ITEMS.map((item) => {
                        const count = navCounts[item.to];
                        return (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) =>
                                    classNames(styles.panelButton, isActive && styles.panelButtonActive)
                                }
                            >
                                <Icon name={item.icon} />
                                {!isCollapsed && <span>{item.label}</span>}
                                {!isCollapsed && count > 0 && (
                                    <span className={styles.count}>{count}</span>
                                )}
                                {item.to === '/downloads' && <UpdateBadge compact={isCollapsed} />}
                            </NavLink>
                        );
                    })}
                    {role === 'admin' && (
                        <NavLink
                            to="/meta-editor"
                            className={({ isActive }) =>
                                classNames(styles.panelButton, isActive && styles.panelButtonActive)
                            }
                        >
                            <Layers aria-hidden />
                            {!isCollapsed && <span>Meta Editor</span>}
                        </NavLink>
                    )}
                </nav>
            </div>

            <div className={styles.middleSection}>
                {isRenderExpanded && !isCollapsed && showFlightCard && (
                    <NextFlightCard seamless />
                )}
                <DownloadProgress
                    isCollapsed={!isRenderExpanded}
                    isExpanding={!isCollapsed && !isRenderExpanded}
                    layered={isRenderExpanded && !isCollapsed && showFlightCard}
                />
            </div>
            <div className={classNames(styles.footer, isCollapsed && styles.panelFooterCollapsed)}>
                <div className={styles.versionBadge}>v{APP_VERSION}</div>
                <div className={styles.sidebarLogo}>
                    <img className={styles.logoImage} style={currentTheme === "light" ? { filter: "invert()" } : {}} src={LOGO_URL} alt="Livery Manager" />
                </div>
            </div>
        </aside>
    );
};
