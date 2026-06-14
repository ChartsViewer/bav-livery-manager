import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText } from 'react-feather';
import { useMetaManifestStore } from '@/store/metaManifestStore';
import type { MetaTextureCfgScanResult } from '@/types/electron-api';
import styles from './TextureConfigPanel.module.css';

type ScanState = 'idle' | 'scanning' | 'done';

const TEXTURE_CFG_PLACEHOLDER = [
    '[fltsim]',
    'fallback.1=..\\..\\..\\..\\AircraftFolder\\texture',
    'fallback.2=..\\..\\..\\..\\AircraftFolder\\texture.White',
].join('\n');

export function MetaTextureConfigPanel() {
    const { liveries, selectedIds, setPendingTextureCfg, pendingTextureCfg } = useMetaManifestStore();
    const selected = liveries.filter((l) => selectedIds.has(l.id) && !l.loadError);

    const selectedDirPaths = useMemo(
        () => liveries
            .filter((l) => selectedIds.has(l.id) && !l.loadError)
            .map((l) => l.dirPath),
        [liveries, selectedIds]
    );

    const [scanState, setScanState] = useState<ScanState>('idle');
    const [scanResults, setScanResults] = useState<MetaTextureCfgScanResult[]>([]);
    const [content, setContent] = useState('');
    const [originalContent, setOriginalContent] = useState('');

    const doScan = useCallback(async (dirs: string[], signal: { cancelled: boolean }) => {
        setScanState('scanning');
        setPendingTextureCfg(null);
        try {
            const results = await window.electronAPI!.metaScanTextureCfg(dirs);
            if (signal.cancelled) return;
            const allHaveFile = results.every((r) => r.cfgPaths.length > 0);
            const allContentsMatch =
                allHaveFile &&
                results.every((r) => r.allMatch) &&
                new Set(results.map((r) => r.content ?? '')).size === 1;
            const scanned = allContentsMatch ? (results[0].content ?? '') : '';
            setScanResults(results);
            setContent(scanned);
            setOriginalContent(scanned);
            setScanState('done');
        } catch {
            if (!signal.cancelled) setScanState('idle');
        }
    }, [setPendingTextureCfg]);

    useEffect(() => {
        if (selectedDirPaths.length === 0) {
            setScanState('idle');
            setScanResults([]);
            setContent('');
            setOriginalContent('');
            setPendingTextureCfg(null);
            return;
        }
        const signal = { cancelled: false };
        doScan(selectedDirPaths, signal);
        return () => { signal.cancelled = true; };
    }, [selectedDirPaths, doScan, setPendingTextureCfg]);

    if (selected.length === 0) {
        return (
            <div className={styles.empty}>
                <div className={styles.emptyIcon}><FileText size={40} strokeWidth={1} /></div>
                <p>Select one or more liveries to scan for texture.cfg</p>
                {liveries.length === 0 && <p className={styles.emptySub}>Texture CFG files will be edited in mass to configure liveries for fallback folders</p>}
            </div>
        );
    }

    const handleRevert = () => {
        setContent(originalContent);
        setPendingTextureCfg(null);
    };

    const allHaveFile = scanResults.length > 0 && scanResults.every((r) => r.cfgPaths.length > 0);
    const allContentsMatch =
        allHaveFile &&
        scanResults.every((r) => r.allMatch) &&
        new Set(scanResults.map((r) => r.content ?? '')).size === 1;
    const isEditMode = allContentsMatch;

    return (
        <div className={styles.panel}>
            <div className={styles.panelHeader}>
                <span className={styles.panelTitle}>
                    {selected.length === 1 ? selected[0].dirName : `Editing ${selected.length} liveries`}
                </span>
                <div className={styles.panelActions}>
                    {scanState === 'done' && !isEditMode && (
                        <span className={styles.freshTag}>fresh write</span>
                    )}
                    {pendingTextureCfg && (
                        <button className={styles.revertBtn} onClick={handleRevert}>Revert</button>
                    )}
                </div>
            </div>

            {scanState === 'scanning' && (
                <div className={styles.scanningMsg}>Scanning…</div>
            )}

            {scanState === 'done' && (
                <div className={styles.editorSection}>
                    <div className={styles.editorHeader}>
                        <span className={styles.editorLabel}>texture.cfg</span>
                    </div>
                    <textarea
                        className={styles.textarea}
                        value={content}
                        onChange={(e) => {
                            setContent(e.target.value);
                            setPendingTextureCfg({ content: e.target.value, dirPaths: selectedDirPaths });
                        }}
                        placeholder={isEditMode ? '' : TEXTURE_CFG_PLACEHOLDER}
                        spellCheck={false}
                    />
                </div>
            )}
        </div>
    );
}
