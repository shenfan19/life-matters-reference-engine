#!/usr/bin/env python3
"""
目录结构诊断脚本
检查 plugins/ 和 mods/ 目录
"""

import os
from pathlib import Path

def check_directory(dir_path, name):
    """检查目录结构"""
    print(f"\n{'=' * 60}")
    print(f"检查 {name} 目录")
    print(f"{'=' * 60}")
    print(f"路径: {dir_path}")
    print(f"存在: {dir_path.exists()}")
    
    if not dir_path.exists():
        print(f"❌ {name} 目录不存在！")
        print(f"\n建议创建:")
        print(f"  mkdir -p {dir_path}")
        return False
    
    # 列出内容
    try:
        contents = list(dir_path.iterdir())
        print(f"\n包含 {len(contents)} 个项目:")
        
        folders = [c for c in contents if c.is_dir()]
        files = [c for c in contents if c.is_file()]
        
        if folders:
            print(f"\n  文件夹 ({len(folders)}):")
            for folder in folders[:10]:  # 只显示前10个
                print(f"    📁 {folder.name}/")
                
                # 检查子文件
                if name == "plugins":
                    manifest = folder / "manifest.yaml"
                    backend = folder / "backend.py"
                    print(f"       {'✅' if manifest.exists() else '❌'} manifest.yaml")
                    print(f"       {'✅' if backend.exists() else '❌'} backend.py")
                elif name == "mods":
                    yaml_files = list(folder.glob("*.yaml")) + list(folder.glob("*.yml"))
                    print(f"       包含 {len(yaml_files)} 个 YAML 文件")
        
        if files:
            print(f"\n  文件 ({len(files)}):")
            for file in files[:10]:
                print(f"    📄 {file.name}")
        
        if not folders and not files:
            print(f"\n  ⚠️  目录为空")
        
        return True
        
    except PermissionError:
        print(f"❌ 权限错误：无法读取目录")
        return False

def main():
    """主函数"""
    print("\n" + "=" * 60)
    print("LifeMatters 目录结构诊断")
    print("=" * 60)
    
    # 获取当前运行目录
    current_dir = Path.cwd()
    print(f"\n当前工作目录: {current_dir}")
    
    # 检查是否在项目根目录
    markers = ["backend", "frontend", "mods", "plugins"]
    found_markers = [m for m in markers if (current_dir / m).exists()]
    
    if len(found_markers) >= 2:
        print(f"✅ 在项目根目录 (找到: {', '.join(found_markers)})")
        project_root = current_dir
    elif (current_dir / "backend").exists():
        print(f"⚠️  当前在 backend/ 目录")
        project_root = current_dir.parent
        print(f"项目根目录: {project_root}")
    else:
        print(f"❌ 无法确定项目根目录")
        print(f"\n请确保从项目根目录运行此脚本:")
        print(f"  cd [项目根目录]")
        print(f"  python check_directories.py")
        return
    
    # 检查 plugins
    plugins_dir = project_root / "plugins"
    check_directory(plugins_dir, "plugins")
    
    # 检查 mods
    mods_dir = project_root / "mods"
    check_directory(mods_dir, "mods")
    
    # 总结
    print(f"\n{'=' * 60}")
    print("总结")
    print(f"{'=' * 60}")
    
    if plugins_dir.exists() and mods_dir.exists():
        print("✅ 所有必需目录都存在")
    else:
        print("❌ 缺少必需目录")
        
        if not plugins_dir.exists():
            print(f"\n请创建 plugins 目录:")
            print(f"  mkdir {plugins_dir}")
        
        if not mods_dir.exists():
            print(f"\n请创建 mods 目录:")
            print(f"  mkdir {mods_dir}")
    
    print()

if __name__ == "__main__":
    main()
