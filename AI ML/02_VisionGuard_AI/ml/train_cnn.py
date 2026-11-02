"""Optional PyTorch training skeleton for replacing the lightweight detector.
Run only after installing torch/torchvision and preparing a labeled dataset.
"""
import torch
from torch import nn
class SmallDefectCNN(nn.Module):
    def __init__(self, classes=4):
        super().__init__()
        self.net=nn.Sequential(nn.Conv2d(3,16,3,padding=1),nn.ReLU(),nn.MaxPool2d(2),nn.Conv2d(16,32,3,padding=1),nn.ReLU(),nn.AdaptiveAvgPool2d(1))
        self.fc=nn.Linear(32,classes)
    def forward(self,x): return self.fc(self.net(x).flatten(1))
if __name__ == "__main__":
    print("Model definition ready. Connect a labeled DataLoader and training loop for your dataset.")
