import { GameState } from '../types';

/**
 * 慢性辐射损伤动力学函数
 * @param state 当前游戏状态
 * @param params 故事参数
 * @returns 状态增量或修改后的状态
 */
export function chronic_damage_dynamics(state: GameState, params: Record<string, number>) {
    const damage = (state.radiation || 0) * (params.chronic_damage_rate || 0.1);
    return {
        health: state.health - damage
    };
}
