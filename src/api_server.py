# src/api_server.py
# Flask API 服务，为前端提供模型文件操作接口

from flask import Flask, jsonify, request
from flask_cors import CORS
import sys
import os
import time
import csv

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
simulation_sessions = {} # ??

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
        
        # ✅ 关键修改：使用 validate=False 避免在加载时验证
        # 验证应该由用户手动触发（点击"确认并验证"按钮）
        model = loader_engine.fetch(model_name, folder, validate=False)
        
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
            'imports': [],  # TODO: 从原始 YAML 读取 imports
            # 新增
            'validated': getattr(model, 'validation_result', {}).get('valid', True),
            'validation_errors': getattr(model, 'validation_result', {}).get('errors', []),
            'validation_warnings': getattr(model, 'validation_result', {}).get('warnings', []),
            'patch_file': getattr(model, 'validation_result', {}).get('patch_file'),
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

@app.route('/api/validate', methods=['POST'])
def validate_model():
    """验证模型（与 CLI 完全一致）"""
    try:
        data = request.json
        file_path = data.get('file_path')
        
        if not file_path:
            return jsonify({
                'success': False,
                'error': '未提供文件路径'
            }), 400
        
        # 分离文件夹和文件名
        if '/' in file_path:
            parts = file_path.split('/')
            folder = parts[0] if len(parts) > 1 else None
            model_name = '/'.join(parts[1:]) if len(parts) > 1 else parts[0]
        else:
            folder = None
            model_name = file_path
        
        # 移除 .yaml 扩展名
        if model_name.endswith('.yaml') or model_name.endswith('.yml'):
            model_name = os.path.splitext(model_name)[0]
        
        logger.info(f"验证模型: {model_name}, 文件夹: {folder}")
        
        # 创建 patch 输出目录
        patch_dir = os.path.join(MODS_DIR, 'patch')
        os.makedirs(patch_dir, exist_ok=True)
        
        # ✅✅✅ 关键修改：先加载但不验证，然后手动验证 ✅✅✅
        # 方案 A：如果 loader_engine.py 已经修改（添加了 validate 参数）
        try:
            # 尝试使用新的 API
            model = loader_engine.fetch(model_name, folder, validate=False)
        except TypeError:
            # 如果 fetch() 还没有 validate 参数，使用旧的方式
            # 手动加载不验证
            file_path_full = loader_engine.find_model_file(model_name, folder)
            if not file_path_full:
                return jsonify({
                    'success': False,
                    'error': f'无法找到模型文件: {file_path}'
                }), 404
            
            from src.models.core import ModStructure
            model = ModStructure(loader_engine.mods_directory, loader_engine.language)
            model.load_model(file_path_full, model_name)
        
        if not model:
            return jsonify({
                'success': False,
                'error': f'无法加载模型: {file_path}'
            }), 404
        
        # 手动验证
        try:
            model.validate_model(output_dir=patch_dir)
            
            # 验证通过
            return jsonify({
                'success': True,
                'message': '模型验证通过',
                'data': {
                    'patch_file': None
                }
            })
        
        except ValueError as ve:
            # 验证失败（validate_model() 抛出的异常）
            error_msg = str(ve)
            
            # 提取错误列表
            errors = []
            for line in error_msg.split('\n'):
                line = line.strip()
                if line.startswith('- '):
                    errors.append(line[2:])
                elif line and 'validation failed' not in line.lower() and 'patch file' not in line.lower():
                    # 也包含其他非空行（但排除标题行）
                    if not line.startswith('Model validation'):
                        errors.append(line)
            
            # 提取 patch 文件路径
            patch_file = None
            if "Patch file generated:" in error_msg:
                for line in error_msg.split('\n'):
                    if "Patch file generated:" in line:
                        patch_file = line.split("Patch file generated:")[-1].strip()
                        break
            
            logger.warning(f"模型验证失败: {len(errors)} 个错误, patch: {patch_file}")
            
            return jsonify({
                'success': False,
                'errors': errors,
                'data': {
                    'patch_file': patch_file
                }
            }), 400
    
    except Exception as e:
        logger.error(f"验证模型失败: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/split', methods=['POST'])
def split_model():
    """拆分模型"""
    try:
        data = request.json
        file_path = data.get('file_path')
        output_dir = data.get('output_dir', 'split_output')
        
        if not file_path:
            return jsonify({
                'success': False,
                'error': '未提供文件路径'
            }), 400
        
        # 构建完整输出路径
        full_output_dir = os.path.join(MODS_DIR, 'splited', output_dir)
        
        # 分离文件夹和文件名
        if '/' in file_path:
            parts = file_path.split('/')
            folder = parts[0] if len(parts) > 1 else None
            model_name = '/'.join(parts[1:]) if len(parts) > 1 else parts[0]
        else:
            folder = None
            model_name = file_path
        
        # 移除 .yaml 扩展名
        if model_name.endswith('.yaml') or model_name.endswith('.yml'):
            model_name = os.path.splitext(model_name)[0]
        
        # 调用 LoaderEngine 的拆分方法
        result = loader_engine.split_model(model_name, output_dir, folder)
        
        if result['success']:
            # 列出生成的文件
            generated_files = []
            if os.path.exists(full_output_dir):
                generated_files = [f for f in os.listdir(full_output_dir) if f.endswith('.yaml')]
            
            # 查找 patch 文件
            patch_file = None
            for f in generated_files:
                if '_patch' in f:
                    patch_file = os.path.join(full_output_dir, f)
                    break
            
            return jsonify({
                'success': True,
                'data': {
                    'output_dir': full_output_dir,
                    'files': generated_files,
                    'patch_file': patch_file,
                    'variables': result['data'].get('variables', 0),
                    'formulas': result['data'].get('formulas', 0)
                }
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', '拆分失败')
            }), 500
    
    except Exception as e:
        logger.error(f"拆分模型失败: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/simulation/start', methods=['POST'])
def start_simulation():
    """
    启动仿真会话
    请求体: {model_name, folder?, time_hours, step_size, input_params, session_id?}
    返回: {session_id, model_name, initial_state, step_size, total_time, total_steps, output_variables}
    """
    try:
        data = request.json
        model_name = data.get('model_name')
        folder = data.get('folder')
        time_hours = data.get('time_hours', 8760.0)
        step_size = data.get('step_size', 3600.0)
        input_params = data.get('input_params', {})
        session_id = data.get('session_id', f"sim_{int(time.time() * 1000)}")
        
        if not model_name:
            return jsonify({
                'success': False,
                'error': '未提供模型名称'
            }), 400
        
        # 使用 LoaderEngine 加载模型
        logger.info(f"正在加载模型: {model_name}, 文件夹: {folder}")
        model = loader_engine.fetch(model_name, folder)
        
        if not model:
            return jsonify({
                'success': False,
                'error': f'无法加载模型: {model_name}'
            }), 404
        
        # 设置输入参数
        for var_name, value in input_params.items():
            if var_name in model.variables:
                model.set_variable_value(var_name, value)
                logger.debug(f"设置输入参数: {var_name} = {value}")
        
        # 计算总步数
        total_time = time_hours * 3600.0
        total_steps = int(total_time / step_size)
        
        # 获取输出变量列表
        output_variables = model.simulator.get('output_variables', []) if model.simulator else []
        if not output_variables:
            # 如果未指定，默认输出所有 state 变量
            output_variables = [name for name, var in model.variables.items() if var.type.value == 'state']
        
        # 创建会话
        simulation_sessions[session_id] = {
            'model': model,
            'model_name': model_name,
            'folder': folder,
            'step_size': step_size,
            'total_time': total_time,
            'total_steps': total_steps,
            'current_step': 0,
            'running': False,
            'data': [],
            'output_variables': output_variables
        }
        
        logger.info(f"仿真会话已创建: {session_id}, 总步数: {total_steps}")
        
        # 返回初始状态
        return jsonify({
            'success': True,
            'data': {
                'session_id': session_id,
                'model_name': model.metadata.name if model.metadata else model_name,
                'initial_state': model.get_current_state(),
                'step_size': step_size,
                'total_time': total_time,
                'total_steps': total_steps,
                'output_variables': output_variables
            }
        })
    
    except Exception as e:
        logger.error(f"启动仿真失败: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/simulation/step', methods=['POST'])
def simulation_step():
    """
    执行单步仿真
    请求体: {session_id, input_changes?}
    返回: {current_step, current_time, state, output, formula_results, completed, progress}
    """
    try:
        data = request.json
        session_id = data.get('session_id')
        input_changes = data.get('input_changes', {})
        
        if not session_id or session_id not in simulation_sessions:
            return jsonify({
                'success': False,
                'error': f'无效的会话ID: {session_id}'
            }), 400
        
        session = simulation_sessions[session_id]
        model = session['model']
        step_size = session['step_size']
        
        # 应用输入变化（动态修改输入）
        for var_name, value in input_changes.items():
            if var_name in model.variables:
                model.set_variable_value(var_name, value)
                logger.debug(f"动态修改输入: {var_name} = {value}")
        
        # 执行单步仿真
        try:
            formula_results = model.step(step_size)
        except Exception as step_error:
            logger.error(f"仿真步骤执行失败: {step_error}", exc_info=True)
            return jsonify({
                'success': False,
                'error': f'仿真计算错误: {str(step_error)}'
            }), 500
        
        session['current_step'] += 1
        
        # 获取输出数据
        output_variables = session['output_variables']
        output_data = {
            'step': model.current_step,
            'time': model.time
        }
        
        for var_name in output_variables:
            if var_name in model.variables:
                output_data[var_name] = model.variables[var_name].value
            else:
                logger.warning(f"输出变量 {var_name} 不存在于模型中")
                output_data[var_name] = 0.0
        
        # 保存数据点
        session['data'].append(output_data)
        
        # 检查是否完成
        completed = session['current_step'] >= session['total_steps']
        progress = (session['current_step'] / session['total_steps']) * 100 if session['total_steps'] > 0 else 0
        
        return jsonify({
            'success': True,
            'data': {
                'current_step': model.current_step,
                'current_time': model.time,
                'state': model.get_current_state(),
                'output': output_data,
                'formula_results': formula_results,
                'completed': completed,
                'progress': round(progress, 2)
            }
        })
    
    except Exception as e:
        logger.error(f"执行仿真步失败: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/simulation/pause', methods=['POST'])
def pause_simulation():
    """
    暂停仿真（标记状态为暂停）
    请求体: {session_id}
    """
    try:
        data = request.json
        session_id = data.get('session_id')
        
        if not session_id or session_id not in simulation_sessions:
            return jsonify({
                'success': False,
                'error': '无效的会话ID'
            }), 400
        
        session = simulation_sessions[session_id]
        session['running'] = False
        
        logger.info(f"仿真已暂停: {session_id}")
        
        return jsonify({
            'success': True,
            'message': '仿真已暂停'
        })
    
    except Exception as e:
        logger.error(f"暂停仿真失败: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/simulation/reset', methods=['POST'])
def reset_simulation():
    """
    重置仿真到初始状态
    请求体: {session_id}
    返回: {initial_state}
    """
    try:
        data = request.json
        session_id = data.get('session_id')
        
        if not session_id or session_id not in simulation_sessions:
            return jsonify({
                'success': False,
                'error': '无效的会话ID'
            }), 400
        
        session = simulation_sessions[session_id]
        model = session['model']
        
        # 重置模型状态
        model.reset_simulation()
        session['current_step'] = 0
        session['running'] = False
        session['data'] = []
        
        logger.info(f"仿真已重置: {session_id}")
        
        return jsonify({
            'success': True,
            'data': {
                'initial_state': model.get_current_state()
            }
        })
    
    except Exception as e:
        logger.error(f"重置仿真失败: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/simulation/export', methods=['POST'])
def export_simulation():
    """
    导出仿真数据为 CSV
    请求体: {session_id, output_path?}
    返回: {csv_path, rows}
    """
    try:
        data = request.json
        session_id = data.get('session_id')
        output_path = data.get('output_path')
        
        if not session_id or session_id not in simulation_sessions:
            return jsonify({
                'success': False,
                'error': '无效的会话ID'
            }), 400
        
        session = simulation_sessions[session_id]
        simulation_data = session['data']
        
        if not simulation_data:
            return jsonify({
                'success': False,
                'error': '无数据可导出'
            }), 400
        
        # 确定输出路径
        if not output_path:
            output_dir = os.path.join(MODS_DIR, 'output')
            os.makedirs(output_dir, exist_ok=True)
            timestamp = int(time.time())
            output_path = os.path.join(output_dir, f"{session['model_name']}_export_{timestamp}.csv")
        else:
            # 确保输出目录存在
            output_dir = os.path.dirname(output_path)
            if output_dir:
                os.makedirs(output_dir, exist_ok=True)
        
        # 写入 CSV
        headers = list(simulation_data[0].keys())
        with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=headers)
            writer.writeheader()
            writer.writerows(simulation_data)
        
        logger.info(f"仿真数据已导出: {output_path}, 共 {len(simulation_data)} 行")
        
        return jsonify({
            'success': True,
            'data': {
                'csv_path': output_path,
                'rows': len(simulation_data)
            }
        })
    
    except Exception as e:
        logger.error(f"导出仿真数据失败: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/simulation/state', methods=['GET'])
def get_simulation_state():
    """
    获取仿真状态
    查询参数: ?session_id=xxx
    返回: {session_id, model_name, current_step, total_steps, progress, running, current_state, data_points}
    """
    try:
        session_id = request.args.get('session_id')
        
        if not session_id or session_id not in simulation_sessions:
            return jsonify({
                'success': False,
                'error': '无效的会话ID'
            }), 400
        
        session = simulation_sessions[session_id]
        model = session['model']
        
        progress = (session['current_step'] / session['total_steps']) * 100 if session['total_steps'] > 0 else 0
        
        return jsonify({
            'success': True,
            'data': {
                'session_id': session_id,
                'model_name': session['model_name'],
                'current_step': session['current_step'],
                'total_steps': session['total_steps'],
                'progress': round(progress, 2),
                'running': session['running'],
                'current_state': model.get_current_state(),
                'data_points': len(session['data'])
            }
        })
    
    except Exception as e:
        logger.error(f"获取仿真状态失败: {e}")
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
    print(f"\n仿真 API:")
    print(f"  POST /api/simulation/start    - 启动仿真")
    print(f"  POST /api/simulation/step     - 单步执行")
    print(f"  POST /api/simulation/pause    - 暂停仿真")
    print(f"  POST /api/simulation/reset    - 重置仿真")
    print(f"  POST /api/simulation/export   - 导出数据")
    print(f"  GET  /api/simulation/state    - 获取状态")
    print(f"\n🌐 启动服务器: http://localhost:5000\n")
    
    app.run(host='0.0.0.0', port=5000, debug=True)