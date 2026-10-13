"""用 yoxi 叫車資料訓練出門卡的三個模型，並用時間切分驗證。

  叫車機率：某位乘客在某個時段（平日／假日 × 4 個時段）會不會叫車去某個常去地點
            特徵用前一個月，標籤看下一個月：2 月 → 3 月訓練，3 月 → 4 月測試
  等車時間：叫車時間 → 行程開始時間（分鐘），2–3 月訓練、4 月測試
  車程    ：行駛分鐘數，2–3 月訓練、4 月測試
  固定行程：解法 2。從過去 4 週的叫車找出規律（同一條路線、同一個星期幾、時間差 45 分內、出現 2 週以上），
            預測下一週會不會照搭，輸出的機率就是信心度。第 4–8 週當目標訓練、第 9–11 週（4 月）測試

執行：python ml/train.py（需要 pandas、scikit-learn、lightgbm），結果寫到 ml/metrics.json
"""
import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, mean_absolute_error, roc_auc_score

ROOT = Path(__file__).resolve().parent
DATA = ROOT.parent / "yoxi_data" / "yoxi_數據資料.csv"
GRID = 0.0025          # 常去地點：約 250–280 公尺的網格
WAIT_CAP = 60          # 超過 60 分視為預約單，不算等車
SEED = 7


def load():
    d = pd.read_csv(DATA)
    for c in ["OrderStartDateTime_UTC8", "OrderEndDateTime_UTC8", "OrderFormCreatedTime_UTC8"]:
        d[c] = pd.to_datetime(d[c], format="mixed")
    d = d.rename(columns={"OrderStartDateTime_UTC8": "start", "OrderFormCreatedTime_UTC8": "created"})
    d["wait"] = (d.start - d.created).dt.total_seconds() / 60
    h = d.start.dt.hour
    d["hour"] = h
    d["slot15"] = h * 4 + d.start.dt.minute // 15
    d["dow"] = d.start.dt.dayofweek
    d["weekend"] = (d.dow >= 5).astype(int)
    d["block"] = np.select([(h >= 6) & (h < 10), (h >= 10) & (h < 16), (h >= 16) & (h < 20)], [0, 1, 2], 3)
    d["cell"] = d.weekend * 4 + d.block  # 8 個時段
    d["pg"] = grid(d.PickUpLatitude, d.PickUpLongitude)
    d["dg"] = grid(d.DropOffLatitude, d.DropOffLongitude)
    d["dist"] = haversine(d.PickUpLatitude, d.PickUpLongitude, d.DropOffLatitude, d.DropOffLongitude)
    d["ppoi"] = poi(d.PickUpLocationType)
    d["dpoi"] = poi(d.DropOffLocationType)
    return d


def grid(lat, lon, g=GRID):
    return (np.floor(lat / g).astype(np.int64) * 100000 + np.floor(lon / g).astype(np.int64))


def haversine(a1, o1, a2, o2):
    a1, o1, a2, o2 = map(np.radians, (a1, o1, a2, o2))
    x = np.sin((a2 - a1) / 2) ** 2 + np.cos(a1) * np.cos(a2) * np.sin((o2 - o1) / 2) ** 2
    return 6371 * 2 * np.arcsin(np.sqrt(x))


POI = [("高鐵", 1), ("機場", 2), ("航廈", 2), ("車站", 3), ("火車站", 3), ("捷運", 4), ("醫院", 5), ("診所", 5), ("飯店", 6), ("酒店", 6)]


def poi(s):
    """地點類型：0 沒標、1 高鐵、2 機場、3 車站、4 捷運、5 醫院、6 飯店、7 其他有名稱的地點"""
    s = s.fillna("")
    out = np.where(s != "", 7, 0)
    for k, v in reversed(POI):
        out = np.where(s.str.contains(k), v, out)
    return out


def month(d, m):
    return d[d.start.dt.month == m]


# ---------------- 叫車機率 ----------------
def ride_table(feat, label):
    """候選＝前一個月去過的 (乘客, 地點) × 8 個時段；標籤＝下一個月在這個時段有叫車去這裡"""
    end = feat.start.max()
    pairs = feat.groupby(["RiderId", "dg"]).agg(n_place=("Id", "size"), last=("start", "max"),
                                                lat=("DropOffLatitude", "mean"), lon=("DropOffLongitude", "mean"),
                                                dpoi=("dpoi", "max"), dist_trip=("dist", "mean")).reset_index()
    pairs["days_since_place"] = (end - pairs["last"]).dt.total_seconds() / 86400
    cand = pairs.merge(pd.DataFrame({"cell": range(8)}), how="cross")
    cand["weekend"] = cand.cell // 4
    cand["block"] = cand.cell % 4
    n_cell = feat.groupby(["RiderId", "dg", "cell"]).size().rename("n_cell")
    n_back = feat.groupby(["RiderId", "pg", "cell"]).size().rename("n_back").rename_axis(["RiderId", "dg", "cell"])
    n_slot = feat.groupby(["RiderId", "cell"]).size().rename("n_slot")
    rider = feat.groupby("RiderId").agg(n_rider=("Id", "size"), active_days=("start", lambda x: x.dt.date.nunique()))
    home = feat.groupby(["RiderId", "pg"]).agg(k=("Id", "size"), hlat=("PickUpLatitude", "mean"), hlon=("PickUpLongitude", "mean"))
    home = home.sort_values("k").groupby(level=0).tail(1).reset_index(level=1, drop=True)[["hlat", "hlon"]]
    pop = feat.groupby(["dg", "cell"]).size().rename("place_pop_cell")
    pop_all = feat.groupby("dg").RiderId.nunique().rename("place_riders")
    t = (cand.join(n_cell, on=["RiderId", "dg", "cell"]).join(n_back, on=["RiderId", "dg", "cell"])
         .join(n_slot, on=["RiderId", "cell"]).join(rider, on="RiderId").join(home, on="RiderId")
         .join(pop, on=["dg", "cell"]).join(pop_all, on="dg"))
    t = t.fillna({"n_cell": 0, "n_back": 0, "n_slot": 0, "place_pop_cell": 0})
    t["share_place"] = t.n_place / t.n_rider
    t["share_slot"] = t.n_slot / t.n_rider
    t["dist_home"] = haversine(t.hlat, t.hlon, t.lat, t.lon)
    y = label.groupby(["RiderId", "dg", "cell"]).size().rename("y")
    t = t.join(y, on=["RiderId", "dg", "cell"])
    t["y"] = (t.y.fillna(0) > 0).astype(int)
    return t


RIDE_X = ["n_cell", "n_place", "n_back", "n_slot", "n_rider", "active_days", "share_place", "share_slot",
          "days_since_place", "dist_home", "dist_trip", "place_pop_cell", "place_riders", "dpoi", "weekend", "block"]
RIDE_NAME = {"n_cell": "這個時段去這裡的次數", "n_place": "去這裡的總次數", "n_back": "這個時段從這裡叫車離開的次數",
             "n_slot": "這個時段叫車的次數", "n_rider": "上個月叫車總次數", "active_days": "上個月有叫車的天數",
             "share_place": "去這裡占你叫車的比例", "share_slot": "這個時段占你叫車的比例", "days_since_place": "上次去這裡是幾天前",
             "dist_home": "離你常上車處的距離", "dist_trip": "平常車程距離", "place_pop_cell": "這個地點這個時段的熱門度",
             "place_riders": "去這個地點的乘客數", "dpoi": "地點類型", "weekend": "平日／假日", "block": "時段"}


def ride_model(d):
    tr = ride_table(month(d, 2), month(d, 3))
    te = ride_table(month(d, 3), month(d, 4))
    m = lgb.LGBMClassifier(n_estimators=400, learning_rate=0.05, num_leaves=63, min_child_samples=100,
                           subsample=0.8, subsample_freq=1, colsample_bytree=0.8, random_state=SEED, verbose=-1)
    m.fit(tr[RIDE_X], tr.y, categorical_feature=["dpoi", "block"])
    p = m.predict_proba(te[RIDE_X])[:, 1]
    out = {"train_rows": len(tr), "test_rows": len(te), "test_pos_rate": round(te.y.mean(), 4),
           "auc": round(roc_auc_score(te.y, p), 4), "pr_auc": round(average_precision_score(te.y, p), 4),
           "baseline_auc_n_cell": round(roc_auc_score(te.y, te.n_cell + te.n_place / 1000), 4),
           "baseline_pr_auc_n_cell": round(average_precision_score(te.y, te.n_cell + te.n_place / 1000), 4)}
    # App 的三段門檻：≥0.6 建議叫車、0.3–0.6 可以叫車、<0.3 搭大眾運輸
    for lo, hi, k in [(0.6, 1.01, "call"), (0.3, 0.6, "maybe"), (0, 0.3, "transit")]:
        sel = (p >= lo) & (p < hi)
        out[f"band_{k}"] = {"share": round(sel.mean(), 4), "actual_rate": round(te.y[sel].mean(), 4) if sel.any() else None}
    gain = pd.Series(m.booster_.feature_importance("gain"), index=RIDE_X).sort_values(ascending=False)
    out["top_features"] = [[RIDE_NAME[k], round(v / gain.sum(), 3)] for k, v in gain.head(5).items()]
    # 依地點類型：模型在高鐵、機場、醫院的表現
    out["auc_by_poi"] = {str(k): round(roc_auc_score(g.y, p[g.index]), 4) for k, g in te.reset_index(drop=True).groupby("dpoi") if g.y.nunique() == 2 and len(g) > 2000}
    return out


# ---------------- 等車時間、車程 ----------------
def reg(tr, te, X, ycol, cat, baselines):
    m = lgb.LGBMRegressor(objective="l1", n_estimators=600, learning_rate=0.05, num_leaves=127, min_child_samples=50,
                          subsample=0.8, subsample_freq=1, colsample_bytree=0.8, random_state=SEED, verbose=-1)
    m.fit(tr[X], tr[ycol], categorical_feature=cat)
    p = m.predict(te[X])
    err = np.abs(p - te[ycol])
    out = {"train_rows": len(tr), "test_rows": len(te), "mae": round(mean_absolute_error(te[ycol], p), 3),
           "median_ae": round(float(np.median(err)), 3), "within_2min": round(float((err <= 2).mean()), 4),
           "within_3min": round(float((err <= 3).mean()), 4), "test_mean": round(te[ycol].mean(), 3)}
    out["mape"] = round(float((err / te[ycol]).mean()), 4)
    for k, b in baselines.items():
        out[f"baseline_mae_{k}"] = round(mean_absolute_error(te[ycol], b), 3)
    return out


def live(d, key, wins=(15, 30, 60)):
    """即時特徵（叫車當下 yoxi 就知道的）：同區過去 w 分鐘的叫車數，以及 20–90 分鐘前叫的車平均等了多久"""
    out = {f"dem{w}": np.zeros(len(d)) for w in wins}
    out["recent_wait"] = np.full(len(d), np.nan)
    t_all = d.created.values.astype("datetime64[s]").astype(np.int64) / 60
    for _, idx in d.groupby(key).indices.items():
        o = idx[np.argsort(t_all[idx], kind="stable")]
        t = t_all[o]
        cw = np.concatenate([[0], np.cumsum(d.wait.values[o])])
        for w in wins:
            out[f"dem{w}"][o] = np.arange(len(o)) - np.searchsorted(t, t - w, "left")
        a, b = np.searchsorted(t, t - 90, "left"), np.searchsorted(t, t - 20, "left")
        n = b - a
        out["recent_wait"][o] = np.where(n > 0, (cw[b] - cw[a]) / np.maximum(n, 1), np.nan)
    return pd.DataFrame(out, index=d.index)


def wait_model(d):
    over = int((month(d, 4).wait > WAIT_CAP).sum())
    d = d[(d.wait > 0) & (d.wait <= WAIT_CAP)].copy()
    d["wg"] = grid(d.PickUpLatitude, d.PickUpLongitude, 0.01)  # 約 1 公里的上車區
    d = d.join(live(d, "wg"))
    d["city_dem15"] = live(d.assign(all=0), "all", wins=(15,))["dem15"]
    tr, te = d[d.start.dt.month.isin([2, 3])].copy(), month(d, 4).copy()
    # 只用訓練期算出來的歷史統計當特徵
    enc = tr.groupby(["wg", "hour", "weekend"]).wait.agg(hist_wait="median", hist_n="size")
    enc2 = tr.groupby("wg").wait.agg(zone_wait="median", zone_n="size")
    for t in (tr, te):
        t[["hist_wait", "hist_n"]] = t.join(enc, on=["wg", "hour", "weekend"])[["hist_wait", "hist_n"]].values
        t[["zone_wait", "zone_n"]] = t.join(enc2, on="wg")[["zone_wait", "zone_n"]].values
    X = ["PickUpLatitude", "PickUpLongitude", "slot15", "hour", "dow", "weekend", "ppoi", "hist_wait", "hist_n", "zone_wait", "zone_n",
         "dem15", "dem30", "dem60", "recent_wait", "city_dem15"]
    base = {"global_median": np.full(len(te), tr.wait.median()),
            "zone_hour_median": te.hist_wait.fillna(te.zone_wait).fillna(tr.wait.median())}
    out = reg(tr, te, X, "wait", ["ppoi"], base)
    out["no_live"] = reg(tr, te, X[:11], "wait", ["ppoi"], {})  # 對照：不用即時特徵
    out["excluded_over_cap"] = over
    return out


def travel_model(d):
    d = d[(d.TravelTime >= 1) & (d.TravelTime <= 120) & (d.dist > 0.05)].copy()
    tr, te = d[d.start.dt.month.isin([2, 3])].copy(), month(d, 4).copy()
    X = ["PickUpLatitude", "PickUpLongitude", "DropOffLatitude", "DropOffLongitude", "dist", "slot15", "hour", "dow", "weekend", "ppoi", "dpoi"]
    k, b = np.polyfit(tr.dist, tr.TravelTime, 1)  # 基準：直線距離 × 平均速度
    return reg(tr, te, X, "TravelTime", ["ppoi", "dpoi"], {"distance_linear": k * te.dist + b})


# ---------------- 固定行程（解法 2） ----------------
HGRID = 0.005     # 規律用約 500 公尺網格，容許上車點差一點
HWEEKS = 4        # 看過去 4 週
HTOL = 45         # 同一個規律：時間差 45 分內
HNEAR = 0.6       # 有照搭：起訖都在 600 公尺內、時間差 60 分內
HX = ["weeks", "n", "tstd", "since", "span", "od_n", "od_days", "r_n", "r_weeks", "share", "hour", "wkend", "dow", "dist", "ppoi", "dpoi"]


def habit_cands(d, t):
    """第 t 週的候選規律（用第 t−4 到 t−1 週的叫車）與標籤（第 t 週有沒有照搭）。"""
    h = d[(d.wk >= t - HWEEKS) & (d.wk < t)]
    key = ["RiderId", "dow", "hp", "hd"]
    c = h.groupby(key).agg(med=("mins", "median"), plat=("PickUpLatitude", "median"), plon=("PickUpLongitude", "median"),
                           dlat=("DropOffLatitude", "median"), dlon=("DropOffLongitude", "median"), dist=("dist", "median"),
                           ppoi=("ppoi", "max"), dpoi=("dpoi", "max")).reset_index()
    h2 = h.merge(c[key + ["med"]], on=key)
    h2 = h2[(h2.mins - h2.med).abs() <= HTOL]
    st = h2.groupby(key).agg(weeks=("wk", "nunique"), n=("wk", "size"), tstd=("mins", "std"), last=("wk", "max"), first=("wk", "min")).reset_index()
    c = c.merge(st, on=key)
    c = c[c.weeks >= 2].copy()
    od = h.groupby(["RiderId", "hp", "hd"]).agg(od_n=("wk", "size"), od_days=("dow", "nunique")).reset_index()  # 同路線其他天也搭（通勤型）
    c = c.merge(od, on=["RiderId", "hp", "hd"]).merge(h.groupby("RiderId").agg(r_n=("wk", "size"), r_weeks=("wk", "nunique")).reset_index(), on="RiderId")
    c["since"], c["span"] = t - 1 - c["last"], c["last"] - c["first"]
    c["tstd"] = c.tstd.fillna(0)
    c["hour"], c["wkend"], c["share"] = c.med // 60, (c.dow >= 5).astype(int), c.n / c.r_n
    tg = d[d.wk == t][["RiderId", "dow", "mins", "PickUpLatitude", "PickUpLongitude", "DropOffLatitude", "DropOffLongitude"]]
    m = c[["RiderId", "dow", "med", "plat", "plon", "dlat", "dlon"]].reset_index().merge(tg, on=["RiderId", "dow"])
    m = m[(haversine(m.plat, m.plon, m.PickUpLatitude, m.PickUpLongitude) < HNEAR) & (haversine(m.dlat, m.dlon, m.DropOffLatitude, m.DropOffLongitude) < HNEAR)]
    c["diff"] = (m.mins - m.med).abs().groupby(m["index"]).min().reindex(c.index).values  # 照搭時和習慣時間差幾分（沒搭是 NaN）
    c["y"] = (c["diff"] <= 60).astype(int)
    c["t"] = t
    return c


def habit_model(d):
    d = d.assign(wk=(d.start.dt.normalize() - pd.Timestamp("2026-02-02")).dt.days // 7, mins=d.start.dt.hour * 60 + d.start.dt.minute,
                 hp=grid(d.PickUpLatitude, d.PickUpLongitude, HGRID), hd=grid(d.DropOffLatitude, d.DropOffLongitude, HGRID))
    d = d[d.wk >= 0]  # 2/2（週一）起算
    tr = pd.concat([habit_cands(d, t) for t in range(4, 9)])
    te = pd.concat([habit_cands(d, t) for t in range(9, 12)])
    m = lgb.LGBMClassifier(n_estimators=400, learning_rate=0.03, num_leaves=31, min_child_samples=100, random_state=SEED, verbose=-1)
    m.fit(tr[HX], tr.y, categorical_feature=["ppoi", "dpoi"])
    p = m.predict_proba(te[HX])[:, 1]
    base = te.weeks / HWEEKS
    out = {"train_rows": len(tr), "test_rows": len(te), "test_pos_rate": round(float(te.y.mean()), 4), "test_riders": int(te.RiderId.nunique()),
           "auc": round(roc_auc_score(te.y, p), 4), "pr_auc": round(average_precision_score(te.y, p), 4),
           "baseline_auc_weeks": round(roc_auc_score(te.y, base), 4), "baseline_pr_auc_weeks": round(average_precision_score(te.y, base), 4)}
    # 信心度校準：模型說幾成，實際有幾成照搭
    out["calibration"] = {f"{lo}-{hi}": {"share": round(float(((p >= lo) & (p < hi)).mean()), 4), "mean_conf": round(float(p[(p >= lo) & (p < hi)].mean()), 4),
                                         "actual_rate": round(float(te.y[(p >= lo) & (p < hi)].mean()), 4)}
                          for lo, hi in [(0.8, 1.01), (0.6, 0.8), (0.4, 0.6), (0.2, 0.4), (0, 0.2)]}
    # 三段：≥0.7 推播預約、0.4–0.7 只放 App、<0.4 不提醒
    for k, (lo, hi) in {"band_push": (0.7, 1.01), "band_app": (0.4, 0.7), "band_quiet": (0, 0.4)}.items():
        sel = (p >= lo) & (p < hi)
        out[k] = {"share": round(float(sel.mean()), 4), "actual_rate": round(float(te.y[sel].mean()), 4),
                  "within30": round(float((te["diff"][sel] <= 30).mean()), 4), "within15": round(float((te["diff"][sel] <= 15).mean()), 4),
                  "median_diff": float(te["diff"][sel & (te.y == 1).values].median()),
                  "per_week": int(round(sel.sum() / 3)), "riders_per_week": int(round(te[sel].groupby("t").RiderId.nunique().mean()))}
    out["by_weeks"] = {int(k): round(float(v), 4) for k, v in te.groupby("weeks").y.mean().items()}
    imp = m.booster_.feature_importance("gain")
    names = {"od_n": "同路線搭過幾次", "weeks": "4 週裡出現幾週", "tstd": "時間穩不穩", "dow": "星期幾", "dist": "距離", "hour": "時段",
             "since": "上次是幾週前", "share": "占你叫車的比例", "span": "持續幾週", "n": "這個規律搭幾次", "od_days": "同路線搭幾種星期",
             "r_n": "你總共叫幾次", "r_weeks": "你有叫車的週數", "wkend": "假日", "ppoi": "上車地點類型", "dpoi": "下車地點類型"}
    out["top_features"] = [[names[k], round(float(v / imp.sum()), 3)] for k, v in sorted(zip(HX, imp), key=lambda x: -x[1])[:5]]
    # 常搭的人裡，有多少人 12 週內有出現 3 週以上的固定規律（簡報第 3 頁）
    h = d[d.wk < 12]
    rs = h.groupby("RiderId").size()
    reg = h[h.RiderId.isin(rs[rs >= 5].index)]
    key = ["RiderId", "dow", "hp", "hd"]
    reg = reg.merge(reg.groupby(key).mins.median().rename("med").reset_index(), on=key)
    reg = reg[(reg.mins - reg.med).abs() <= HTOL]
    wk = reg.groupby(key).wk.nunique()
    out["regular_riders"] = {"riders_5plus": int((rs >= 5).sum()), "with_3week_pattern": int(wk[wk >= 3].reset_index().RiderId.nunique())}
    return out


if __name__ == "__main__":
    d = load()
    res = {"data": {"rows": len(d), "from": str(d.start.min()), "to": str(d.start.max()), "riders": int(d.RiderId.nunique())}}
    res["ride_probability"] = ride_model(d)
    print("叫車機率", json.dumps(res["ride_probability"], ensure_ascii=False))
    res["wait_time"] = wait_model(d)
    print("等車時間", json.dumps(res["wait_time"], ensure_ascii=False))
    res["travel_time"] = travel_model(d)
    print("車程", json.dumps(res["travel_time"], ensure_ascii=False))
    res["habit"] = habit_model(d)
    print("固定行程", json.dumps(res["habit"], ensure_ascii=False))
    (ROOT / "metrics.json").write_text(json.dumps(res, ensure_ascii=False, indent=1))
