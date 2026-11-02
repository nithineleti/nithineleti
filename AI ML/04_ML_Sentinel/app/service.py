from pathlib import Path
import json, time, sqlite3
import pandas as pd, numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
BASE=Path(__file__).resolve().parents[1]
FEATURES=["age","income","utilization","late_payments","tenure_years"]
class ModelService:
    def __init__(self):
        self.df=pd.read_csv(BASE/"data/training.csv")
        self.version=0; self.history=[]; self.train()
    def train(self):
        X=self.df[FEATURES]; y=self.df.target
        Xtr,Xte,ytr,yte=train_test_split(X,y,test_size=.25,random_state=42,stratify=y)
        self.model=Pipeline([("scale",StandardScaler()),("model",LogisticRegression(max_iter=1000,class_weight="balanced"))])
        self.model.fit(Xtr,ytr); prob=self.model.predict_proba(Xte)[:,1]; pred=(prob>=.5).astype(int)
        self.version+=1
        self.metrics={"accuracy":round(float(accuracy_score(yte,pred)),3),"f1":round(float(f1_score(yte,pred)),3),"roc_auc":round(float(roc_auc_score(yte,prob)),3),"version":f"v{self.version}","trained_rows":len(Xtr)}
        self.baseline={c:self.df[c].to_numpy() for c in FEATURES}; return self.metrics
    def predict(self,record):
        x=pd.DataFrame([{k:record[k] for k in FEATURES}]); p=float(self.model.predict_proba(x)[0,1]); label=int(p>=.5)
        event={"timestamp":int(time.time()),"probability":round(p,4),"label":label,**record}; self.history.append(event); self.history=self.history[-30:]; return event
    def _psi(self,base,new,bins=10):
        edges=np.unique(np.quantile(base,np.linspace(0,1,bins+1))); 
        if len(edges)<3:return 0.0
        edges=edges.astype(float); edges[0]=-np.inf; edges[-1]=np.inf
        b=np.histogram(base,bins=edges)[0]/len(base); n=np.histogram(new,bins=edges)[0]/len(new); b=np.clip(b,1e-6,None); n=np.clip(n,1e-6,None)
        return float(np.sum((n-b)*np.log(n/b)))
    def drift(self,mode="stable"):
        rng=np.random.default_rng(7); sample=self.df[FEATURES].sample(250,random_state=3).copy()
        if mode=="shifted":
            sample["income"]*=1.18; sample["utilization"]=np.clip(sample["utilization"]+.12,0,1)
        scores={c:round(self._psi(self.baseline[c],sample[c].to_numpy()),3) for c in FEATURES}; mx=max(scores.values()); return {"mode":mode,"scores":scores,"max_psi":mx,"status":"drift_detected" if mx>=.2 else "stable","threshold":.2}
service=ModelService()
