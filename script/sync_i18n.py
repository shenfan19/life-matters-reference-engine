import os
import json
import subprocess
import polib

def po_to_json(po_path, json_path):
    """Convert a .po file to a flat .json file for React i18n."""
    try:
        po = polib.pofile(po_path)
        translations = {}
        for entry in po:
            if entry.msgid and entry.msgstr:
                translations[entry.msgid] = entry.msgstr
        
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(translations, f, ensure_ascii=False, indent=4)
        print(f"Converted {po_path} -> {json_path}")
    except Exception as e:
        print(f"Error converting {po_path}: {e}")

def compile_mo(po_path, mo_path):
    """Compile a .po file to .mo."""
    try:
        os.makedirs(os.path.dirname(mo_path), exist_ok=True)
        po = polib.pofile(po_path)
        po.save_as_mofile(mo_path)
        print(f"Compiled {po_path} -> {mo_path}")
    except Exception as e:
        print(f"Error compiling {po_path}: {e}")

def merge_json_into_po(json_path, po_path):
    """Merge entries from a JSON file into a PO file."""
    if not os.path.exists(json_path):
        return
    
    print(f"Merging {json_path} into {po_path}")
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        po = polib.pofile(po_path)
        existing_ids = {entry.msgid for entry in po}
        
        added_count = 0
        for key, value in data.items():
            if key not in existing_ids:
                entry = polib.POEntry(
                    msgid=key,
                    msgstr=value
                )
                po.append(entry)
                added_count += 1
            else:
                # Update if empty
                for entry in po:
                    if entry.msgid == key and not entry.msgstr:
                        entry.msgstr = value
                        break
        
        po.save(po_path)
        print(f"Added {added_count} new entries to {po_path}")
    except Exception as e:
        print(f"Error merging {json_path}: {e}")

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    locales_dir = os.path.join(base_dir, 'locales')
    old_json_dir = os.path.join(locales_dir, 'sim')
    
    # Target frontend directories
    frontends = {
        'sim': os.path.join(base_dir, 'sim_gui', 'public', 'locales', 'sim'),
        'game': os.path.join(base_dir, 'game', 'public', 'locales', 'game')
    }
    
    # Mapping of languages (Internal -> Frontend/JSON)
    languages = {
        'en': 'en',
        'zh_CN': 'zh-CN',
        'zh_TW': 'zh-TW',
        'fr': 'fr'
    }
    
    # Fallback mappings if standardized directories don't exist
    fallbacks = {
        'zh_CN': 'zhhans',
        'zh_TW': 'zhhant'
    }
    
    for lang, fe_lang in languages.items():
        lang_dir = os.path.join(locales_dir, lang)
        
        # Check fallback if standard doesn't exist
        if not os.path.exists(lang_dir) and lang in fallbacks:
            fallback_dir = os.path.join(locales_dir, fallbacks[lang])
            if os.path.exists(fallback_dir):
                print(f"Using fallback directory {fallback_dir} for {lang}")
                lang_dir = fallback_dir

        po_path = os.path.join(lang_dir, 'LC_MESSAGES', 'messages.po')
        mo_path = os.path.join(lang_dir, 'LC_MESSAGES', 'messages.mo')
        old_json_path = os.path.join(old_json_dir, f"{fe_lang}.json")
        
        if not os.path.exists(po_path):
            print(f"Warning: PO file not found at {po_path}")
            continue
            
        # 1. Merge existing JSON into PO (transition phase)
        merge_json_into_po(old_json_path, po_path)
        
        # 2. Compile MO for backend
        compile_mo(po_path, mo_path)
        
        # 3. Convert to JSON for each frontend
        for key, target_dir in frontends.items():
            # Ensure target directory exists
            if not os.path.exists(target_dir):
                print(f"Creating directory: {target_dir}")
                os.makedirs(target_dir, exist_ok=True)
            
            json_path = os.path.join(target_dir, f"{fe_lang}.json")
            po_to_json(po_path, json_path)

if __name__ == "__main__":
    main()
