import os
import sys
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

OUTPUT_DIR = os.path.abspath('film/public/audio')
os.makedirs(OUTPUT_DIR, exist_ok=True)

SR = 44100  # Standard audio sample rate

# =====================================================================
# 1. GENERATE VOICEOVER WITH KOKORO TTS
# =====================================================================
print("--- [1/3] Synthesizing Voiceover with Kokoro-82M ---")
MODEL_PATH = os.path.abspath('film/audio_models/kokoro-v1.0.onnx')
VOICES_PATH = os.path.abspath('film/audio_models/voices-v1.0.bin')

kokoro = Kokoro(MODEL_PATH, VOICES_PATH)
VOICE = 'am_michael'  # Confident, clear engineering narrator

VO_SCRIPT = [
    ('vo_shot1.wav', 'For mechanical estimators who need faster takeoffs and zero guesswork: Introducing BlueTraceAI. Built to turn complex construction drawings into verified takeoffs at the speed of thought.'),
    ('vo_shot2.wav', 'BlueTraceAI is an ongoing MEP takeoff project. It began with a simple goal: help estimators move from complex plan sheets to takeoffs they can verify.'),
    ('vo_shot3.wav', 'Meta models help read drawing content and schedules; deterministic local geometry keeps measurement grounded.'),
    ('vo_shot4.wav', 'A visual guess is not a measurement. BlueTraceAI checks scale and drawing geometry, and surfaces uncertainty for review instead of presenting an unverified quantity as fact.'),
    ('vo_shot5.wav', 'Suggestions stay connected to the sheet. The estimator inspects the vector evidence and decides what belongs in the takeoff.'),
    ('vo_shot6.wav', 'The copilot investigates the work in front of you, while keeping every calculation tied to evidence the engineer can inspect.'),
    ('vo_shot7.wav', 'The aim is not to replace engineering judgment. It is to make drawing review more traceable, and takeoff work easier to verify.'),
    ('vo_shot8.wav', 'BlueTraceAI. From drawing to reviewable takeoff.'),
]

for filename, text in VO_SCRIPT:
    dest = os.path.join(OUTPUT_DIR, filename)
    print(f"Generating {filename} ({len(text)} chars)...")
    samples, sample_rate = kokoro.create(text, voice=VOICE, speed=1.05, lang="en-us")
    sf.write(dest, samples, sample_rate)
    duration = len(samples) / sample_rate
    print(f"  -> Saved {dest} ({duration:.2f}s)")

# =====================================================================
# 2. SYNTHESIZE BESPOKE UI SOUND EFFECTS (FOLEY)
# =====================================================================
print("\n--- [2/3] Synthesizing Precision UI Sound Effects ---")

def save_wav(name, audio_stereo):
    # Normalize peak to -1.5 dB (approx 0.84)
    peak = np.max(np.abs(audio_stereo))
    if peak > 0:
        audio_stereo = (audio_stereo / peak) * 0.84
    path = os.path.join(OUTPUT_DIR, name)
    sf.write(path, audio_stereo.astype(np.float32), SR)
    print(f"  -> Generated SFX: {name} ({len(audio_stereo)/SR:.2f}s)")

# SFX 1: sfx_brand_assemble.wav (0.9s low-frequency air swoop as 3D folded ribbon locks in)
t = np.linspace(0, 0.9, int(SR * 0.9), endpoint=False)
env = np.sin(np.pi * t / 0.9) ** 1.8
sweep_freq = np.linspace(160, 48, len(t))
phase = 2 * np.pi * np.cumsum(sweep_freq) / SR
sub_bass = np.sin(phase) * env * 0.7
# Air friction filtered noise
noise = np.random.normal(0, 0.25, len(t)) * env
air_whoosh = np.convolve(noise, np.ones(40)/40, mode='same')
sfx_assemble = np.vstack([sub_bass * 0.9 + air_whoosh * 0.35, sub_bass * 0.8 + air_whoosh * 0.45]).T
save_wav('sfx_brand_assemble.wav', sfx_assemble)

# SFX 2: sfx_specular_glint.wav (0.8s crystalline bell chime shimmer)
t = np.linspace(0, 0.85, int(SR * 0.85), endpoint=False)
env1 = np.exp(-6.5 * t)
env2 = np.exp(-8.0 * t)
env3 = np.exp(-11.0 * t)
# Frequencies: C7 (2093 Hz), G7 (3136 Hz), C8 (4186 Hz), high glass sheen (5587 Hz)
chime = (
    0.45 * np.sin(2 * np.pi * 2093 * t) * env1 +
    0.35 * np.sin(2 * np.pi * 3136 * t) * env2 +
    0.25 * np.sin(2 * np.pi * 4186 * t) * env3 +
    0.15 * np.sin(2 * np.pi * 5587 * t) * np.exp(-14.0 * t)
)
pan_l = chime * np.linspace(0.85, 0.4, len(t))
pan_r = chime * np.linspace(0.4, 0.95, len(t))
save_wav('sfx_specular_glint.wav', np.vstack([pan_l, pan_r]).T)

# SFX 3: sfx_workstation_swoop.wav (0.75s aerodynamic CAD window landing)
t = np.linspace(0, 0.75, int(SR * 0.75), endpoint=False)
env = np.sin(np.pi * (t / 0.75) ** 0.8) ** 2.0
noise = np.random.normal(0, 0.3, len(t)) * env
whoosh = np.convolve(noise, np.ones(60)/60, mode='same')
# Soft landing thud at t = 0.5s
thud_idx = int(0.48 * SR)
thud = np.zeros_like(t)
t_thud = np.linspace(0, 0.25, len(t) - thud_idx)
thud[thud_idx:] = np.sin(2 * np.pi * 60 * t_thud) * np.exp(-12.0 * t_thud) * 0.6
left = whoosh * 0.7 + thud * 0.8
right = whoosh * 0.8 + thud * 0.8
save_wav('sfx_workstation_swoop.wav', np.vstack([left, right]).T)

# SFX 4: sfx_duct_click.wav (0.2s tactile mechanical mouse switch click + dimension lock confirmation)
t = np.linspace(0, 0.22, int(SR * 0.22), endpoint=False)
# Initial sharp mechanical micro-switch click transient (8ms)
click = np.random.normal(0, 0.8, len(t)) * np.exp(-140.0 * t)
# Subtle tactile confirmation pitch (880 Hz / A5)
t_beep = t[t >= 0.015]
beep = np.zeros_like(t)
beep[t >= 0.015] = np.sin(2 * np.pi * 880 * (t_beep - 0.015)) * np.exp(-32.0 * (t_beep - 0.015)) * 0.4
audio_click = np.vstack([click + beep, click * 0.95 + beep * 1.05]).T
save_wav('sfx_duct_click.wav', audio_click)

# SFX 5: sfx_vellum_layer_lift.wav (1.4s tactile drafting paper separation texture)
t = np.linspace(0, 1.4, int(SR * 1.4), endpoint=False)
env = np.sin(np.pi * t / 1.4) ** 1.5
paper_noise = np.random.normal(0, 0.3, len(t))
# Texture filtered
b = np.ones(18)/18
paper = np.convolve(paper_noise, b, mode='same') * env
# Add subtle page friction sweeps
friction = np.sin(2 * np.pi * np.linspace(350, 650, len(t)) * t) * env * 0.08
left = (paper * 0.85 + friction) * np.linspace(0.4, 0.85, len(t))
right = (paper * 0.85 + friction) * np.linspace(0.85, 0.4, len(t))
save_wav('sfx_vellum_layer_lift.wav', np.vstack([left, right]).T)

# SFX 6: sfx_end_chime.wav (2.8s authoritative closing acoustic chime)
t = np.linspace(0, 2.8, int(SR * 2.8), endpoint=False)
decay1 = np.exp(-1.4 * t)
decay2 = np.exp(-2.2 * t)
decay3 = np.exp(-3.5 * t)
# C major warm chord: C5 (523Hz), E5 (659Hz), G5 (784Hz), C6 (1046Hz)
end_chord = (
    0.40 * np.sin(2 * np.pi * 523.25 * t) * decay1 +
    0.30 * np.sin(2 * np.pi * 659.25 * t) * decay2 +
    0.25 * np.sin(2 * np.pi * 783.99 * t) * decay2 +
    0.15 * np.sin(2 * np.pi * 1046.50 * t) * decay3
)
save_wav('sfx_end_chime.wav', np.vstack([end_chord * 0.8, end_chord * 0.85]).T)

# =====================================================================
# 3. GENERATE AMBIENT MUSIC BED (120 SECONDS)
# =====================================================================
print("\n--- [3/3] Synthesizing Ambient Minimalist Score (120.0s) ---")
total_seconds = 120.0
total_samples = int(SR * total_seconds)
t = np.linspace(0, total_seconds, total_samples, endpoint=False)

# BPM = 110. Quarter note = 60/110 = 0.545s. Bar = 2.18s
bpm = 110.0
bar_dur = (60.0 / bpm) * 4.0
bars = int(total_seconds / bar_dur) + 1

# Master Ambient Synth Bed (Warm pad chords in D Dorian: Dm7 -> G7 -> Am7 -> Em7)
# Frequencies: D3 (146.8), F3 (174.6), A3 (220.0), C4 (261.6)
chord_d = np.sin(2*np.pi*146.83*t) + 0.8*np.sin(2*np.pi*220.0*t) + 0.6*np.sin(2*np.pi*261.63*t)
# Subtle chorus / stereo detuning
chord_d_r = np.sin(2*np.pi*147.2*t) + 0.8*np.sin(2*np.pi*219.7*t) + 0.6*np.sin(2*np.pi*262.1*t)

# Sub-bass pulse on quarter notes
beat_dur = 60.0 / bpm
t_mod = np.mod(t, beat_dur)
pulse_env = np.exp(-12.0 * t_mod)
sub_pulse = np.sin(2 * np.pi * 55.0 * t) * pulse_env * 0.45

# Slow cinematic master volume automation (fade in at start, fade out at 118s)
fade_in = np.clip(t / 4.0, 0, 1)
fade_out = np.clip((120.0 - t) / 3.0, 0, 1)
master_vol = fade_in * fade_out * 0.35

ambient_left = (chord_d * 0.3 + sub_pulse) * master_vol
ambient_right = (chord_d_r * 0.3 + sub_pulse) * master_vol

save_wav('music_bed.wav', np.vstack([ambient_left, ambient_right]).T)

print("\n[SUCCESS] All Voiceover, SFX, and Music assets generated in film/public/audio/!")
