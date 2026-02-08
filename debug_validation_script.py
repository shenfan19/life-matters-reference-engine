import sys
import os
sys.path.insert(0, os.getcwd())
import logging
from engine.src.loader_engine import LoaderEngine
from engine.src.mod_structure.core import ModStructure

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def debug_validation(files):
    print(f"\n--- Debugging Validation for: {files} ---")
    
    # Initialize LoaderEngine
    # Assuming the script is run from project root, mods_directory is "mods"
    engine = LoaderEngine(mods_directory="mods")
    
    print(f"Mods Directory: {os.path.abspath('mods')}")
    
    # 1. Test find_model_file for each file
    print("\n[Step 1] Testing find_model_file...")
    for f in files:
        # Simulate how api_server handles paths
        # Frontend sends "models/interventions/diet/banana.yaml"
        # api_server passes this directly to find_model_file if it starts with "models/"
        
        # Cleanup extension if needed logic from api_server (though validate_model logic I wrote does pass full path)
        # Let's try both with and without extension just in case
        
        path = engine.find_model_file(f)
        print(f"  Query: '{f}' -> Found: {path}")
        
        if not path:
             # Try without extension
             name_no_ext = os.path.splitext(f)[0]
             path_no_ext = engine.find_model_file(name_no_ext)
             print(f"  Query (no ext): '{name_no_ext}' -> Found: {path_no_ext}")


    # 2. Test merge_models logic
    print("\n[Step 2] Testing merge_models...")
    try:
        # In api_server: 
        # merge_result = loader_engine.merge_models(
        #     model_names=files_to_validate, 
        #     folders=None,
        #     output_path=None # In-memory merge
        # )
        
        merge_result = engine.merge_models(
            model_names=files,
            folders=None,
            output_path=None
        )
        
        if merge_result['success']:
            print("  Merge Success!")
            model = merge_result['data']
            print(f"  Variables: {len(model.variables)}")
            print(f"  Formulas: {len(model.formulas)}")
            
            # 3. Test validate_model
            print("\n[Step 3] Testing validate_model...")
            try:
                # Patch dir logic
                patch_dir = os.path.join("mods", "models", "_output", "patch")
                print(f"  Patch Output Dir: {patch_dir}")
                
                model.validate_model(output_dir=patch_dir)
                print("  Validation Passed!")
            except ValueError as e:
                print(f"  Validation Failed: {e}")
                
        else:
            print(f"  Merge Failed: {merge_result.get('error')}")

    except Exception as e:
        print(f"  Exception during merge/validate: {e}")

if __name__ == "__main__":
    # Test case: A source model and its patch
    files = [
        "models/_test/test_invalid.yaml",
        "models/_output/patch/test_invalid_patch.yaml"
    ]
    debug_validation(files)
