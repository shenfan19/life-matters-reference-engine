import os
import shutil

def setup():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    locales_dir = os.path.join(base_dir, 'locales')
    
    mapping = {
        'zhhans': 'zh_CN',
        'zhhant': 'zh_TW'
    }
    
    # 1. Rename folders to standard codes
    for old, new in mapping.items():
        old_path = os.path.join(locales_dir, old)
        new_path = os.path.join(locales_dir, new)
        if os.path.exists(old_path) and not os.path.exists(new_path):
            print(f"Renaming {old} to {new}")
            os.rename(old_path, new_path)
        elif os.path.exists(old_path) and os.path.exists(new_path):
            print(f"Merging {old} into {new}")
            # Move po files if they don't exist
            old_po = os.path.join(old_path, 'LC_MESSAGES', 'messages.po')
            new_po = os.path.join(new_path, 'LC_MESSAGES', 'messages.po')
            if os.path.exists(old_po) and not os.path.exists(new_po):
                os.makedirs(os.path.dirname(new_po), exist_ok=True)
                shutil.copy(old_po, new_po)
            shutil.rmtree(old_path)
            
    # 2. Ensure LC_MESSAGES exists in all standard folders
    for lang in ['en', 'fr', 'zh_CN', 'zh_TW']:
        lc_dir = os.path.join(locales_dir, lang, 'LC_MESSAGES')
        if not os.path.exists(lc_dir):
            print(f"Creating {lc_dir}")
            os.makedirs(lc_dir, exist_ok=True)
            
    print("Locale directory standardization complete.")

if __name__ == "__main__":
    setup()
