import pickle
import os

BASE = os.path.dirname(os.path.abspath(__file__))
PREP_PATH = os.path.join(BASE, "models", "preprocessor.pkl")
FEATURE_PATH = os.path.join(BASE, "models", "training_features.pkl")

try:
    preprocessor = pickle.load(open(PREP_PATH, "rb"))
    training_features = pickle.load(open(FEATURE_PATH, "rb"))
    
    print("=" * 60)
    print("PREPROCESSOR ANALYSIS")
    print("=" * 60)
    
    print("\n📋 Saved training_features.pkl:")
    print(f"   Count: {len(training_features)}")
    print(f"   Features: {training_features}")
    
    print("\n📋 Preprocessor.feature_names_in_:")
    in_features = list(preprocessor.feature_names_in_)
    print(f"   Count: {len(in_features)}")
    print(f"   Features: {in_features}")
    
    print("\n📋 Preprocessor transformers:")
    for name, transformer, columns in preprocessor.transformers_:
        print(f"   {name}: {columns}")
    
    print("\n📋 Preprocessor output features (attempt to get):")
    try:
        out_features = list(preprocessor.get_feature_names_out())
        print(f"   Count: {len(out_features)}")
        print(f"   Features: {out_features}")
    except Exception as e:
        print(f"   Error: {e}")
    
    print("\n" + "=" * 60)
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
