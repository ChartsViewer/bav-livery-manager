import { useCallback, useEffect, useRef, useState } from 'react';
import { useMetaManifestStore } from '@/store/metaManifestStore';
import { useMetaDbStore } from '@/store/metaDbStore';
import { useMetaFinaliserStore } from '@/store/metaFinaliserStore';
import { MetaLiveryList } from '@/components/meta/LiveryList';
import { MetaManifestEditor } from '@/components/meta/ManifestEditor';
import { MetaAssetsPanel } from '@/components/meta/AssetsPanel';
import { MetaTextureConfigPanel } from '@/components/meta/TextureConfigPanel';
import type { AircraftRecord } from '@/types/metaManifest';
import { Folder, Plus, Search, Play } from 'react-feather';
import styles from './MetaEditorPage.module.css';

type MainTab = 'editor' | 'database' | 'finaliser';
type EditorTab = 'manifest' | 'assets' | 'texture';

const EMPTY_RECORD: AircraftRecord = { registration: '', aircraftType: '', engine: '', category: '', year: '', livery: '' };

function DatabaseTab() {
    const { records, isLoaded, loadError, load, upsert, remove, save } = useMetaDbStore();
    const [search, setSearch] = useState('');
    const [editingReg, setEditingReg] = useState<string | null>(null);
    const [form, setForm] = useState<AircraftRecord>(EMPTY_RECORD);
    const [isAdding, setIsAdding] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);

    const filtered = records.filter(
        (r) =>
            r.registration.toLowerCase().includes(search.toLowerCase()) ||
            r.aircraftType.toLowerCase().includes(search.toLowerCase()) ||
            r.category.toLowerCase().includes(search.toLowerCase()) ||
            r.livery.toLowerCase().includes(search.toLowerCase())
    );

    function startEdit(record: AircraftRecord) { setEditingReg(record.registration); setForm({ ...record }); setIsAdding(false); }
    function startAdd() { setIsAdding(true); setEditingReg(null); setForm(EMPTY_RECORD); }
    function cancelEdit() { setEditingReg(null); setIsAdding(false); setForm(EMPTY_RECORD); }
    function commitEdit() { if (!form.registration.trim()) return; upsert(form); cancelEdit(); }

    async function handleSave() {
        setIsSaving(true);
        const ok = await save();
        setIsSaving(false);
        setSaveMsg(ok ? 'Saved' : 'Save failed');
        setTimeout(() => setSaveMsg(null), 2500);
    }

    return (
        <div className={styles.dbPage}>
            {loadError && (
                <div className={styles.errorBar}>
                    <span>Failed to load database: {loadError}</span>
                    <button className={styles.dismissBtn} onClick={() => load()}>Retry</button>
                </div>
            )}

            <div className={styles.dbToolbar}>
                <input
                    className={styles.dbSearch}
                    type="text"
                    placeholder="Search registrations, aircraft, category…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <span className={styles.dbCount}>{filtered.length} of {records.length}</span>
                <button className={styles.addBtn} onClick={startAdd} disabled={!isLoaded}>+ Add Entry</button>
                <button className={styles.saveDbBtn} onClick={handleSave} disabled={isSaving || !isLoaded}>
                    {isSaving ? 'Saving…' : 'Save DB'}
                </button>
                {saveMsg && <span className={styles.saveMsg}>{saveMsg}</span>}
            </div>

            {isAdding && (
                <div className={styles.formRow}>
                    <FormFields form={form} onChange={setForm} />
                    <button className={styles.commitBtn} onClick={commitEdit}>Add</button>
                    <button className={styles.formCancelBtn} onClick={cancelEdit}>Cancel</button>
                </div>
            )}

            <div className={styles.tableWrap}>
                {!isLoaded ? (
                    <div className={styles.noResults}>Loading aircraft database…</div>
                ) : (
                    <>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Registration</th><th>Aircraft</th><th>Engine</th>
                                    <th>Category</th><th>Year</th><th>Livery</th><th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((record) =>
                                    editingReg === record.registration ? (
                                        <tr key={record.registration} className={styles.editRow}>
                                            <td colSpan={6}>
                                                <div className={styles.formRow}>
                                                    <FormFields form={form} onChange={setForm} />
                                                </div>
                                            </td>
                                            <td>
                                                <div className={styles.rowActions}>
                                                    <button className={styles.commitBtn} onClick={commitEdit}>Save</button>
                                                    <button className={styles.formCancelBtn} onClick={cancelEdit}>Cancel</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        <tr key={record.registration}>
                                            <td className={styles.regCell}>{record.registration}</td>
                                            <td>{record.aircraftType}</td>
                                            <td>{record.engine}</td>
                                            <td>
                                                <span className={`${styles.catBadge} ${styles[`cat_${record.category.toLowerCase()}`]}`}>
                                                    {record.category}
                                                </span>
                                            </td>
                                            <td>{record.year}</td>
                                            <td className={styles.liveryCell}>{record.livery}</td>
                                            <td>
                                                <div className={styles.rowActions}>
                                                    <button className={styles.editBtn} onClick={() => startEdit(record)}>Edit</button>
                                                    <button className={styles.deleteBtn} onClick={() => remove(record.registration)}>×</button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                )}
                            </tbody>
                        </table>
                        {filtered.length === 0 && <div className={styles.noResults}>No records match your search</div>}
                    </>
                )}
            </div>
        </div>
    );
}

interface FormFieldsProps { form: AircraftRecord; onChange: (r: AircraftRecord) => void; }
function FormFields({ form, onChange }: FormFieldsProps) {
    function set(key: keyof AircraftRecord, value: string) { onChange({ ...form, [key]: value }); }
    return (
        <div className={styles.formFields}>
            <input className={styles.formInput} placeholder="Registration" value={form.registration} onChange={(e) => set('registration', e.target.value)} />
            <input className={styles.formInput} placeholder="Aircraft Type" value={form.aircraftType} onChange={(e) => set('aircraftType', e.target.value)} />
            <input className={styles.formInput} placeholder="Engine" value={form.engine} onChange={(e) => set('engine', e.target.value)} />
            <select className={styles.formSelect} value={form.category} onChange={(e) => set('category', e.target.value)}>
                <option value="">Category</option>
                <option value="Mainline">Mainline</option>
                <option value="Euroflyer">Euroflyer</option>
                <option value="Cityflyer">Cityflyer</option>
            </select>
            <input className={styles.formInput} placeholder="Year" value={form.year} onChange={(e) => set('year', e.target.value)} />
            <input className={styles.formInput} placeholder="Livery" value={form.livery} onChange={(e) => set('livery', e.target.value)} style={{ flex: 2 }} />
        </div>
    );
}

function FinaliserTab() {
    const { workspaceDir, setWorkspaceDir, logs, clearLogs, running, setRunning } = useMetaFinaliserStore();
    const [copied, setCopied] = useState(false);
    const logBodyRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logBodyRef.current) logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight;
    }, [logs]);

    const handleSelectWorkspace = async () => {
        const dir = await window.electronAPI!.metaSelectWorkspaceDirectory();
        if (dir) setWorkspaceDir(dir);
    };

    const runLayouts = useCallback(async () => {
        if (!workspaceDir) return;
        await window.electronAPI!.metaRunLayoutGenerator(workspaceDir);
    }, [workspaceDir]);

    const runZips = useCallback(async () => {
        if (!workspaceDir) return;
        await window.electronAPI!.metaRunZipPackages(workspaceDir);
    }, [workspaceDir]);

    const handleRunLayouts = async () => {
        if (running || !workspaceDir) return;
        setRunning(true);
        try { await runLayouts(); } finally { setRunning(false); }
    };

    const handleRunZips = async () => {
        if (running || !workspaceDir) return;
        setRunning(true);
        try { await runZips(); } finally { setRunning(false); }
    };

    const handleRunAll = async () => {
        if (running || !workspaceDir) return;
        setRunning(true);
        try { await runLayouts(); await runZips(); } finally { setRunning(false); }
    };

    const handleCancel = () => window.electronAPI!.metaCancelFinaliser();

    const copyLog = async () => {
        if (logs.length === 0) return;
        await navigator.clipboard.writeText(logs.join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const canRun = !!workspaceDir && !running;

    return (
        <div className={styles.finaliserPage}>
            <div className={styles.finaliserHeader}>
                <p className={styles.finaliserTitle}>Livery Finaliser</p>
                <p className={styles.finaliserSub}>
                    Recursively finds all livery packages, regenerates layout.json files, and zips each package next to its source folder
                </p>
            </div>

            <div className={styles.finaliserBody}>
                <div className={styles.finaliserControls}>
                    <div className={styles.card}>
                        <div className={styles.cardHeader}><span className={styles.cardTitle}>Workspace</span></div>
                        <div className={styles.cardBody}>
                            <div className={styles.dirRow}>
                                <span className={styles.dirLabel}>Root Directory</span>
                                <span className={`${styles.dirPath} ${!workspaceDir ? styles.dirPathEmpty : ''}`}>
                                    {workspaceDir ?? 'No directory selected'}
                                </span>
                                <button className={styles.actionBtn} onClick={handleSelectWorkspace} disabled={running}>
                                    <Folder size={20} />
                                    <p>Browse</p>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className={styles.stepsRow}>
                        <div className={styles.step}>
                            <div className={styles.stepHeader}>
                                <span className={styles.stepNum}>1</span>
                                <span className={styles.stepTitle}>Generate Layouts</span>
                            </div>
                            <div className={styles.stepBody}>
                                <p className={styles.stepDesc}>Recursively finds every package with a layout.json and runs MSFSLayoutGenerator.exe to regenerate it.</p>
                                <button className={styles.actionBtn} onClick={handleRunLayouts} disabled={!canRun}>Run Step 1</button>
                            </div>
                        </div>
                        <div className={styles.step}>
                            <div className={styles.stepHeader}>
                                <span className={styles.stepNum}>2</span>
                                <span className={styles.stepTitle}>Zip Packages</span>
                            </div>
                            <div className={styles.stepBody}>
                                <p className={styles.stepDesc}>Recursively finds every package with a layout.json and zips its contents next to the source folder.</p>
                                <button className={styles.actionBtn} onClick={handleRunZips} disabled={!canRun}>Run Step 2</button>
                            </div>
                        </div>
                    </div>

                    <div className={styles.actionsRow}>
                        <button className={styles.actionBtn} onClick={handleRunAll} disabled={!canRun}>
                            {running && <span className={styles.runningDot} />}
                            {running ? 'Running…' : <><Play size={20} /><p>Run All</p></>}
                        </button>
                        {running && <button className={styles.cancelBtn} onClick={handleCancel}>Cancel</button>}
                    </div>
                </div>

                <div className={styles.logCard}>
                    <div className={styles.logHeader}>
                        <span className={styles.logTitle}>Output Log</span>
                        <div className={styles.logHeaderBtns}>
                            <button className={styles.logHeaderBtn} onClick={copyLog} disabled={logs.length === 0}>
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                            <button className={styles.logHeaderBtn} onClick={clearLogs} disabled={running}>Clear</button>
                        </div>
                    </div>
                    <div className={styles.logBody} ref={logBodyRef}>
                        {logs.length === 0 ? (
                            <span className={styles.logEmpty}>No output yet — select a root directory and run a step.</span>
                        ) : (
                            logs.map((line, i) => (
                                <div key={i} className={styles.logLine}>
                                    {line.includes('✓') ? (
                                        <span className={styles.logSuccess}>{line}</span>
                                    ) : line.includes('✗') || line.toUpperCase().includes('ERROR') || line.toUpperCase().includes('CANCELLED') ? (
                                        <span className={styles.logError}>{line}</span>
                                    ) : line}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function EditorTab() {
    const { addLiveries, saveAll, clearAll, isSaving, saveErrors, clearSaveErrors, liveries, pendingTextureCfg } = useMetaManifestStore();
    const [editorTab, setEditorTab] = useState<EditorTab>('manifest');

    const hasChanges = liveries.some((l) => l.hasChanges) || pendingTextureCfg !== null;
    const changedCount = liveries.filter((l) => l.hasChanges).length;

    async function handleAddDirectories() {
        const paths = await window.electronAPI!.metaSelectLiveryDirectories();
        if (paths.length > 0) await addLiveries(paths);
    }

    async function handleScanParent() {
        const paths = await window.electronAPI!.metaScanParentDirectory();
        if (paths.length > 0) await addLiveries(paths);
    }

    return (
        <div className={styles.editorPage}>
            <header className={styles.editorToolbar}>
                <button className={styles.btn} onClick={handleAddDirectories}><Plus size={13} />Add Liveries</button>
                <button className={styles.btnSecondary} onClick={handleScanParent}><Search size={13} />Scan Folder</button>
                {liveries.length > 0 && (
                    <>
                        <button className={styles.btnSaveAll} onClick={saveAll} disabled={!hasChanges || isSaving}>
                            {isSaving ? 'Saving…' : `Save All${changedCount > 0 ? ` (${changedCount})` : ''}`}
                        </button>
                        <button className={styles.btnDanger} onClick={clearAll}>Clear</button>
                    </>
                )}
            </header>

            {saveErrors.length > 0 && (
                <div className={styles.errorBar}>
                    <span>Save failed for: {saveErrors.join(', ')}</span>
                    <button className={styles.dismissBtn} onClick={clearSaveErrors}>×</button>
                </div>
            )}

            <div className={styles.editorBody}>
                <MetaLiveryList />
                <div className={styles.editorPanel}>
                    <div className={styles.editorTabs}>
                        <button
                            className={`${styles.editorTab} ${editorTab === 'manifest' ? styles.editorTabActive : ''}`}
                            onClick={() => setEditorTab('manifest')}
                        >
                            Manifest
                        </button>
                        <button
                            className={`${styles.editorTab} ${editorTab === 'assets' ? styles.editorTabActive : ''}`}
                            onClick={() => setEditorTab('assets')}
                        >
                            Assets
                        </button>
                        <button
                            className={`${styles.editorTab} ${editorTab === 'texture' ? styles.editorTabActive : ''}`}
                            onClick={() => setEditorTab('texture')}
                        >
                            Texture Config
                        </button>
                    </div>
                    {editorTab === 'manifest' && <MetaManifestEditor />}
                    {editorTab === 'assets' && <MetaAssetsPanel />}
                    {editorTab === 'texture' && <MetaTextureConfigPanel />}
                </div>
            </div>
        </div>
    );
}

const TAB_LABELS: Record<MainTab, string> = {
    editor: 'Editor',
    database: 'Database',
    finaliser: 'Finaliser',
};

export function MetaEditorPage() {
    const [tab, setTab] = useState<MainTab>('editor');
    const { load, isLoaded } = useMetaDbStore();
    const addLog = useMetaFinaliserStore((s) => s.addLog);

    useEffect(() => {
        if (!isLoaded) load();
    }, [isLoaded, load]);

    useEffect(() => {
        window.electronAPI!.onMetaFinaliserLog(addLog);
        return () => window.electronAPI!.removeMetaFinaliserLogListeners();
    }, [addLog]);

    return (
        <div className={styles.page}>
            <div className={styles.pageHeader}>
                <div className={styles.headerLeft}>
                    <h1>Meta Editor</h1>
                    <p className={styles.subtitle}>Edit manifests, manage the aircraft database, and package liveries</p>
                </div>
                <div className={styles.tabRow}>
                    {(Object.keys(TAB_LABELS) as MainTab[]).map((t) => (
                        <button
                            key={t}
                            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
                            onClick={() => setTab(t)}
                        >
                            {TAB_LABELS[t]}
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.content}>
                {tab === 'editor' && <EditorTab />}
                {tab === 'database' && <DatabaseTab />}
                {tab === 'finaliser' && <FinaliserTab />}
            </div>
        </div>
    );
}
