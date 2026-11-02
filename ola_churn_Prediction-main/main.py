# main.py

import os
import pickle
import pandas as pd

from src.data_loading_01 import load_data
from src.feature_engineering_02 import engineer_features
from src.preprocessing_06 import preprocess
from src.model_ensemble_09 import build_ensemble
from src.evaluation_08 import evaluate
from src.scoring_10 import score


def main():

    print("\n==============================")
    print("🚀 OLA DRIVER CHURN PIPELINE STARTED")
    print("==============================\n")

    # ---------------------------------------------------------
    # 1. LOAD DATA
    # ---------------------------------------------------------
    df = load_data("data/ola_driver.csv")
    print("Data Loaded Successfully!")
    print("Shape:", df.shape)

    # ---------------------------------------------------------
    # 2. FEATURE ENGINEERING
    # ---------------------------------------------------------
    print("\n🔧 Running Feature Engineering...")
    df = engineer_features(df)

    # ---------------------------------------------------------
    # 3. PREPROCESSING
    # ---------------------------------------------------------
    print("\n⚙️ Running Preprocessing...")
    X_train, X_test, y_train, y_test, preprocessor = preprocess(df)

    print("\nProcessed feature count:", X_train.shape[1])

    # ---------------------------------------------------------
    # 4. MODEL TRAINING + OPTUNA
    # ---------------------------------------------------------
    print("\n🤖 Training Ensemble Model...")

    USE_OPTUNA = True
    OPTIMIZE_FOR = "f1"   # or "recall" / "precision"

    model = build_ensemble(
        X_train,
        y_train,
        optimize=USE_OPTUNA,
        metric=OPTIMIZE_FOR,
        n_trials=20,
    )

    # ---------------------------------------------------------
    # 5. SAVE TRAINING RAW FEATURE LIST (IMPORTANT)
    # ---------------------------------------------------------
    os.makedirs("models", exist_ok=True)

    feature_list_path = "models/training_features.pkl"

    # preprocessor.feature_names_in_ gives original raw columns BEFORE OneHotEncoder
    training_features = list(preprocessor.feature_names_in_)

    with open(feature_list_path, "wb") as f:
        pickle.dump(training_features, f)

    print("\nSaved training features → models/training_features.pkl")
    print("Raw feature count:", len(training_features))
    
    # Save the preprocessor
    preprocessor_path = "models/preprocessor.pkl"
    with open(preprocessor_path, "wb") as f:
        pickle.dump(preprocessor, f)
    print("Saved preprocessor → models/preprocessor.pkl")

    # ---------------------------------------------------------
    # 6. EVALUATION
    # ---------------------------------------------------------
    print("\n📊 Evaluating Model Performance...")
    metrics = evaluate(model, X_test, y_test, optimize_for=OPTIMIZE_FOR)

    print("\n=== BEST MODEL METRICS ===")
    for k, v in metrics.items():
        print(f"{k}: {v}")

    # ---------------------------------------------------------
    # 7. SAVE ENGINEERED DATASET
    # ---------------------------------------------------------
    df.to_csv("data/engineered_data.csv", index=False)

    # ---------------------------------------------------------
    # 8. SCORE FULL DATASET
    # ---------------------------------------------------------
    print("\n🏷️ Generating Churn Scores...")

    # Raw columns before preprocessing
    raw_input_cols = list(preprocessor.feature_names_in_)

    X_full_raw = df[raw_input_cols].copy()
    X_full_processed = preprocessor.transform(X_full_raw)

    best_threshold = metrics["threshold"]
    df_scored = score(model, X_full_processed, df.copy(), threshold=best_threshold)

    df_scored.to_csv("data/churn_scores.csv", index=False)

    print("\nTop 5 Drivers by Churn Probability:")
    print(df_scored[['Driver_ID', 'churn_probability']].head())

    print("\n==============================")
    print("🎉 PIPELINE COMPLETED SUCCESSFULLY")
    print("==============================\n")


if __name__ == "__main__":
    main()
