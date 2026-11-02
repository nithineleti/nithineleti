import pickle
import pandas as pd

# Load preprocessor
preprocessor = pickle.load(open("models/preprocessor.pkl", "rb"))

# Extract training-time features
num_features = preprocessor.transformers_[0][2]
cat_features = preprocessor.transformers_[1][2]
ohe = preprocessor.named_transformers_["cat"]
cat_ohe = ohe.get_feature_names_out(cat_features)

MODEL_FEATURES = list(num_features) + list(cat_ohe)

print("\n=== TRAINING FEATURE COUNT ===")
print(len(MODEL_FEATURES))

print("\n=== TRAINING FEATURES ===")
for f in MODEL_FEATURES:
    print(f)
