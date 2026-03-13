import { Story, StoryMeta, Card, GameState, DeckConfig, CardEffect } from './types';

export class AdaptiveConverter {
  /**
   * Converts a Universal Dynamics Model YAML object into a Game Story object.
   */
  static convertModelToStory(modelData: any): Story {
    const { metadata, variables = {}, formulas = {} } = modelData;

    // 1. Map Metadata
    const meta: StoryMeta = {
      id: metadata.name || 'generated_story',
      name: metadata.description?.split('：')[0] || metadata.name || '未知故事',
      description: metadata.description || '由通用动力学模型自适应生成。',
      goal_variable: this.detectGoalVariable(variables),
      goal_value: 100,
      variable_labels: this.generateVariableLabels(variables),
    };

    // 2. Map Initial State (State variables)
    const initialState: GameState = {
      health: 100,
      money: 100,
      status: 1,
    };

    const params: Record<string, number> = {};
    const cards: Record<string, Card> = {};
    const playerCards: { id: string; count: number }[] = [];

    // 3. Process Variables
    Object.entries(variables).forEach(([name, data]: [string, any]) => {
      const type = data.type || 'state';
      const initialValue = data.value ?? 0;

      if (type === 'state') {
        initialState[name] = initialValue;
      } else if (type === 'parameter' || data.io_role === 'parameter') {
        params[name] = initialValue;
      } else if (type === 'input') {
        // Generate a Card for each Input
        const cardId = `card_${name}`;
        const card: Card = {
          id: cardId,
          name: data.description || name,
          type: this.detectCardType(name, data),
          description: `调整 ${data.description || name}。`,
          cost: 0,
          effects: [
            {
              variable: name,
              value: initialValue || 10,
              op: '+',
            },
          ],
        };
        cards[cardId] = card;
        playerCards.push({ id: cardId, count: 3 });
      }
    });

    // 4. Map Formulas to Environment Cards
    const envCards = this.processFormulas(formulas, variables, meta.id);
    envCards.forEach(c => {
      cards[c.id] = c;
    });

    // 5. Map Decks
    const decks: DeckConfig[] = [
      {
        id: 'player_initial',
        name: '初始手牌',
        cards: playerCards.length > 0 ? playerCards : [{ id: 'wait', count: 5 }],
      },
      {
        id: 'environment_initial',
        name: '环境牌堆',
        cards: envCards.map(c => ({ id: c.id, count: c.is_passive ? 99 : 1 })),
      },
    ];

    // Placeholder card if no inputs
    if (playerCards.length === 0) {
      cards['wait'] = {
        id: 'wait',
        name: '观望',
        type: 'environment',
        description: '静观其变。',
        effects: [],
      };
    }

    return {
      meta,
      initialState,
      params,
      cards,
      decks,
    };
  }

  private static processFormulas(formulas: any, variables: any, storyId: string): Card[] {
    const cards: Card[] = [];

    Object.entries(formulas).forEach(([id, data]: [string, any]) => {
      const { description, condition, dynamics, probability } = data;
      
      // Pattern recognition for effects
      const effects: CardEffect[] = [];
      if (dynamics) {
        Object.entries(dynamics).forEach(([varName, expr]: [string, any]) => {
          const parsed = this.parseFormulaExpression(varName, String(expr));
          if (parsed) effects.push(parsed);
        });
      }

      if (effects.length > 0) {
        cards.push({
          id: `env_${id}`,
          name: description || id,
          type: 'environment',
          description: description || `环境影响: ${id}`,
          is_passive: !probability && (!condition || condition === 'true'),
          condition: condition,
          probability: probability,
          effects: effects,
        });
      }
    });

    return cards;
  }

  private static parseFormulaExpression(varName: string, expr: string): CardEffect | null {
    // Advanced detection for complex patterns
    // We Map: x = x + (expression) -> { variable: 'x', value: 'expression', op: '+' }
    
    // Clean up step_size and whitespace
    let cleanExpr = expr.replace(/\* step_size/g, '').trim();
    
    // Check for relative change pattern: varName + (rest) or varName - (rest)
    const plusRegex = new RegExp(`^${varName}\\s*\\+\\s*(.*)$`);
    const minusRegex = new RegExp(`^${varName}\\s*\\-\\s*(.*)$`);
    
    const plusMatch = cleanExpr.match(plusRegex);
    if (plusMatch) {
      return {
        variable: varName,
        value: plusMatch[1].trim(),
        op: '+',
      };
    }
    
    const minusMatch = cleanExpr.match(minusRegex);
    if (minusMatch) {
      return {
        variable: varName,
        value: minusMatch[1].trim(),
        op: '-',
      };
    }
    
    // If it doesn't match a simple relative pattern, it might be an absolute set or too complex
    // For now, if it doesn't contain varName, we'll treat it as + from 0 (not very robust but better than nothing)
    if (!cleanExpr.includes(varName)) {
        return {
            variable: varName,
            value: cleanExpr,
            op: '+', // This effectively makes it additive to 0 if we start from 0, otherwise it's broken.
            // TODO: Enhance engine to handle "SET" operator
        };
    }

    return null;
  }

  private static formatGameValue(val: string): string | number {
    // If it's a simple number
    if (/^\d+(\.\d+)?$/.test(val)) return parseFloat(val);
    
    // If it's a variable reference, prefix with 'state.' for Engine
    // (We'll assume anything that's not a number is a variable for now)
    return `state.${val}`;
  }

  private static detectGoalVariable(variables: any): string {
    const goals = ['health_score', 'savings', 'safety_score', 'mastery', 'research_progress'];
    for (const goal of goals) {
      if (variables[goal]) return goal;
    }
    // Fallback to first state variable
    const firstState = Object.entries(variables).find(([_, v]: [string, any]) => v.type === 'state' || !v.type);
    return firstState ? firstState[0] : 'status';
  }

  private static generateVariableLabels(variables: any): Record<string, string> {
    const labels: Record<string, string> = {};
    const icons: Record<string, string> = {
      health: '❤️',
      money: '💰',
      savings: '🏦',
      glucose: '🩸',
      temperature: '🌡️',
      vitality: '⚡',
      fatigue: '😫',
      tension: '😰',
      safety: '🛡️',
    };

    Object.entries(variables).forEach(([name, data]: [string, any]) => {
      if (data.type === 'state') {
        const icon = icons[name] || icons[Object.keys(icons).find(k => name.includes(k)) || ''] || '📊';
        labels[name] = `${icon} ${data.description || name}`;
      }
    });
    return labels;
  }

  private static detectCardType(name: string, data: any): Card['type'] {
    const text = (name + (data.description || '')).toLowerCase();
    if (text.includes('rest') || text.includes('medicine') || text.includes('health') || text.includes('水')) return 'health';
    if (text.includes('work') || text.includes('overtime') || text.includes('training')) return 'work';
    if (text.includes('research') || text.includes('skill')) return 'goal';
    if (text.includes('risk') || text.includes('conflict') || text.includes('evacuation')) return 'risk';
    return 'environment';
  }
}
