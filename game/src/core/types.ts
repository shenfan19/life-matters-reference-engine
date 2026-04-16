export interface GameState {
  health: number;
  money: number;
  status: number;
  [key: string]: number; // Support for dynamic story-specific variables like 'radiation'
}

export interface StoryMeta {
  name: string;
  id: string;
  description: string;
  goal_value: number;
  goal_variable: string;
  variable_labels?: Record<string, string>;
  author?: string;
}


export interface CardEffect {
  variable: string;
  value: number | string; // Can be a number or a reference like 'params.income'
  op: '+' | '-' | '*' | '/';
}

export interface Card {
  id: string;
  name: string;
  type: 'work' | 'goal' | 'health' | 'risk' | 'environment';
  description: string;
  cost?: number;
  effects?: CardEffect[];
  is_passive?: boolean;
  dynamic_effect?: string; // Reference to a dynamics JS function
  condition?: string; // Logical expression for environment cards
  probability?: number; // Probability of triggering for environment cards
  reference?: string;
}

export interface DeckConfig {
  id: string;
  name: string;
  cards: { id: string; count: number }[];
}

export interface Story {
  meta: StoryMeta;
  initialState: GameState;
  params: Record<string, number>;
  cards: Record<string, Card>;
  decks: DeckConfig[];
}
