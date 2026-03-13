import { GameState, Card, Story } from './types';
import { StoryLoader } from './StoryLoader';

export class Engine {
  private state: GameState;
  private story: Story;
  private loader: StoryLoader;
  private dynamics: Record<string, Function> = {};

  constructor(story: Story, loader: StoryLoader) {
    this.story = story;
    this.loader = loader;
    this.state = { ...story.initialState };
  }

  /**
   * Runs the story-wide passive dynamics (non-card specific effects)
   */
  processPassiveEffects() {
      // For now, we find all environment cards marked as passive and apply them once
      // In a more complex engine, this would be story-defined outputs
      Object.values(this.story.cards).forEach(card => {
          if (card.type === 'environment' && card.is_passive) {
              this.applyCard(card);
          }
      });
  }


  getState(): GameState {
    return this.state;
  }

  registerDynamicEffect(name: string, fn: Function) {
    this.dynamics[name] = fn;
  }

  /**
   * Applies the effect of a card to the current state
   */
  applyCard(card: Card) {
    if (card.effects) {
      card.effects.forEach((effect) => {
        const val = this.resolveValue(effect.value);
        this.applyEffect(effect.variable, val, effect.op);
      });
    }

    if (card.dynamic_effect && this.dynamics[card.dynamic_effect]) {
        const newState = this.dynamics[card.dynamic_effect](this.state, this.story.params);
        this.state = { ...this.state, ...newState };
    }
  }

  private resolveValue(value: number | string): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      if (value.startsWith('params.')) {
        const paramName = value.split('.')[1];
        return this.story.params[paramName] ?? 0;
      }
      if (value.startsWith('state.')) {
        const expression = value.split('.')[1];
        return this.evaluateExpression(expression);
      }
      if (this.state[value] !== undefined) return this.state[value];
      
      // Try to evaluate as a generic expression if it contains operators
      if (/[+\-*/]/.test(value)) {
          return this.evaluateExpression(value);
      }
    }
    return 0;
  }

  private evaluateExpression(expr: string): number {
    try {
      // Basic sanitization and prefixing
      let sanitized = expr
        .replace(/\b([a-zA-Z_]\w*)\b/g, (match) => {
          // If it's a number, leave it
          if (!isNaN(parseFloat(match))) return match;
          // If it's a state variable, resolve it
          return String(this.state[match] ?? 0);
        });

      // Use a safe evaluation approach for basic arithmetic
      // Warning: simple Function constructor for arithmetic is safer than eval but still limited
      // For this system, we'll use a basic token-based evaluator or a simplified math parser
      // To keep it simple and robust without external deps:
      return this.simpleEval(sanitized);
    } catch (e) {
      console.error('Expression evaluation failed:', expr, e);
      return 0;
    }
  }

  private simpleEval(tokens: string): number {
    // Remove all whitespace
    const clean = tokens.replace(/\s+/g, '');
    // Very basic support for simple expressions
    try {
        // Fallback to a basic Function for complex arithmetic if safe enough (only numbers and ops left)
        if (/^[0-9.+\-*/() ]+$/.test(clean)) {
            return new Function(`return ${clean}`)();
        }
    } catch {
        return 0;
    }
    return 0;
  }

  private applyEffect(variable: string, value: number, op: string) {
    const currentVal = this.state[variable] ?? 0;
    switch (op) {
      case '+':
        this.state[variable] = currentVal + value;
        break;
      case '-':
        this.state[variable] = currentVal - value;
        break;
      case '*':
        this.state[variable] = currentVal * value;
        break;
      case '/':
        this.state[variable] = currentVal / (value || 1);
        break;
    }
  }

  /**
   * Evaluates a string condition (e.g., "radiation > 50")
   */
  checkCondition(condition: string): boolean {
    // Improved expression parser (handling missing spaces)
    const match = condition.match(/(\w+)\s*([><=!]+)\s*(\d+)/);
    if (!match) return false;

    const [, variable, op, value] = match;
    const currentVal = this.state[variable] ?? 0;
    const targetVal = parseFloat(value);


    switch (op) {
      case '>': return currentVal > targetVal;
      case '<': return currentVal < targetVal;
      case '>=': return currentVal >= targetVal;
      case '<=': return currentVal <= targetVal;
      case '==': return currentVal === targetVal;
      default: return false;
    }
  }

  checkVictory(): 'win' | 'lose' | 'ongoing' {
    const goalVar = this.story.meta.goal_variable;
    const goalVal = this.story.meta.goal_value;
    
    if (this.state.health <= 0) return 'lose';
    if (this.state[goalVar] >= goalVal) return 'win';
    
    return 'ongoing';
  }
}
