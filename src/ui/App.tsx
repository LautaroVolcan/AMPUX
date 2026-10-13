import { useEffect, useState } from 'react';
import { I18nContext, dictionaries } from '../i18n';
import { usePrefs } from './prefs';
import { Home } from './Home';
import { ProjectView } from './ProjectView';

function projectFromHash() {
  const m = /^#\/p\/(.+)$/.exec(location.hash);
  return m ? decodeURIComponent(m[1]) : null;
}

export function App() {
  const [prefs, setPrefs] = usePrefs();
  const [projectId, setProjectId] = useState<string | null>(projectFromHash);

  useEffect(() => {
    const onHash = () => setProjectId(projectFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prefs.theme);
    root.lang = prefs.uiLang;
  }, [prefs.theme, prefs.uiLang]);

  const open = (id: string | null) => {
    location.hash = id ? `#/p/${encodeURIComponent(id)}` : '';
    setProjectId(id);
  };

  return (
    <I18nContext.Provider value={dictionaries[prefs.uiLang]}>
      {projectId ? (
        <ProjectView key={projectId} projectId={projectId} prefs={prefs} setPrefs={setPrefs} onClose={() => open(null)} />
      ) : (
        <Home onOpen={open} />
      )}
    </I18nContext.Provider>
  );
}
