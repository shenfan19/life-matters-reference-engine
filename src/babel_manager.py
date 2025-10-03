# -*- coding: utf-8 -*-
import logging
import os
from babel.support import Translations, NullTranslations
from typing import Optional

logger = logging.getLogger(__name__)

class BabelLanguageManager:
    """使用 Babel 的多语言管理器"""
    
    def __init__(self, default_language: str = "en", locales_dir: str = "locales"):
        self.current_language = default_language
        self.locales_dir = locales_dir
        self._translations = self._load_translations()
        logger.info(f"Initialized BabelLanguageManager with language {default_language}")
    
    def _load_translations(self) -> Translations:
        """加载翻译"""
        try:
            locale_path = os.path.join(self.locales_dir, self.current_language, 'LC_MESSAGES')
            if os.path.exists(locale_path):
                return Translations.load(self.locales_dir, [self.current_language])
            else:
                logger.warning(f"Locale {self.current_language} not found, using NullTranslations")
                return NullTranslations()
        except Exception as e:
            logger.error(f"Failed to load translations: {e}")
            return NullTranslations()
    
    def set_language(self, language: str) -> None:
        """设置语言"""
        self.current_language = language
        self._translations = self._load_translations()
        logger.info(f"Language set to {language}")
    
    def gettext(self, message: str) -> str:
        """获取翻译文本（简单翻译）"""
        return self._translations.gettext(message)
    
    def get_translation(self, message: str, **kwargs) -> str:
        """获取翻译并格式化（兼容旧接口）"""
        translated = self._translations.gettext(message)
        try:
            # 支持两种格式化方式
            if kwargs:
                # 尝试 % 格式化
                try:
                    return translated % kwargs
                except (KeyError, TypeError):
                    # 回退到 .format()
                    return translated.format(**kwargs)
            return translated
        except Exception as e:
            logger.warning(f"Translation formatting failed for '{message}': {e}")
            return translated
    
    @property
    def language(self):
        return self.current_language
