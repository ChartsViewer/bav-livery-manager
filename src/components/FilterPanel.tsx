import {useState} from 'react';
import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import styles from './FilterPanel.module.css';
import type {FilterKey, FilterState} from '@/store/filterStore';

export type {FilterKey, FilterState};

export interface ChipOption {
    value: string;
    label: string;
    hint?: string | null;
}

export interface FilterCounts {
    developer: Map<string, number>;
    aircraft: Map<string, number>;
    engine: Map<string, number>;
    category: Map<string, number>;
    totals: { developer: number; aircraft: number; engine: number; category: number };
}

interface FilterPanelProps {
    filters: FilterState;
    developerOptions: ChipOption[];
    aircraftOptions: ChipOption[];
    engineOptions: string[];
    categoryOptions: ChipOption[];
    filterCounts: FilterCounts;
    onFilterChange: (key: FilterKey, value: string) => void;
}

const ChevronDown = () => (
    <svg className={styles.chevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M6 9l6 6 6-6"/>
    </svg>
);

const CheckIcon = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
        <path d="M20 6L9 17l-5-5"/>
    </svg>
);

interface FilterItemProps {
    itemKey: string;
    label: string;
    filterKey: FilterKey;
    options: ChipOption[];
    activeValue: string;
    counts: Map<string, number>;
    total: number;
    onSelect: (key: FilterKey, value: string) => void;
}

const FilterItem = ({itemKey, label, filterKey, options, activeValue, counts, total, onSelect}: FilterItemProps) => {
    const isFiltered = activeValue !== 'all';
    const activeLabel = isFiltered ? (options.find((o) => o.value === activeValue)?.label ?? activeValue) : null;

    return (
        <NavigationMenu.Item value={itemKey} className={styles.navItem}>
            <NavigationMenu.Trigger className={`${styles.trigger} ${isFiltered ? styles.triggerFiltered : ''}`}>
                <span className={styles.triggerName}>{label}</span>
                {activeLabel && <span className={styles.triggerValue}>· {activeLabel}</span>}
                <ChevronDown/>
            </NavigationMenu.Trigger>

            <NavigationMenu.Content className={styles.content}>
                <ul className={styles.optionList} role="listbox" aria-label={label}>
                    <li>
                        <button
                            type="button"
                            role="option"
                            aria-selected={activeValue === 'all'}
                            className={`${styles.option} ${activeValue === 'all' ? styles.optionSelected : ''}`}
                            onClick={() => onSelect(filterKey, 'all')}
                        >
                            <span className={styles.optionCheck}>{activeValue === 'all' && <CheckIcon/>}</span>
                            <span className={styles.optionLabel}>All {label}s</span>
                            <span className={styles.optionCount}>{total}</span>
                        </button>
                    </li>
                    {options.map((opt) => {
                        const count = counts.get(opt.value) ?? 0;
                        const selected = activeValue === opt.value;
                        return (
                            <li key={opt.value}>
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={selected}
                                    className={`${styles.option} ${selected ? styles.optionSelected : ''} ${count === 0 ? styles.optionEmpty : ''}`}
                                    onClick={() => onSelect(filterKey, opt.value)}
                                    title={opt.hint ?? undefined}
                                >
                                    <span className={styles.optionCheck}>{selected && <CheckIcon/>}</span>
                                    <span className={styles.optionLabel}>{opt.label}</span>
                                    <span className={styles.optionCount}>{count}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </NavigationMenu.Content>
        </NavigationMenu.Item>
    );
};

export const FilterPanel = ({
    filters,
    developerOptions,
    aircraftOptions,
    engineOptions,
    categoryOptions,
    filterCounts,
    onFilterChange,
}: FilterPanelProps) => {
    const [menuValue, setMenuValue] = useState('');

    const handleSelect = (key: FilterKey, value: string) => {
        onFilterChange(key, value);
        setMenuValue('');
    };

    const engineChipOptions: ChipOption[] = engineOptions.map((eng) => ({value: eng, label: eng}));

    return (
        <NavigationMenu.Root value={menuValue} onValueChange={setMenuValue} className={styles.navRoot}>
            <NavigationMenu.List className={styles.navList}>
                <FilterItem
                    itemKey="developer"
                    label="Developer"
                    filterKey="developer"
                    options={developerOptions}
                    activeValue={filters.developer}
                    counts={filterCounts.developer}
                    total={filterCounts.totals.developer}
                    onSelect={handleSelect}
                />
                <FilterItem
                    itemKey="aircraft"
                    label="Aircraft"
                    filterKey="aircraft"
                    options={aircraftOptions}
                    activeValue={filters.aircraft}
                    counts={filterCounts.aircraft}
                    total={filterCounts.totals.aircraft}
                    onSelect={handleSelect}
                />
                <FilterItem
                    itemKey="category"
                    label="Subsidiary"
                    filterKey="category"
                    options={categoryOptions}
                    activeValue={filters.category}
                    counts={filterCounts.category}
                    total={filterCounts.totals.category}
                    onSelect={handleSelect}
                />
                {engineOptions.length > 0 && (
                    <FilterItem
                        itemKey="engine"
                        label="Engine"
                        filterKey="engine"
                        options={engineChipOptions}
                        activeValue={filters.engine}
                        counts={filterCounts.engine}
                        total={filterCounts.totals.engine}
                        onSelect={handleSelect}
                    />
                )}
            </NavigationMenu.List>
        </NavigationMenu.Root>
    );
};
