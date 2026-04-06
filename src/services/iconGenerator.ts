import { GoogleGenAI } from "@google/genai";

export async function generateAppIcon() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const prompt = `A professional, high-quality mobile app icon for a virtual SIM management terminal named "MK-NET". 
  The icon should feature a stylized, glowing emerald green shield or a circuit-patterned SIM card at the center. 
  The background should be a deep charcoal or black with a subtle glassmorphism effect. 
  Modern, minimalist, 3D aesthetic. Emerald green glow highlights. 
  Rounded square shape. No text.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: prompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
        },
      },
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
  } catch (error) {
    console.error("Error generating icon:", error);
    return null;
  }
}
