from pathlib import Path
import pandas as pd, numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
BASE=Path(__file__).resolve().parents[1]
class Recommender:
    def __init__(self):
        self.items=pd.read_csv(BASE/"data/items.csv")
        self.inter=pd.read_csv(BASE/"data/interactions.csv")
        text=(self.items.category+" "+self.items.tags+" "+self.items.description).tolist()
        self.vec=TfidfVectorizer(ngram_range=(1,2),min_df=1)
        self.X=self.vec.fit_transform(text)
        self.item_idx={i:n for n,i in enumerate(self.items.item_id)}
        self.users=sorted(self.inter.user_id.unique().tolist())
        self.matrix=self.inter.pivot_table(index="user_id",columns="item_id",values="rating",fill_value=0).reindex(index=self.users, columns=self.items.item_id, fill_value=0)
    def recommend(self,user_id,k=5):
        if user_id not in self.users: raise ValueError("unknown user")
        hist=self.inter[self.inter.user_id==user_id]
        seen=set(hist.item_id)
        weights=np.array(hist.rating,dtype=float)
        idx=[self.item_idx[x] for x in hist.item_id]
        profile=np.asarray(self.X[idx].multiply(weights[:,None]).sum(axis=0)).reshape(1,-1)
        content=cosine_similarity(profile,self.X).ravel()
        uidx=self.users.index(user_id); sim=cosine_similarity(self.matrix.values)[uidx]
        sim[uidx]=0
        collab=np.zeros(len(self.items))
        denom=np.abs(sim).sum()+1e-9
        for j,it in enumerate(self.items.item_id): collab[j]=float(np.dot(sim,self.matrix[it].values)/denom)/5.0
        popularity=np.array([self.inter[self.inter.item_id==it].rating.mean() if len(self.inter[self.inter.item_id==it]) else 0 for it in self.items.item_id])/5.0
        score=.58*content+.30*collab+.12*popularity
        out=[]
        for j in np.argsort(-score):
            row=self.items.iloc[j]
            if row.item_id in seen: continue
            out.append({"item_id":row.item_id,"name":row["name"],"category":row.category,"description":row.description,"score":round(float(score[j]),3),"content":round(float(content[j]),3),"collaborative":round(float(collab[j]),3)})
            if len(out)>=k: break
        return {"user_id":user_id,"history":hist.merge(self.items,on="item_id")[["name","rating"]].to_dict("records"),"recommendations":out}
    def metrics(self):
        recs={u:[x["item_id"] for x in self.recommend(u,5)["recommendations"]] for u in self.users}
        coverage=len(set(sum(recs.values(),[])))/len(self.items)
        return {"catalog_coverage_at_5":round(coverage,3),"users":len(self.users),"items":len(self.items),"interactions":len(self.inter)}
engine=Recommender()
