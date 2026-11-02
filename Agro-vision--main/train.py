from src.modeling import train_and_save


if __name__ == "__main__":
    _, metrics = train_and_save()
    print(f"Training images: {metrics['training_images']}")
    print(f"Validation images: {metrics['validation_images']}")
    print(f"Synthetic macro-F1: {metrics['synthetic_macro_f1']:.3f}")
    print(f"Lesion mean IoU: {metrics['lesion_segmentation_mean_iou']:.3f}")
    print("Important: synthetic validation does not represent field accuracy.")
