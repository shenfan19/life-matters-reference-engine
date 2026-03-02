import os
import yaml
from pathlib import Path

class ScenarioConverterPlugin:
    def __init__(self, context):
        self.context = context
        self.mods_dir = Path("mods")
        self.output_dir = self.mods_dir / "games"

    def run(self, inputs: dict) -> dict:
        """
        inputs = {
            'scenario_path': 'scenarios/population_model.yaml',
            'story_path': 'stories/marie_curie.yaml',
            'mapping': {
                'cost': 'energy',
                'atk': 'population',
                'def': 'resources',
                'selectedDynamics': ['birth_rate', 'death_rate']
            }
        }
        """
        scenario_path = inputs.get('scenario_path')
        story_path = inputs.get('story_path')
        mapping = inputs.get('mapping', {})
        
        if not scenario_path or not story_path:
            return {'success': False, 'error': 'Missing scenario_path or story_path'}
        
        scenario_full_path = self.mods_dir / scenario_path
        story_full_path = self.mods_dir / story_path
        
        if not scenario_full_path.exists():
            return {'success': False, 'error': f'Scenario not found: {scenario_path}'}
        if not story_full_path.exists():
            return {'success': False, 'error': f'Story not found: {story_path}'}
            
        try:
            with open(scenario_full_path, 'r', encoding='utf-8') as f:
                scenario_data = yaml.safe_load(f)
            with open(story_full_path, 'r', encoding='utf-8') as f:
                story_data = yaml.safe_load(f)
            
            # Use mapping to generate card attributes
            game_case = {
                'type': 'game_case',
                'title': f"{Path(scenario_path).stem} -> {Path(story_path).stem} Game",
                'source_scenario': scenario_path,
                'target_story': story_path,
                'mapping_info': mapping,
                'levels': story_data.get('levels', []),
                'cards': [
                    {
                        'id': 'converted_card_1',
                        'name': f"Converted {Path(scenario_path).stem} Card",
                        'cost_var': mapping.get('cost'),
                        'atk_var': mapping.get('atk'),
                        'def_var': mapping.get('def'),
                        'dynamics': mapping.get('selectedDynamics', [])
                    }
                ]
            }
            
            if not self.output_dir.exists():
                self.output_dir.mkdir(parents=True, exist_ok=True)
                
            output_file = self.output_dir / f"{Path(scenario_path).stem}_to_{Path(story_path).stem}.yaml"
            with open(output_file, 'w', encoding='utf-8') as f:
                yaml.dump(game_case, f, allow_unicode=True)
                
            return {
                'success': True,
                'message': f"Successfully converted to {output_file.relative_to(self.mods_dir)}",
                'output_path': str(output_file)
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
