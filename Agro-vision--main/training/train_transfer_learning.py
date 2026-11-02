"""Optional MobileNetV3 transfer learning for a real ImageFolder dataset."""

import argparse
import json
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader
from torchvision import datasets, models, transforms


def run(data: Path, output: Path, epochs: int, batch_size: int):
    transform_train = transforms.Compose([
        transforms.Resize((224, 224)), transforms.RandomHorizontalFlip(),
        transforms.RandomRotation(18), transforms.ColorJitter(.2, .2, .2),
        transforms.ToTensor(), transforms.Normalize([.485,.456,.406],[.229,.224,.225]),
    ])
    transform_valid = transforms.Compose([
        transforms.Resize((224, 224)), transforms.ToTensor(),
        transforms.Normalize([.485,.456,.406],[.229,.224,.225]),
    ])
    train_set = datasets.ImageFolder(data / "train", transform_train)
    valid_set = datasets.ImageFolder(data / "val", transform_valid)
    train_loader = DataLoader(train_set, batch_size=batch_size, shuffle=True, num_workers=2)
    valid_loader = DataLoader(valid_set, batch_size=batch_size, num_workers=2)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = models.mobilenet_v3_small(weights=models.MobileNet_V3_Small_Weights.DEFAULT)
    model.classifier[3] = nn.Linear(model.classifier[3].in_features, len(train_set.classes))
    model.to(device); optimiser = torch.optim.AdamW(model.parameters(), lr=2e-4, weight_decay=1e-4); criterion = nn.CrossEntropyLoss()
    best_accuracy = 0.0
    output.mkdir(parents=True, exist_ok=True)
    for epoch in range(epochs):
        model.train()
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device); optimiser.zero_grad()
            loss = criterion(model(images), labels); loss.backward(); optimiser.step()
        model.eval(); correct = total = 0
        with torch.no_grad():
            for images, labels in valid_loader:
                labels = labels.to(device); prediction = model(images.to(device)).argmax(1)
                correct += int((prediction == labels).sum()); total += len(labels)
        accuracy = correct / max(1, total); print(f"epoch={epoch+1} validation_accuracy={accuracy:.4f}")
        if accuracy > best_accuracy:
            best_accuracy = accuracy; torch.save(model.state_dict(), output / "mobilenetv3_best.pt")
    (output / "metadata.json").write_text(json.dumps({"classes":train_set.classes,"best_accuracy":best_accuracy}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--data", type=Path, required=True); parser.add_argument("--output", type=Path, default=Path("artifacts/deep_model")); parser.add_argument("--epochs", type=int, default=8); parser.add_argument("--batch-size", type=int, default=32)
    args = parser.parse_args(); run(args.data, args.output, args.epochs, args.batch_size)
