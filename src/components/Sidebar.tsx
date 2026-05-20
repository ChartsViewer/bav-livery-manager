import {NavLink} from 'react-router-dom';
import {DownloadProgress} from './DownloadProgress';
import {NextFlightCard} from './NextFlightCard';
import {UpdateBadge} from './UpdateBadge';
import {APP_VERSION} from '@/constants/appVersion';
import styles from './Sidebar.module.css';
import {Package as PackageIcon, RotateCw} from 'react-feather';
import {useState} from "react";
import {useThemeStore} from "@/store/themeStore";
import {useNextFlightQuery} from "@/hooks/useNextFlightQuery";
import {useLiveryStore} from "@/store/liveryStore";

const NAV_ITEMS = [
    {label: 'Liveries', to: '/search', icon: 'search'},
    {label: 'Packages', to: '/packages', icon: 'package'},
    {label: 'Updates', to: '/downloads', icon: 'download'},
    {label: 'Settings', to: '/settings', icon: 'settings'}
];

const LOGO_URL = 'https://pub-505cce096f5e4523867626e0594f0337.r2.dev/InstallerLogo.png';

const Icon = ({name}: { name: string }) => {
    switch (name) {
        case 'download':
            return (
                <RotateCw/>
            );
        case 'package':
            return (
                <PackageIcon/>
            );
        case 'settings':
            return (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <circle cx="12" cy="12" r="3"/>
                    <path
                        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.18a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
            );
        default:
            return (
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="none" stroke="currentColor" strokeWidth="80"><path d="m397-115-99-184-184-99 71-70 145 25 102-102-317-135 84-86 385 68 124-124q23-23 57-23t57 23q23 23 23 56.5T822-709L697-584l68 384-85 85-136-317-102 102 26 144-71 71Z"/></svg>
            );
    }
};

const UnCollapseIcon = ({color}: {color: string}) => <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill={color}><path d="M120-160v-640h80v640h-80Zm360-120L280-480l200-200 56 56-104 104h408v80H432l104 104-56 56Z"/></svg>;
const CollapseIcon = ({color}: {color: string}) => <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill={color}><path d="M760-160v-640h80v640h-80ZM480-280l-56-56 104-104H120v-80h408L424-624l56-56 200 200-200 200Z"/></svg>;

const classNames = (...tokens: Array<string | false | undefined>) => tokens.filter(Boolean).join(' ');

export const Sidebar = () => {

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isRenderExpanded, setIsRenderExpanded] = useState(true);

    const {theme, currentTheme} = useThemeStore();
    const {data: flight} = useNextFlightQuery();
    const liveriesCount = useLiveryStore((state) => state.liveries.length);
    const hasFlight = Boolean(flight) && liveriesCount > 0;

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
                            isCollapsed ? <CollapseIcon color={theme.text}/> : <UnCollapseIcon color={theme.text}/>
                        }
                        {!isCollapsed && <span>Collapse</span>}
                    </div>
                </div>
                <nav className={styles.panelButtons}>
                    {NAV_ITEMS.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({isActive}) =>
                                classNames(styles.panelButton, isActive && styles.panelButtonActive)
                            }
                        >
                            <Icon name={item.icon}/>
                            {!isCollapsed && <span>{item.label}</span>}
                            {item.to === '/downloads' && <UpdateBadge/>}
                        </NavLink>
                    ))}
                </nav>
            </div>

                <div className={styles.middleSection}>
                    {isRenderExpanded && !isCollapsed && hasFlight && (
                        <NextFlightCard seamless />
                    )}
                    <DownloadProgress
                        isCollapsed={!isRenderExpanded}
                        isExpanding={!isCollapsed && !isRenderExpanded}
                        layered={isRenderExpanded && !isCollapsed && hasFlight}
                    />
                </div>
                <div className={classNames(styles.footer, isCollapsed && styles.panelFooterCollapsed)}>
                    <div className={styles.versionBadge}>v{APP_VERSION}</div>
                    <div className={styles.sidebarLogo}>
                        <img className={styles.logoImage} style={currentTheme === "light" ? {filter: "invert()"} : {}} src={LOGO_URL} alt="Livery Manager"/>
                    </div>
                </div>
        </aside>
    );
};
