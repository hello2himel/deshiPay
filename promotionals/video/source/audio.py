import numpy as np, wave
SR=48000; DUR=52.0; N=int(SR*DUR); t=np.arange(N)/SR
rng=np.random.default_rng(7)
L=np.zeros(N); R=np.zeros(N)

def add(sig, pan=0.0, gain=1.0, start=0.0):
    i=int(start*SR); n=min(len(sig), N-i)
    if n<=0: return
    seg=sig[:n]
    L[i:i+n]+=seg*gain*(1-pan)/2**0.5
    R[i:i+n]+=seg*gain*(1+pan)/2**0.5

def env(n, a, d, s=0.0, r=0.0):
    e=np.ones(n)
    a=max(1,int(a*SR)); d=max(1,int(d*SR)); r=max(1,int(r*SR))
    e[:min(a,n)]=np.linspace(0,1,min(a,n))
    if a<n: e[a:min(a+d,n)]*=np.exp(-np.linspace(0,4,min(d,n-a)))
    if s>0: e*=s
    if r>0: e[-min(r,n):]*=np.linspace(1,0,min(r,n))
    return e

def note(freq,dur,kind='pluck',gain=0.1,pan=0,start=0):
    n=int(dur*SR); tt=np.arange(n)/SR
    if kind=='pluck':
        sig=(np.sin(2*np.pi*freq*tt)*0.7 + np.sin(2*np.pi*freq*2*tt)*0.18 + np.sin(2*np.pi*freq*3*tt)*0.07)
        e=np.exp(-tt*4.2)
    elif kind=='bell':
        sig=(np.sin(2*np.pi*freq*tt)+0.5*np.sin(2*np.pi*freq*2.01*tt)+0.25*np.sin(2*np.pi*freq*3.99*tt))
        e=np.exp(-tt*2.2)
    elif kind=='bass':
        sig=np.sin(2*np.pi*freq*tt)+0.2*np.sin(2*np.pi*freq*2*tt)
        e=np.exp(-tt*3)*np.minimum(1,tt*80)
    add(sig*e,gain=gain,pan=pan,start=start)

def chord(freqs,start,dur,gain=0.035):
    n=int(dur*SR); tt=np.arange(n)/SR
    for k,f in enumerate(freqs):
        det=1+0.002*((-1)**k)
        sig=np.sin(2*np.pi*f*det*tt)+0.3*np.sin(2*np.pi*f*2*det*tt)+0.1*np.sin(2*np.pi*f*3*det*tt)
        e=np.minimum(1,tt/1.8)*np.minimum(1,(dur-tt)/1.2)
        add(sig*e,gain=gain,pan=(-0.25 if k==0 else 0.25 if k==2 else 0),start=start)

def kick(start,gain=0.5):
    n=int(0.35*SR); tt=np.arange(n)/SR
    f=52*np.exp(-tt*18)+42
    sig=np.sin(2*np.pi*f*tt)*np.exp(-tt*12)
    add(sig,gain=gain,start=start)

def hat(start,gain=0.05):
    n=int(0.09*SR); tt=np.arange(n)/SR
    sig=rng.normal(0,1,n)
    sig=np.diff(sig,prepend=sig[0])  # high-ish
    add(sig*np.exp(-tt*70),gain=gain,pan=0.2,start=start)

# A minor -> F -> C -> G, 4 bars each at 120 BPM (2s per bar)
prog=[(220.00,[220.00,261.63,329.63]), (174.61,[174.61,220.00,261.63]), (130.81,[130.81,164.81,196.00]), (196.00,[196.00,246.94,293.66])]
for i,(root,notes) in enumerate(prog):
    chord(notes, i*13.0, 13.0, 0.026)
    chord([f*2 for f in notes], i*13.0+0.02, 13.0, 0.008)
    # bass root each 2 beats (1s) from bar 2 onward
    if i>=1:
        for b in range(13):
            note(root/2, 0.42, 'bass', 0.09, 0.0, i*13.0 + b*1.0)
# kick from scene 2 (4s) through 26.5
for beat in np.arange(4.0, 48.5, 0.5):
    if (beat % 1.0) < 1e-6:
        kick(beat, 0.16 if beat<10 else 0.22)
for beat in np.arange(8.0, 48.0, 0.25):
    hat(beat, 0.018 if int(beat*2)%2 else 0.028)
# pluck motif, sparse
motif=[440.0,523.25,659.25,523.25]
for i,start in enumerate(np.arange(4.0, 48.0, 2.0)):
    note(motif[i%4], 0.8, 'pluck', 0.035, -0.15 if i%2 else 0.15, start)
# scene accents
note(880, 2.8, 'bell', 0.035, 0.2, 50.0)
note(659.25, 2.6, 'bell', 0.025, -0.2, 51.0)
# shimmer at 21
for j,f in enumerate([1046.5,1318.5,1568.0]):
    note(f, 1.8, 'bell', 0.012, (-0.3,0,0.3)[j], 21.0+j*0.05)
# low tom-ish at transitions
for start in [11.4, 17.8, 24.4, 32.6, 38.0]:
    n=int(0.5*SR); tt=np.arange(n)/SR
    sig=np.sin(2*np.pi*(70*np.exp(-tt*6)+45)*tt)*np.exp(-tt*7)
    add(sig,gain=0.09,start=start)

# gentle fade in/out, stereo width via slight delay
L[:int(0.5*SR)]*=np.linspace(0,1,int(0.5*SR))
R[:int(0.5*SR)]*=np.linspace(0,1,int(0.5*SR))
fade=int(0.9*SR); L[-fade:]*=np.linspace(1,0,fade); R[-fade:]*=np.linspace(1,0,fade)
# reverb-ish simple delay
d=int(0.18*SR); L2=L.copy(); R2=R.copy()
for k in range(1,4):
    L2[k*d:]+=L[:-k*d]*0.12/k
    R2[k*d:]+=R[:-k*d]*0.11/k
L,R=L2,R2
peak=max(np.max(np.abs(L)),np.max(np.abs(R)))
L=L/peak*0.72; R=R/peak*0.72
stereo=np.stack([L,R],axis=1)
pcm=(stereo*32767).clip(-32768,32767).astype('<i2')
with wave.open('music.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print('wrote music.wav', pcm.shape, 'peak', peak)
