import tempfile
import unittest
from pathlib import Path

from src.data import generate_feedback, validate_feedback
from src.modeling import load_bundle
from src.privacy import redact_pii
from src.service import ConsumerVoiceService


class ConsumerVoiceTests(unittest.TestCase):
    def test_data_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            frame = generate_feedback(Path(directory) / "feedback.csv", rows=160, seed=8)
        validate_feedback(frame)
        self.assertEqual(len(frame), 160)

    def test_pii_redaction(self):
        clean, types = redact_pii("Email me at person@example.com or call 9876543210 about order ABC12345")
        self.assertNotIn("person@example.com", clean)
        self.assertNotIn("9876543210", clean)
        self.assertIn("email", types)
        self.assertIn("phone", types)

    def test_analysis_schema(self):
        result = ConsumerVoiceService().analyze("The package was damaged and support ignored my complaint.")
        self.assertIn(result["sentiment"], {"positive", "neutral", "negative"})
        self.assertGreaterEqual(result["sentiment_confidence"], 0)
        self.assertLessEqual(result["sentiment_confidence"], 1)

    def test_rag_returns_cited_evidence(self):
        answer, evidence = ConsumerVoiceService().ask("What are customers saying about damaged packaging?")
        self.assertIn("[R1]", answer)
        self.assertEqual(evidence.iloc[0]["citation"], "R1")
        self.assertFalse(evidence["text"].str.contains(r"[\w.-]+@[\w.-]+", regex=True).any())

    def test_saved_metrics_are_reasonable(self):
        metrics = load_bundle().metrics
        self.assertGreater(metrics["sentiment_macro_f1"], .80)
        self.assertGreater(metrics["topic_macro_f1"], .80)


if __name__ == "__main__":
    unittest.main()
