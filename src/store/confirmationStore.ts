import { create } from 'zustand';
import type React from 'react';

export interface ConfirmationDialogOptions {
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
}

interface ConfirmationState {
    isOpen: boolean;
    options: ConfirmationDialogOptions | null;
    isLoading: boolean;
    openConfirmation: (options: ConfirmationDialogOptions) => void;
    closeConfirmation: () => void;
    setLoading: (loading: boolean) => void;
}

export const useConfirmationStore = create<ConfirmationState>((set) => ({
    isOpen: false,
    options: null,
    isLoading: false,

    openConfirmation: (options: ConfirmationDialogOptions) => {
        set({ isOpen: true, options, isLoading: false });
    },

    closeConfirmation: () => {
        set({ isOpen: false, options: null, isLoading: false });
    },

    setLoading: (loading: boolean) => {
        set({ isLoading: loading });
    }
}));



