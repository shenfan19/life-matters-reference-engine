import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';

export type Language = 'en' | 'zh-CN' | 'zh-TW';

interface I18nContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
    version: number;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider = ({ children, section }: { children: ReactNode; section: 'sim' | 'game' }) => {
    // 1. Initial State with Legacy Support
    const [language, setLanguageState] = useState<Language>(() => {
        let saved = localStorage.getItem('language');

        // Normalize legacy keys
        if (saved === 'zh_CN') saved = 'zh-CN';
        if (saved === 'zh_TW') saved = 'zh-TW';

        const validLangs: Language[] = ['en', 'zh-CN', 'zh-TW'];
        const finalLang = (saved && validLangs.includes(saved as Language)) ? (saved as Language) : 'zh-CN';

        // Ensure normalized value is stored
        if (saved !== finalLang) {
            localStorage.setItem('language', finalLang);
        }
        return finalLang;
    });

    const [translations, setTranslations] = useState<Record<string, string>>({});
    const [isLoaded, setIsLoaded] = useState(false);
    const [version, setVersion] = useState(0);

    const setLanguage = (lang: Language) => {
        console.log(`[i18n] Switching to: ${lang}`);
        setLanguageState(lang);
        localStorage.setItem('language', lang);
        setIsLoaded(false);
        setVersion(v => v + 1);
    };

    useEffect(() => {
        let isMounted = true;
        const loadTranslations = async () => {
            const timestamp = Date.now();
            const url = `/locales/${section}/${language}.json?v=${timestamp}`;
            console.log(`[i18n] Fetching: ${url}`);

            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();

                if (isMounted) {
                    if (Object.keys(data).length === 0 && language !== 'en') {
                        console.warn(`[i18n] ${language} JSON is empty, falling back to English`);
                        const enResponse = await fetch(`/locales/${section}/en.json`);
                        if (enResponse.ok) {
                            const enData = await enResponse.json();
                            setTranslations(enData);
                        }
                    } else {
                        setTranslations(data);
                    }
                    setIsLoaded(true);
                    setVersion(v => v + 1);
                }
            } catch (error) {
                console.error(`[i18n] Load failed:`, error);
                if (isMounted && language !== 'en') {
                    fetch(`/locales/${section}/en.json`).then(r => r.json()).then(d => {
                        if (isMounted) {
                            setTranslations(d);
                            setVersion(v => v + 1);
                        }
                    }).catch(() => { });
                }
            }
        };

        loadTranslations();
        return () => { isMounted = false; };
    }, [language, section]);

    const t = (key: string) => {
        const val = translations[key];
        if (!val) {
            if (isLoaded) {
                console.warn(`[i18n] Missing key: "${key}" in ${language}`);
            }
            return key;
        }
        return val;
    };

    return (
        <I18nContext.Provider value={{ language, setLanguage, t, version }}>
            {children}
        </I18nContext.Provider>
    );
};

export const useI18n = () => {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error('useI18n must be used within an I18nProvider');
    }
    return context;
};
