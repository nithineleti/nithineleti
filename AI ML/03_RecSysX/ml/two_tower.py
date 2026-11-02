"""Optional PyTorch two-tower model for learned user/item embeddings."""
import torch
from torch import nn
class TwoTower(nn.Module):
    def __init__(self,n_users,n_items,dim=32):
        super().__init__(); self.user=nn.Embedding(n_users,dim); self.item=nn.Embedding(n_items,dim)
    def forward(self,u,i):
        a=nn.functional.normalize(self.user(u),dim=-1); b=nn.functional.normalize(self.item(i),dim=-1)
        return (a*b).sum(-1)
