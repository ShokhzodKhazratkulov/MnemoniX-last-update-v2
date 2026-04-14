
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { MnemonicResponse, Language } from "../types";

export class GeminiService {
  private apiKeys: string[] = [];
  private currentKeyIndex = 0;

  constructor() {
    let loadedKeys: string[] = [];
    const keysString = import.meta.env.VITE_GEMINI_API_KEYS;
    if (keysString && keysString !== 'undefined') {
      loadedKeys = keysString.split(',').map((k: string) => k.trim()).filter(Boolean);
    }

    const individualKeys = [
      import.meta.env.VITE_GEMINI_API_KEY,
      import.meta.env.VITE_GEMINI_API_KEY_2,
      import.meta.env.VITE_GEMINI_API_KEY_3,
      import.meta.env.VITE_GEMINI_API_KEY_4,
      import.meta.env.VITE_GEMINI_API_KEY_5,
      (import.meta.env as any).GEMINI_API_KEY 
    ].filter(k => k && k !== 'undefined') as string[];

    this.apiKeys = Array.from(new Set([...loadedKeys, ...individualKeys]));
    
    if (this.apiKeys.length === 0) {
      console.error("CRITICAL: No Gemini API keys found!");
    } else {
      console.log(`GeminiService: Initialized with ${this.apiKeys.length} keys.`);
    }
  }

  private getAI(version: 'v1' | 'v1beta' = 'v1') {
    if (this.apiKeys.length === 0) {
      throw new Error("API Key missing");
    }
    const apiKey = this.apiKeys[this.currentKeyIndex];
    return new GoogleGenAI({ apiKey, apiVersion: version });
  }

  private rotateKey() {
    if (this.apiKeys.length > 1) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
      console.warn(`Rotating to Key #${this.currentKeyIndex + 1}`);
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        const message = error?.message || '';
        if (message.includes('429') || message.includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
          this.rotateKey();
        }
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  async checkSpelling(word: string): Promise<string> {
    return this.withRetry(async () => {
      const ai = this.getAI('v1');
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: `Correct spelling: "${word}". Return ONLY the word.`,
      });
      return response.text?.trim().toLowerCase() || word.toLowerCase();
    });
  }

  async getMnemonic(word: string, targetLanguage: Language): Promise<MnemonicResponse> {
    return this.withRetry(async () => {
      const ai = this.getAI('v1');
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: `Generate mnemonic for "${word}" in ${targetLanguage}.`,
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
              examples: { type: Type.ARRAY, items: { type: Type.STRING } },
              synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
              level: { type: Type.STRING },
              category: { type: Type.STRING },
              imagePrompt: { type: Type.STRING }
            },
            required: ["word", "transcription", "meaning", "morphology", "imagination", "phoneticLink", "connectorSentence", "examples", "synonyms", "level", "category", "imagePrompt"]
          }
        }
      });
      return JSON.parse(response.text || '{}');
    });
  }

  async generateImage(prompt: string): Promise<string> {
    return `https://picsum.photos/seed/${encodeURIComponent(prompt)}/1024/1024`;
  }

  async generateTTS(text: string, targetLanguage: Language): Promise<string> {
    return this.withRetry(async () => {
      const ai = this.getAI('v1beta');
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [{ parts: [{ text: `Speak naturally in ${targetLanguage}: "${text}"` }] }],
        config: { responseModalities: [Modality.AUDIO] },
      });
      return response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data || '';
    });
  }

  async getPracticeResponse(word: string, meaning: string, targetLanguage: Language, history: any[], level?: 'Easy' | 'Medium' | 'Hard' | 'EasyToHard', sentenceCount: number = 0) {
    return this.withRetry(async () => {
      const ai = this.getAI('v1');
      
      const levelInstructions = {
        Easy: "Focus on SIMPLE sentences (Subject + Verb + Object). Use high-frequency, basic vocabulary. Example structure: 'The cat sits on the mat.'",
        Medium: "Focus on COMPOUND sentences using 'and,' 'but,' or 'or.' Encourage the use of common adverbs. Example structure: 'The cat sits on the mat, but the dog is outside.'",
        Hard: "Focus on COMPLEX sentences with relative clauses, passive voice, or conditional tense. Example structure: 'Although it was raining, the cat remained on the mat that was placed near the fire.'",
        EasyToHard: `This is a progressive session. 
          - For sentences 1-2: Use EASY level (Simple sentences).
          - For sentences 3-4: Use MEDIUM level (Compound sentences).
          - For sentence 5: Use HARD level (Complex sentences).
          Current sentence number: ${sentenceCount + 1}.`
      };

      const selectedLevelInstruction = level ? levelInstructions[level] : levelInstructions.Easy;
      const displayLevel = level === 'EasyToHard' 
        ? (sentenceCount < 2 ? 'Easy' : sentenceCount < 4 ? 'Medium' : 'Hard')
        : (level || 'Easy');

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: history.length > 0 ? history : [{ role: 'user', parts: [{ text: `Hi! I want to practice the word "${word}". I've chosen the ${level === 'EasyToHard' ? 'Easy to Hard' : (level || 'Easy')} level. Please start the session in ${targetLanguage}.` }] }],
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
          The user is learning the word "${word}" (meaning: ${meaning}).
          Your goal is to help them practice using this word in context at the ${displayLevel} level.
          
          Level-Specific Sentence Requirements:
          ${selectedLevelInstruction}
          
          Instructions:
          1. Communicate EXCLUSIVELY in ${targetLanguage}. 
          2. Give the user a specific scenario or question in ${targetLanguage} that requires them to use the English word "${word}".
          3. The user MUST respond in English using the sentence structure appropriate for the ${displayLevel} level.
          4. Evaluate their English sentence. 
          5. If it's correct and matches the level's complexity, set isCorrect to true, provide praise in the feedback field, and give a new challenge.
          6. If it's incorrect or too simple for the level, set isCorrect to false, gently correct or guide them in the feedback field, and ask them to try again.
          7. This is a 5-step practice session. After 5 successful English sentences, set sessionComplete to true, congratulate them warmly in the feedback field, and tell them they have mastered the word!
          8. Keep your feedback concise (max 2-3 sentences).
          9. Return ONLY a valid JSON object.`,
        }
      });
      return response.text;
    });
  }

  async generateNuance(word: string, synonyms: string[], targetLanguage: Language): Promise<any> {
    return this.withRetry(async () => {
      const ai = this.getAI('v1');
      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: `Nuance of "${word}" vs ${synonyms.join(', ')} for ${targetLanguage} speaker.`,
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
          }
        }
      });
      return JSON.parse(response.text || '{}');
    });
  }
}
