import { useState, useEffect } from 'react';
import { useConfirmationStore } from '@/store/confirmationStore';
import styles from './ConfirmationDialog.module.css';
import { AlertCircle } from 'react-feather';

export const ConfirmationDialog = () => {
    const { isOpen, options, isLoading, closeConfirmation, setLoading } = useConfirmationStore();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleCancel();
            }
            if (e.key === 'Enter' && !isLoading && !error) {
                handleConfirm();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isLoading, error]);

    if (!isOpen || !options) return null;

    const handleConfirm = async () => {
        setLoading(true);
        setError(null);
        try {
            await options.onConfirm();
            closeConfirmation();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
            setLoading(false);
        }
    };

    const handleCancel = () => {
        if (isLoading) return;
        options.onCancel?.();
        closeConfirmation();
        setError(null);
    };

    return (
        <div className={styles.backdrop} onClick={handleCancel} role="presentation">
            <div className={styles.modal} onClick={(e) => e.stopPropagation()} role="alertdialog" aria-modal="true">
                <div className={styles.header}>
                    <div className={styles.headerContent}>
                        <AlertCircle className={styles.icon} aria-hidden="true" />
                        <h2 className={styles.title} id="dialog-title">{options.title}</h2>
                    </div>
                </div>

                <div className={styles.body}>
                    <div className={styles.message} id="dialog-description">
                        {typeof options.message === 'string' ? (
                            <p style={{ margin: 0 }}>{options.message}</p>
                        ) : (
                            options.message
                        )}
                    </div>
                    {error && (
                        <div className={styles.error} role="alert">
                            <AlertCircle className={styles.errorIcon} aria-hidden="true" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                <div className={styles.actions}>
                    <button
                        className={styles.btnSecondary}
                        onClick={handleCancel}
                        disabled={isLoading}
                        aria-label={`${options.cancelText || 'Cancel'} dialog`}
                    >
                        {options.cancelText || 'Cancel'}
                    </button>
                    <button
                        className={styles.btnPrimary}
                        onClick={handleConfirm}
                        disabled={isLoading}
                        aria-label={`${options.confirmText || 'Confirm'} action`}
                        autoFocus
                    >
                        {isLoading ? 'Please wait...' : (options.confirmText || 'Confirm')}
                    </button>
                </div>
            </div>
        </div>
    );
};

