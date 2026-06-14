export function CheckboxChecked() {
    return (
        <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
            <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" style={{ fill: 'var(--panel)', stroke: 'var(--muted)' }} strokeWidth="1.5" />
            <path d="M4.5 8l2.5 2.5 4.5-4.5" style={{ stroke: 'var(--muted)', fill: 'none' }} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
