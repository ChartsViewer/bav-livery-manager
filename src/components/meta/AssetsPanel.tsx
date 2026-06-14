import { useState } from 'react';
import { Folder } from 'react-feather';
import { useMetaManifestStore } from '@/store/metaManifestStore';
import type { MetaCopyAssetResult } from '@/types/electron-api';
import styles from './AssetsPanel.module.css';

type AssetType = 'manager-thumbnail' | 'ingame-thumbnail' | 'texture';

const FILTERS: Record<AssetType, { name: string; extensions: string[] }[]> = {
    'manager-thumbnail': [{ name: 'PNG Image', extensions: ['png'] }],
    'ingame-thumbnail': [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg'] }],
    texture: [{ name: 'Texture Files', extensions: ['dds', 'DDS', 'ktx2', 'cfg'] }],
};

function basename(p: string) {
    return p.split(/[\\/]/).pop() ?? p;
}

function FileList({ files }: { files: string[] }) {
    if (files.length === 0) return null;
    return (
        <div className={styles.fileList}>
            {files.map((f) => (
                <span key={f} className={styles.fileTag} title={f}>{basename(f)}</span>
            ))}
        </div>
    );
}

export function MetaAssetsPanel() {
    const { liveries, selectedIds } = useMetaManifestStore();
    const selected = liveries.filter((l) => selectedIds.has(l.id) && !l.loadError);

    const [managerFile, setManagerFile] = useState<string | null>(null);
    const [thumbnailFiles, setThumbnailFiles] = useState<string[]>([]);
    const [textureFiles, setTextureFiles] = useState<string[]>([]);
    const [lastResults, setLastResults] = useState<{ type: AssetType; items: MetaCopyAssetResult[] } | null>(null);
    const [copying, setCopying] = useState<AssetType | null>(null);

    const browse = async (type: AssetType) => {
        const multi = type !== 'manager-thumbnail';
        const files = await window.electronAPI!.metaSelectAssetFiles(FILTERS[type], multi);
        if (files.length === 0) return;
        if (type === 'manager-thumbnail') setManagerFile(files[0]);
        else if (type === 'ingame-thumbnail') setThumbnailFiles(files);
        else setTextureFiles(files);
    };

    const copyAssets = async (type: AssetType) => {
        const files =
            type === 'manager-thumbnail' ? (managerFile ? [managerFile] : [])
                : type === 'ingame-thumbnail' ? thumbnailFiles
                    : textureFiles;
        if (files.length === 0 || selected.length === 0 || copying) return;
        setCopying(type);
        setLastResults(null);
        const items = await window.electronAPI!.metaCopyAssetToLiveries(files, selected.map((l) => l.dirPath), type);
        setLastResults({ type, items });
        setCopying(null);
    };

    const canCopy = (type: AssetType) => {
        const hasFiles =
            type === 'manager-thumbnail' ? !!managerFile
                : type === 'ingame-thumbnail' ? thumbnailFiles.length > 0
                    : textureFiles.length > 0;
        return hasFiles && selected.length > 0 && !copying;
    };

    if (selected.length === 0) {
        return (
            <div className={styles.empty}>
                <div className={styles.emptyIcon}><Folder size={40} strokeWidth={1} /></div>
                <p>Select one or more liveries to copy assets</p>
                {liveries.length === 0 && <p className={styles.emptySub}>Files are routed to the correct folder automatically based on FS20/FS24 structure</p>}
            </div>
        );
    }

    return (
        <div className={styles.panel}>
            <div className={styles.panelHeader}>
                <span className={styles.selectedNote}>
                    {selected.length === 1 ? selected[0].dirName : `Editing ${selected.length} liveries`}
                </span>
            </div>

            <div className={styles.sections}>
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Manager Thumbnail</span>
                        <span className={styles.acceptTag}>PNG</span>
                    </div>
                    <div className={styles.sectionBody}>
                        <p className={styles.sectionDesc}>Placed at the livery root alongside manifest.json. Same location for FS20 and FS24.</p>
                        <div className={styles.fileRow}>
                            <button className={styles.actionBtn} onClick={() => browse('manager-thumbnail')}><Folder size={14} />Browse</button>
                            {managerFile ? (
                                <>
                                    <span className={styles.fileName} title={managerFile}>{basename(managerFile)}</span>
                                    <button className={`${styles.actionBtn} ${styles.clearBtn}`} onClick={() => setManagerFile(null)}>×</button>
                                </>
                            ) : (
                                <span className={styles.filePlaceholder}>No file selected</span>
                            )}
                            <button className={styles.actionBtn} onClick={() => copyAssets('manager-thumbnail')} disabled={!canCopy('manager-thumbnail')}>
                                {copying === 'manager-thumbnail' ? 'Copying…' : `Copy to ${selected.length}`}
                            </button>
                        </div>
                    </div>
                </div>

                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>In-Game Thumbnail</span>
                        <span className={styles.acceptTag}>PNG · JPG</span>
                    </div>
                    <div className={styles.sectionBody}>
                        <p className={styles.sectionDesc}>
                            FS20: <code>SimObjects/.../texture.X-XXXX/</code> &nbsp;·&nbsp; FS24: <code>SimObjects/.../liveries/.../thumbnail/</code>
                        </p>
                        <div className={styles.fileRow}>
                            <button className={styles.actionBtn} onClick={() => browse('ingame-thumbnail')}><Folder size={14} />Browse</button>
                            {thumbnailFiles.length > 0 && <button className={`${styles.actionBtn} ${styles.clearBtn}`} onClick={() => setThumbnailFiles([])}>Clear</button>}
                            {thumbnailFiles.length === 0 && <span className={styles.filePlaceholder}>No files selected</span>}
                            <button className={styles.actionBtn} onClick={() => copyAssets('ingame-thumbnail')} disabled={!canCopy('ingame-thumbnail')}>
                                {copying === 'ingame-thumbnail' ? 'Copying…' : `Copy to ${selected.length}`}
                            </button>
                        </div>
                        <FileList files={thumbnailFiles} />
                    </div>
                </div>

                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Textures</span>
                        <span className={styles.acceptTag}>DDS · KTX2 · cfg</span>
                    </div>
                    <div className={styles.sectionBody}>
                        <p className={styles.sectionDesc}>
                            FS20: <code>SimObjects/.../texture.X-XXXX/</code> &nbsp;·&nbsp; FS24: <code>SimObjects/.../liveries/.../texture/</code>
                        </p>
                        <div className={styles.fileRow}>
                            <button className={styles.actionBtn} onClick={() => browse('texture')}><Folder size={14} />Browse</button>
                            {textureFiles.length > 0 && <button className={`${styles.actionBtn} ${styles.clearBtn}`} onClick={() => setTextureFiles([])}>Clear</button>}
                            {textureFiles.length === 0 && <span className={styles.filePlaceholder}>No files selected</span>}
                            <button className={styles.actionBtn} onClick={() => copyAssets('texture')} disabled={!canCopy('texture')}>
                                {copying === 'texture' ? 'Copying…' : `Copy to ${selected.length}`}
                            </button>
                        </div>
                        <FileList files={textureFiles} />
                    </div>
                </div>

                {lastResults && (
                    <div className={styles.results}>
                        <div className={styles.resultsHeader}>
                            {lastResults.type === 'manager-thumbnail' ? 'Manager Thumbnail'
                                : lastResults.type === 'ingame-thumbnail' ? 'In-Game Thumbnail'
                                    : 'Textures'}{' '}
                            — {lastResults.items.filter((r) => r.success).length}/{lastResults.items.length} succeeded
                        </div>
                        <div className={styles.resultsList}>
                            {lastResults.items.map((item) => (
                                <div key={item.liveryName} className={styles.resultRow}>
                                    <span className={`${styles.resultIcon} ${item.success ? styles.resultSuccess : styles.resultError}`}>
                                        {item.success ? '✓' : '✗'}
                                    </span>
                                    <span className={styles.resultName} title={item.liveryName}>{item.liveryName}</span>
                                    <span className={styles.resultTarget} title={item.error ?? item.targetDir ?? ''}>
                                        {item.error ?? item.targetDir ?? ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
