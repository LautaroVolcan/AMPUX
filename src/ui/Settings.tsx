import { useT } from '../i18n';
import type { ProjectSettings } from '../types';
import type { Prefs } from './prefs';
import { Modal } from './Dialogs';

interface Props {
  settings: ProjectSettings;
  onSettings: (s: ProjectSettings) => void;
  prefs: Prefs;
  onPrefs: (p: Partial<Prefs>) => void;
  onClose: () => void;
}

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg text">
      {options.map(([v, label]) => (
        <button key={String(v)} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function SettingsDialog({ settings, onSettings, prefs, onPrefs, onClose }: Props) {
  const t = useT();
  const s = t.settings;
  const set = (patch: Partial<ProjectSettings>) => onSettings({ ...settings, ...patch });
  return (
    <Modal title={s.title} onClose={onClose} wide>
      <div className="settings">
        <div className="row">
          <span>{s.pageSize}</span>
          <Seg value={settings.pageSize} options={[['letter', 'Letter'], ['a4', 'A4']]} onChange={(v) => set({ pageSize: v })} />
        </div>
        <div className="row">
          <span>{s.sceneNumbers}</span>
          <Seg
            value={settings.sceneNumbers}
            options={[['none', s.sceneNumbersNone], ['left', s.sceneNumbersLeft], ['both', s.sceneNumbersBoth]]}
            onChange={(v) => set({ sceneNumbers: v })}
          />
        </div>
        <div className="row">
          <span>{s.sceneSpacing}</span>
          <Seg value={settings.sceneSpacing} options={[[1, '1'], [2, '2']]} onChange={(v) => set({ sceneSpacing: v })} />
        </div>
        <div className="row">
          <span>{s.language}</span>
          <Seg value={settings.language} options={[['es', 'Español'], ['en', 'English']]} onChange={(v) => set({ language: v })} />
        </div>
        <label className="row check">
          <span>{s.moreContd}</span>
          <input type="checkbox" checked={settings.showMoreContd} onChange={(e) => set({ showMoreContd: e.target.checked })} />
        </label>
        <label className="row check">
          <span>{s.autoContd}</span>
          <input type="checkbox" checked={settings.autoContd} onChange={(e) => set({ autoContd: e.target.checked })} />
        </label>
        <label className="row check">
          <span>{s.lockedNumbers}</span>
          <input type="checkbox" checked={settings.lockedNumbers} onChange={(e) => set({ lockedNumbers: e.target.checked })} />
        </label>

        <hr />

        <div className="row">
          <span>{s.uiLanguage}</span>
          <Seg value={prefs.uiLang} options={[['es', 'Español'], ['en', 'English']]} onChange={(v) => onPrefs({ uiLang: v })} />
        </div>
        <div className="row">
          <span>{s.theme}</span>
          <Seg value={prefs.theme} options={[['system', s.system], ['light', s.light], ['dark', s.dark]]} onChange={(v) => onPrefs({ theme: v })} />
        </div>
        <label className="row check">
          <span>{s.typeLabels}</span>
          <input type="checkbox" checked={prefs.typeLabels} onChange={(e) => onPrefs({ typeLabels: e.target.checked })} />
        </label>

        <hr />
        <h3 className="sub">{s.shortcuts}</h3>
        <dl className="shortcuts">
          {t.shortcuts.map(([k, v]) => (
            <div key={k}>
              <dt><kbd>{k}</kbd></dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  );
}
