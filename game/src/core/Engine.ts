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
    if (typeof value === 'string' && value.startsWith('params.')) {
      const paramName = value.split('.')[1];
      return this.story.params[paramName] ?? 0;
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
