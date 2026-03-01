import os
import yaml
from pathlib import Path

class StoryConverterPlugin:
    def __init__(self, context):
        self.context = context
        self.mods_dir = Path("mods")
        self.output_dir = self.mods_dir / "games"

    def run(self, inputs: dict) -> dict:
        """
        inputs = {
            'story_path': 'stories/marie_curie.yaml'
        }
        """
        story_path = inputs.get('story_path')
        if not story_path:
            return {'success': False, 'error': 'Missing story_path'}
        
        full_path = self.mods_dir / story_path
        if not full_path.exists():
            return {'success': False, 'error': f'Story not found: {story_path}'}
            
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                story_data = yaml.safe_load(f)
            
            # Simple conversion logic
            game_case = {
                'type': 'game_case',
                'title': f"{story_data.get('name', 'Untitled')} - Game",
                'story_ref': story_path,
                'levels': story_data.get('levels', [])
            }
            
            # Save to mods/games
            if not self.output_dir.exists():
                self.output_dir.mkdir(parents=True, exist_ok=True)
                
            output_file = self.output_dir / f"{Path(story_path).stem}_game.yaml"
            with open(output_file, 'w', encoding='utf-8') as f:
                yaml.dump(game_case, f, allow_unicode=True)
                
            return {
                'success': True,
                'message': f"Converted to {output_file.relative_to(self.mods_dir)}",
                'output_path': str(output_file)
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
