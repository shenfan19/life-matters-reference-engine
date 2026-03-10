import yaml from 'js-yaml';
import { Story, StoryMeta, Card, GameState, DeckConfig } from './types';

export class StoryLoader {
  private currentStory: Story | null = null;

  /**
   * Loads story configuration from strings (useful for web environment)
   */
  async loadStory(
    storyYaml: string,
    cardsYaml: string,
  ): Promise<Story> {
    const rawStory = yaml.load(storyYaml) as any;
    const rawCards = yaml.loadAll(cardsYaml) as any[];

    const cardsMap: Record<string, Card> = {};
    rawCards.forEach((c: any) => {
      if (c && c.id) {
        cardsMap[c.id] = c as Card;
      }
    });

    this.currentStory = {
      meta: rawStory.story_meta as StoryMeta,
      initialState: rawStory.initial_state as GameState,
      params: rawStory.params as Record<string, number>,
      cards: cardsMap,
      decks: rawStory.decks as DeckConfig[],
    };

    return this.currentStory;
  }

  getCurrentStory(): Story | null {
    return this.currentStory;
  }

  getCard(id: string): Card | undefined {
    return this.currentStory?.cards[id];
  }

  resolveValue(value: number | string): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.startsWith('params.')) {
      const paramName = value.split('.')[1];
      return this.currentStory?.params[paramName] ?? 0;
    }
    return 0;
  }
}
