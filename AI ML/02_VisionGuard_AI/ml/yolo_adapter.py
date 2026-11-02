"""Optional YOLO inference adapter.
Install `ultralytics` and provide weights to use this instead of the lightweight demo detector.
"""
def predict_yolo(image_path, weights="best.pt"):
    from ultralytics import YOLO
    model=YOLO(weights)
    return model.predict(image_path, verbose=False)
