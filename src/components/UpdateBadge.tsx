import { useLiveryStore } from '@/store/liveryStore';
import { usePackageStore } from '@/store/packageStore';
import styles from './UpdateBadge.module.css';

type UpdateBadgeProps = {
    compact?: boolean;
};

export const UpdateBadge = ({ compact = false }: UpdateBadgeProps) => {
    const liveryUpdates = useLiveryStore((state) => state.availableUpdates);
    const packageUpdates = usePackageStore((state) => state.availableUpdates);
    const total = liveryUpdates.length + packageUpdates.length;

    if (total === 0) {
        return null;
    }

    const title = `${total} update${total === 1 ? '' : 's'} available`;

    if (compact) {
        return (
            <span className={`${styles.badge} ${styles.badgeCompact}`} title={title}>
                {total > 9 ? '9+' : total}
            </span>
        );
    }

    return (
        <span className={styles.badge} title={title}>
            {total} update{total === 1 ? '' : 's'}
        </span>
    );
};
