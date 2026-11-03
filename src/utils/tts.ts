/**
 * Web Speech API Text-to-Speech (id-ID) with high responsiveness and reliable fallback
 */

export interface TtsOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  enabled?: boolean;
}

class TextToSpeechService {
  private voices: SpeechSynthesisVoice[] = [];
  private isLoaded = false;
  private isUnlocked = false;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private resumeTimer: any = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.loadVoices();

      // Listen for voice list updates from browser
      if ('onvoiceschanged' in window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = () => {
          this.loadVoices();
        };
      }

      // Pre-warm audio engine on first user interaction
      const unlockAudio = () => {
        if (!this.isUnlocked) {
          this.isUnlocked = true;
          this.loadVoices();
          try {
            if (window.speechSynthesis.paused) {
              window.speechSynthesis.resume();
            }
          } catch (e) {
            // Ignore
          }
          window.removeEventListener('click', unlockAudio);
          window.removeEventListener('keydown', unlockAudio);
          window.removeEventListener('touchstart', unlockAudio);
        }
      };

      window.addEventListener('click', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
    }
  }

  private loadVoices() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) {
        this.voices = v;
        this.isLoaded = true;
      }
    } catch {
      // Ignore
    }
  }

  getAvailableVoices(): SpeechSynthesisVoice[] {
    if (!this.isLoaded || this.voices.length === 0) {
      this.loadVoices();
    }
    return this.voices;
  }

  /**
   * Find best matching Indonesian voice, prioritizing natural / Google / Microsoft Indonesian voices
   */
  private getIndonesianVoice(): SpeechSynthesisVoice | null {
    const voices = this.getAvailableVoices();
    if (!voices || voices.length === 0) return null;

    // 1. Exact match id-ID or in-ID
    const idVoices = voices.filter((v) => {
      const lang = (v.lang || '').toLowerCase().replace('_', '-');
      const name = (v.name || '').toLowerCase();
      return (
        lang === 'id-id' ||
        lang === 'in-id' ||
        lang.startsWith('id') ||
        lang.startsWith('in') ||
        name.includes('indonesia')
      );
    });

    if (idVoices.length > 0) {
      // Prioritize Google / Natural voices if available
      const googleVoice = idVoices.find(
        (v) => v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('natural')
      );
      return googleVoice || idVoices[0];
    }

    return null;
  }

  /**
   * Ultra-responsive speak invocation with immediate queue clearing and Chrome GC safety
   */
  speak(text: string, options: TtsOptions = {}) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (options.enabled === false) return;
    if (!text || !text.trim()) return;

    try {
      // 1. Instantly cancel any ongoing or backlogged speech for zero lag
      window.speechSynthesis.cancel();

      // 2. Unpause engine if sleeping (Chromium quirk)
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      // 3. Ensure voices are fetched
      if (this.voices.length === 0) {
        this.loadVoices();
      }

      const cleanText = text.trim();
      const utterance = new SpeechSynthesisUtterance(cleanText);

      // Fast, snappy rate (1.1x default) ensures kiosk announcements don't lag behind quick scans
      utterance.rate = options.rate ?? 1.1;
      utterance.pitch = options.pitch ?? 1.0;
      utterance.volume = options.volume ?? 1.0;

      // Select Indonesian voice
      const idVoice = this.getIndonesianVoice();
      if (idVoice) {
        utterance.voice = idVoice;
        utterance.lang = idVoice.lang || 'id-ID';
      } else {
        utterance.lang = 'id-ID';
      }

      // CRITICAL: Keep strong reference to prevent Chrome garbage collecting the utterance mid-speech
      this.activeUtterance = utterance;

      // Periodic resume keepalive for Chrome 15s freeze bug
      if (this.resumeTimer) {
        clearInterval(this.resumeTimer);
        this.resumeTimer = null;
      }
      this.resumeTimer = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          if (this.resumeTimer) clearInterval(this.resumeTimer);
          this.resumeTimer = null;
        } else if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 3000);

      utterance.onstart = () => {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      };

      utterance.onend = () => {
        this.activeUtterance = null;
        if (this.resumeTimer) {
          clearInterval(this.resumeTimer);
          this.resumeTimer = null;
        }
      };

      utterance.onerror = (e) => {
        this.activeUtterance = null;
        if (this.resumeTimer) {
          clearInterval(this.resumeTimer);
          this.resumeTimer = null;
        }
        if (e.error !== 'canceled' && e.error !== 'interrupted') {
          console.warn('[TTS] Synthesis event error:', e.error);
        }
      };

      // Slight micro-timeout (10ms) prevents Chromium bug where cancel() immediately cancels subsequent speak()
      setTimeout(() => {
        try {
          if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
          }
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn('[TTS] Speak error:', e);
        }
      }, 10);
    } catch (err) {
      console.warn('[TTS] Speech synthesis exception:', err);
    }
  }

  stop() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      if (this.resumeTimer) {
        clearInterval(this.resumeTimer);
        this.resumeTimer = null;
      }
      this.activeUtterance = null;
      window.speechSynthesis.cancel();
    }
  }
}

export const ttsService = new TextToSpeechService();


