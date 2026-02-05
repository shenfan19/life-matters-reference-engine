import sys
import os
import logging

# 将 engine/src 添加到 path
sys.path.append(os.path.abspath(os.path.join(os.getcwd(), 'engine', 'src')))

from loader_engine import LoaderEngine

# 设置日志级别以查看输出
logging.basicConfig(level=logging.INFO)

def verify():
    engine = LoaderEngine(mods_directory="mods")
    
    # 尝试加载简化的故事
    # 注意：fetch 方法会自动处理 imports 并进行验证
    story_name = "stories/examples/simple_banana_story"
    print(f"--- 正在验证故事: {story_name} ---")
    
    try:
        model = engine.fetch(story_name, validate=True)
        if model:
            print(f"验证成功! 加载了 {len(model.variables)} 个变量和 {len(model.formulas)} 个公式。")
            print(f"元数据名称: {model.metadata.name}")
        else:
            print("验证失败: engine.fetch 返回 None。")
    except Exception as e:
        print(f"验证过程中发生异常:\n{e}")

if __name__ == "__main__":
    verify()
