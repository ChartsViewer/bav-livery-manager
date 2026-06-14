import {create} from "zustand";
import {persist} from "zustand/middleware";

const darkTheme = {
    primary: "#ffffff",
    bg: "#000000",
    panel: "#111111",
    card: "#1a1a1a",
    border: "#333333",
    text: "#ffffff",
    muted: "#b3b3b3",
    danger: "#ff4444",
    warning: "#fab005",
    success: "#4caf50",
    focus: "rgba(255, 255, 255, 0.3)",
    chipsBackground: "rgba(255, 255, 255, 0.04)",
    chipsBackgroundActive: "rgba(255, 255, 255, 0.12)",
    buttons: "#2a2a2a",
    shadow: "rgba(0, 0, 0, 0.2)",
    changelogText: "#b3b3b3",
}

const whiteTheme = {
    primary: "#000000",
    bg: "#ffffff",
    panel: "#eeeeee",
    card: "#efefef",
    border: "#bbbbbb",
    text: "#000000",
    muted: "#323232",
    danger: "#ff4444",
    warning: "#fab005",
    success: "#4caf50",
    focus: "rgba(255, 255, 255, 0.3)",
    chipsBackground: "#efefef",
    chipsBackgroundActive: "rgba(255, 255, 255, 0.12)",
    buttons: "#dcdcdc",
    shadow: "rgba(255, 255, 255, 0.2)",
    changelogText: "#000000",
}

interface ThemeStore {
    currentTheme: "dark" | "light";
    theme: Object & {text: string};
    setTheme: (theme: "dark" | "light") => void;
    changeTheme: () => void;
}

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set, get) => ({
            currentTheme: "dark",
            theme: darkTheme,
            setTheme: (theme: "dark" | "light") => set({currentTheme: theme, theme: theme === 'dark' ? darkTheme : whiteTheme}),
            changeTheme: () => {
                const {currentTheme} = get();
                if (currentTheme === "dark") {
                    set({currentTheme: "light", theme: whiteTheme});
                } else {
                    set({currentTheme: "dark", theme: darkTheme});
                }
            },
        }), {
            name: "theme",
        }
    )
);