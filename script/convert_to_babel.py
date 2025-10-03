# -*- coding: utf-8 -*-
import yaml
import os
from babel.messages import Catalog
from babel.messages.pofile import write_po

def convert_yaml_to_po(yaml_file: str, output_dir: str, locale: str):
    """将 YAML 翻译文件转换为 PO 文件"""
    
    # 读取 YAML
    with open(yaml_file, 'r', encoding='utf-8') as f:
        translations = yaml.safe_load(f)
    
    # 创建 Catalog
    catalog = Catalog(locale=locale, project='LifeMatters')
    
    # 添加翻译
    for key, value in translations.items():
        catalog.add(key, string=value)
    
    # 确保输出目录存在
    locale_dir = os.path.join(output_dir, locale, 'LC_MESSAGES')
    os.makedirs(locale_dir, exist_ok=True)
    
    # 写入 PO 文件
    po_file = os.path.join(locale_dir, 'messages.po')
    with open(po_file, 'wb') as f:
        write_po(f, catalog)
    
    print(f"Created {po_file}")

# 使用示例
if __name__ == '__main__':
    # 假设你的 YAML 文件在 langs/ 目录
    convert_yaml_to_po('langs/en.yaml', 'locales', 'en')
    convert_yaml_to_po('langs/fr.yaml', 'locales', 'fr')
    convert_yaml_to_po('langs/zh_Hans.yaml', 'locales', 'zh_Hans')
    convert_yaml_to_po('langs/zh_Hant.yaml', 'locales', 'zh_Hant')