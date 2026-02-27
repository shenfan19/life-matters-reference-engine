# -*- coding: utf-8 -*-
import logging
import os
from babel.support import Translations, NullTranslations
from typing import Optional

logger = logging.getLogger(__name__)

class BabelLanguageManager:
    """使用 Babel 的多语言管理器"""
    
    def __init__(self, default_language: str = "en", locales_dir: str = "locales"):
        self.locales_dir = locales_dir
        # 映射前端横杠代码到后端下划线目录名
        lang_map = {
            "zh-CN": "zh_CN",
            "zh-TW": "zh_TW"
        }
        self.current_language = lang_map.get(default_language, default_language)
        self._translations = self._load_translations()
        logger.info(f"Initialized BabelLanguageManager with language {self.current_language}")
    
    def _load_translations(self) -> Translations:
        """加载翻译"""
        try:
            # 标准的 LC_MESSAGES 路径
            locale_path = os.path.join(self.locales_dir, self.current_language, 'LC_MESSAGES')
            if os.path.exists(locale_path):
                # domain 默认为 'messages'
                return Translations.load(self.locales_dir, [self.current_language])
            else:
                logger.warning(f"Locale {self.current_language} not found at {locale_path}, using NullTranslations")
                return NullTranslations()
        except Exception as e:
            logger.error(f"Failed to load translations for {self.current_language}: {e}")
            return NullTranslations()
    
    def set_language(self, language: str) -> None:
        """设置语言"""
        lang_map = {
            "zh-CN": "zh_CN",
            "zh-TW": "zh_TW"
        }
        self.current_language = lang_map.get(language, language)
        self._translations = self._load_translations()
        logger.info(f"Language set to {self.current_language}")
    
    def gettext(self, message: str) -> str:
        """获取翻译文本（简单翻译）"""
        return self._translations.gettext(message)
    
    def get_translation(self, message: str, **kwargs) -> str:
        """获取翻译并格式化"""
        translated = self._translations.gettext(message)
        
        if kwargs:
            try:
                return translated.format(**kwargs)
            except (KeyError, ValueError) as e:
                logger.warning(f"Translation formatting failed for '{message}': {e}, kwargs={kwargs}")
                return translated
        
        return translated
    
    @property
    def language(self):
        return self.current_language
