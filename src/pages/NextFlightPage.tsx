import { ReturnButton } from '@/components/ReturnButton';

export const NextFlightPage = () => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
            <ReturnButton />
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 1,
                    color: 'var(--muted)',
                    fontSize: '0.9rem'
                }}
            >
                Next Flight page coming soon.
            </div>
        </div>
    );
};
