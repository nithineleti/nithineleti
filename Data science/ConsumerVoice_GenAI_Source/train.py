from src.data import generate_feedback
from src.modeling import train_and_save


if __name__ == "__main__":
    data = generate_feedback()
    _, metrics = train_and_save()
    print(f"Generated {len(data):,} fictional feedback records")
    print(f"Sentiment macro-F1: {metrics['sentiment_macro_f1']:.3f}")
    print(f"Topic macro-F1: {metrics['topic_macro_f1']:.3f}")
    print(f"Urgent-case F1: {metrics['urgent_f1']:.3f}")
