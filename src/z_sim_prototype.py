import yaml  # 导入YAML库，用于加载模型文件
from scipy.integrate import solve_ivp  # 导入SciPy积分器，用于非线性ODE求解
import sys  # 导入sys模块，用于系统交互和退出

class SimEngine:  # 定义模拟引擎类，核心科学计算和事件处理
    def __init__(self, yaml_path):  # 初始化方法，加载YAML模型
        with open(yaml_path, 'r', encoding='utf-8') as f:  # 以UTF-8编码打开YAML文件
            self.model = yaml.safe_load(f)  # 安全加载YAML内容到字典
        self.states = {k: v['value'] for k, v in self.model['variables'].items()}  # 从variables提取初始states字典
        self.parameters = {k: v['value'] for k, v in self.model['parameters'].items()}  # 从parameters提取常值字典
        self.dt = self.model['simulator']['step_size']  # 从simulator获取时间步长
        self.total_steps = self.model['simulator']['steps']  # 获取总步数
        self.pause_every = self.model['simulator']['pause_every']  # 获取暂停间隔
        self.step = 0  # 当前步数初始化为0
        self.events = []  # 初始化事件队列，用于实时输入

    def process_event(self, event_str):  # 处理事件方法，解析CLI输入
        if '=' in event_str:  # 检查输入是否为调整命令（含=）
            parts = event_str.split('=')  # 分割变量名和值
            var, val_str = parts[0].strip(), parts[1].strip()  # 提取变量和字符串值
            try:
                val = float(val_str)  # 尝试转换为浮点数
                if var in self.parameters:  # 如果是常值parameters，更新它
                    self.parameters[var] = val  # 更新parameters值
                    print(f"调整常值参数 {var} = {val}")  # 打印确认
                elif var in self.states:  # 如果是动态states，更新它
                    self.states[var] = val  # 更新states值
                    print(f"调整动态状态 {var} = {val}")  # 打印确认
                else:
                    print(f"未知变量: {var}")  # 打印错误
            except ValueError:  # 如果转换失败
                print("无效数值")  # 打印错误
        elif event_str.lower() == 'continue':  # 检查是否为继续命令
            pass  # 无需操作，继续模拟
        elif event_str.lower() == 'quit':  # 检查是否为退出命令
            sys.exit(0)  # 退出程序
        else:
            print("无效命令。格式: 'adjust var=value' 或 'continue' 或 'quit'")  # 打印帮助

    def ode_func(self, t, y):  # 定义ODE函数，用于非线性动态积分（y为states向量）
        # 示例ODE: d(energy)/dt = metabolism_rate * nutrition_base - exercise_consume
        # d(metabolism_rate)/dt = -aging_decay * metabolism_rate (简化衰减为连续形式)
        energy_idx, meta_idx = 0, 1  # states索引：energy=0, metabolism_rate=1
        energy_rate = y[meta_idx] * self.parameters['nutrition_base'] - self.parameters['exercise_consume']  # 能量变化率
        meta_rate = -self.parameters['aging_decay'] * y[meta_idx]  # 代谢率衰减率（非线性）
        return [energy_rate, meta_rate]  # 返回导数向量

    def run_step(self):  # 单步运行方法，积分并更新states
        y0 = [self.states['energy'], self.states['metabolism_rate']]  # 初始states向量
        sol = solve_ivp(self.ode_func, [0, self.dt], y0, method='RK45', rtol=1e-6)  # 使用RK45积分器求解，相对容差1e-6
        if sol.success:  # 如果积分成功
            self.states['energy'] = sol.y[0, -1]  # 更新energy为最后一步值
            self.states['metabolism_rate'] = sol.y[1, -1]  # 更新metabolism_rate为最后一步值
        else:
            print("积分失败，步长可能过大")  # 打印警告
        self.step += 1  # 步数递增
        return self.get_states()  # 返回更新后的states

    def get_states(self):  # 获取即时states方法，返回字典副本
        return self.states.copy()  # 复制states，避免外部修改

    def pause_and_adjust(self):  # 暂停调整方法，CLI交互逻辑（GUI预留）
        print(f"\n--- 暂停 (步 {self.step}) ---")  # 打印暂停信息
        print(f"当前states: {self.get_states()}")  # 打印即时states
        print("输入: 'adjust var=value' (e.g., adjust nutrition_base=2500), 'continue', 或 'quit'")  # 打印提示
        event_str = input("> ").strip()  # 读取用户输入
        self.process_event(event_str)  # 处理输入事件

    def simulate(self, interactive=True):  # 主模拟方法，支持交互中断
        print(f"启动模拟: {self.total_steps} 步 (dt={self.dt} {self.model['simulator']['dt_unit']})")  # 打印启动信息
        while self.step < self.total_steps:  # 循环至总步数
            states = self.run_step()  # 执行单步，获取states
            print(f"步 {self.step}: states={states}")  # 打印即时输出
            if interactive and self.step % self.pause_every == 0 and self.step > 0:  # 检查交互暂停条件
                self.pause_and_adjust()  # 调用暂停调整
        print(f"\n模拟结束。最终states: {self.get_states()}")  # 打印结束结果
        # 预留优化接口：这里可调用HealthTuner评估最终states
        return self.get_states()  # 返回最终states

# 主程序入口
if __name__ == "__main__":  # 如果直接运行脚本
    engine = SimEngine("energy_balance.yaml")  # 创建引擎，加载YAML
    engine.simulate(interactive=True)  # 运行交互式模拟