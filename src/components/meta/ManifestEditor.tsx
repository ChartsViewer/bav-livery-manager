import { useCallback, useState } from 'react';
import { Clipboard } from 'react-feather';
import { useMetaManifestStore, getNestedValue } from '@/store/metaManifestStore';
import { useMetaDbStore } from '@/store/metaDbStore';
import type { Manifest } from '@/types/metaManifest';
import styles from './ManifestEditor.module.css';

const MIXED = Symbol('mixed');

interface FieldDef {
    keyPath: string;
    label: string;
    type: 'text' | 'textarea' | 'array';
    placeholder?: string;
    autoFilled?: boolean;
}

const MSFS_FIELDS: FieldDef[] = [
    { keyPath: 'content_type', label: 'Content Type', type: 'text', placeholder: 'LIVERY' },
    { keyPath: 'title', label: 'Title', type: 'text' },
    { keyPath: 'manufacturer', label: 'Manufacturer', type: 'text' },
    { keyPath: 'creator', label: 'Creator', type: 'text' },
    { keyPath: 'package_version', label: 'Package Version', type: 'text', placeholder: '1.0.0' },
    { keyPath: 'minimum_game_version', label: 'Min Game Version', type: 'text', placeholder: '1.18.13' },
    { keyPath: 'minimum_compatibility_version', label: 'Min Compat Version', type: 'text' },
    { keyPath: 'builder', label: 'Builder', type: 'text' },
    { keyPath: 'dependencies', label: 'Dependencies', type: 'array', placeholder: 'Comma-separated package names' },
];

const MANAGER_FIELDS: FieldDef[] = [
    { keyPath: 'managerData.name', label: 'Name (Registration)', type: 'text', autoFilled: true },
    { keyPath: 'managerData.aircraft', label: 'Aircraft Type', type: 'text', autoFilled: true },
    { keyPath: 'managerData.engine', label: 'Engine', type: 'text', autoFilled: true },
    { keyPath: 'managerData.year', label: 'Year', type: 'text', autoFilled: true },
    { keyPath: 'managerData.category', label: 'Category', type: 'text', autoFilled: true },
    { keyPath: 'managerData.developer', label: 'Developer', type: 'text', placeholder: 'e.g. Fenix, PMDG, FBW' },
    { keyPath: 'managerData.simulator', label: 'Simulator', type: 'text', placeholder: 'e.g. FS20, FS24' },
    { keyPath: 'managerData.resolution', label: 'Resolution', type: 'text', placeholder: 'e.g. 4K, 8K' },
    { keyPath: 'managerData.requiredPackages', label: 'Required Packages', type: 'array', placeholder: 'Comma-separated package names' },
];

function getEffectiveValue(manifests: Manifest[], keyPath: string): string | typeof MIXED {
    if (manifests.length === 0) return '';
    const isArray = keyPath === 'dependencies' || keyPath === 'managerData.requiredPackages';
    const values = manifests.map((m) => {
        const v = getNestedValue(m, keyPath);
        if (isArray && Array.isArray(v)) return v.join(', ');
        if (v == null) return '';
        return String(v);
    });
    const first = values[0];
    return values.every((v) => v === first) ? first : MIXED;
}

export function MetaManifestEditor() {
    const { liveries, selectedIds, updateField, revertSelected, applyAutoFill } = useMetaManifestStore();
    const { lookup } = useMetaDbStore();
    const [isAutoFilling, setIsAutoFilling] = useState(false);
    const [autoFillResults, setAutoFillResults] = useState<string | null>(null);

    const selected = liveries.filter((l) => selectedIds.has(l.id));
    const selectedManifests = selected.map((l) => l.manifest);
    const hasChanges = selected.some((l) => l.hasChanges);
    const hasSelected = selected.length > 0;

    const handleChange = useCallback(
        (keyPath: string, rawValue: string, isArray: boolean) => {
            const value = isArray ? rawValue.split(',').map((s) => s.trim()).filter(Boolean) : rawValue;
            updateField(keyPath, value);
        },
        [updateField]
    );

    const handleAutoFill = async () => {
        setIsAutoFilling(true);
        setAutoFillResults(null);
        let filled = 0;
        let notFound = 0;
        for (const livery of selected) {
            const reg = await window.electronAPI!.metaFindRegistration(livery.dirPath);
            if (!reg) { notFound++; continue; }
            const record = lookup(reg);
            if (!record) { notFound++; continue; }
            applyAutoFill(livery.id, record, reg);
            filled++;
        }
        setIsAutoFilling(false);
        if (filled > 0 || notFound > 0) {
            setAutoFillResults(
                notFound === 0
                    ? `Auto-filled ${filled} livery${filled !== 1 ? 's' : ''}`
                    : `Filled ${filled}, not found in DB: ${notFound}`
            );
            setTimeout(() => setAutoFillResults(null), 4000);
        }
    };

    if (!hasSelected) {
        return (
            <div className={styles.empty}>
                <div className={styles.emptyIcon}><Clipboard size={40} strokeWidth={1} /></div>
                <p>Select one or more liveries to edit their manifest</p>
                {liveries.length === 0 && <p className={styles.emptySub}>Manifest JSON files will be edited in mass. Airframe details can be populated with the auto-fill feature</p>}
            </div>
        );
    }

    return (
        <div className={styles.editor}>
            <div className={styles.editorHeader}>
                <div className={styles.editorMeta}>
                    {selected.length === 1 ? (
                        <span className={styles.editorTitle}>{selected[0].dirName}</span>
                    ) : (
                        <span className={styles.editorTitle}>Editing {selected.length} liveries</span>
                    )}
                    {hasChanges && <span className={styles.unsavedBadge}>Unsaved changes</span>}
                </div>
                {hasChanges && (
                    <div className={styles.editorActions}>
                        <button className={styles.revertBtn} onClick={revertSelected}>Revert</button>
                    </div>
                )}
            </div>

            <div className={styles.fields}>
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>MSFS Manifest</span>
                    </div>
                    <div className={styles.sectionFields}>
                        {MSFS_FIELDS.map((field) => renderField(field, selectedManifests, handleChange))}
                    </div>
                </div>

                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionTitle}>Manager Data</span>
                        <div className={styles.autoFillGroup}>
                            {autoFillResults && <span className={styles.autoFillResult}>{autoFillResults}</span>}
                            <button
                                className={styles.autoFillBtn}
                                onClick={handleAutoFill}
                                disabled={isAutoFilling}
                                title="Search each livery folder for aircraft.cfg / livery.cfg, extract the registration, and fill from the database"
                            >
                                {isAutoFilling ? 'Searching…' : '⚡ Auto-fill from cfg'}
                            </button>
                        </div>
                    </div>
                    <div className={styles.sectionFields}>
                        {MANAGER_FIELDS.map((field) => renderField(field, selectedManifests, handleChange))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function renderField(
    field: FieldDef,
    selectedManifests: Manifest[],
    handleChange: (keyPath: string, rawValue: string, isArray: boolean) => void
) {
    const effective = getEffectiveValue(selectedManifests, field.keyPath);
    const isMixed = effective === MIXED;
    const displayValue = isMixed ? '' : (effective as string);

    return (
        <div key={field.keyPath} className={styles.field}>
            <label className={styles.label} htmlFor={field.keyPath}>
                {field.label}
                {field.autoFilled && <span className={styles.autoTag}>auto</span>}
                {isMixed && <span className={styles.mixedTag}>mixed</span>}
            </label>
            {field.type === 'textarea' ? (
                <textarea
                    id={field.keyPath}
                    className={`${styles.input} ${styles.textarea} ${isMixed ? styles.inputMixed : ''}`}
                    value={displayValue}
                    placeholder={isMixed ? '(mixed – type to override all)' : (field.placeholder ?? '')}
                    onChange={(e) => handleChange(field.keyPath, e.target.value, false)}
                    rows={3}
                />
            ) : (
                <input
                    id={field.keyPath}
                    className={`${styles.input} ${isMixed ? styles.inputMixed : ''}`}
                    type="text"
                    value={displayValue}
                    placeholder={isMixed ? '(mixed – type to override all)' : (field.placeholder ?? '')}
                    onChange={(e) => handleChange(field.keyPath, e.target.value, field.type === 'array')}
                />
            )}
        </div>
    );
}
