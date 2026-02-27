import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';

type Language = 'en' | 'zh-CN' | 'zh-TW';

interface I18nContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider = ({ children, section }: { children: ReactNode; section: 'sim' | 'game' }) => {
    const [language, setLanguageState] = useState<Language>((localStorage.getItem('language') as Language) || 'zh-CN');
    const [translations, setTranslations] = useState<Record<string, string>>({});

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem('language', lang);
    };

    useEffect(() => {
        const loadTranslations = async () => {
            try {
                const response = await fetch(`/locales/${section}/${language}.json`);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                setTranslations(data);
            } catch (error) {
                console.error('Failed to load translations:', error);
            }
        };
        loadTranslations();
    }, [language, section]);

    const t = (key: string) => {
        return translations[key] || key;
    };

    return (
        <I18nContext.Provider value={{ language, setLanguage, t }}>
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
