type CollapseIconProps = {
    color: string;
};

export function CollapseIcon({ color }: CollapseIconProps) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill={color} aria-hidden>
            <path d="M760-160v-640h80v640h-80ZM480-280l-56-56 104-104H120v-80h408L424-624l56-56 200 200-200 200Z" />
        </svg>
    );
}
