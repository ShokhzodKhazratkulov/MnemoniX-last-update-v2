
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { MnemonicResponse, Language } from "../types";

export class GeminiService {
  private apiKeys: string[] = [];
  private currentKeyIndex = 0;

  constructor() {
    // In Vite, variables must be accessed via import.meta.env
    let loadedKeys: string[] = [];
    
    // 1. Try the comma-separated list
    const keysString = import.meta.env.VITE_GEMINI_API_KEYS;
    if (keysString && keysString !== 'undefined') {
      loadedKeys = keysString.split(',').map((k: string) => k.trim()).filter(Boolean);
    }

    // 2. Try individual keys
    const individualKeys = [
      import.meta.env.VITE_GEMINI_API_KEY,
      import.meta.env.VITE_GEMINI_API_KEY_2,
      import.meta.env.VITE_GEMINI_API_KEY_3,
      import.meta.env.VITE_GEMINI_API_KEY_4,
      import.meta.env.VITE_GEMINI_API_KEY_5,
      // Special case: AI Studio's default key
      (import.meta.env as any).GEMINI_API_KEY 
    ].filter(k => k && k !== 'undefined') as string[];

    // Combine and remove duplicates
    this.apiKeys = Array.from(new Set([...loadedKeys, ...individualKeys]));
    
    if (this.apiKeys.length === 0) {
      console.error("CRITICAL: No Gemini API keys found in environment variables!");
    } else {
      console.log(`GeminiService: Successfully initialized with ${this.apiKeys.length} total unique keys.`);
    }
  }

  private getAI() {
    if (this.apiKeys.length === 0) {
      throw new Error("Gemini API Key not found.");
    }
    const apiKey = this.apiKeys[this.currentKeyIndex];
    // Modern SDK initialization
    return new GoogleGenAI({ apiKey });
  }

  private rotateKey() {
    if (this.apiKeys.length > 1) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
      console.warn(`Quota reached. Rotating to API Key #${this.currentKeyIndex + 1}`);
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        const message = error?.message || (typeof error === 'string' ? error : '');
        
        const isQuotaError = 
          message.includes('429') || 
          message.includes('RESOURCE_EXHAUSTED') ||
          message.toLowerCase().includes('quota exceeded');

        if (isQuotaError) {
          this.rotateKey();
        }

        if (attempt < maxRetries) {
          const delay = (Math.pow(2, attempt + 1) - 1) * 1000 + Math.random() * 1000;
          console.warn(`Retrying after error (Attempt ${attempt + 1}/${maxRetries}) in ${Math.round(delay)}ms. Message: ${message}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  async checkSpelling(word: string): Promise<string> {
    return this.withRetry(async () => {
      const ai = this.getAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Correct the spelling of the following English word: "${word}". Return ONLY the corrected word.`,
      });

      return response.text?.trim().toLowerCase().replace(/[^a-z\s-]/g, '') || word.toLowerCase();
    });
  }

  async getMnemonic(word: string, targetLanguage: Language): Promise<MnemonicResponse> {
    return this.withRetry(async () => {
      const ai = this.getAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate a mnemonic for the English word "${word}" for a ${targetLanguage} speaker.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              transcription: { type: Type.STRING },
              meaning: { type: Type.STRING },
              morphology: { type: Type.STRING },
              imagination: { type: Type.STRING },
              phoneticLink: { type: Type.STRING },
              connectorSentence: { type: Type.STRING },
              examples: { 
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
              },
              synonyms: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
              },
              level: { type: Type.STRING },
              category: { type: Type.STRING },
              imagePrompt: { type: Type.STRING }
            },
            required: ["word", "transcription", "meaning", "morphology", "imagination", "phoneticLink", "connectorSentence", "examples", "synonyms", "level", "category", "imagePrompt"]
          },
          systemInstruction: `Role: You are a Linguistic Mnemonic Architect. Help users acquire English vocabulary using the Keyword Method.
          
          Instructions:
          1. Acoustic Link (phoneticLink): Identify a keyword in ${targetLanguage} that sounds like the English word.
          2. Imagery Link (imagination): Create a vivid, absurd mental image where the keyword and meaning interact.
          3. All explanatory fields MUST be in ${targetLanguage}.
          4. Return ONLY valid JSON.`
        },
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      return JSON.parse(text);
    });
  }

  async generateImage(prompt: string): Promise<string> {
    // Placeholder for image generation
    return `https://picsum.photos/seed/${encodeURIComponent(prompt)}/1024/1024`;
  }

  async generateTTS(text: string, targetLanguage: Language): Promise<string> {
    return this.withRetry(async () => {
      const ai = this.getAI();
      
      const languageName = targetLanguage === Language.ENGLISH ? 'English' : targetLanguage;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ 
          parts: [{ 
            text: `Say cheerfully: ${text}` 
          }] 
        }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const audioData = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
      if (audioData) {
        return audioData;
      }
      
      console.error("TTS Response missing audio parts:", response);
      return '';
    });
  }

  async getPracticeResponse(word: string, meaning: string, targetLanguage: Language, history: any[], level?: 'Easy' | 'Medium' | 'Hard' | 'EasyToHard', sentenceCount: number = 0) {
    return this.withRetry(async () => {
      const ai = this.getAI();
      
      const displayLevel = level === 'EasyToHard' 
        ? (sentenceCount < 2 ? 'Easy' : sentenceCount < 4 ? 'Medium' : 'Hard')
        : (level || 'Easy');

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: history.length > 0 ? history : [{
          role: 'user',
          parts: [{ text: `Hi! I want to practice the word "${word}". Level: ${displayLevel}. Language: ${targetLanguage}.` }]
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              feedback: { type: Type.STRING },
              isCorrect: { type: Type.BOOLEAN },
              sessionComplete: { type: Type.BOOLEAN }
            },
            required: ["feedback", "isCorrect", "sessionComplete"]
          },
          systemInstruction: `You are a helpful English Practice Partner. 
          The user is learning "${word}" (meaning: ${meaning}).
          Communicate EXCLUSIVELY in ${targetLanguage}. 
          Evaluate their English sentence at the ${displayLevel} level.`,
        },
      });
      return response.text;
    });
  }

  async generateNuance(word: string, synonyms: string[], targetLanguage: Language): Promise<any> {
    return this.withRetry(async () => {
      const ai = this.getAI();
      const synonymsList = synonyms && synonyms.length > 0 ? synonyms.join(', ') : 'common synonyms';
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Explain nuance: "${word}" vs ${synonymsList} for ${targetLanguage} speaker.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              coreDifference: { type: Type.STRING },
              comparisonTable: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    usage: { type: Type.STRING },
                    reason: { type: Type.STRING }
                  },
                  required: ["word", "usage", "reason"]
                }
              },
              commonMistake: {
                type: Type.OBJECT,
                properties: {
                  incorrect: { type: Type.STRING },
                  natural: { type: Type.STRING }
                },
                required: ["incorrect", "natural"]
              }
            },
            required: ["coreDifference", "comparisonTable", "commonMistake"]
          },
          systemInstruction: `You are an expert English Language Coach. Explain nuances in ${targetLanguage}.`
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      return JSON.parse(text);
    });
  }
}
