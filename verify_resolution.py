import sys
import os
import logging

# 将 engine/src 添加到 path
sys.path.append(os.path.abspath(os.path.join(os.getcwd(), 'engine', 'src')))

from loader_engine import LoaderEngine

# 设置日志级别
logging.basicConfig(level=logging.INFO)

def test_resolution():
    engine = LoaderEngine(mods_directory="mods")
    
    test_cases = [
        # 1. 新结构全路径 (不带扩展名)
        ("stories/examples/simple_banana_story", None),
        # 2. 新结构全路径 (带扩展名)
        ("stories/examples/simple_banana_story.yaml", None),
        # 3. 拆分后的逻辑 (folder + model_name)
        ("examples/simple_banana_story", "stories"),
        # 4. 拆分后的逻辑 (folder + model_name + .yaml)
        ("examples/simple_banana_story.yaml", "stories"),
        # 5. 为了测试 basic_nutrition_story
        ("examples/basic_nutrition_story", "stories"),
        # 6. 为了测试 test_valid
        ("_test/test_valid", "models")
    ]
    
    for model_name, folder in test_cases:
        print(f"\n--- Testing: model_name='{model_name}', folder='{folder}' ---")
        file_path = engine.find_model_file(model_name, folder)
        if file_path:
            print(f"Found: {file_path}")
        else:
            print(f"FAILED to find model.")

if __name__ == "__main__":
    test_resolution()
