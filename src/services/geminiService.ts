
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

  private getAI(version: 'v1' | 'v1beta' = 'v1') {
    if (this.apiKeys.length === 0) {
      throw new Error("Gemini API Key not found.");
    }
    const apiKey = this.apiKeys[this.currentKeyIndex];
    // Modern SDK initialization
    return new GoogleGenAI({ apiKey, apiVersion: version });
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
      const ai = this.getAI('v1beta');
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
                  description: "2-3 English sentences with their ${targetLanguage} translations in parentheses"
              },
              synonyms: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "3-5 English synonyms followed by their ${targetLanguage} translations in parentheses"
              },
              level: { type: Type.STRING },
              category: { type: Type.STRING },
              imagePrompt: { type: Type.STRING }
            },
            required: ["word", "transcription", "meaning", "morphology", "imagination", "phoneticLink", "connectorSentence", "examples", "synonyms", "level", "category", "imagePrompt"]
          },
          systemInstruction: `Role: You are a Linguistic Mnemonic Architect specializing in the "Keyword Method". Your goal is to help users acquire English vocabulary by building a two-stage mnemonic chain consisting of an acoustic link and an imagery link.
          
          You MUST provide high-quality, creative, and memorable stories. For Central Asian languages (Uzbek, Kazakh, Kyrgyz, Tajik, Turkmen), ensure the phonetic links are culturally relevant and phonetically accurate.
          
          Instructions for Content Generation:
          1. The Acoustic Link (phoneticLink)
          - Identify a "Keyword" in ${targetLanguage} that sounds as much as possible like a part of the spoken English word.
          - Priority: Favor the initial syllable or the most stressed part of the English word for better retrieval.
          - Constraint: The keyword must be a concrete noun or an easily visualized object/phrase. Avoid abstract concepts.
          - Explanation: Explain WHY this keyword was chosen and how it sounds like the English word.
          
          2. The Imagery Link (imagination)
          - Create a vivid mental image description where the Keyword and the English Translation interact in a graphic, dynamic, and memorable way.
          - Absurdity Factor: The interaction should be unique, absurd, or exaggerated.
          - Fusion: The scene must be a single "fused" picture where the two items are locked together.
          
          3. Covert Cognate Check
          - Before forcing a keyword, check if a "covert cognate" exists (a word with a shared root in ${targetLanguage}).
          - If a cognate is found, prioritize explaining that relationship first in the phoneticLink field.
          
          4. Examples & Synonyms
          - Every example sentence MUST be followed by its translation in ${targetLanguage} in parentheses.
          - Every synonym MUST be followed by its translation in ${targetLanguage} in parentheses.
          
          CRITICAL RULES:
          1. All explanatory fields (meaning, morphology, imagination, phoneticLink, connectorSentence) MUST be written EXCLUSIVELY in ${targetLanguage}.
          2. The "word" field should remain the original English word.
          3. The "imagePrompt" MUST be a detailed, English-only visual description of the scene described in the "imagination" field. Focus on characters, actions, and specific visual details to help an AI generate a matching image.
          4. Return ONLY a valid JSON object.`
        },
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      return JSON.parse(text);
    });
  }

  async generateImage(prompt: string): Promise<string> {
    return this.withRetry(async () => {
      const ai = this.getAI('v1beta');
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{ 
          parts: [{ 
            text: `Generate a high-quality, vibrant, and detailed illustration based on this description: ${prompt}. The style should be consistent with educational mnemonics—clear, slightly whimsical, and memorable. No text in the image.` 
          }] 
        }],
        config: {
          responseModalities: [Modality.IMAGE],
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (!part || !part.inlineData) {
        throw new Error("No image data received from API");
      }

      return `data:image/png;base64,${part.inlineData.data}`;
    });
  }

  async generateTTS(text: string, targetLanguage: Language): Promise<string> {
    return this.withRetry(async () => {
      const ai = this.getAI('v1beta');
      
      const languageName = targetLanguage === Language.ENGLISH ? 'English' : targetLanguage;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ 
          parts: [{ 
            text: `Speak the following text naturally and expressively. It contains English words and their explanation in ${languageName}. 
            For English words, use a clear American accent. 
            For ${languageName} (which could be Kazakh, Kyrgyz, Tajik, Turkmen, or Uzbek), use a native, fluent, and authentic accent. 
            Ensure the pronunciation of Central Asian languages is accurate and high-quality.
            Text: "${text}"` 
          }] 
        }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Zephyr' }, // Trying Zephyr for potentially more natural feel
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
      const ai = this.getAI('v1beta');
      
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
        model: "gemini-3-flash-preview",
        contents: history.length > 0 ? history : [{
          role: 'user',
          parts: [{ text: `Hi! I want to practice the word "${word}". I've chosen the ${level === 'EasyToHard' ? 'Easy to Hard' : (level || 'Easy')} level. Please start the session in ${targetLanguage}.` }]
        }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              feedback: { type: Type.STRING, description: "The AI's response to the user in the target language." },
              isCorrect: { type: Type.BOOLEAN, description: "Whether the user's English sentence was correct and met the level requirements." },
              sessionComplete: { type: Type.BOOLEAN, description: "Whether the 5-step practice session is now complete." }
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
        },
      });
      return response.text;
    });
  }

  async generateNuance(word: string, synonyms: string[], targetLanguage: Language): Promise<any> {
    return this.withRetry(async () => {
      const ai = this.getAI('v1beta');
      const synonymsList = synonyms && synonyms.length > 0 ? synonyms.join(', ') : 'common synonyms';
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Explain the nuance and usage differences between the English word "${word}" and its synonyms: ${synonymsList}. Provide the explanation for a ${targetLanguage} speaker.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              coreDifference: { type: Type.STRING, description: "The main conceptual difference between the word and its synonyms in ${targetLanguage}." },
              comparisonTable: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    usage: { type: Type.STRING, description: "A natural English sentence using this word." },
                    reason: { type: Type.STRING, description: "Why this word is used in this specific context (in ${targetLanguage})." }
                  },
                  required: ["word", "usage", "reason"]
                }
              },
              commonMistake: {
                type: Type.OBJECT,
                properties: {
                  incorrect: { type: Type.STRING, description: "A common incorrect way a ${targetLanguage} speaker might use the word." },
                  natural: { type: Type.STRING, description: "The correct, natural way to say it in English." }
                },
                required: ["incorrect", "natural"]
              }
            },
            required: ["coreDifference", "comparisonTable", "commonMistake"]
          },
          systemInstruction: `You are an expert English Language Coach. 
          Your goal is to help advanced learners understand the subtle differences (nuances) between similar words.
          
          Instructions:
          1. The "coreDifference" field must be written in ${targetLanguage}.
          2. The "comparisonTable" should show how the target word and its synonyms are used in different contexts. The "reason" field must be in ${targetLanguage}.
          3. The "commonMistake" section should highlight a typical error made by ${targetLanguage} speakers due to direct translation, and provide the natural English alternative.
          4. Keep explanations clear, professional, and practical.
          5. Return ONLY a valid JSON object.`
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      return JSON.parse(text);
    });
  }
}
