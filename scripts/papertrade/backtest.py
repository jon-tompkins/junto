"""Papertrade strategy backtest: exact payout curve (frontend port), 1m candles, bar-level fills.
Usage: python3 -I pt_backtest.py BTC_1m.json ETH_1m.json
"""
import json, sys, math, random, itertools
import numpy as np

INST = {'BTC': dict(pm=814.598, buf=0.000476041580087574),
        'ETH': dict(pm=483.979, buf=0.00048130405018013)}
MINT = 10.7          # PAPER per $1 loss basis (Oct 19)
SLIP_BPS = 1.0       # adverse fill assumption per fill (relayer delay), bps of notional
MARGIN = 100.0       # $ per leg
MAX_HOLD = 1440      # bars
COOLDOWN = 5

def scale(m, pm):
    return 0.9 / (1 + 1/(m*15000) + 0.1/(m*pm))

def payout(move, margin, L, pm):
    """$ pnl of closing at fractional move (+favourable / -adverse)."""
    if move <= 0:
        return max(move*margin*L, -margin)
    m = move - 1/50000
    if m <= 0: return 0.0
    return m*margin*L*scale(m, pm)*0.98

def load(path):
    d = json.load(open(path))
    a = np.array(d, dtype=float)
    return dict(t=a[:,0], o=a[:,1], h=a[:,2], l=a[:,3], c=a[:,4])

def indicators(D):
    c = D['c']; n = len(c)
    r = np.diff(np.log(c), prepend=np.log(c[0]))
    def roll_std(x, w):
        out = np.full(n, np.nan)
        cs = np.cumsum(np.insert(x,0,0)); cs2 = np.cumsum(np.insert(x*x,0,0))
        for i in range(w, n):
            s = cs[i]-cs[i-w]; s2 = cs2[i]-cs2[i-w]
            out[i] = math.sqrt(max(s2/w - (s/w)**2, 0))
        return out
    D['rv30'] = roll_std(r, 30); D['rv360'] = roll_std(r, 360)
    tr = np.maximum(D['h']-D['l'], np.maximum(abs(D['h']-np.roll(c,1)), abs(D['l']-np.roll(c,1))))
    D['atr30'] = np.convolve(tr, np.ones(30)/30, mode='full')[:n]
    for k in (20, 60):
        e = np.empty(n); e[0] = c[0]; a = 2/(k+1)
        for i in range(1, n): e[i] = a*c[i] + (1-a)*e[i-1]
        D[f'ema{k}'] = e
    return D

class Leg:
    __slots__ = ('side','E','m','L','pm','stop','liq','peak','trail','entry_bar','ema_exit','asset')
    def __init__(self, asset, side, E, m, L, cut, trail, inst, ema_exit, bar):
        self.asset=asset; self.side=side; self.E=E; self.m=m; self.L=L; self.pm=inst['pm']
        self.stop = cut/L                                   # price fraction
        self.liq = 1/L - inst['buf']*(1-1/L)
        self.peak = E; self.trail = trail; self.entry_bar = bar; self.ema_exit = ema_exit

    def exit_frac(self):
        # favourable retrace level as fraction (negative => still below entry => stop)
        st = -self.stop
        if self.trail is None: return st
        pk = (self.peak - self.E)/self.E * (1 if self.side>0 else -1)
        return max(st, pk - self.trail)

    def step(self, k, D):
        """returns (exit_move, liq_flag) or None"""
        o,h,l,c = D['o'][k], D['h'][k], D['l'][k], D['c'][k]
        s = self.side
        fav_ext = (h - self.E)/self.E*s if s>0 else (self.E - l)/self.E
        adv_ext = (self.E - l)/self.E if s>0 else (h - self.E)/self.E
        fav_first = (c >= o) == (s > 0)
        def check():
            ex = self.exit_frac()
            if adv_ext >= self.liq: return (-1.0, True)
            if self._retraced(l,h,ex):
                o_move = (o - self.E)/self.E*s
                return (min(ex, o_move), False)   # gap through the level fills at open
            return None
        if fav_first:
            self.peak = max(self.peak, h) if s>0 else min(self.peak, l)
            r = check()
        else:
            r = check()
            if r is None:
                self.peak = max(self.peak, h) if s>0 else min(self.peak, l)
        if r: return r
        if self.ema_exit is not None:
            e = D[self.ema_exit][k]
            if (s>0 and c < e) or (s<0 and c > e):
                return ((c - self.E)/self.E*s, False)
        if k - self.entry_bar >= MAX_HOLD:
            return ((c - self.E)/self.E*s, False)
        return None

    def _retraced(self, l, h, ex):
        px = self.E*(1+ex) if self.side>0 else self.E*(1-ex)
        return l <= px if self.side>0 else h >= px

def settle(leg, move, liq):
    slip = leg.m*leg.L*SLIP_BPS/1e4
    if liq:
        return -leg.m, leg.m*MINT
    p = payout(move, leg.m, leg.L, leg.pm) - slip
    paper = (min(-p, leg.m)*0.98*MINT) if p < 0 else 0.0
    return p, paper

def run(D, asset, cfg, rng=None):
    """cfg: mode in {'donchian','straddle_squeeze','straddle_always','pairfarm','random_dir','random_straddle'}"""
    inst = INST[asset]; n = len(D['c'])
    L, cut, trail, ema_exit = cfg['L'], cfg['cut'], cfg.get('trail'), cfg.get('ema_exit')
    N = cfg.get('N', 60); q = cfg.get('squeeze')   # squeeze quantile ratio or None
    legs = []; pnl = []; paper = 0.0; liqs = 0; last_exit = -999; opens = 0
    hi = D['h']; lo = D['l']; c = D['c']
    cum = 0.0; peak_cum = 0.0; maxdd = 0.0; exposure = 0
    rand_times = None
    if cfg['mode'].startswith('random'):
        rand_times = set(rng.sample(range(400, n-2), cfg['n_entries']))
    i = max(400, N+1)
    while i < n-1:
        # manage open legs on bar i
        still = []
        liq_hit = False
        for leg in legs:
            r = leg.step(i, D)
            if r is None: still.append(leg); continue
            p, pp = settle(leg, r[0], r[1]); pnl.append(p); paper += pp; liqs += r[1]; liq_hit |= r[1]
            cum += p; peak_cum = max(peak_cum, cum); maxdd = min(maxdd, cum-peak_cum); last_exit = i
        legs = still
        if cfg['mode']=='pairfarm' and legs:
            # close both when |move| >= d from entry (either leg's fav reaches d), or a leg got liquidated
            d = cfg['d']; E = legs[0].E
            mv_hi = (hi[i]-E)/E; mv_lo = (E-lo[i])/E
            if liq_hit or mv_hi >= d or mv_lo >= d:
                mv = d if (mv_hi >= d or mv_lo >= d) else (c[i]-E)/E
                sign = 1 if mv_hi >= d else -1
                for leg in legs:
                    p, pp = settle(leg, abs(mv)*(1 if leg.side==sign else -1) if not liq_hit else (c[i]-E)/E*leg.side, False)
                    pnl.append(p); paper += pp; cum += p; peak_cum=max(peak_cum,cum); maxdd=min(maxdd,cum-peak_cum)
                legs = []; last_exit = i
        exposure += len(legs)
        # entries decided at close of bar i, filled at open of i+1
        if not legs and i - last_exit >= COOLDOWN:
            sides = []
            m = cfg['mode']
            sq_ok = True if q is None else (D['rv30'][i] < q*D['rv360'][i])
            if m in ('donchian',):
                up = c[i] > hi[i-N:i].max(); dn = c[i] < lo[i-N:i].min()
                if sq_ok and up: sides=[1]
                elif sq_ok and dn: sides=[-1]
            elif m == 'straddle_squeeze':
                if sq_ok: sides=[1,-1]
            elif m in ('straddle_always','pairfarm'):
                sides=[1,-1]
            elif m == 'random_dir':
                if i in rand_times: sides=[rng.choice([1,-1])]
            elif m == 'random_straddle':
                if i in rand_times: sides=[1,-1]
            if sides:
                E = D['o'][i+1]
                for s in sides:
                    legs.append(Leg(asset, s, E, MARGIN, L, cut, trail, inst, ema_exit, i+1))
                opens += 1
        i += 1
    for leg in legs:   # mark remaining at last close
        p, pp = settle(leg, (c[-1]-leg.E)/leg.E*leg.side, False); pnl.append(p); paper += pp; cum += p
    days = (D['t'][-1]-D['t'][400])/86400e3
    wins = sum(1 for p in pnl if p>0)
    return dict(trades=len(pnl), opens=opens, win=wins/max(len(pnl),1), net=sum(pnl), perday=sum(pnl)/days,
                paper=paper, paperday=paper/days, liqs=liqs, maxdd=maxdd, exp=exposure/(n-400), days=days,
                gross_win=sum(p for p in pnl if p>0), gross_loss=-sum(p for p in pnl if p<0), bigwin=max(pnl) if pnl else 0.0)

def combine(rs):
    out = dict(trades=0, opens=0, net=0.0, paper=0.0, liqs=0, maxdd=0.0, gross_win=0.0, gross_loss=0.0, exp=0.0, w=0, bigwin=0.0)
    for r in rs:
        for k in ('trades','opens','net','paper','liqs','gross_win','gross_loss'): out[k]+=r[k]
        out['maxdd'] += r['maxdd']; out['exp'] += r['exp']; out['w'] += r['win']*r['trades']; out['bigwin']=max(out['bigwin'],r['bigwin'])
    d = rs[0]['days']; out['perday']=out['net']/d; out['paperday']=out['paper']/d
    out['win']=out['w']/max(out['trades'],1); out['pf']=out['gross_win']/max(out['gross_loss'],1e-9)
    out['cpp']=(-out['net']/out['paper']) if out['paper']>0 else float('nan')
    out['conc']=out['bigwin']/max(out['gross_win'],1e-9); out['roe']=out['perday']/max(out['exp']*MARGIN,1e-9)*100
    return out

def fmt(name, r):
    return (f"{name:<46} {r['trades']:>5} {r['win']*100:>4.0f}% pf{r['pf']:>5.2f} {r['perday']:>+8.2f}/d "
            f"PAPER {r['paperday']:>6.0f}/d  c/PAPER {r['cpp']*100:>+6.2f}¢  liq{r['liqs']:>3}  dd{r['maxdd']:>7.0f}  exp{r['exp']:>4.2f} roe{r['roe']:>+6.1f}%/d top1={r['conc']*100:>3.0f}%")

if __name__ == '__main__':
    data = {a: indicators(load(p)) for a, p in zip(('BTC','ETH'), sys.argv[1:3])}
    assets = ('BTC','ETH')
    print(f"margin ${MARGIN:.0f}/leg, mint {MINT}/$, slip {SLIP_BPS}bp, days={data['BTC']['t'][-1]/86400e3-data['BTC']['t'][400]/86400e3:.2f}\n")
    results = []
    # --- pair farm baselines
    print("== PAIR FARM (both legs, close both at ±d) ==")
    for L in (50,100,200):
        for d in (0.003,0.006,0.01):
            if d >= 1/L - 0.0006: continue
            cfg=dict(mode='pairfarm', L=L, cut=1.0, d=d)
            r = combine([run(data[a],a,cfg) for a in assets]); print(fmt(f"pairfarm L{L} d{d*100:.1f}%", r))
    # --- straddle always (≈ current bot: cut loser, trail winner)
    print("\n== STRADDLE ALWAYS: cut loser, trail winner (≈ current farm bot) ==")
    grid=[]
    for L in (50,100,200):
        for cut in (0.3,0.5):
            for tr in (0.5,1.0,2.0):
                cfg=dict(mode='straddle_always', L=L, cut=cut, trail=tr*cut/L)
                r = combine([run(data[a],a,cfg) for a in assets]); grid.append((r['perday'],fmt(f"straddle L{L} cut{cut} trail{tr}xstop",r),r,cfg,f"straddle L{L} cut{cut} trail{tr}xstop"))
    grid.sort(key=lambda x:-x[0])
    for s_ in grid[:8]: print(s_[1])
    print(f"  ({sum(1 for g in grid if g[0]>0)}/{len(grid)} configs positive, median {sorted(g[0] for g in grid)[len(grid)//2]:+.2f}/d)")
    strad_best = grid[:3]
    print("\n== STRADDLE ON SQUEEZE (rv30 < q*rv360) ==")
    grid=[]
    for L in (50,100,200):
        for cut in (0.3,0.5):
            for tr in (1.0,2.0):
                for q in (0.5,0.7):
                    cfg=dict(mode='straddle_squeeze', L=L, cut=cut, trail=tr*cut/L, squeeze=q)
                    r = combine([run(data[a],a,cfg) for a in assets]); grid.append((r['perday'],fmt(f"sq-straddle L{L} cut{cut} tr{tr} q{q}",r),r,cfg,f"sq-straddle L{L} cut{cut} tr{tr} q{q}"))
    grid.sort(key=lambda x:-x[0])
    for s_ in grid[:8]: print(s_[1])
    print(f"  ({sum(1 for g in grid if g[0]>0)}/{len(grid)} configs positive, median {sorted(g[0] for g in grid)[len(grid)//2]:+.2f}/d)")
    strad_best += grid[:3]
    print("\n== RANDOM-TIME STRADDLE CONTROL for top straddle configs (same exits & #entries; 40 seeds) ==")
    for _,_,r,cfg,nm in strad_best:
        per=[]
        for seed in range(40):
            rng=random.Random(seed); rs=[]
            for a in assets:
                c2=dict(cfg); c2['mode']='random_straddle'; c2['n_entries']=max(1,int(r['opens']/2))
                rs.append(run(data[a],a,c2,rng))
            per.append(combine(rs)['perday'])
        per=np.array(per)
        print(f"{nm:<46} strategy {r['perday']:+.2f}/d  vs random mean {per.mean():+.2f}/d sd {per.std():.2f}  pctile {100*(per<r['perday']).mean():.0f}%")
    print("\n== DONCHIAN BREAKOUT (directional), trail or EMA-flip exit ==")
    grid=[]; best=None
    for L in (25,50,100,200):
        for cut in (0.3,0.5,0.7):
            for N in (20,60,180,480):
                for ex in (('trail',1.0),('trail',2.0),('trail',4.0),('ema20',None),('ema60',None)):
                    for q in (None,0.7):
                        cfg=dict(mode='donchian', L=L, cut=cut, N=N, squeeze=q)
                        if ex[0]=='trail': cfg['trail']=ex[1]*cut/L; nm=f"tr{ex[1]}"
                        else: cfg['ema_exit']=ex[0]; cfg['trail']=None; nm=ex[0]
                        r = combine([run(data[a],a,cfg) for a in assets])
                        if r['trades'] < 6: continue
                        name=f"donch N{N} L{L} cut{cut} {nm}{' sq'+str(q) if q else ''}"
                        grid.append((r['perday'],name,r,cfg))
    grid.sort(key=lambda x:-x[0])
    print("top 12 by $/day:")
    for _,nm,r,_ in grid[:12]: print(fmt(nm,r))
    print("bottom 5:")
    for _,nm,r,_ in grid[-5:]: print(fmt(nm,r))
    med = sorted(x[0] for x in grid)[len(grid)//2]; pos=sum(1 for x in grid if x[0]>0)
    print(f"\n{len(grid)} donchian configs: {pos} positive, median {med:+.2f}/day")
    # robustness: by N and by exit type
    import collections
    byN=collections.defaultdict(list); byEx=collections.defaultdict(list); byL=collections.defaultdict(list)
    for pd_,nm,r,cfg in grid:
        byN[cfg['N']].append(pd_); byL[cfg['L']].append(pd_); byEx[cfg.get('ema_exit') or f"trail{round(cfg['trail']/(cfg['cut']/cfg['L']),1)}"].append(pd_)
    for lab,dct in (('N',byN),('L',byL),('exit',byEx)):
        print(f" by {lab}: " + ", ".join(f"{k}: {np.mean(v):+.2f}" for k,v in sorted(dct.items(), key=lambda kv: str(kv[0]))))
    # random-entry control for top 3 directional configs
    print("\n== RANDOM-ENTRY CONTROL (same exits, same # entries, random time & direction; 40 seeds) ==")
    for _,nm,r,cfg in grid[:3]:
        per=[]
        for seed in range(40):
            rng=random.Random(seed); rs=[]
            for a in assets:
                c2=dict(cfg); c2['mode']='random_dir'; c2['n_entries']=max(1,int(r['opens']/2))
                rs.append(run(data[a],a,c2,rng))
            per.append(combine(rs)['perday'])
        per=np.array(per)
        print(f"{nm:<46} strategy {r['perday']:+.2f}/d  vs random mean {per.mean():+.2f}/d sd {per.std():.2f}  pctile {100*(per<r['perday']).mean():.0f}%")
    # per-asset breakdown for best directional
    print("\n== per-asset, best directional ==")
    _,nm,r,cfg = grid[0]
    for a in assets:
        print(fmt(f"{nm} [{a}]", combine([run(data[a],a,cfg)])))
