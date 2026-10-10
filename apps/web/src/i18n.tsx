import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { kk } from './i18n-kk';

/** The public site speaks Russian (default) and Kazakh; the admin stays in Russian. */
export type Lang = 'ru' | 'kk';
const KEY = 'lang';
function initial(): Lang {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (fromUrl === 'kk' || fromUrl === 'ru') return fromUrl;
    return localStorage.getItem(KEY) === 'kk' ? 'kk' : 'ru';
  } catch {
    return 'ru';
  }
}
const Context = createContext<{ lang: Lang; setLang: (lang: Lang) => void }>({
  lang: 'ru',
  setLang: () => undefined,
});
export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initial);
  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      // Private mode: the choice simply is not remembered.
    }
  }, [lang]);
  return <Context.Provider value={{ lang, setLang }}>{children}</Context.Provider>;
}
/**
 * `t('Русский текст', { name })`: the Russian text is the key, so a missing Kazakh entry
 * falls back to Russian instead of showing a placeholder. `{name}` is replaced by vars.
 */
export function useT() {
  const { lang, setLang } = useContext(Context);
  const t = useCallback(
    (text: string, vars: Record<string, string | number> = {}) =>
      (lang === 'kk' ? (kk[text] ?? text) : text).replace(/\{(\w+)\}/g, (m, k: string) =>
        k in vars ? String(vars[k]) : m,
      ),
    [lang],
  );
  return { t, lang, setLang, locale: lang === 'kk' ? 'kk-KZ' : 'ru-RU' };
}
/** «Қаз» / «Рус» switch for the header. */
export function LangSwitch({ className = '' }: { className?: string }) {
  const { lang, setLang } = useT();
  return (
    <button
      className={`lang-switch ${className}`}
      onClick={() => setLang(lang === 'ru' ? 'kk' : 'ru')}
      aria-label={lang === 'ru' ? 'Қазақ тіліне ауысу' : 'Переключить на русский'}
      lang={lang === 'ru' ? 'kk' : 'ru'}
    >
      {lang === 'ru' ? 'Қаз' : 'Рус'}
    </button>
  );
}
