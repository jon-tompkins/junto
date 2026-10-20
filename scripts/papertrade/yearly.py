import os, sys, glob, json, random, collections, inspect
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import backtest as B
from multiprocessing import Pool

src = inspect.getsource(B.run)
src = src.replace("up = c[i] > hi[i-N:i].max(); dn = c[i] < lo[i-N:i].min()",
 "up = c[i] > hi[i-N:i].max(); dn = c[i] < lo[i-N:i].min()\n"
 "                if cfg.get('er_min') is not None and not (D['er240'][i] > cfg['er_min']): up=dn=False\n"
 "                if cfg.get('htf'):\n"
 "                    if c[i] < D['ema240'][i]: up=False\n"
 "                    if c[i] > D['ema240'][i]: dn=False\n"
 "                if cfg.get('fade'): up,dn=dn,up")
ns = dict(B.__dict__); exec(src, ns); RUN = ns['run']

def extra(D):
    c=D['c']; n=len(c)
    e=np.empty(n); e[0]=c[0]; al=2/241
    for i in range(1,n): e[i]=al*c[i]+(1-al)*e[i-1]
    D['ema240']=e
    dc=np.abs(np.diff(c,prepend=c[0])); cs=np.cumsum(dc)
    er=np.full(n,np.nan); er[240:]=np.abs(c[240:]-c[:-240])/np.maximum(cs[240:]-cs[:-240],1e-9)
    D['er240']=er; return D

def load_csv(path, tf=1):
    a = np.loadtxt(path, delimiter=',', skiprows=1, usecols=(0,2,3,4,5))
    if tf>1:
        m=(len(a)//tf)*tf; a=a[:m].reshape(-1,tf,5)
        a=np.column_stack([a[:,0,0],a[:,0,1],a[:,:,2].max(1),a[:,:,3].min(1),a[:,-1,4]])
    return extra(B.indicators(dict(t=a[:,0],o=a[:,1],h=a[:,2],l=a[:,3],c=a[:,4])))

CONFIGS = [
 # (name, tf, slip, cfg)
 ("farm L50 d0.6% slip0",   1, 0.0, dict(mode='pairfarm', L=50, cut=1.0, d=0.006)),
 ("farm L50 d1.0% slip0",   1, 0.0, dict(mode='pairfarm', L=50, cut=1.0, d=0.010)),
 ("farm L25 d2.0% slip0",   1, 0.0, dict(mode='pairfarm', L=25, cut=1.0, d=0.020)),
 ("farm L50 d1.0% slip1",   1, 1.0, dict(mode='pairfarm', L=50, cut=1.0, d=0.010)),
 ("straddle L100 cut.5 tr2 slip0", 1, 0.0, dict(mode='straddle_always', L=100, cut=0.5, trail=1.0/100)),
 ("straddle L50 cut.3 tr2 slip0",  1, 0.0, dict(mode='straddle_always', L=50, cut=0.3, trail=0.6/50)),
 ("1m fade N60 L100 cut.3 ema60",  1, 1.0, dict(mode='donchian', L=100, cut=0.3, N=60, ema_exit='ema60', trail=None, fade=True)),
 ("1m fade N60 L100 cut.3 tr2",    1, 1.0, dict(mode='donchian', L=100, cut=0.3, N=60, trail=0.6/100, fade=True)),
 ("1m donch N60 L100 cut.3 ema60 er>.3", 1, 1.0, dict(mode='donchian', L=100, cut=0.3, N=60, ema_exit='ema60', trail=None, er_min=0.3)),
 ("1m donch N60 L100 cut.3 ema60 htf",   1, 1.0, dict(mode='donchian', L=100, cut=0.3, N=60, ema_exit='ema60', trail=None, htf=True)),
 ("1m donch N480 L100 cut.3 ema240",     1, 1.0, dict(mode='donchian', L=100, cut=0.3, N=480, ema_exit='ema240', trail=None)),
 ("15m donch N96 L20 cut.5 ema60",   15, 1.0, dict(mode='donchian', L=20, cut=0.5, N=96, ema_exit='ema60', trail=None)),
 ("15m donch N96 L20 cut.5 tr4",     15, 1.0, dict(mode='donchian', L=20, cut=0.5, N=96, trail=4*0.5/20)),
 ("15m donch N480 L20 cut.5 ema60",  15, 1.0, dict(mode='donchian', L=20, cut=0.5, N=480, ema_exit='ema60', trail=None)),
 ("15m donch N96 L10 cut.5 ema60",   15, 1.0, dict(mode='donchian', L=10, cut=0.5, N=96, ema_exit='ema60', trail=None)),
 ("15m donch N96 L20 cut.5 ema60 htf",15, 1.0, dict(mode='donchian', L=20, cut=0.5, N=96, ema_exit='ema60', trail=None, htf=True)),
 ("1h donch N24 L20 cut.5 ema20",    60, 1.0, dict(mode='donchian', L=20, cut=0.5, N=24, ema_exit='ema20', trail=None)),
 ("1h donch N24 L10 cut.5 tr4",      60, 1.0, dict(mode='donchian', L=10, cut=0.5, N=24, trail=4*0.5/10)),
 ("1h donch N120 L10 cut.5 ema60",   60, 1.0, dict(mode='donchian', L=10, cut=0.5, N=120, ema_exit='ema60', trail=None)),
 ("15m straddle-squeeze L20 cut.5 tr2 q.7", 15, 1.0, dict(mode='straddle_squeeze', L=20, cut=0.5, trail=2*0.5/20, squeeze=0.7)),
]
RANDOM_FOR = {"15m donch N96 L20 cut.5 ema60", "1h donch N24 L20 cut.5 ema20"}

def task(args):
    asset, paths = args   # whole year concatenated per asset (so slow timeframes have enough bars)
    out = {}
    cache = {}
    for nm, tf, slip, cfg in CONFIGS:
        if tf not in cache:
            arrs=[np.loadtxt(p, delimiter=',', skiprows=1, usecols=(0,2,3,4,5)) for p in paths]
            a=np.vstack(arrs)
            if tf>1:
                m=(len(a)//tf)*tf; a=a[:m].reshape(-1,tf,5)
                a=np.column_stack([a[:,0,0],a[:,0,1],a[:,:,2].max(1),a[:,:,3].min(1),a[:,-1,4]])
            cache[tf]=extra(B.indicators(dict(t=a[:,0],o=a[:,1],h=a[:,2],l=a[:,3],c=a[:,4])))
        D=cache[tf]; B.SLIP_BPS=slip
        B.MAX_HOLD = 1440 if tf==1 else (1440//tf)*10   # 10 days on slow frames
        r = B.combine([RUN(D, asset, cfg)]); r.pop('w',None)
        r['days']=(D['t'][-1]-D['t'][400])/86400e3
        out[nm]={k:float(v) for k,v in r.items()}
        if nm in RANDOM_FOR:
            per=[]
            for seed in range(8):
                rng=random.Random(seed); c2=dict(cfg); c2['mode']='random_dir'; c2['n_entries']=max(1,int(r['opens']))
                per.append(B.combine([RUN(D, asset, c2, rng)])['perday'])
            out[nm+' [random ctrl]']=dict(perday=float(np.mean(per)), sd=float(np.std(per)))
        print('done',asset,nm,flush=True)
    return asset, out

if __name__=='__main__':
    btc=sorted(glob.glob(sys.argv[1]+'/1m/*/*/BTCUSDT_1m_*.csv')); eth=sorted(glob.glob(sys.argv[2]+'/ETHUSDT_1m_*.csv'))
    with Pool(2) as pool:
        res=dict(pool.map(task,[('BTC',btc),('ETH',eth)]))
    json.dump(res,open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'monthly2_results.json'),'w'))
    print("\nFULL-YEAR (Nov 2025 - Oct 2026), $100 margin/leg, mint 10.7/$")
    print(f"{'config':<42} {'asset':<4} {'$/day':>7} {'trades/d':>8} {'win%':>5} {'pf':>5} {'PAPER/d':>8} {'c/PAPER':>8} {'liq':>4} {'maxDD':>7} {'exp':>5}")
    for nm,_,_,_ in CONFIGS:
        for a in ('BTC','ETH'):
            r=res[a][nm]; rc=res[a].get(nm+' [random ctrl]')
            print(f"{nm:<42} {a:<4} {r['perday']:>+7.1f} {r['trades']/r['days']:>8.1f} {r['win']*100:>4.0f}% {r['pf']:>5.2f} {r['paperday']:>8.0f} {r['cpp']*100:>+7.2f}¢ {r['liqs']:>4.0f} {r['maxdd']:>7.0f} {r['exp']:>5.2f}" + (f"   random {rc['perday']:+.1f}±{rc['sd']:.1f}" if rc else ""))
    print('ALL DONE')
