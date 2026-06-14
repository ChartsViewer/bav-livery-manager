import { useState } from 'react';
import { useMetaManifestStore } from '@/store/metaManifestStore';
import { CheckboxChecked } from '@/components/Icons/CheckboxChecked';
import { CheckboxEmpty } from '@/components/Icons/CheckboxEmpty';
import styles from './LiveryList.module.css';

export function MetaLiveryList() {
    const { liveries, selectedIds, toggleSelect, selectAll, selectNone, removeLivery } = useMetaManifestStore();
    const [search, setSearch] = useState('');

    const query = search.trim().toLowerCase();
    const filtered = query
        ? liveries.filter((l) => {
              const title = (l.manifest.title as string | undefined)?.toLowerCase() ?? '';
              return l.dirName.toLowerCase().includes(query) || title.includes(query);
          })
        : liveries;

    return (
        <aside className={styles.sidebar}>
            <div className={styles.header}>
                <span className={styles.title}>Liveries</span>
                <span className={styles.count}>{liveries.length}</span>
            </div>

            <div className={styles.searchBar}>
                <input
                    className={styles.searchInput}
                    type="text"
                    placeholder="Search…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                    <button className={styles.clearBtn} onClick={() => setSearch('')}>×</button>
                )}
            </div>

            {liveries.length > 0 && (
                <div className={styles.selectionBar}>
                    <button className={styles.linkBtn} onClick={selectAll}>All</button>
                    <span className={styles.divider}>·</span>
                    <button className={styles.linkBtn} onClick={selectNone}>None</button>
                    <span className={styles.selectedCount}>
                        {selectedIds.size > 0 && `${selectedIds.size} selected`}
                    </span>
                </div>
            )}

            <ul className={styles.list}>
                {liveries.length === 0 ? (
                    <li className={styles.empty}><span>Add liveries via the <span className={styles.emphasis}>Add Liveries</span> button, or scan a directory for liveries using the <span className={styles.emphasis}>Scan Folder</span> button</span></li>
                ) : (
                    <>
                        {filtered.map((livery) => {
                            const isSelected = selectedIds.has(livery.id);
                            return (
                                <li
                                    key={livery.id}
                                    className={`${styles.item} ${isSelected ? styles.itemSelected : ''} ${livery.loadError ? styles.itemError : ''}`}
                                    onClick={() => toggleSelect(livery.id)}
                                >
                                    <span className={styles.checkbox}>
                                        {isSelected ? <CheckboxChecked /> : <CheckboxEmpty />}
                                    </span>
                                    <span className={styles.itemContent}>
                                        <span className={styles.dirName} title={livery.dirPath}>{livery.dirName}</span>
                                        {livery.manifest.title && livery.manifest.title !== livery.dirName && (
                                            <span className={styles.manifestTitle}>{livery.manifest.title as string}</span>
                                        )}
                                        {livery.loadError && <span className={styles.errorBadge}>No manifest</span>}
                                        {livery.hasChanges && !livery.loadError && <span className={styles.changeBadge}>●</span>}
                                    </span>
                                    <button
                                        className={styles.removeBtn}
                                        title="Remove from list"
                                        onClick={(e) => { e.stopPropagation(); removeLivery(livery.id); }}
                                    >
                                        ×
                                    </button>
                                </li>
                            );
                        })}
                        {filtered.length === 0 && (
                            <li className={styles.noResults}>No matches for "{search}"</li>
                        )}
                    </>
                )}
            </ul>
        </aside>
    );
}
