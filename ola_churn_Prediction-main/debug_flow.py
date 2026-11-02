import pandas as pd
from src.data_loading_01 import load_data
from src.feature_engineering_02 import engineer_features
from src.preprocessing_06 import preprocess

df = load_data("data/ola_driver.csv")
print("After load_data:")
print(f"  Has 'Unnamed: 0': {'Unnamed: 0' in df.columns}")
print(f"  Shape: {df.shape}")

df = engineer_features(df)
print("\nAfter engineer_features:")
print(f"  Has 'Unnamed: 0': {'Unnamed: 0' in df.columns}")
print(f"  Shape: {df.shape}")
print(f"  Columns (first 10): {list(df.columns)[:10]}")

# Now call preprocess
X_train, X_test, y_train, y_test, preprocessor = preprocess(df)
print("\nPreprocessor:")
print(f"  feature_names_in_: {list(preprocessor.feature_names_in_)}")
print(f"  Count: {len(list(preprocessor.feature_names_in_))}")
