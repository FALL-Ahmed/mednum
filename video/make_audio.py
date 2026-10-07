"""Fabrique la bande-son de la pub (sons synthétisés, donc libres de droits) calée sur la chronologie de ad.html.
Sortie : out/audio.wav (stéréo, 44,1 kHz). Usage : python make_audio.py
"""
import wave
import numpy as np
from scipy import signal

SR = 44100
DUR = 31.5
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N)
R = np.zeros(N)


def add(t, sig, gain=1.0, pan=0.0):
    """Ajoute `sig` à l'instant t (secondes). pan : -1 gauche … +1 droite."""
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    l, r = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
    L[i:i + len(sig)] += sig * l * 1.4
    R[i:i + len(sig)] += sig * r * 1.4


def tt(d):
    return np.arange(int(d * SR)) / SR


def env(d, a=0.003, dec=8.0):
    t = tt(d)
    return np.minimum(1, t / a) * np.exp(-dec * t)


def sine(f, d, dec=8.0, a=0.003):
    return np.sin(2 * np.pi * f * tt(d)) * env(d, a, dec)


def sweep(f0, f1, d, dec=4.0, a=0.003):
    t = tt(d)
    f = f0 * (f1 / f0) ** (t / d)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(d, a, dec)


def noise(d):
    return rng.standard_normal(int(d * SR))


def bandpass(x, lo, hi):
    sos = signal.butter(2, [lo, hi], btype='band', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def highpass(x, f):
    return signal.sosfilt(signal.butter(2, f, btype='high', fs=SR, output='sos'), x)


def lowpass(x, f):
    return signal.sosfilt(signal.butter(2, f, btype='low', fs=SR, output='sos'), x)


# ── briques sonores ──
def whoosh(d=0.5, lo=300, hi=3500, rising=True):
    n = noise(d)
    t = tt(d)
    c = lo * (hi / lo) ** (t / d if rising else 1 - t / d)
    out = np.zeros_like(n)
    # filtre balayé : on découpe en petits blocs
    blk = 441
    for s in range(0, len(n) - blk, blk):
        f = float(np.clip(c[s], 80, 9000))
        sos = signal.butter(2, [max(60, f * .6), min(14000, f * 1.6)], btype='band', fs=SR, output='sos')
        out[s:s + blk] = signal.sosfilt(sos, n[s:s + blk])
    shape = np.sin(np.pi * t / d) ** 1.5
    return out * shape * 0.9


def impact(d=0.7):
    t = tt(d)
    body = np.sin(2 * np.pi * np.cumsum(120 * np.exp(-t * 7) + 38) / SR) * np.exp(-t * 6)
    click = lowpass(noise(d), 2500) * np.exp(-t * 40) * .6
    return body + click


def pop(f=700, d=0.12):
    return sweep(f, f * 1.7, d, dec=22) * .8


def tick(f=2200, d=0.025, g=.5):
    return sine(f, d, dec=140, a=.0005) * g


def chime(f=880, d=1.1, g=.55):
    t = tt(d)
    s = sine(f, d, 5.0) + .5 * sine(f * 2.0, d, 7.0) + .25 * sine(f * 3.01, d, 9.0)
    return s * g


def flip(d=0.18):
    return highpass(noise(d), 2500) * np.sin(np.pi * tt(d) / d) ** 2 * .5


def rise(d, f0=260, f1=1100):
    t = tt(d)
    base = sweep(f0, f1, d, dec=0.0, a=.05)
    trem = .75 + .25 * np.sin(2 * np.pi * 7 * t)
    return base * trem * np.minimum(1, (d - t) / .12) * .35


# ── événements (mêmes instants que ad.html) ──
# 1. accroche
add(0.05, impact(), .9)            # « EXAMEN »
add(0.55, impact(), 1.0)           # « VENDREDI. »
add(1.0, pop(520, .16), .8)        # pastille J-3
for k in range(34):                # compteur de pages
    t = 1.4 + 1.3 * (k / 34) ** .8
    add(t, tick(1500 + 40 * k, .02, .35), 1.0, pan=rng.uniform(-.3, .3))
add(1.95, whoosh(.4, 300, 2000), .15)
add(3.0, whoosh(.45, 400, 3000), .18)   # on bascule vers l'application

# 2. dépose ton cours
add(3.1, whoosh(.45, 300, 2200), .16)    # le téléphone monte
add(3.3, pop(600), .5)
add(4.0, whoosh(.3, 1200, 500, rising=False), .14)
add(4.55, impact(.4), .45)              # le fichier tombe
add(4.9, rise(1.1, 260, 1100), 1.0)     # lecture du cours
for i in range(3):
    add(6.05 + i * .18, chime(988 * (1.25 ** i), .9, .4), 1.0, pan=-.3 + .3 * i)

# 3. fiche
add(6.9, whoosh(.28, 700, 2400), .12)
for i in range(6):
    add(7.5 + i * .17, tick(1900 + 150 * (i % 3), .02, .35), 1.0)
add(8.3, pop(520), .6)

# 4. QCM
add(9.4, whoosh(.28, 700, 2400), .12)
for i in range(5):
    add(9.8 + i * .12, pop(500 + 60 * i, .08), .45, pan=.1 * (i - 2))
for i, f in enumerate([784, 988, 1175]):    # trois bonnes réponses
    add(11.2 + i * .09, chime(f, .9, .5), 1.0, pan=-.3 + .3 * i)
add(11.7, pop(900, .15), .8)
add(11.75, chime(1319, 1.2, .5), .8)        # 10 / 10
add(12.0, whoosh(.3, 500, 2000), .10)

# 5. flashcards
add(13.4, whoosh(.28, 700, 2400), .12)
add(14.3, flip(), 1.0)
add(14.45, chime(1047, .8, .45), .8)
add(15.5, whoosh(.25, 600, 2200), .12)
add(16.1, flip(), 1.0)
add(16.25, chime(1175, .8, .45), .8)

# 6. Dr. Ahmed
add(17.2, whoosh(.28, 700, 2400), .12)
t = 17.7
while t < 18.8:
    add(t, tick(rng.uniform(1700, 2300), .018, .3), 1.0, pan=.2); t += rng.uniform(.045, .085)
add(18.85, pop(450, .1), .5, pan=-.3)
t = 18.9
while t < 20.7:
    add(t, tick(rng.uniform(1400, 2000), .016, .22), 1.0, pan=-.2); t += rng.uniform(.035, .065)
add(20.85, chime(1319, .9, .35), .7)

# 7. révision à deux
add(21.6, whoosh(.28, 700, 2400), .12)
add(21.95, pop(620, .14), .8)
add(22.0, chime(784, .8, .4), .8)
add(22.45, pop(560, .1), .5)
for i in range(5):                          # les deux barres avancent
    add(22.7 + i * .3, tick(1200 + 140 * i, .03, .4), 1.0, pan=-.4)
for i in range(5):
    add(22.8 + i * .22, tick(1500 + 160 * i, .03, .4), 1.0, pan=.4)
add(24.3, pop(700, .15), .7)
for i, f in enumerate([880, 1109, 1319]):
    add(24.4 + i * .08, chime(f, .9, .4), 1.0, pan=-.3 + .3 * i)

# 8. Pomodoro : tic-tac accéléré puis cloche
add(25.4, whoosh(.28, 700, 2400), .12)
t, step = 25.9, .22
alt = 0
while t < 27.0:
    add(t, tick(1300 if alt else 1900, .03, .5), 1.0, pan=-.2 if alt else .2)
    alt ^= 1
    t += step
    step = max(.07, step * .93)
add(27.0, chime(659, 2.0, .6), 1.0)
add(27.0, chime(1319, 1.6, .25), 1.0)
add(27.05, pop(480, .14), .6)

# 9. appel à l'action
add(27.9, whoosh(.5, 300, 3000), .2)
add(28.3, pop(560, .14), .6)
add(28.6, impact(.5), .45)
add(29.2, impact(.5), .55)
add(29.7, pop(800, .16), .9)
add(29.75, chime(1047, 1.2, .5), .9)
add(30.3, chime(1319, 1.6, .45), .8)
add(30.3, chime(1568, 1.4, .3), .8)

L_sfx, R_sfx = L.copy(), R.copy()   # effets seuls (la musique de fond est celle de l'application)

# ── musique « teaser SaaS » : douce, moderne, lumineuse (tempo 108, Do maj7 / La m7 / Fa maj7 / Sol 6) ──
bpm = 108
beat = 60 / bpm
bar = beat * 4
CH = [  # (basse, notes de l'accord)
    (65.41, [261.63, 329.63, 392.00, 493.88]),   # Cmaj7
    (55.00, [220.00, 261.63, 329.63, 392.00]),   # Am7
    (43.65, [174.61, 220.00, 261.63, 329.63]),   # Fmaj7
    (49.00, [196.00, 246.94, 293.66, 329.63]),   # G6
]
M = np.zeros((N, 2))


def madd(t, sig, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N or i < 0:
        return
    sig = sig[: N - i] * gain
    M[i:i + len(sig), 0] += sig * np.sqrt((1 - pan) / 2)
    M[i:i + len(sig), 1] += sig * np.sqrt((1 + pan) / 2)


def pluck(f, d=.45, dec=7.0):
    t = tt(d)
    fm = np.sin(2 * np.pi * f * t + 1.6 * np.exp(-t * 18) * np.sin(2 * np.pi * f * 2 * t))   # petite attaque « marimba / kalimba »
    return fm * env(d, .002, dec)


def bellsp(f, d=.9):
    return (sine(f, d, 4.5) + .35 * sine(f * 2.76, d, 7.0)) * .6


def soft_kick(d=.28):
    return sweep(95, 42, d, 12, .003)


def pad_note(f, d, swell=True):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) + .5 * np.sin(2 * np.pi * f * 1.003 * t + .7) + .25 * np.sin(2 * np.pi * f * 2 * t)
    return s * np.minimum(1, t / 1.0) * np.minimum(1, (d - t) / 1.0)


def layer(t, a, b, fi=1.0, fo=1.0):
    """1 entre a et b, avec entrée/sortie douces."""
    return float(np.clip((t - a) / fi, 0, 1) * np.clip((b - t) / fo, 0, 1))


kick_times = []
n_bars = int(DUR / bar) + 1
for bi in range(n_bars):
    t0 = bi * bar
    root, notes = CH[bi % 4]
    # arpège de pincées (croches), de 3,0 s à 30,4 s ; léger balancement gauche / droite
    pat = [0, 1, 2, 3, 2, 1, 3, 2]
    for k in range(8):
        t = t0 + k * beat / 2
        g = layer(t, 3.0, 30.4, 1.6, .8) * (.085 if k % 2 == 0 else .06)
        if g > 0:
            f = notes[pat[k]] * (2 if pat[k] >= 2 else 1)
            madd(t, pluck(f), g, pan=(-.35 if k % 2 == 0 else .35))
    # étincelles aiguës sur le premier temps (une mesure sur deux)
    if bi % 2 == 0:
        g = layer(t0, 6.9, 30.0, 1, 1) * .05
        if g > 0:
            madd(t0 + beat * 2.5, bellsp(notes[3] * 2), g, pan=.5)
    # nappe douce à partir de la fiche
    gp = layer(t0, 6.9, 30.4, 2.0, 1.5) * .030
    if gp > 0:
        for f in notes:
            madd(t0, pad_note(f / 2 if f > 300 else f, bar + .6), gp, pan=0)
    # basse ronde sur les temps 1 et « et du 2 » à partir du QCM
    gb = layer(t0, 9.4, 28.2, 1.2, 1.2) * .16
    if gb > 0:
        madd(t0, sine(root, beat * 1.3, 3.5, .01), gb)
        madd(t0 + beat * 1.5, sine(root * 2, beat * .8, 6, .01), gb * .55)
    # grosse caisse douce sur 1 et 3 à partir des flashcards, claquement de doigts sur 2 et 4 à partir de la révision à deux
    gk = layer(t0, 13.4, 28.2, 1.0, 1.0) * .14
    if gk > 0:
        for k in (0, 2):
            madd(t0 + k * beat, soft_kick(), gk)
            kick_times.append(t0 + k * beat)
    gs = layer(t0, 21.6, 28.2, 1.0, 1.0) * .05
    if gs > 0:
        for k in (1, 3):
            madd(t0 + k * beat, bandpass(noise(.09), 1800, 4500) * np.exp(-tt(.09) * 38), gs * 2.2)
    # petit shaker sur les croches à partir des flashcards
    gh = layer(t0, 13.4, 28.2, 1.0, 1.0) * .028
    if gh > 0:
        for k in range(8):
            madd(t0 + k * beat / 2, highpass(noise(.05), 6500) * np.exp(-tt(.05) * 70), gh * (1.4 if k % 2 else .8), pan=(.3 if k % 2 else -.3))

# accord final, lumineux, au moment du bouton (Do majeur 7)
for f in (261.63, 329.63, 392.00, 493.88, 659.25):
    madd(29.7, sine(f, 2.2, 1.6, .02), .05)
madd(29.7, sine(65.41, 2.0, 1.8, .02), .14)

# on passe la musique dans un filtre doux, puis on la baisse sous les effets forts (légère « pompe » à chaque grosse caisse)
M[:, 0] = lowpass(M[:, 0], 7500)
M[:, 1] = lowpass(M[:, 1], 7500)
duck = np.ones(N)
for kt in kick_times:
    i = int(kt * SR)
    n = int(.22 * SR)
    if i < N:
        seg = np.linspace(.82, 1.0, min(n, N - i))
        duck[i:i + len(seg)] = np.minimum(duck[i:i + len(seg)], seg)
L += M[:, 0] * duck * 1.05
R += M[:, 1] * duck * 1.05

# ── fond musical : le morceau lofi-6 du Pomodoro de l'application (remplace la musique synthétisée) ──
USE_LOFI = True
if USE_LOFI:
    import subprocess, pathlib
    ff = str(pathlib.Path('node_modules/ffmpeg-static/ffmpeg.exe'))
    raw = subprocess.run([ff, '-v', 'error', '-i', '../web/public/sons/lofi-6.mp3', '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True).stdout
    song = np.frombuffer(raw, dtype='<f4').reshape(-1, 2).astype(float)
    start = 0.0                                   # point de départ dans le morceau (secondes)
    song = song[int(start * SR):]
    reps = int(np.ceil(N / len(song)))
    if reps > 1:                                  # morceau plus court que la vidéo : on le reboucle avec un fondu
        song = np.concatenate([song] * reps)
    song = song[:N]
    mt = np.arange(N) / SR
    g = np.clip((mt - 2.6) / 1.8, 0, 1) * np.clip((DUR - mt) / 2.4, 0, 1) * 0.55
    L, R = L_sfx + song[:, 0] * g, R_sfx + song[:, 1] * g

# ── mastering : on cible un volume confortable pour les réseaux (≈ -17 dB RMS), limiteur doux, crête à -1 dBFS ──
mix = np.stack([L, R], axis=1)
rms = np.sqrt(np.mean(mix ** 2))
mix = mix * (10 ** (-17 / 20) / max(rms, 1e-9))
mix = np.tanh(mix * 1.25) / np.tanh(1.25)
mix *= 0.89 / max(1e-9, np.max(np.abs(mix)))
pcm = (mix * 32767).astype('<i2')
import os
os.makedirs('out', exist_ok=True)
with wave.open('out/audio.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('out/audio.wav prêt')
