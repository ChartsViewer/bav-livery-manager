import {useThemeStore} from "@/store/themeStore";
import {useEffect} from "react";

export const ThemeSync = () => {
    const theme = useThemeStore((state) => state.theme);
    const currentTheme = useThemeStore((state) => state.currentTheme);

    useEffect(() => {
        console.log("ThemeSync", theme);
        const root = document.documentElement;
        Object.entries(theme).forEach(([key, value]) => {
            const cssVar = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
            root.style.setProperty(cssVar, value);
        });

        const isDark = currentTheme === 'dark';
        window.electronAPI?.setTitleBarOverlay(
            isDark ? '#111111' : '#eeeeee',
            isDark ? '#ffffff' : '#000000',
            isDark
        );
    }, [theme, currentTheme]);

    return null;
}