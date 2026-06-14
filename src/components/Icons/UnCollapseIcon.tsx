type UnCollapseIconProps = {
    color: string;
};

export function UnCollapseIcon({ color }: UnCollapseIconProps) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill={color} aria-hidden>
            <path d="M120-160v-640h80v640h-80Zm360-120L280-480l200-200 56 56-104 104h408v80H432l104 104-56 56Z" />
        </svg>
    );
}
