import pickle
import pandas as pd
import os

BASE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE, "models", "ensemble_model.pkl")
PREP_PATH = os.path.join(BASE, "models", "preprocessor.pkl")
ENGINEERED_DATA = os.path.join(BASE, "data", "engineered_data.csv")

try:
    model = pickle.load(open(MODEL_PATH, "rb"))
    preprocessor = pickle.load(open(PREP_PATH, "rb"))
    df = pd.read_csv(ENGINEERED_DATA)
    
    print("=" * 70)
    print("MODEL & PREPROCESSOR FEATURE ANALYSIS")
    print("=" * 70)
    
    print("\n📋 PREPROCESSOR:")
    in_features = list(preprocessor.feature_names_in_)
    print(f"   Input Features ({len(in_features)}): {in_features}")
    
    out_features = list(preprocessor.get_feature_names_out())
    print(f"   Output Features ({len(out_features)})")
    
    print("\n📋 MODEL STACKING:")
    print(f"   Type: {type(model)}")
    print(f"   Estimators: {model.estimators_}")
    print(f"   Final Estimator: {model.final_estimator_}")
    
    # Try to get the model's expected feature count
    try:
        first_base = model.estimators_[0]
        if hasattr(first_base, 'n_features_in_'):
            print(f"   First base learner expects: {first_base.n_features_in_} features")
    except Exception as e:
        print(f"   Could not get base learner info: {e}")
    
    if hasattr(model.final_estimator_, 'n_features_in_'):
        print(f"   Final estimator expects: {model.final_estimator_.n_features_in_} features")
    
    # Test with actual data
    print("\n🧪 TESTING WITH ACTUAL DATA:")
    raw_cols = list(preprocessor.feature_names_in_)
    X_sample_raw = df[raw_cols].head(1)
    print(f"   Sample raw shape: {X_sample_raw.shape}")
    
    X_sample_transformed = preprocessor.transform(X_sample_raw)
    print(f"   Sample transformed shape: {X_sample_transformed.shape}")
    print(f"   Transformed feature count: {X_sample_transformed.shape[1]}")
    
    print("\n" + "=" * 70)
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
