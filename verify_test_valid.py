import sys
import os
import logging

# 将 engine/src 添加到 path
sys.path.append(os.path.abspath(os.path.join(os.getcwd(), 'engine', 'src')))

from loader_engine import LoaderEngine

# 设置日志级别
logging.basicConfig(level=logging.ERROR)

def verify():
    engine = LoaderEngine(mods_directory="mods")
    
    # 尝试加载 test_valid.yaml
    model_name = "models/_test/test_valid"
    print(f"--- 正在验证模型: {model_name} ---")
    
    try:
        model = engine.fetch(model_name, validate=True)
        if model:
            print(f"验证成功! 加载了 {len(model.variables)} 个变量和 {len(model.formulas)} 个公式。")
        else:
            print("验证失败: engine.fetch 返回 None。")
    except ValueError as ve:
        print(f"验证失败 (ValueError):\n{ve}")
    except Exception as e:
        print(f"验证过程中发生异常:\n{e}")

if __name__ == "__main__":
    verify()
