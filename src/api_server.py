# src/api_server.py
# Flask API 服务，为前端提供模型文件操作接口

from flask import Flask, jsonify, request
from flask_cors import CORS
import sys
import os

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.loader.loader_engine import LoaderEngine
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # 启用 CORS

# 初始化 LoaderEngine
MODS_DIR = os.path.join(os.path.dirname(__file__), '..', 'mods')
loader_engine = LoaderEngine(mods_directory=MODS_DIR, language='zhhans')

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'status': 'ok',
        'mods_directory': MODS_DIR,
        'exists': os.path.exists(MODS_DIR)
    })

@app.route('/api/files', methods=['GET'])
def get_file_tree():
    """获取文件树结构"""
    try:
        def build_tree(directory, base_path=''):
            """递归构建文件树"""
            items = []
            
            if not os.path.exists(directory):
                return items
            
            for item in sorted(os.listdir(directory)):
                item_path = os.path.join(directory, item)
                relative_path = os.path.join(base_path, item).replace('\\', '/')
                
                if os.path.isdir(item_path):
                    # 文件夹
                    children = build_tree(item_path, relative_path)
                    if children:  # 只添加非空文件夹
                        items.append({
                            'title': item,
                            'key': relative_path,
                            'type': 'folder',
                            'children': children
                        })
                elif item.endswith('.yaml') or item.endswith('.yml'):
                    # YAML 文件
                    items.append({
                        'title': item,
                        'key': relative_path,
                        'type': 'file',
                        'isLeaf': True
                    })
            
            return items
        
        # 构建文件树
        tree = [{
            'title': 'mods',
            'key': 'mods',
            'type': 'folder',
            'children': build_tree(MODS_DIR)
        }]
        
        return jsonify({
            'success': True,
            'data': tree
        })
    
    except Exception as e:
        logger.error(f"获取文件树失败: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/file/<path:file_path>', methods=['GET'])
def get_file_content(file_path):
    """读取 YAML 文件内容"""
    try:
        # 使用 LoaderEngine 的 fetch 方法加载模型
        logger.info(f"正在读取文件: {file_path}")
        
        # 分离文件夹和文件名
        if '/' in file_path:
            parts = file_path.split('/')
            folder = parts[0] if len(parts) > 1 else None
            model_name = '/'.join(parts[1:]) if len(parts) > 1 else parts[0]
        else:
            folder = None
            model_name = file_path
        
        # 移除 .yaml 扩展名（如果有）
        if model_name.endswith('.yaml') or model_name.endswith('.yml'):
            model_name = os.path.splitext(model_name)[0]
        
        # 使用 fetch 加载模型
        model = loader_engine.fetch(model_name, folder)
        
        if not model:
            return jsonify({
                'success': False,
                'error': f'无法加载模型: {file_path}'
            }), 404
        
        # 构建返回数据
        content = {
            'metadata': {
                'name': model.metadata.name if model.metadata else '',
                'version': model.metadata.version if model.metadata else '',
                'author': model.metadata.author if model.metadata else '',
                'description': model.metadata.description if model.metadata else '',
                'tags': model.metadata.tags if model.metadata else [],
                'conflicts': model.metadata.conflicts if model.metadata else []
            },
            'variables': {},
            'formulas': {},
            'simulator': model.simulator,
            'optimizer': model.optimizer,
            'imports': []  # TODO: 从原始 YAML 读取 imports
        }
        
        # 转换变量
        for var_name, var in model.variables.items():
            content['variables'][var_name] = {
                'description': var.description,
                'value': var.value,
                'unit': var.unit,
                'type': var.type.value,
                'bounds': var.bounds
            }
        
        # 转换公式
        for formula_name, formula in model.formulas.items():
            content['formulas'][formula_name] = {
                'description': formula.description,
                'condition': formula.condition,
                'priority': formula.priority,
                'dynamics': formula.dynamics
            }
        
        return jsonify({
            'success': True,
            'data': {
                'path': file_path,
                'content': content
            }
        })
    
    except Exception as e:
        logger.error(f"读取文件失败 {file_path}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/search', methods=['GET'])
def search_files():
    """搜索文件"""
    try:
        keyword = request.args.get('q', '').lower()
        
        if not keyword:
            return jsonify({
                'success': True,
                'data': []
            })
        
        results = []
        
        def search_in_dir(directory, base_path=''):
            """递归搜索文件"""
            if not os.path.exists(directory):
                return
            
            for item in os.listdir(directory):
                item_path = os.path.join(directory, item)
                relative_path = os.path.join(base_path, item).replace('\\', '/')
                
                if os.path.isdir(item_path):
                    search_in_dir(item_path, relative_path)
                elif (item.endswith('.yaml') or item.endswith('.yml')) and keyword in item.lower():
                    results.append({
                        'title': item,
                        'key': relative_path,
                        'path': relative_path,
                        'type': 'file'
                    })
        
        search_in_dir(MODS_DIR)
        
        return jsonify({
            'success': True,
            'data': results
        })
    
    except Exception as e:
        logger.error(f"搜索失败: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/merge', methods=['POST'])
def merge_models():
    """合并多个模型"""
    try:
        data = request.json
        model_names = data.get('model_names', [])
        folders = data.get('folders', [])
        output_name = data.get('output_name', 'merged_model')
        
        if not model_names and not folders:
            return jsonify({
                'success': False,
                'error': '未提供要合并的模型或文件夹'
            }), 400
        
        # 构建输出路径
        output_path = os.path.join(MODS_DIR, 'merged', f'{output_name}.yaml')
        
        # 调用 LoaderEngine 的合并方法
        result = loader_engine.merge_models(
            model_names=model_names,
            folders=folders,
            output_path=output_path,
            merged_name=output_name
        )
        
        if result['success']:
            # 返回合并后的模型内容
            merged_model = result['data']
            return jsonify({
                'success': True,
                'data': {
                    'output_path': output_path,
                    'variables': result['variables'],
                    'formulas': result['formulas'],
                    'message': f'成功合并 {result["variables"]} 个变量和 {result["formulas"]} 个公式'
                }
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', '合并失败')
            }), 500
    
    except Exception as e:
        logger.error(f"合并模型失败: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/folders', methods=['GET'])
def get_folders():
    """获取所有文件夹列表"""
    try:
        folders = []
        
        def collect_folders(directory, base_path=''):
            """递归收集文件夹"""
            if not os.path.exists(directory):
                return
            
            for item in os.listdir(directory):
                item_path = os.path.join(directory, item)
                if os.path.isdir(item_path):
                    relative_path = os.path.join(base_path, item).replace('\\', '/')
                    folders.append(relative_path)
                    collect_folders(item_path, relative_path)
        
        collect_folders(MODS_DIR)
        
        return jsonify({
            'success': True,
            'data': folders
        })
    
    except Exception as e:
        logger.error(f"获取文件夹列表失败: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    print(f"🚀 LifeMatters API Server")
    print(f"📁 MODS 目录: {MODS_DIR}")
    print(f"✅ 目录存在: {os.path.exists(MODS_DIR)}")
    print(f"\n可用 API:")
    print(f"  GET  /api/health         - 健康检查")
    print(f"  GET  /api/files          - 获取文件树")
    print(f"  GET  /api/file/<path>    - 读取文件内容")
    print(f"  GET  /api/search?q=...   - 搜索文件")
    print(f"  POST /api/merge          - 合并模型")
    print(f"  GET  /api/folders        - 获取文件夹列表")
    print(f"\n🌐 启动服务器: http://localhost:5000\n")
    
    app.run(host='0.0.0.0', port=5000, debug=True)